/**
 * review-independence.ts — M11-R31 reviewer independence and diversity
 * (AM-0020 §5, §6, §10).
 *
 * Blind review is mandatory: a reviewer reads the plan, candidate and raw
 * evidence, creates threat hypotheses and adversarial probes, and forms a
 * provisional verdict BEFORE reading the worker's verdict. Only then may it
 * compare the worker report to ground truth. Review disagreements are NEVER
 * majority-voted: REVIEW_CONFLICT is resolved by deterministic reproduction
 * when both receipts reference reproducible evidence, otherwise by a strong
 * adjudicator given both arguments, the plan, candidate and raw evidence.
 *
 * Independence requires a distinct reviewer session (self-review and
 * same-session review are invalid) plus an ordering proof that the blind pass
 * was recorded before any comparison. T3 additionally requires at least one
 * reviewer that is different-provider-or-stronger than the writer.
 *
 * `ReviewCoordinator` assigns reviewers per claim tier (AM-0020 §6), enforces
 * blind-first ordering, records independence proofs, routes conflicts and
 * emits AM-0020 §10 calibration telemetry hooks. Reviews are sharded and
 * dispatched concurrently (AM-0019 §5): the coordinator never serializes.
 *
 * ponytail: R29 review-receipt.ts is a sibling worktree (absent here). This
 * module is self-contained; when R29 merges, `assertIndependence` composes as
 * the independence_proof supplier inside the R29 ReviewReceipt record.
 */
import type { RiskTier } from './claim-registry.js';

// ── verdicts (AM-0020 §5) ────────────────────────────────────────────────────

export const REVIEW_VERDICTS = [
  'ACCEPT_SCOPE', 'NEEDS_REPAIR', 'REJECT_EVIDENCE', 'REVIEW_CONFLICT', 'CAPABILITY_MISSING',
] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

// ── identities ───────────────────────────────────────────────────────────────

export interface ModelIdentity {
  /** What the caller asked for (AM-0019 §5 requested/resolved/observed). */
  requested: string;
  resolved: string;
  /** What was actually observed at the runtime (no silent substitution). */
  observed: string;
}

export interface AgentIdentity {
  session: string;
  provider: string;
  model: ModelIdentity;
}

export type ReviewerIdentity = AgentIdentity;
export type WriterIdentity = AgentIdentity;

// ── independence proof (AM-0020 §5) ──────────────────────────────────────────

export type OrderingEventName = 'blind_pass_captured' | 'worker_verdict_read';

export interface OrderingEvent {
  event: OrderingEventName;
  at: string;
}

export interface IndependenceProof {
  reviewer_session: string;
  writer_session: string;
  provider: string;
  model: ModelIdentity;
  blind_review_completed: boolean;
  threat_hypotheses: string[];
  adversarial_probes: string[];
  verdict_formed_before_comparing: boolean;
  /** Ordering evidence: blind pass capture must precede worker-verdict read. */
  ordering_evidence: OrderingEvent[];
}

export interface IndependenceEvidence {
  blind_review_completed: boolean;
  threat_hypotheses: string[];
  adversarial_probes: string[];
  verdict_formed_before_comparing: boolean;
  ordering_evidence: OrderingEvent[];
}

export type IndependenceResult =
  | { status: 'INDEPENDENT' }
  | { status: 'NOT_INDEPENDENT'; reason: string };

export interface IndependenceOptions {
  tier?: RiskTier;
  /** Full reviewer set for the claim — T3 diversity is evaluated across it. */
  reviewers?: readonly ReviewerIdentity[];
}

// ── model strength / diversity (AM-0020 §6) ──────────────────────────────────

/** DeepSeek ordering: Flash High < Flash Max < Pro (AM-0020 §10 routing). */
const MODEL_STRENGTH: Readonly<Record<string, number>> = {
  'deepseek-flash-high': 1,
  'deepseek-flash-max': 2,
  'deepseek-pro': 3,
};

export function modelStrength(model: string): number {
  if (MODEL_STRENGTH[model] !== undefined) return MODEL_STRENGTH[model];
  if (/pro|max/i.test(model)) return 2;
  return 1;
}

