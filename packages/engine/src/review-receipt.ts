/**
 * review-receipt.ts — M11-R29 capability-qualified verdicts (AM-0020 §5–6).
 *
 * A `ReviewReceipt` is the only object that may accept a claim scope. §5 fields:
 * review_id, claim_scope, risk_tier, candidate_epoch, reviewer_session,
 * reviewer_model_provider_effort, capability_attestation, independence_proof,
 * blind_review_completed, threat_hypotheses, adversarial_probes,
 * evidence_reproduced, findings, coverage, verdict, confidence, limitations.
 *
 * Verdicts are a closed 5-set: ACCEPT_SCOPE | NEEDS_REPAIR | REJECT_EVIDENCE |
 * REVIEW_CONFLICT | CAPABILITY_MISSING. ACCEPT_SCOPE never means project
 * complete — only the engine terminal gate (claim-registry formula evaluation +
 * this receipt gate) may determine project state.
 *
 * Invalid by construction (each rejected with a single fail-closed reason):
 *   - verdict outside the allowed set
 *   - claim_scope that does not cover the claim's scope labels
 *   - risk_tier mismatch
 *   - candidate_epoch different from the final epoch
 *   - same-session / self-review (reviewer_session == writer session)
 *   - missing independence_proof
 *   - ACCEPT_SCOPE without the claim's required_capabilities attested
 *     (no 'vision' ⇒ cannot accept a T-Visual claim; no 'cdp' ⇒ cannot accept a
 *     raw-CDP claim; no 'specialist' ⇒ cannot accept a T2/T3 claim)
 *   - blind_review_completed false
 *   - T2/T3 with no adversarial probes and no recorded deterministic-proof
 *     justification (link to M11-R30 §7 gate: a negative probe is required
 *     unless a deterministic proof makes it formally unnecessary)
 *
 * Tier topology (§6): T0 none (deterministic verifier), T1 one independent
 * economical reviewer, T2 specialist + adversarial probe, T3 two independent
 * reviewers with ≥1 strong or different-provider reviewer, T-Visual
 * deterministic visual compiler + vision-capable reviewer, T-Global sharded
 * specialists + blind final challenger.
 */
import type { CapabilityStatus } from './contracts.js';
import { candidateEpochHash, type CandidateEpoch } from './candidate-epoch.js';
import {
  evaluateClaimFormulas,
  type ClaimDefinition,
  type ClaimEvidenceInput,
  type RiskTier,
} from './plan-readiness.js';
import type { Counterexample } from './adversarial-compiler.js';

// ── §5 verdicts and receipt shape ────────────────────────────────────────────

export const REVIEW_VERDICTS = [
  'ACCEPT_SCOPE', 'NEEDS_REPAIR', 'REJECT_EVIDENCE', 'REVIEW_CONFLICT', 'CAPABILITY_MISSING',
] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export type ReviewerStrength = 'economy' | 'standard' | 'expert';

/**
 * Requested/resolved/observed model + provider + effort per reviewer. The three
 * model fields must come from adapter observation (HostAttestation model roles),
 * never inferred — silent model/capability substitution is invalid (AM-0020 §12).
 */
export interface ReviewerModelProviderEffort {
  readonly requested_model: string;
  readonly resolved_model: string;
  readonly observed_model: string;
  readonly provider: string;
  readonly effort: ReviewerStrength;
}

