/**
 * review-independence.test.ts — M11-R31 reviewer independence and diversity
 * (AM-0020 §5, §6, §10; AM-0019 §5 sharded parallel dispatch).
 *
 * Covers:
 *  - same-session review rejected;
 *  - blind-first ordering: verdict before blind pass invalid, pass after
 *    comparison invalid;
 *  - hypotheses + probes present, provisional verdict before comparison;
 *  - T3 diversity: two same-provider reviewers rejected, different-provider ok;
 *  - conflict: contradictory ACCEPT_SCOPE → REVIEW_CONFLICT (not majority),
 *    deterministic reproduction resolves, else adjudicator routed with both
 *    arguments;
 *  - AM-0020 §10 calibration hooks: worker self-PASS rejected, reviewer ACCEPT
 *    rejected by challenger, false rejection overturned, defect escape with
 *    model/provider/domain, duplicate findings, repair-loop count;
 *  - sharded concurrency: reviewers dispatch in parallel, never serialized.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  assertIndependence,
  contradictoryFindings,
  detectConflict,
  finalizeReview,
  resolveConflict,
  requiredReviewersFor,
  ReviewCoordinator,
  isDifferentProviderOrStronger,
  type AgentIdentity,
  type BlindReviewPass,
  type ReviewReceiptRef,
  type ReviewVerdict,
  type CalibrationEvent,
  type CalibrationSink,
} from '../src/review-independence.js';
import { RISK_TIERS } from '../src/claim-registry.js';

function identity(session: string, provider = 'deepseek', observed = 'deepseek-flash-high'): AgentIdentity {
  return { session, provider, model: { requested: observed, resolved: observed, observed } };
}

function blindPass(review_id: string, verdict: ReviewVerdict = 'ACCEPT_SCOPE', at = new Date(Date.now() - 60_000).toISOString()): BlindReviewPass {
  return {
    review_id,
    threat_hypotheses: ['TH-1: revoked token must fail closed'],
    adversarial_probes: ['PROBE-1: stale-token replay'],
    provisional_verdict: verdict,
    captured_at: at,
  };
}

function receipt(review_id: string, claim_id: string, verdict: ReviewVerdict, findings: ReviewReceiptRef['findings'], reproducible = false, evidence_refs: string[] = []): ReviewReceiptRef {
  return {
    review_id,
    claim_id,
    risk_tier: 'T3',
    reviewer: identity(review_id),
    verdict,
    findings,
    evidence_refs,
    reproducible,
    verdict_formed_before_comparing: true,
  };
}

class CollectingSink implements CalibrationSink {
  readonly events: CalibrationEvent[] = [];
  record(event: CalibrationEvent): void { this.events.push(event); }
  of(event: CalibrationEvent['event']): CalibrationEvent[] { return this.events.filter((e) => e.event === event); }
}

describe('assertIndependence', () => {
  it('rejects same-session review', () => {
    const writer = identity('sess-writer');
    const reviewer = identity('sess-writer'); // same session
    const evidence = {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [
        { event: 'blind_pass_captured' as const, at: '2026-08-01T10:00:00.000Z' },
        { event: 'worker_verdict_read' as const, at: '2026-08-01T10:05:00.000Z' },
      ],
    };
    const r = assertIndependence(reviewer, writer, evidence);
    assert.equal(r.status, 'NOT_INDEPENDENT');
    assert.match((r as { reason: string }).reason, /same-session/);
  });

  it('rejects verdict formed before the blind pass (blind-first ordering violated)', () => {
    const writer = identity('sess-writer');
    const reviewer = identity('sess-reviewer');
    const evidence = {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: false, // verdict formed BEFORE blind pass
      ordering_evidence: [
        { event: 'blind_pass_captured' as const, at: '2026-08-01T10:00:00.000Z' },
        { event: 'worker_verdict_read' as const, at: '2026-08-01T10:05:00.000Z' },
      ],
    };
    const r = assertIndependence(reviewer, writer, evidence);
    assert.equal(r.status, 'NOT_INDEPENDENT');
    assert.match((r as { reason: string }).reason, /blind-first/);
  });

  it('rejects blind pass recorded AFTER the comparison (ordering proof violated)', () => {
    const evidence = {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [
        { event: 'worker_verdict_read' as const, at: '2026-08-01T10:05:00.000Z' },
        { event: 'blind_pass_captured' as const, at: '2026-08-01T10:06:00.000Z' }, // after read
      ],
    };
    const r = assertIndependence(identity('sess-reviewer'), identity('sess-writer'), evidence);
    assert.equal(r.status, 'NOT_INDEPENDENT');
    assert.match((r as { reason: string }).reason, /ordering/);
  });

  it('rejects missing hypotheses or probes', () => {
    const r = assertIndependence(identity('sess-reviewer'), identity('sess-writer'), {
      blind_review_completed: true,
      threat_hypotheses: [],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [{ event: 'blind_pass_captured', at: '2026-08-01T10:00:00.000Z' }],
    });
    assert.equal(r.status, 'NOT_INDEPENDENT');
    assert.match((r as { reason: string }).reason, /threat hypotheses/);
  });

  it('accepts a genuinely blind, ordered, distinct-session review', () => {
    const r = assertIndependence(identity('sess-reviewer'), identity('sess-writer'), {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [
        { event: 'blind_pass_captured', at: '2026-08-01T10:00:00.000Z' },
        { event: 'worker_verdict_read', at: '2026-08-01T10:05:00.000Z' },
      ],
    });
    assert.deepEqual(r, { status: 'INDEPENDENT' });
  });
});

describe('T3 diversity', () => {
  it('two same-provider, non-stronger reviewers rejected', () => {
    const writer = identity('sess-writer', 'deepseek', 'deepseek-pro');
    const r1 = identity('sess-r1', 'deepseek', 'deepseek-pro');
    const r2 = identity('sess-r2', 'deepseek', 'deepseek-pro');
    const r = assertIndependence(r1, writer, {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [{ event: 'blind_pass_captured', at: '2026-08-01T10:00:00.000Z' }],
    }, { tier: 'T3', reviewers: [r1, r2] });
    assert.equal(r.status, 'NOT_INDEPENDENT');
    assert.match((r as { reason: string }).reason, /diversity/);
  });

  it('one different-provider reviewer in the set makes the set acceptable', () => {
    const writer = identity('sess-writer', 'deepseek', 'deepseek-pro');
    const r1 = identity('sess-r1', 'deepseek', 'deepseek-pro');
    const r2 = identity('sess-r2', 'anthropic', 'claude-sonnet'); // different provider
    const r = assertIndependence(r1, writer, {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [{ event: 'blind_pass_captured', at: '2026-08-01T10:00:00.000Z' }],
    }, { tier: 'T3', reviewers: [r1, r2] });
    assert.deepEqual(r, { status: 'INDEPENDENT' });
  });

  it('one stronger same-provider reviewer makes the set acceptable', () => {
    const writer = identity('sess-writer', 'deepseek', 'deepseek-flash-high');
    const r1 = identity('sess-r1', 'deepseek', 'deepseek-flash-max');
    const r2 = identity('sess-r2', 'deepseek', 'deepseek-flash-high');
    assert.ok(isDifferentProviderOrStronger(r1, writer));
    const r = assertIndependence(r1, writer, {
      blind_review_completed: true,
      threat_hypotheses: ['h'],
      adversarial_probes: ['p'],
      verdict_formed_before_comparing: true,
      ordering_evidence: [{ event: 'blind_pass_captured', at: '2026-08-01T10:00:00.000Z' }],
    }, { tier: 'T3', reviewers: [r1, r2] });
    assert.deepEqual(r, { status: 'INDEPENDENT' });
  });
});

describe('requiredReviewersFor (AM-0020 §6 topology)', () => {
  it('maps every tier to the required review topology', () => {
    assert.deepEqual(requiredReviewersFor('T0'), { count: 0, deterministic_only: true });
    assert.deepEqual(requiredReviewersFor('T1'), { count: 1 });
    assert.deepEqual(requiredReviewersFor('T2'), { count: 1, specialist: true });
    assert.deepEqual(requiredReviewersFor('T3'), { count: 2, specialist: true, strong_or_different_provider: true });
    assert.deepEqual(requiredReviewersFor('T-Visual'), { count: 1, vision: true });
    assert.deepEqual(requiredReviewersFor('T-Global'), { count: 2, specialist: true, blind_challenger: true });
    assert.equal(RISK_TIERS.length, 6);
  });
});

describe('finalizeReview — blind protocol', () => {
  it('records provisional verdict before comparison and confirms agreement', () => {
    const rcpt = receipt('REV-1', 'CLAIM-1', 'ACCEPT_SCOPE', []);
    const pass = blindPass('REV-1', 'ACCEPT_SCOPE');
    const out = finalizeReview(rcpt, pass, 'ACCEPT_SCOPE', '2026-08-01T10:05:00.000Z');
    assert.equal(out.confirmation, 'CONFIRMATION');
    assert.equal(out.final_verdict, 'ACCEPT_SCOPE');
    assert.equal(out.blind_verdict, 'ACCEPT_SCOPE');
  });

  it('records divergence when worker verdict differs from the blind verdict', () => {
    const out = finalizeReview(
      receipt('REV-2', 'CLAIM-1', 'NEEDS_REPAIR', []),
      blindPass('REV-2', 'NEEDS_REPAIR'),
      'ACCEPT_SCOPE',
      '2026-08-01T10:05:00.000Z',
    );
    assert.equal(out.confirmation, 'DIVERGENCE');
    assert.equal(out.final_verdict, 'NEEDS_REPAIR');
  });

  it('throws when the blind pass postdates the comparison', () => {
    assert.throws(
      () => finalizeReview(
        receipt('REV-3', 'CLAIM-1', 'ACCEPT_SCOPE', []),
        blindPass('REV-3', 'ACCEPT_SCOPE', '2026-08-01T10:06:00.000Z'),
        'ACCEPT_SCOPE',
        '2026-08-01T10:05:00.000Z',
      ),
      /ordering proof violated|postdates/,
    );
  });

  it('throws when hypotheses or probes are missing', () => {
    assert.throws(
      () => finalizeReview(
        receipt('REV-4', 'CLAIM-1', 'ACCEPT_SCOPE', []),
        { review_id: 'REV-4', threat_hypotheses: [], adversarial_probes: [], provisional_verdict: 'ACCEPT_SCOPE', captured_at: '2026-08-01T10:00:00.000Z' },
        'ACCEPT_SCOPE',
      ),
      /threat hypotheses/,
    );
  });
});

describe('conflict protocol — never majority vote', () => {
  it('two ACCEPT_SCOPE with contradictory findings → REVIEW_CONFLICT, not majority acceptance', () => {
    const a = receipt('REV-A', 'CLAIM-F', 'ACCEPT_SCOPE', [
      { finding_id: 'F1', scope: 'finance.concurrency', disposition: 'CLEAN', summary: 'no cross-tenant leak' },
    ]);
    const b = receipt('REV-B', 'CLAIM-F', 'ACCEPT_SCOPE', [
      { finding_id: 'F2', scope: 'finance.concurrency', disposition: 'BLOCKING', summary: 'cross-tenant leak reproduced' },
    ]);
    assert.ok(contradictoryFindings(a, b));
    assert.ok(detectConflict(a, b));
  });

  it('non-contradictory agreeing reviews are NOT a conflict', () => {
    const a = receipt('REV-A', 'CLAIM-F', 'ACCEPT_SCOPE', [
      { finding_id: 'F1', scope: 'finance.concurrency', disposition: 'CLEAN', summary: 'clean' },
    ]);
    const b = receipt('REV-B', 'CLAIM-F', 'ACCEPT_SCOPE', [
      { finding_id: 'F2', scope: 'finance.tenancy', disposition: 'CLEAN', summary: 'clean' },
    ]);
    assert.equal(detectConflict(a, b), false);
  });

  it('resolves via deterministic reproduction when both receipts reference reproducible evidence', () => {
    const a = receipt('REV-A', 'CLAIM-D', 'ACCEPT_SCOPE', [], true, ['evidence-hash-1']);
    const b = receipt('REV-B', 'CLAIM-D', 'ACCEPT_SCOPE', [], true, ['evidence-hash-2']);
    const reproducer = () => ({ verdict: 'REJECT_EVIDENCE' as ReviewVerdict, reproduction_ref: 'repro-01' });
    const resolution = resolveConflict(a, b, reproducer);
    assert.equal(resolution.resolution, 'DETERMINISTIC_REPRODUCTION');
    if (resolution.resolution === 'DETERMINISTIC_REPRODUCTION') {
      assert.equal(resolution.verdict, 'REJECT_EVIDENCE');
      assert.equal(resolution.reproduction_ref, 'repro-01');
    }
  });

  it('routes an adjudicator with BOTH arguments when reproduction is impossible', () => {
    const a = receipt('REV-A', 'CLAIM-D', 'ACCEPT_SCOPE', [
      { finding_id: 'F1', scope: 's', disposition: 'CLEAN', summary: 'clean' },
    ], false, []);
    const b = receipt('REV-B', 'CLAIM-D', 'REJECT_EVIDENCE', [
      { finding_id: 'F2', scope: 's', disposition: 'BLOCKING', summary: 'broken' },
    ], false, []);
    const resolution = resolveConflict(a, b);
    assert.equal(resolution.resolution, 'ADJUDICATOR_ROUTED');
    if (resolution.resolution === 'ADJUDICATOR_ROUTED') {
      assert.equal(resolution.record.arguments_from.reviewer_a, 'REV-A');
      assert.equal(resolution.record.arguments_from.reviewer_b, 'REV-B');
      assert.deepEqual(resolution.record.raw_evidence_refs, []);
      assert.equal(resolution.record.decision, null);
    }
  });
});

describe('ReviewCoordinator', () => {
  it('rejects same-session and insufficient reviewer sets at assignment', () => {
    const writer = identity('sess-writer');
    const coord = new ReviewCoordinator(writer, new CollectingSink());
    const same = coord.assignReviewers('CLAIM-1', 'T3', [writer, identity('sess-r2')]);
    assert.equal(same.ok, false);
    const tooFew = coord.assignReviewers('CLAIM-2', 'T3', [identity('sess-r1')]);
    assert.equal(tooFew.ok, false);
    const ok = coord.assignReviewers('CLAIM-3', 'T1', [identity('sess-r1')]);
    assert.equal(ok.ok, true);
  });

  it('enforces blind-first ordering: finalize before blind pass throws', () => {
    const coord = new ReviewCoordinator(identity('sess-writer'), new CollectingSink());
    const assigned = coord.assignReviewers('CLAIM-1', 'T1', [identity('sess-r1')]);
    assert.equal(assigned.ok, true);
    if (assigned.ok) {
      assert.throws(() => coord.finalize(assigned.assignments[0].review_id, 'ACCEPT_SCOPE'), /blind pass must be captured/);
    }
  });

  it('records blind pass with hypotheses + probes and finalizes', () => {
    const coord = new ReviewCoordinator(identity('sess-writer'), new CollectingSink());
    const assigned = coord.assignReviewers('CLAIM-1', 'T1', [identity('sess-r1')]);
    assert.equal(assigned.ok, true);
    if (!assigned.ok) return;
    const reviewId = assigned.assignments[0].review_id;
    coord.captureBlindPass(reviewId, blindPass(reviewId, 'ACCEPT_SCOPE'));
    const out = coord.finalize(reviewId, 'ACCEPT_SCOPE');
    assert.equal(out.confirmation, 'CONFIRMATION');
    assert.equal(coord.get(reviewId)!.status, 'FINALIZED');
  });

  it('T3 with two same-provider reviewers rejected at coordinator assignment', () => {
    const writer = identity('sess-writer', 'deepseek', 'deepseek-pro');
    const coord = new ReviewCoordinator(writer, new CollectingSink());
    const result = coord.assignReviewers('CLAIM-T3', 'T3', [
      identity('sess-r1', 'deepseek', 'deepseek-pro'),
      identity('sess-r2', 'deepseek', 'deepseek-pro'),
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.rejected.some((r) => /diversity/.test(r)), 'rejected reason mentions diversity');
    }
  });

  it('sharded run dispatches reviewers concurrently (never serialized)', async () => {
    const coord = new ReviewCoordinator(identity('sess-writer'), new CollectingSink());
    const startOrder: string[] = [];
    const reviewer = async () => {
      startOrder.push('start');
      await new Promise((r) => setTimeout(r, 20));
      startOrder.push('done');
      return blindPass('REV-x', 'ACCEPT_SCOPE');
    };
    // T3 requires 2 reviewers with ≥1 different-provider-or-stronger; both must
    // START before either finishes (parallel dispatch, AM-0019 §5).
    const result = await coord.runShard('CLAIM-SHARD', 'T3', [
      identity('sess-s1'),
      identity('sess-s2', 'anthropic', 'claude-sonnet'),
    ], reviewer, 'ACCEPT_SCOPE');
    assert.equal(result.finalized.length, 2);
    assert.equal(startOrder[0], 'start');
    assert.equal(startOrder[1], 'start');
    assert.equal(startOrder[2], 'done');
  });
});

describe('calibration telemetry hooks (AM-0020 §10)', () => {
  it('worker self-PASS later rejected', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    const assigned = coord.assignReviewers('CLAIM-C1', 'T1', [identity('sess-r1')]);
    assert.equal(assigned.ok, true);
    if (!assigned.ok) return;
    const reviewId = assigned.assignments[0].review_id;
    coord.captureBlindPass(reviewId, blindPass(reviewId, 'NEEDS_REPAIR'));
    coord.finalize(reviewId, 'ACCEPT_SCOPE'); // worker self-PASS later rejected
    const events = sink.of('worker-self-pass-rejected');
    assert.equal(events.length, 1);
  });

  it('reviewer ACCEPT later rejected by a challenger', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    const assigned = coord.assignReviewers('CLAIM-C2', 'T-Global', [identity('sess-r1'), identity('sess-r2')]);
    assert.equal(assigned.ok, true);
    if (!assigned.ok) return;
    const reviewId = assigned.assignments[0].review_id;
    coord.captureBlindPass(reviewId, blindPass(reviewId, 'ACCEPT_SCOPE'));
    coord.finalize(reviewId, 'REJECT_EVIDENCE'); // challenger rejects the reviewer ACCEPT
    assert.equal(sink.of('reviewer-accept-rejected-by-challenger').length, 1);
  });

  it('false rejection overturned by adjudication', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    coord.recordFalseRejectionOverturned('REV-X', 'CLAIM-C3');
    assert.equal(sink.of('false-rejection-overturned').length, 1);
  });

  it('defect escape recorded with model/provider/domain', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    coord.recordDefectEscape('CLAIM-C4', identity('sess-r1', 'deepseek', 'deepseek-flash-high'), 'finance_concurrency');
    const events = sink.of('defect-escape-by-model-provider-domain');
    assert.equal(events.length, 1);
    const e = events[0];
    if (e.event === 'defect-escape-by-model-provider-domain') {
      assert.equal(e.model, 'deepseek-flash-high');
      assert.equal(e.provider, 'deepseek');
      assert.equal(e.domain, 'finance_concurrency');
    }
  });

  it('duplicate findings counted and repair-loop count recorded', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    coord.recordDuplicateFindings('CLAIM-C5', 3);
    coord.recordRepairLoop('CLAIM-C5', 2);
    assert.equal(sink.of('duplicate-findings').length, 1);
    assert.equal(sink.of('repair-loop-count').length, 1);
    assert.equal(sink.of('duplicate-findings')[0].event === 'duplicate-findings' ? (sink.of('duplicate-findings')[0] as { count: number }).count : 0, 3);
  });

  it('review latency/token/cost recorded on finalize', () => {
    const sink = new CollectingSink();
    const coord = new ReviewCoordinator(identity('sess-writer'), sink);
    const assigned = coord.assignReviewers('CLAIM-C6', 'T1', [identity('sess-r1')]);
    assert.equal(assigned.ok, true);
    if (!assigned.ok) return;
    const reviewId = assigned.assignments[0].review_id;
    coord.captureBlindPass(reviewId, blindPass(reviewId, 'ACCEPT_SCOPE'));
    coord.finalize(reviewId, 'ACCEPT_SCOPE', { latency_ms: 1200, tokens: 8000, cost: 0.05 });
    const events = sink.of('review-latency-token-cost');
    assert.equal(events.length, 1);
    const e = events[0];
    if (e.event === 'review-latency-token-cost') {
      assert.equal(e.latency_ms, 1200);
      assert.equal(e.tokens, 8000);
      assert.equal(e.cost, 0.05);
    }
  });
});