/** A reviewer is "different-provider-or-stronger" than the writer. */
export function isDifferentProviderOrStronger(reviewer: ReviewerIdentity, writer: WriterIdentity): boolean {
  return reviewer.provider !== writer.provider
    || modelStrength(reviewer.model.observed) > modelStrength(writer.model.observed);
}

// ── required reviewers per tier (AM-0020 §6 topology) ────────────────────────

export interface RequiredReviewers {
  count: number;
  specialist?: boolean;
  vision?: boolean;
  strong_or_different_provider?: boolean;
  blind_challenger?: boolean;
  /** T0 may be satisfied by a deterministic verifier alone; count is advisory. */
  deterministic_only?: boolean;
}

/**
 * AM-0020 §6 review topology. R29's ReviewReceipt consumes this via
 * `requiredReviewersFor`; implemented here until the sibling merges.
 */
export function requiredReviewersFor(tier: RiskTier): RequiredReviewers {
  switch (tier) {
    case 'T0': return { count: 0, deterministic_only: true };
    case 'T1': return { count: 1 };
    case 'T2': return { count: 1, specialist: true };
    case 'T3': return { count: 2, specialist: true, strong_or_different_provider: true };
    case 'T-Visual': return { count: 1, vision: true };
    case 'T-Global': return { count: 2, specialist: true, blind_challenger: true };
  }
}

// ── assertIndependence ───────────────────────────────────────────────────────

function orderingViolation(evidence: IndependenceEvidence): string | null {
  const blind = evidence.ordering_evidence.find((e) => e.event === 'blind_pass_captured');
  const read = evidence.ordering_evidence.find((e) => e.event === 'worker_verdict_read');
  if (!blind) return 'no blind_pass_captured ordering event — blind pass was not recorded';
  const blindAt = Date.parse(blind.at);
  if (Number.isNaN(blindAt)) return 'blind_pass_captured has no parseable timestamp';
  if (read) {
    const readAt = Date.parse(read.at);
    if (Number.isNaN(readAt)) return 'worker_verdict_read has no parseable timestamp';
    if (readAt <= blindAt) return 'worker_verdict_read predates blind_pass_captured — ordering proof violated';
  }
  return null;
}

export function assertIndependence(
  reviewer: ReviewerIdentity,
  writer: WriterIdentity,
  evidence: IndependenceEvidence,
  opts: IndependenceOptions = {},
): IndependenceResult {
  if (reviewer.session === writer.session) {
    return { status: 'NOT_INDEPENDENT', reason: `same-session review: reviewer and writer share session ${reviewer.session}` };
  }
  if (evidence.blind_review_completed !== true) {
    return { status: 'NOT_INDEPENDENT', reason: 'blind review not recorded as completed' };
  }
  if (evidence.threat_hypotheses.length === 0) {
    return { status: 'NOT_INDEPENDENT', reason: 'no threat hypotheses recorded before comparison' };
  }
  if (evidence.adversarial_probes.length === 0) {
    return { status: 'NOT_INDEPENDENT', reason: 'no adversarial probes recorded before comparison' };
  }
  if (evidence.verdict_formed_before_comparing !== true) {
    return { status: 'NOT_INDEPENDENT', reason: 'verdict formed after reading the worker verdict — blind-first ordering violated' };
  }
  const vo = orderingViolation(evidence);
  if (vo) return { status: 'NOT_INDEPENDENT', reason: vo };
  if (opts.tier === 'T3') {
    const reviewers = (opts.reviewers && opts.reviewers.length > 0) ? opts.reviewers : [reviewer];
    const hasDiverse = reviewers.some((r) => isDifferentProviderOrStronger(r, writer));
    if (!hasDiverse) {
      return {
        status: 'NOT_INDEPENDENT',
        reason: 'T3 diversity violated: no reviewer is different-provider-or-stronger than the writer',
      };
    }
  }
  return { status: 'INDEPENDENT' };
}

// ── blind review protocol (AM-0020 §5) ───────────────────────────────────────

export interface BlindReviewPass {
  review_id: string;
  threat_hypotheses: string[];
  adversarial_probes: string[];
  provisional_verdict: ReviewVerdict;
  /** Timestamp captured BEFORE the reviewer reads the worker verdict. */
  captured_at: string;
}

