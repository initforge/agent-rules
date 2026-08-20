/**
 * artifact-consistency.test.ts — M11-R33 cross-artifact consistency validator (AM-0020 §8).
 *
 * Covers all eleven §8 families: one pass + one violation per family, the
 * fail-closed behavior (report totals without raw runner output), and claim
 * scoping via `claimsAffectedByViolations`.
 */
import { describe, expect, it } from 'vitest';
import {
  validateCrossArtifactConsistency,
  claimsAffectedByViolations,
  type ConsistencyViolation,
  type ConsistencyInput,
} from '../src/artifact-consistency.js';

const EPOCH = Date.parse('2026-08-01T00:00:00.000Z');
const HOUR = 3600_000;

/** Helper asserting a check family produced exactly one violation of `kind`. */
function expectViolation(result: ReturnType<typeof validateCrossArtifactConsistency>, kind: string): ConsistencyViolation {
  expect(result.passed).toBe(false);
  const hit = result.violations.find((v) => v.kind === kind);
  expect(hit, `expected violation ${kind} in ${result.violations.map((v) => v.kind).join(', ') || '(none)'}`).toBeDefined();
  return hit as ConsistencyViolation;
}

function expectClean(result: ReturnType<typeof validateCrossArtifactConsistency>): void {
  expect(result.passed).toBe(true);
  expect(result.violations).toEqual([]);
  expect(typeof result.checked_at).toBe('string');
  expect(Number.isNaN(Date.parse(result.checked_at))).toBe(false);
}

describe('§8.1 — test totals vs report totals', () => {
  it('passes when raw runner totals sum exactly to the report totals', () => {
    const result = validateCrossArtifactConsistency({
      testTotals: [
        { source: 'unit', total: 10, passed: 9, failed: 1, skipped: 0 },
        { source: 'integration', total: 5, passed: 5, failed: 0, skipped: 0 },
      ],
      reportTotals: { total: 15, passed: 14, failed: 1, skipped: 0 },
    });
    expectClean(result);
  });

  it('violates on any field mismatch between raw sums and the report', () => {
    const result = validateCrossArtifactConsistency({
      testTotals: [{ source: 'unit', total: 10, passed: 10, failed: 0, skipped: 0 }],
      reportTotals: { total: 10, passed: 9, failed: 1, skipped: 0 },
    });
    expectViolation(result, 'TOTALS_MISMATCH');
  });
});

describe('§8.2 — claimed-removed warnings still present', () => {
  it('passes when present warnings are not claimed removed', () => {
    const result = validateCrossArtifactConsistency({
      warnings: [
        { file: 'runner.log', severity: 'warning', message: 'deprecation', claimed_removed: false },
        { file: 'runner.log', severity: 'error', message: 'flaky retry' },
      ],
    });
    expectClean(result);
  });

  it('violates when a warning claimed removed is still present', () => {
    const result = validateCrossArtifactConsistency({
      warnings: [{ file: 'runner.log', severity: 'error', message: 'db timeout', claimed_removed: true }],
    });
    const v = expectViolation(result, 'CLAIMED_REMOVED_WARNING_PRESENT');
    expect(v.artifact).toBe('runner.log');
  });
});

describe('§8.3 — ledger status vs report status', () => {
  it('passes when ledger and report statuses agree', () => {
    expectClean(validateCrossArtifactConsistency({ ledgerStatus: 'VERIFIED', reportStatus: 'VERIFIED' }));
  });

  it('violates when ledger and report statuses diverge', () => {
    const result = validateCrossArtifactConsistency({ ledgerStatus: 'PARTIAL', reportStatus: 'VERIFIED' });
    expectViolation(result, 'STATUS_MISMATCH');
  });
});

describe('§8.4 — open finding severity vs disposition', () => {
  it('passes when critical/high findings are accepted or wonfix', () => {
    const result = validateCrossArtifactConsistency({
      openFindings: [
        { id: 'F-1', severity: 'critical', disposition: 'wonfix' },
        { id: 'F-2', severity: 'high', disposition: 'accepted' },
        { id: 'F-3', severity: 'info', disposition: 'open' },
      ],
    });
    expectClean(result);
  });

  it('violates when a critical/high finding is still open', () => {
    const result = validateCrossArtifactConsistency({
      openFindings: [
        { id: 'F-1', severity: 'high', disposition: 'open' },
        { id: 'F-2', severity: 'medium', disposition: 'open' },
      ],
    });
    const v = expectViolation(result, 'OPEN_BLOCKING_FINDING');
    expect(v.artifact).toBe('finding:F-1');
  });
});