/** AM-0020 §5 ReviewReceipt — all listed fields are required. */
export interface ReviewReceipt {
  readonly review_id: string;
  /** Scope labels the receipt covers; must ⊇ the claim's scope labels. */
  readonly claim_scope: string[];
  readonly risk_tier: RiskTier;
  /** Content hash of the reviewed CandidateEpoch (candidateEpochHash). */
  readonly candidate_epoch: string;
  readonly reviewer_session: string;
  readonly reviewer_model_provider_effort: ReviewerModelProviderEffort;
  /** Capabilities the reviewer attests (vision/cdp/specialist/deterministic-verifier…). */
  readonly capability_attestation: string[];
  /** Non-empty proof of independence (separate session + read-only review evidence ref). */
  readonly independence_proof: string;
  readonly blind_review_completed: boolean;
  /** Created before reading the worker verdict (blind pass). */
  readonly threat_hypotheses: string[];
  /** Negative probe ids executed against the claim (M11-R30 §7). */
  readonly adversarial_probes: string[];
  /** Recorded justification when a deterministic proof makes probes unnecessary (R30 link). */
  readonly deterministic_proof_justification?: string;
  /** Evidence ids the reviewer independently reproduced. */
  readonly evidence_reproduced: string[];
  /** Normalized, deduplicated findings. */
  readonly findings: string[];
  readonly coverage: string;
  readonly verdict: ReviewVerdict;
  /** 0..1 calibration score, never a substitute for evidence. */
  readonly confidence: number;
  readonly limitations: string[];
  /** Optional receipt fingerprint of the reviewed claim state for staleness. */
  readonly reviewed_claim_fingerprint?: string;
  /** T-Global blind final challenger marker. */
  readonly blind_challenger?: boolean;
}

// ── Reviewer registry (adapter capability observation, engine-side) ──────────

/**
 * Adapter-observed reviewer record. Mirrors the HostAttestation model roles
 * (requested/resolved/observed) and reuses the `CapabilityStatus` concept from
 * contracts.ts: HOST_NATIVE / ADAPTER_ENFORCED / EMULATED / UNSUPPORTED /
 * UNVERIFIED. This is a wrap of the platform adapter capability reporting —
 * the adapters are not reimplemented here.
 */
export interface ReviewerRecord {
  readonly session_id: string;
  readonly provider: string;
  readonly model: string;
  readonly strength: ReviewerStrength;
  /** Observed capabilities (e.g. vision, cdp, specialist). */
  readonly capabilities: string[];
  readonly capability_status: CapabilityStatus;
  readonly requested_model: string;
  readonly resolved_model: string;
  readonly observed_model: string;
}

export interface ReviewerRegistry {
  /** The session that wrote the candidate. Self-review compares against it. */
  readonly writer: ReviewerRecord;
  /** Distinct reviewer sessions observed via the adapter. */
  readonly reviewers: readonly ReviewerRecord[];
}

/**
 * Engine-side wrap of adapter capability reporting: fold a HostAttestation's
 * model evidence (requested/resolved/observed) plus a declared review-capability
 * set into a ReviewerRecord. Capability ids from the adapter (e.g. opencode:run)
 * stay untouched; review capabilities are declared per session and verified by
 * the receipt gate.
 */