export interface ReviewFinding {
  finding_id: string;
  scope: string;
  disposition: 'BLOCKING' | 'ADVISORY' | 'CLEAN';
  summary: string;
}

export interface ReviewReceiptRef {
  review_id: string;
  claim_id: string;
  risk_tier: RiskTier;
  reviewer: ReviewerIdentity;
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  /** Raw evidence references the review bound (deterministic reproduction possible). */
  evidence_refs: string[];
  reproducible: boolean;
  verdict_formed_before_comparing: boolean;
}

export interface ReviewFinalization {
  review_id: string;
  confirmation: 'CONFIRMATION' | 'DIVERGENCE';
  blind_verdict: ReviewVerdict;
  worker_verdict: ReviewVerdict;
  final_verdict: ReviewVerdict;
  compared_at: string;
}

export class BlindReviewProtocolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BlindReviewProtocolError';
    this.code = code;
  }
}

/**
 * Compare the blind provisional verdict against the worker verdict. Throws
 * when the blind pass was not captured, when hypotheses/probes are missing,
 * when the pass postdates the comparison, or when the reviewer's verdict was
 * formed before the blind pass (ordering inversion).
 */
export function finalizeReview(
  receipt: ReviewReceiptRef,
  blindPass: BlindReviewPass,
  workerVerdict: ReviewVerdict,
  now = new Date().toISOString(),
): ReviewFinalization {
  if (!blindPass.captured_at) throw new BlindReviewProtocolError('NO_BLIND_PASS', `review ${receipt.review_id}: blind pass has no captured_at`);
  if (blindPass.threat_hypotheses.length === 0) throw new BlindReviewProtocolError('NO_HYPOTHESES', `review ${receipt.review_id}: blind pass has no threat hypotheses`);
  if (blindPass.adversarial_probes.length === 0) throw new BlindReviewProtocolError('NO_PROBES', `review ${receipt.review_id}: blind pass has no adversarial probes`);
  if (receipt.verdict_formed_before_comparing !== true) {
    throw new BlindReviewProtocolError('VERDICT_BEFORE_BLIND', `review ${receipt.review_id}: verdict was formed before the blind pass — blind-first ordering violated`);
  }
  const blindAt = Date.parse(blindPass.captured_at);
  const compareAt = Date.parse(now);
  if (Number.isNaN(blindAt) || Number.isNaN(compareAt)) {
    throw new BlindReviewProtocolError('BAD_TIMESTAMP', `review ${receipt.review_id}: blind/comparison timestamps unparseable`);
  }
  if (compareAt <= blindAt) {
    throw new BlindReviewProtocolError('BLIND_AFTER_COMPARISON', `review ${receipt.review_id}: blind pass postdates comparison — ordering proof violated`);
  }
  return {
    review_id: receipt.review_id,
    confirmation: blindPass.provisional_verdict === workerVerdict ? 'CONFIRMATION' : 'DIVERGENCE',
    blind_verdict: blindPass.provisional_verdict,
    worker_verdict: workerVerdict,
    final_verdict: blindPass.provisional_verdict,
    compared_at: now,
  };
}

// ── conflict protocol (AM-0020 §5) — never majority vote ─────────────────────

export interface AdjudicatorRecord {
  adjudicator_session: string;
  provider: string;
  model: ModelIdentity;
  arguments_from: { reviewer_a: string; reviewer_b: string };
  plan_ref: string;
  candidate_ref: string;
  raw_evidence_refs: string[];
  decision: ReviewVerdict | null;
  basis: string | null;
}

export interface ConflictReproducer {
  (a: ReviewReceiptRef, b: ReviewReceiptRef): { verdict: ReviewVerdict; reproduction_ref: string } | null;
}

export type ConflictResolution =
  | { resolution: 'DETERMINISTIC_REPRODUCTION'; verdict: ReviewVerdict; reproduction_ref: string }
  | { resolution: 'ADJUDICATOR_ROUTED'; record: AdjudicatorRecord };

/** Two findings on the same scope with opposite disposition contradict. */
export function contradicts(a: ReviewFinding, b: ReviewFinding): boolean {
  return a.scope === b.scope
    && a.disposition !== b.disposition
    && (a.disposition === 'CLEAN' || b.disposition === 'CLEAN');
}