describe('§8.5 — evidence time vs candidate epoch', () => {
  it('passes when evidence is produced at/after the final candidate epoch', () => {
    const result = validateCrossArtifactConsistency({
      candidateEpoch: EPOCH,
      evidence: [
        { evidence_id: 'ev-1', produced_at: EPOCH, candidate_epoch: EPOCH, claim_id: 'CLAIM-A' },
        { evidence_id: 'ev-2', produced_at: EPOCH + HOUR, candidate_epoch: EPOCH, claim_id: 'CLAIM-B' },
      ],
    });
    expectClean(result);
  });

  it('violates when evidence predates the final candidate epoch and scopes the claim', () => {
    const result = validateCrossArtifactConsistency({
      candidateEpoch: EPOCH,
      evidence: [
        { evidence_id: 'ev-1', produced_at: EPOCH - HOUR, candidate_epoch: EPOCH, claim_id: 'CLAIM-A' },
        { evidence_id: 'ev-2', produced_at: EPOCH + HOUR, candidate_epoch: EPOCH, claim_id: 'CLAIM-B' },
      ],
    });
    const v = expectViolation(result, 'EVIDENCE_PREDATES_EPOCH');
    expect(v.affects_claim_ids).toEqual(['CLAIM-A']);
  });
});

describe('§8.6 — source tree vs installed artifact vs container digests', () => {
  it('passes when all provided digests agree', () => {
    const result = validateCrossArtifactConsistency({
      sourceTreeDigest: 'sha256:abc',
      installedArtifactDigest: 'sha256:abc',
      containerDigest: 'sha256:abc',
    });
    expectClean(result);
  });

  it('violates when any provided digest pair disagrees', () => {
    const result = validateCrossArtifactConsistency({
      sourceTreeDigest: 'sha256:abc',
      installedArtifactDigest: 'sha256:def',
      containerDigest: 'sha256:abc',
    });
    const v = expectViolation(result, 'DIGEST_MISMATCH');
    expect(v.artifact).toContain('source-tree');
    expect(v.artifact).toContain('installed-artifact');
  });
});

describe('§8.7 — claimed coverage vs actually tested', () => {
  it('passes when every claimed coverage target was tested', () => {
    const result = validateCrossArtifactConsistency({
      coverage: [
        { route: '/checkout', claimed: true, tested: true },
        { role: 'admin', viewport: 'mobile', state: 'signed-in', claimed: true, tested: true },
        { route: '/home', claimed: false, tested: false },
      ],
    });
    expectClean(result);
  });

  it('violates when coverage is claimed but no test ran it', () => {
    const result = validateCrossArtifactConsistency({
      coverage: [
        { route: '/checkout', claimed: true, tested: false },
        { role: 'admin', claimed: true, tested: true },
      ],
    });
    const v = expectViolation(result, 'COVERAGE_CLAIMED_NOT_TESTED');
    expect(v.artifact).toBe('coverage:route:/checkout');
  });
});

describe('§8.8 — reviewer capabilities vs verdict type', () => {
  it('passes when the reviewer holds every capability its verdicts require', () => {
    const result = validateCrossArtifactConsistency({
      reviewerCapabilities: [
        { reviewer_id: 'reviewer-vision', capability: 'vision', verdict: 'VISUAL_PASS' },
        { reviewer_id: 'reviewer-vision', capability: 'cdp', verdict: 'RAW_CDP_PASS' },
        { reviewer_id: 'reviewer-t1', capability: 'specialist', verdict: 'STANDARD_PASS' },
      ],
    });
    expectClean(result);
  });

  it('violates when a reviewer issues a verdict for a capability it lacks', () => {
    const result = validateCrossArtifactConsistency({
      reviewerCapabilities: [
        { reviewer_id: 'reviewer-blind', capability: 'specialist', verdict: 'VISUAL_PASS' },
        { reviewer_id: 'reviewer-blind', capability: 'specialist', verdict: 'RAW_CDP_PASS' },
      ],
    });
    const v = expectViolation(result, 'CAPABILITY_MISSING_FOR_VERDICT');
    expect(v.artifact).toBe('reviewer:reviewer-blind');
  });
});