export function reviewerRecordFromAttestation(
  attestation: {
    readonly host: string;
    readonly requestedModel: string;
    readonly resolvedModel: string;
    readonly observedModel: string;
    readonly capabilityStatus: CapabilityStatus;
    readonly capabilityIds: readonly string[];
  },
  opts: {
    readonly session_id: string;
    readonly provider: string;
    readonly strength: ReviewerStrength;
    /** Review capabilities observed for this session (vision/cdp/specialist). */
    readonly capabilities: readonly string[];
  },
): ReviewerRecord {
  return {
    session_id: opts.session_id,
    provider: opts.provider,
    model: attestation.observedModel,
    strength: opts.strength,
    capabilities: [...opts.capabilities],
    capability_status: attestation.capabilityStatus,
    requested_model: attestation.requestedModel,
    resolved_model: attestation.resolvedModel,
    observed_model: attestation.observedModel,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic fingerprint of a claim's review-relevant fields. */
export function claimFingerprint(claim: ClaimDefinition): string {
  const pick: Record<string, unknown> = {
    claim_id: claim.claim_id,
    scope: [...claim.scope].sort(),
    risk_tier: claim.risk_tier,
    required_capabilities: [...claim.required_capabilities].sort(),
    meaning: claim.meaning,
  };
  return JSON.stringify(pick);
}

export function findReviewer(registry: ReviewerRegistry, sessionId: string): ReviewerRecord | undefined {
  if (registry.writer.session_id === sessionId) return registry.writer;
  return registry.reviewers.find((r) => r.session_id === sessionId);
}

export type ReceiptValidation = { readonly valid: true } | { readonly valid: false; readonly reason: string };

function invalid(reason: string): ReceiptValidation {
  return { valid: false, reason };
}

// ── §5 receipt validation ────────────────────────────────────────────────────

export interface ValidateReceiptContext {
  readonly claim: ClaimDefinition;
  readonly epoch: CandidateEpoch;
  readonly reviewerRegistry: ReviewerRegistry;
  /** Compiled R30 probes for probe-id linkage (optional). */
  readonly compiledProbes?: readonly Counterexample[];
}

/**
 * Validate a single receipt against the claim, final epoch and registry.
 * Fail-closed: the first violated rule wins, in §5 order. ACCEPT_SCOPE is a
 * capability-qualified verdict — it requires every claim capability to be
 * attested. Non-accepting verdicts do not (a no-vision reviewer may still
 * flag defects), and `CAPABILITY_MISSING` is exactly the verdict that reports
 * the gap.
 */
export function validateReceipt(receipt: ReviewReceipt, ctx: ValidateReceiptContext): ReceiptValidation {
  if (!REVIEW_VERDICTS.includes(receipt.verdict)) {
    return invalid(`verdict '${receipt.verdict}' is not in the allowed set {${REVIEW_VERDICTS.join(', ')}}`);
  }
  if (typeof receipt.review_id !== 'string' || receipt.review_id.trim().length === 0) {
    return invalid('missing review_id');
  }
  if (typeof receipt.confidence !== 'number' || receipt.confidence < 0 || receipt.confidence > 1) {
    return invalid(`confidence must be in [0,1], got ${receipt.confidence}`);
  }

  // scope coverage: every label the claim carries must be covered by the receipt.
  const missingScope = ctx.claim.scope.filter((label) => !receipt.claim_scope.includes(label));
  if (missingScope.length > 0) {
    return invalid(`claim_scope does not cover the claim: missing ${missingScope.join(', ')}`);
  }
  if (receipt.risk_tier !== ctx.claim.risk_tier) {
    return invalid(`risk_tier mismatch: receipt ${receipt.risk_tier} vs claim ${ctx.claim.risk_tier}`);
  }
  if (receipt.candidate_epoch !== candidateEpochHash(ctx.epoch)) {
    return invalid('candidate_epoch does not equal the final candidate epoch');
  }

  // independence: reviewer must be a distinct, registered session with a proof.
  const writerSession = ctx.reviewerRegistry.writer.session_id;
  if (receipt.reviewer_session === writerSession) {
    return invalid('self-review: reviewer_session equals the writer session');
  }
  const reviewer = findReviewer(ctx.reviewerRegistry, receipt.reviewer_session);
  if (!reviewer) {
    return invalid(`reviewer_session '${receipt.reviewer_session}' is not a registered reviewer session`);
  }
  if (typeof receipt.independence_proof !== 'string' || receipt.independence_proof.trim().length === 0) {
    return invalid('missing independence_proof');
  }

  // capability qualification: ACCEPT_SCOPE requires every claim capability.
  if (receipt.verdict === 'ACCEPT_SCOPE') {
    const missingCap = ctx.claim.required_capabilities.filter((cap) => !receipt.capability_attestation.includes(cap));
    if (missingCap.length > 0) {
      return invalid(`capability-qualified ACCEPT_SCOPE requires capabilities ${missingCap.join(', ')} — no ${missingCap[0]} capability on ${receipt.risk_tier} claim`);
    }
  }
  if (receipt.blind_review_completed !== true) {
    return invalid('blind_review_completed must be true — reviewer must form threat hypotheses before reading the worker verdict');
  }

  // T2/T3 negative-probe gate (M11-R30 §7): a claim cannot be ACCEPTED without
  // a negative probe unless a deterministic proof makes it formally unnecessary.
  // Non-accepting verdicts (NEEDS_REPAIR/REJECT_EVIDENCE/…) are not gated — a
  // reviewer may flag defects without having run the probe battery.
  if (receipt.verdict === 'ACCEPT_SCOPE' && (receipt.risk_tier === 'T2' || receipt.risk_tier === 'T3')) {
    if (receipt.adversarial_probes.length === 0 && !receipt.deterministic_proof_justification) {
      return invalid(`${receipt.risk_tier} claim requires adversarial_probes or a recorded deterministic_proof_justification`);
    }
    if (ctx.compiledProbes && receipt.adversarial_probes.length > 0) {
      const known = new Set(ctx.compiledProbes.map((p) => p.probe_id));
      const unknown = receipt.adversarial_probes.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return invalid(`adversarial_probes reference unknown probe ids: ${unknown.join(', ')}`);
      }
    }
  }

  return { valid: true };
}

// ── §6 tier topology ─────────────────────────────────────────────────────────

export interface ReviewRequirement {
  readonly tier: RiskTier;
  readonly minimum_reviewers: number;
  readonly specialist_required: boolean;
  readonly vision_required: boolean;
  readonly strong_or_different_provider_required: boolean;
  readonly adversarial_probe_required: boolean;
  readonly blind_challenger_required: boolean;
  readonly note: string;
}

/** AM-0020 §6 risk-tiered review topology. */
export function requiredReviewersFor(claim: Pick<ClaimDefinition, 'risk_tier'>): ReviewRequirement {
  switch (claim.risk_tier) {
    case 'T0':
      return { tier: 'T0', minimum_reviewers: 0, specialist_required: false, vision_required: false, strong_or_different_provider_required: false, adversarial_probe_required: false, blind_challenger_required: false, note: 'deterministic verifier; LLM reviewer optional' };
    case 'T1':
      return { tier: 'T1', minimum_reviewers: 1, specialist_required: false, vision_required: false, strong_or_different_provider_required: false, adversarial_probe_required: false, blind_challenger_required: false, note: 'one independent economical reviewer' };
    case 'T2':
      return { tier: 'T2', minimum_reviewers: 1, specialist_required: true, vision_required: false, strong_or_different_provider_required: false, adversarial_probe_required: true, blind_challenger_required: false, note: 'specialist reviewer plus adversarial probe' };
    case 'T3':
      return { tier: 'T3', minimum_reviewers: 2, specialist_required: true, vision_required: false, strong_or_different_provider_required: true, adversarial_probe_required: true, blind_challenger_required: false, note: 'two independent reviewers; at least one strong or different-provider' };
    case 'T-Visual':
      return { tier: 'T-Visual', minimum_reviewers: 1, specialist_required: false, vision_required: true, strong_or_different_provider_required: false, adversarial_probe_required: false, blind_challenger_required: false, note: 'deterministic visual compiler plus a vision-capable reviewer' };
    case 'T-Global':
      return { tier: 'T-Global', minimum_reviewers: 2, specialist_required: true, vision_required: false, strong_or_different_provider_required: false, adversarial_probe_required: false, blind_challenger_required: true, note: 'sharded specialist reviews plus a blind final challenger' };
  }
}

export interface ValidateReviewSetContext {
  readonly claim: ClaimDefinition;
  readonly epoch: CandidateEpoch;
  readonly reviewerRegistry: ReviewerRegistry;
  readonly compiledProbes?: readonly Counterexample[];
}

export type ReviewSetValidation =
  | { readonly valid: true; readonly acceptSessions: readonly string[] }
  | { readonly valid: false; readonly reason: string };

function registerHas(reviewer: ReviewerRecord, capability: string): boolean {
  return reviewer.capabilities.includes(capability);
}

/**
 * Validate the review set for one claim against §6 topology. A set is valid
 * when it contains the tier-required number of distinct ACCEPT_SCOPE receipts,
 * each individually valid, and the reviewers carry the tier capabilities.
 * T3 diversity: at least one reviewer is strong (expert effort) or its provider
 * differs from the writer or from the other reviewer (AM-0020 §6 / M11-R31).
 */
export function validateReviewSet(receipts: readonly ReviewReceipt[], ctx: ValidateReviewSetContext): ReviewSetValidation {
  const req = requiredReviewersFor(ctx.claim);
  const validReceipts = receipts.filter((r) => validateReceipt(r, ctx).valid);
  const accepts = validReceipts.filter((r) => r.verdict === 'ACCEPT_SCOPE');
  const distinct = new Set(accepts.map((r) => r.reviewer_session));

  if (req.minimum_reviewers === 0) {
    return { valid: true, acceptSessions: [...distinct] };
  }
  if (distinct.size < req.minimum_reviewers) {
    return { valid: false, reason: `${ctx.claim.risk_tier} requires ${req.minimum_reviewers} independent ACCEPT_SCOPE reviewer(s), got ${distinct.size} (${req.note})` };
  }
  // Every receipt in the set must itself be valid — one invalid receipt poisons the set.
  if (validReceipts.length !== receipts.length) {
    const bad = receipts.find((r) => !validateReceipt(r, ctx).valid);
    return { valid: false, reason: `invalid receipt in the set: ${bad?.review_id ?? 'unknown'}` };
  }
  if (accepts.length !== distinct.size) {
    return { valid: false, reason: 'the same reviewer session cannot issue two ACCEPT_SCOPE receipts' };
  }

  // Capability per tier from the adapter-observed registry records.
  const reviewers = accepts
    .map((r) => findReviewer(ctx.reviewerRegistry, r.reviewer_session))
    .filter((r): r is ReviewerRecord => r !== undefined);
  if (req.specialist_required && !reviewers.some((r) => registerHas(r, 'specialist'))) {
    return { valid: false, reason: `${ctx.claim.risk_tier} requires a specialist reviewer` };
  }
  if (req.vision_required && !reviewers.some((r) => registerHas(r, 'vision'))) {
    return { valid: false, reason: `${ctx.claim.risk_tier} requires a vision-capable reviewer` };
  }
  if (req.adversarial_probe_required) {
    const probed = accepts.some((r) => r.adversarial_probes.length > 0 || r.deterministic_proof_justification !== undefined);
    if (!probed) {
      return { valid: false, reason: `${ctx.claim.risk_tier} requires a negative probe unless a deterministic proof makes it unnecessary` };
    }
  }
  if (req.strong_or_different_provider_required && reviewers.length >= 2) {
    const writerProvider = ctx.reviewerRegistry.writer.provider;
    const writerStrength = ctx.reviewerRegistry.writer.strength;
    const diversityOk = reviewers.some((r) =>
      r.strength === 'expert' || r.provider !== writerProvider || r.strength !== writerStrength
    ) || reviewers[0].provider !== reviewers[1].provider;
    if (!diversityOk) {
      return { valid: false, reason: 'T3 requires at least one strong or different-provider reviewer (all reviewers share the writer provider/strength)' };
    }
  }
  if (req.blind_challenger_required) {
    const challenger = accepts.filter((r) => r.blind_challenger === true);
    if (challenger.length === 0) {
      return { valid: false, reason: 'T-Global requires a blind final challenger (blind_review_completed + blind_challenger)' };
    }
  }
  return { valid: true, acceptSessions: [...distinct] };
}

// ── staleness (AM-0020 §5) ───────────────────────────────────────────────────

export interface ReceiptStalenessContext {
  readonly epoch: CandidateEpoch;
  readonly claim: ClaimDefinition;
  /** Optional precomputed claim fingerprint (defaults to claimFingerprint(claim)). */
  readonly claimFingerprint?: string;
}

/**
 * Any post-review change affecting the claim makes the receipt stale: a new
 * candidate epoch, a changed claim scope, a changed risk tier, or a changed
 * claim fingerprint. Returns null when fresh, otherwise the staleness reason.
 */
export function receiptStale(receipt: ReviewReceipt, ctx: ReceiptStalenessContext): string | null {
  if (receipt.candidate_epoch !== candidateEpochHash(ctx.epoch)) {
    return 'post-review change: new candidate epoch';
  }
  if (receipt.risk_tier !== ctx.claim.risk_tier) {
    return 'post-review change: claim risk tier changed';
  }
  const missingScope = ctx.claim.scope.filter((label) => !receipt.claim_scope.includes(label));
  if (missingScope.length > 0) {
    return `post-review change: claim scope changed (missing ${missingScope.join(', ')})`;
  }
  const current = ctx.claimFingerprint ?? claimFingerprint(ctx.claim);
  if (receipt.reviewed_claim_fingerprint !== undefined && receipt.reviewed_claim_fingerprint !== current) {
    return 'post-review change: claim definition changed';
  }
  return null;
}

// ── terminal eligibility (API seam, fail-closed) ─────────────────────────────

export interface TerminalReceiptContext extends ValidateReviewSetContext {
}

export interface ClaimTerminalCheck {
  readonly claim_id: string;
  readonly eligible: boolean;
  readonly reason: string | null;
}

/**
 * A claim is terminal-eligible when it has a valid, fresh review set for its
 * tier AND every receipt in the set is individually valid. ACCEPT_SCOPE is
 * scoped (per-claim); this function never writes project state — it only
 * reports eligibility for the engine terminal gate.
 */
export function claimTerminalEligible(claim: ClaimDefinition, receipts: readonly ReviewReceipt[], ctx: TerminalReceiptContext): ClaimTerminalCheck {
  const staleReasons = receipts.map((r) => ({ review_id: r.review_id, reason: receiptStale(r, ctx) })).filter((x) => x.reason !== null);
  if (staleReasons.length > 0) {
    return { claim_id: claim.claim_id, eligible: false, reason: `stale receipt(s): ${staleReasons.map((s) => `${s.review_id} (${s.reason})`).join(', ')}` };
  }
  const setResult = validateReviewSet(receipts, ctx);
  if (!setResult.valid) {
    return { claim_id: claim.claim_id, eligible: false, reason: setResult.reason };
  }
  return { claim_id: claim.claim_id, eligible: true, reason: null };
}

export interface TerminalReceiptAssessment {
  readonly eligible: boolean;
  readonly blockedClaims: Array<{ claim_id: string; reason: string }>;
  readonly reasons: string[];
}

/** Terminal gate over the whole claim set: fail-closed on any claim lacking a valid, fresh per-tier receipt set. */
export function assessTerminalReceipts(
  claims: readonly ClaimDefinition[],
  receiptsByClaim: Readonly<Record<string, readonly ReviewReceipt[]>>,
  ctx: TerminalReceiptContext,
): TerminalReceiptAssessment {
  const blockedClaims: Array<{ claim_id: string; reason: string }> = [];
  const reasons: string[] = [];
  for (const claim of claims) {
    if (claim.risk_tier === 'T0') continue; // deterministic verifier, no LLM reviewer required
    const check = claimTerminalEligible(claim, receiptsByClaim[claim.claim_id] ?? [], { ...ctx, claim });
    if (!check.eligible) {
      blockedClaims.push({ claim_id: claim.claim_id, reason: check.reason ?? 'no valid fresh receipt set' });
      reasons.push(`${claim.claim_id}:${check.reason ?? 'no valid fresh receipt set'}`);
    }
  }
  return { eligible: blockedClaims.length === 0, blockedClaims, reasons };
}

/**
 * Combined seam: evaluate the claim formula state (claim-registry, M11-R27) and
 * require a valid, fresh receipt set per tier for every non-T0 claim. The
 * formula alone can never certify terminal state without the receipt gate.
 */
export function evaluateTerminalEligibility(
  claims: readonly ClaimDefinition[],
  evidenceByClaim: Readonly<Record<string, ClaimEvidenceInput>>,
  receiptsByClaim: Readonly<Record<string, readonly ReviewReceipt[]>>,
  ctx: TerminalReceiptContext,
): { formula: ReturnType<typeof evaluateClaimFormulas>; eligible: boolean; reasons: string[] } {
  const formula = evaluateClaimFormulas([...claims], { ...evidenceByClaim });
  const receiptAssessment = assessTerminalReceipts(claims, receiptsByClaim, ctx);
  const reasons = [
    ...formula.formulas.find((f) => f.formula === 'HV3_M11_LOCAL_COMPLETE')?.reasons ?? [],
    ...receiptAssessment.reasons,
  ];
  return { formula, eligible: formula.formulaState.HV3_M11_LOCAL_COMPLETE && receiptAssessment.eligible, reasons };
}