export function contradictoryFindings(a: ReviewReceiptRef, b: ReviewReceiptRef): boolean {
  for (const fa of a.findings) {
    for (const fb of b.findings) {
      if (contradicts(fa, fb)) return true;
    }
  }
  return false;
}

/**
 * Two reviews on the same claim whose findings contradict → REVIEW_CONFLICT,
 * even when both verdicts are ACCEPT_SCOPE. Majority counting is forbidden.
 */
export function detectConflict(a: ReviewReceiptRef, b: ReviewReceiptRef): boolean {
  return a.claim_id === b.claim_id && contradictoryFindings(a, b);
}

export function resolveConflict(
  a: ReviewReceiptRef,
  b: ReviewReceiptRef,
  reproducer?: ConflictReproducer,
  adjudicator: Omit<AdjudicatorRecord, 'decision' | 'basis'> = {
    adjudicator_session: `adjudicator-${a.claim_id}`,
    provider: 'deepseek',
    model: { requested: 'deepseek-pro', resolved: 'deepseek-pro', observed: 'deepseek-pro' },
    arguments_from: { reviewer_a: a.review_id, reviewer_b: b.review_id },
    plan_ref: 'plan-original.md',
    candidate_ref: 'candidate-epoch',
    raw_evidence_refs: [...new Set([...a.evidence_refs, ...b.evidence_refs])],
  },
): ConflictResolution {
  const bothReproducible = a.reproducible && b.reproducible
    && a.evidence_refs.length > 0 && b.evidence_refs.length > 0;
  if (bothReproducible && reproducer) {
    const r = reproducer(a, b);
    if (r) {
      return { resolution: 'DETERMINISTIC_REPRODUCTION', verdict: r.verdict, reproduction_ref: r.reproduction_ref };
    }
  }
  return {
    resolution: 'ADJUDICATOR_ROUTED',
    record: { ...adjudicator, decision: null, basis: null },
  };
}

// ── calibration telemetry (AM-0020 §10) ──────────────────────────────────────

export type CalibrationEvent =
  | { event: 'worker-self-pass-rejected'; review_id: string; claim_id: string; model: string; provider: string }
  | { event: 'reviewer-accept-rejected-by-challenger'; review_id: string; claim_id: string }
  | { event: 'false-rejection-overturned'; review_id: string; claim_id: string }
  | { event: 'defect-escape-by-model-provider-domain'; claim_id: string; model: string; provider: string; domain: string }
  | { event: 'duplicate-findings'; claim_id: string; count: number }
  | { event: 'repair-loop-count'; claim_id: string; count: number }
  | { event: 'review-latency-token-cost'; review_id: string; latency_ms: number; tokens: number; cost: number }
  | { event: 'capability-mismatch-cost'; claim_id: string; capability: string; cost: number };

export interface CalibrationSink {
  record(event: CalibrationEvent): void;
}

// ── ReviewCoordinator ────────────────────────────────────────────────────────

export interface ReviewAssignment {
  review_id: string;
  claim_id: string;
  risk_tier: RiskTier;
  reviewer: ReviewerIdentity;
  status: 'ASSIGNED' | 'BLIND_CAPTURED' | 'FINALIZED' | 'CONFLICT' | 'ADJUDICATED';
  blind_pass: BlindReviewPass | null;
  receipt: ReviewReceiptRef | null;
  finalization: ReviewFinalization | null;
}

export interface ShardReviewer {
  /** Run the reviewer concurrently; returns the blind pass captured pre-comparison. */
  (assignment: ReviewAssignment): Promise<BlindReviewPass>;
}

export interface ShardResult {
  assignments: ReviewAssignment[];
  finalized: ReviewAssignment[];
  failed: Array<{ review_id: string; reason: string }>;
}

export class ReviewCoordinator {
  readonly writer: WriterIdentity;
  readonly sink: CalibrationSink;
  readonly assignments: ReviewAssignment[] = [];
  private _now: () => string;

  constructor(writer: WriterIdentity, sink: CalibrationSink, now: () => string = () => new Date().toISOString()) {
    this.writer = writer;
    this.sink = sink;
    this._now = now;
  }

  requiredFor(tier: RiskTier): RequiredReviewers {
    return requiredReviewersFor(tier);
  }