describe('§8.9 — PARTIAL/HIGH_DIFF/SKIPPED/UNVERIFIED/advisory hidden by aggregate PASS', () => {
  it('passes when fail-closed records stay visible', () => {
    const result = validateCrossArtifactConsistency({
      aggregateRecords: [
        { record: 'rec-1', level: 'PARTIAL', hidden_by_aggregate_pass: false },
        { record: 'rec-2', level: 'ADVISORY', hidden_by_aggregate_pass: false },
      ],
    });
    expectClean(result);
  });

  it('violates when any fail-closed record is hidden by an aggregate PASS', () => {
    const result = validateCrossArtifactConsistency({
      aggregateRecords: [
        { record: 'rec-1', level: 'HIGH_DIFF', hidden_by_aggregate_pass: true },
        { record: 'rec-2', level: 'SKIPPED', hidden_by_aggregate_pass: false },
      ],
    });
    const v = expectViolation(result, 'AGGREGATE_PASS_HIDES_RECORD');
    expect(v.artifact).toBe('record:rec-1');
  });
});

describe('§8.10 — CDP claims vs actual CDP session use', () => {
  it('passes when raw-CDP claims carry a real CDP session', () => {
    const result = validateCrossArtifactConsistency({
      cdpClaims: [
        { claim_id: 'CLAIM-R20-1', uses_raw_cdp: true, has_cdp_session: true },
        { claim_id: 'CLAIM-R19-1', uses_raw_cdp: false, has_cdp_session: false },
      ],
    });
    expectClean(result);
  });

  it('violates when a raw-CDP claim has no CDP session and scopes the claim', () => {
    const result = validateCrossArtifactConsistency({
      cdpClaims: [
        { claim_id: 'CLAIM-R20-1', uses_raw_cdp: true, has_cdp_session: false },
        { claim_id: 'CLAIM-R20-2', uses_raw_cdp: true, has_cdp_session: true },
      ],
    });
    const v = expectViolation(result, 'RAW_CDP_WITHOUT_SESSION');
    expect(v.affects_claim_ids).toEqual(['CLAIM-R20-1']);
  });
});

describe('§8.11 — reference/target parity identity and environment', () => {
  it('passes when parity pairs share state and environment', () => {
    const result = validateCrossArtifactConsistency({
      parityPairs: [
        { pair_id: 'P-1', ref_state: 'signed-in', tgt_state: 'signed-in', ref_env: 'staging', tgt_env: 'staging' },
      ],
    });
    expectClean(result);
  });

  it('violates when state or environment differs between reference and target', () => {
    const result = validateCrossArtifactConsistency({
      parityPairs: [
        { pair_id: 'P-1', ref_state: 'signed-in', tgt_state: 'guest', ref_env: 'staging', tgt_env: 'staging' },
        { pair_id: 'P-2', ref_state: 'signed-in', tgt_state: 'signed-in', ref_env: 'staging', tgt_env: 'production' },
      ],
    });
    expectViolation(result, 'PARITY_INEQUIVALENCE');
  });
});

describe('fail-closed — missing mandatory data', () => {
  it('violates when the report asserts totals but no raw runner output exists', () => {
    const result = validateCrossArtifactConsistency({ reportTotals: { total: 42, passed: 42, failed: 0, skipped: 0 } });
    expectViolation(result, 'TOTALS_UNRECONCILABLE');
  });

  it('skips optional families that are absent (no violation, passed)', () => {
    expectClean(validateCrossArtifactConsistency({}));
  });
});

describe('claimsAffectedByViolations', () => {
  it('returns only the claims named in violation affects_claim_ids, in input order', () => {
    const violations: ConsistencyViolation[] = [
      { artifact: 'evidence:ev-1', kind: 'EVIDENCE_PREDATES_EPOCH', detail: 'd', affects_claim_ids: ['CLAIM-A'] },
      { artifact: 'claim:CLAIM-C', kind: 'RAW_CDP_WITHOUT_SESSION', detail: 'd', affects_claim_ids: ['CLAIM-C'] },
      { artifact: 'test-totals', kind: 'TOTALS_MISMATCH', detail: 'd', affects_claim_ids: [] },
    ];
    const affected = claimsAffectedByViolations(['CLAIM-A', 'CLAIM-B', 'CLAIM-C', 'CLAIM-D'], violations);
    expect(affected).toEqual(['CLAIM-A', 'CLAIM-C']);
    expect(affected).not.toContain('CLAIM-B');
    expect(affected).not.toContain('CLAIM-D');
  });

  it('returns an empty list when no violation names any given claim', () => {
    const violations: ConsistencyViolation[] = [
      { artifact: 'x', kind: 'STATUS_MISMATCH', detail: 'd', affects_claim_ids: ['CLAIM-Z'] },
    ];
    expect(claimsAffectedByViolations(['CLAIM-A', 'CLAIM-B'], violations)).toEqual([]);
  });
});