  /**
   * Assign reviewers to a claim. Enforces the per-tier required count,
   * session independence from the writer, and T3 diversity across the set.
   * Returns a rejected reason array — invalid assignments are never issued.
   *
   * Assignment-time checks cover only what is knowable before the review runs
   * (session distinctness, T3 diversity); the blind-pass ordering proof is
   * enforced at capture/finalize time.
   */
  assignReviewers(claim_id: string, tier: RiskTier, candidates: readonly ReviewerIdentity[]): { ok: true; assignments: ReviewAssignment[] } | { ok: false; rejected: string[] } {
    const req = requiredReviewersFor(tier);
    if (candidates.length < req.count) {
      return { ok: false, rejected: [`${claim_id} (${tier}): required ${req.count} reviewer(s), got ${candidates.length}`] };
    }
    const selected = candidates.slice(0, req.count);
    const rejected: string[] = [];
    const assignments: ReviewAssignment[] = [];
    for (const reviewer of selected) {
      if (reviewer.session === this.writer.session) {
        rejected.push(`reviewer ${reviewer.session}: same-session review`);
        continue;
      }
      if (tier === 'T3') {
        const hasDiverse = selected.some((r) => isDifferentProviderOrStronger(r, this.writer));
        if (!hasDiverse) {
          rejected.push(`reviewer ${reviewer.session}: T3 diversity violated — no reviewer is different-provider-or-stronger than the writer`);
          continue;
        }
      }
      assignments.push({
        review_id: `REV-${claim_id}-${reviewer.session}`,
        claim_id,
        risk_tier: tier,
        reviewer,
        status: 'ASSIGNED',
        blind_pass: null,
        receipt: null,
        finalization: null,
      });
    }
    if (rejected.length > 0 || assignments.length < req.count) {
      return { ok: false, rejected: rejected.length > 0 ? rejected : [`${claim_id}: could not assemble ${req.count} independent reviewer(s)`] };
    }
    this.assignments.push(...assignments);
    return { ok: true, assignments };
  }

  get(review_id: string): ReviewAssignment | undefined {
    return this.assignments.find((a) => a.review_id === review_id);
  }

  /**
   * Record the blind pass BEFORE the reviewer may read the worker verdict.
   * Fails the assignment when the pass postdates an existing comparison.
   */
  captureBlindPass(review_id: string, pass: BlindReviewPass): ReviewAssignment {
    const assignment = this.get(review_id);
    if (!assignment) throw new BlindReviewProtocolError('UNKNOWN_REVIEW', `no assignment ${review_id}`);
    if (assignment.finalization) {
      throw new BlindReviewProtocolError('BLIND_AFTER_COMPARISON', `review ${review_id}: blind pass recorded after finalization`);
    }
    if (pass.threat_hypotheses.length === 0 || pass.adversarial_probes.length === 0) {
      throw new BlindReviewProtocolError('EMPTY_BLIND_PASS', `review ${review_id}: blind pass must carry hypotheses and probes`);
    }
    assignment.blind_pass = pass;
    assignment.status = 'BLIND_CAPTURED';
    return assignment;
  }

  /**
   * Finalize: compare blind verdict against the worker verdict and emit
   * calibration hooks. Enforces blind-first ordering (throws otherwise).
   */
  finalize(review_id: string, workerVerdict: ReviewVerdict, meta: { latency_ms?: number; tokens?: number; cost?: number } = {}): ReviewFinalization {
    const assignment = this.get(review_id);
    if (!assignment) throw new BlindReviewProtocolError('UNKNOWN_REVIEW', `no assignment ${review_id}`);
    const blindPass = assignment.blind_pass;
    if (!blindPass) throw new BlindReviewProtocolError('NO_BLIND_PASS', `review ${review_id}: blind pass must be captured before comparison`);

    const now = this._now();
    const receipt: ReviewReceiptRef = {
      review_id,
      claim_id: assignment.claim_id,
      risk_tier: assignment.risk_tier,
      reviewer: assignment.reviewer,
      verdict: blindPass.provisional_verdict,
      findings: [],
      evidence_refs: [],
      reproducible: false,
      verdict_formed_before_comparing: true,
    };
    const result = finalizeReview(receipt, blindPass, workerVerdict, now);
    assignment.receipt = { ...receipt, verdict: result.final_verdict };
    assignment.finalization = result;
    assignment.status = 'FINALIZED';

    const model = assignment.reviewer.model.observed;
    const provider = assignment.reviewer.provider;
    // Worker self-PASS later rejected.
    if (workerVerdict === 'ACCEPT_SCOPE' && result.final_verdict !== 'ACCEPT_SCOPE') {
      this.sink.record({ event: 'worker-self-pass-rejected', review_id, claim_id: assignment.claim_id, model, provider });
    }
    // Reviewer ACCEPT later rejected by a challenger (T-Global blind challenger).
    if (assignment.risk_tier === 'T-Global' && result.final_verdict === 'ACCEPT_SCOPE' && workerVerdict !== 'ACCEPT_SCOPE') {
      this.sink.record({ event: 'reviewer-accept-rejected-by-challenger', review_id, claim_id: assignment.claim_id });
    }
    if (meta.latency_ms !== undefined || meta.tokens !== undefined || meta.cost !== undefined) {
      this.sink.record({
        event: 'review-latency-token-cost',
        review_id,
        latency_ms: meta.latency_ms ?? 0,
        tokens: meta.tokens ?? 0,
        cost: meta.cost ?? 0,
      });
    }
    return result;
  }

  /** Reviewer lacks a required capability → capability-mismatch cost hook. */
  recordCapabilityMismatch(claim_id: string, capability: string, cost: number): void {
    this.sink.record({ event: 'capability-mismatch-cost', claim_id, capability, cost });
  }

  /** Defect escaped review and was caught later — record model/provider/domain. */
  recordDefectEscape(claim_id: string, reviewer: ReviewerIdentity, domain: string): void {
    this.sink.record({
      event: 'defect-escape-by-model-provider-domain',
      claim_id,
      model: reviewer.model.observed,
      provider: reviewer.provider,
      domain,
    });
  }

  /** Duplicate findings consolidated by root cause → count hook. */
  recordDuplicateFindings(claim_id: string, duplicates: number): void {
    if (duplicates > 0) this.sink.record({ event: 'duplicate-findings', claim_id, count: duplicates });
  }

  /** Same root cause repaired repeatedly → repair-loop count hook. */
  recordRepairLoop(claim_id: string, count: number): void {
    this.sink.record({ event: 'repair-loop-count', claim_id, count });
  }

  /** Adjudication overturned a rejection → false-rejection-overturned hook. */
  recordFalseRejectionOverturned(review_id: string, claim_id: string): void {
    this.sink.record({ event: 'false-rejection-overturned', review_id, claim_id });
  }

  /**
   * Sharded parallel dispatch (AM-0019 §5). All reviewer runners are launched
   * concurrently via Promise.allSettled — the coordinator never serializes.
   * Blind passes are collected asynchronously and finalized in the same pass.
   */
  async runShard(
    claim_id: string,
    tier: RiskTier,
    candidates: readonly ReviewerIdentity[],
    runReviewer: ShardReviewer,
    workerVerdict: ReviewVerdict,
    meta: { latency_ms?: number; tokens?: number; cost?: number } = {},
  ): Promise<ShardResult> {
    const assigned = this.assignReviewers(claim_id, tier, candidates);
    if (!assigned.ok) {
      return { assignments: [], finalized: [], failed: assigned.rejected.map((reason) => ({ review_id: claim_id, reason })) };
    }
    const started = assigned.assignments.map((a) => runReviewer(a));
    const settled = await Promise.allSettled(started);
    const finalized: ReviewAssignment[] = [];
    const failed: Array<{ review_id: string; reason: string }> = [];
    settled.forEach((s, i) => {
      const a = assigned.assignments[i];
      if (s.status === 'fulfilled') {
        this.captureBlindPass(a.review_id, s.value);
        this.finalize(a.review_id, workerVerdict, meta);
        finalized.push(this.get(a.review_id)!);
      } else {
        failed.push({ review_id: a.review_id, reason: s.reason instanceof Error ? s.reason.message : String(s.reason) });
      }
    });
    return { assignments: assigned.assignments, finalized, failed };
  }
}
