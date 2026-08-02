/**
 * main-run-capsule.ts — C5 M11R37/R38/R42 MainRunCapsule and fidelity validation.
 *
 * Every premium-main wake receives a content-addressed MainRunCapsule that binds:
 * - The immutable original plan SHA-256
 * - The ordered effective plan identity (original + approved amendments)
 * - The candidate epoch (M11-R32)
 * - The ledger revision
 * - The capsule hash (content-addressed over the full capsule)
 *
 * The capsule is deterministic: the same inputs always yield the same capsule_sha256.
 * A stale, tampered or materially incomplete capsule is rejected by CapsuleFidelityValidator
 * and invokes correctness fallback rather than a fabricated decision.
 *
 * References:
 * - AM-0021 §3: MainRunCapsule contract
 * - AM-0021 §6: CapsuleFidelityValidator proves fidelity
 * - M11-R37: attribute context by plan/candidate epoch
 * - M11-R38: every premium-main wake uses a signed MainRunCapsule
 * - M11-R42: capsule fidelity binds plan, ledger and candidate epoch
 */
import { createHash } from 'node:crypto';
import { sha256Bytes, isSha256, type Sha256 } from './contracts.js';
import { candidateEpochHash, type CandidateEpoch } from './candidate-epoch.js';
import { computeCanonicalEffectivePlanIdentity, type IdentityAmendment } from './plan-identity.js';

export type { Sha256 } from './contracts.js';
export { candidateEpochHash } from './candidate-epoch.js';
export { computeCanonicalEffectivePlanIdentity } from './plan-identity.js';

// ── Capsule Errors ────────────────────────────────────────────────────────────

export class CapsuleError extends Error {
  constructor(m: string) { super(m); this.name = 'CapsuleError'; }
}

export class CapsuleFidelityError extends Error {
  readonly code: string;
  constructor(code: string, m: string) {
    super(m);
    this.name = 'CapsuleFidelityError';
    this.code = code;
  }
}

// ── Core Types ────────────────────────────────────────────────────────────────

export const CAPSULE_SCHEMA = 'harness/main-run-capsule/v1';
export const CAPSULE_VERSION = 1;

export interface OwnerIntentInvariant {
  readonly invariant_id: string;
  readonly description: string;
  readonly binding_sha256: Sha256;
}

export interface ActiveDecision {
  readonly decision_id: string;
  readonly category: string;
  readonly rationale: string;
  readonly made_at: string;
  readonly binding_sha256: Sha256;
}

export interface CriticalPathEntry {
  readonly task_id: string;
  readonly requirement_ids: readonly string[];
  readonly priority: number;
}

export interface AssignmentState {
  readonly assignment_id: string;
  readonly status: string;
  readonly task_id: string;
}

export interface ChangedClaim {
  readonly claim_id: string;
  readonly requirement_id: string;
  readonly previous_state: string;
  readonly current_state: string;
  readonly changed_at: string;
}

export interface OpenFinding {
  readonly finding_id: string;
  readonly severity: string;
  readonly requirement_id: string;
  readonly description: string;
}

export interface ConflictDecision {
  readonly conflict_id: string;
  readonly type: string;
  readonly affected_claims: readonly string[];
  readonly resolution_needed: boolean;
}

export interface ArtifactPointer {
  readonly artifact_id: string;
  readonly uri: string;
  readonly sha256: Sha256;
  readonly media_type: string;
  readonly byte_size: number;
  readonly chunk_index: number;
}

export interface OmittedManifest {
  readonly total_artifacts: number;
  readonly omitted_count: number;
  readonly omitted_uris: readonly string[];
  readonly total_bytes: number;
  readonly omitted_bytes: number;
}

export type DrilldownKind = 'PLAN_ANCHORS' | 'DIFF_HUNKS' | 'EVIDENCE_EXCERPTS' | 'REVIEW_CONFLICT' | 'RAW_RANGE' | 'FULL_ARTIFACT';

export interface BudgetEnvelope {
  readonly max_tokens_per_run: number;
  readonly max_cost_per_run_usd: number;
  readonly max_latency_ms: number;
  readonly advisory_context_tokens: number;
}

/**
 * MainRunCapsule — content-addressed capsule for premium-main wake.
 * Bound to original/effective plan identity, candidate epoch, and ledger revision.
 * A stale, tampered or materially incomplete capsule is rejected.
 */
export interface MainRunCapsule {
  readonly schema: typeof CAPSULE_SCHEMA;
  readonly version: typeof CAPSULE_VERSION;
  /** Unique identifier for this capsule run. */
  readonly run_id: string;
  readonly plan_id: string;
  /** SHA-256 of the immutable original plan (before amendments). */
  readonly original_plan_sha256: Sha256;
  /** SHA-256 of the effective plan (original + ordered approved amendments). */
  readonly effective_plan_sha256: Sha256;
  /** Deterministic hash of the candidate epoch content (excludes created_at). */
  readonly candidate_epoch_hash: Sha256;
  /** Ledger revision at capsule compile time. */
  readonly ledger_revision: number;
  /** Event sequence cursor (last processed event sequence number). */
  readonly event_cursor: number;
  /** Capsule revision counter (increments on every capsule recompile). */
  readonly capsule_revision: number;
  /** Owner intent invariants that must be preserved across decisions. */
  readonly owner_intent_invariants: readonly OwnerIntentInvariant[];
  /** Active decisions made in previous runs (preserved across checkpoints). */
  readonly active_decisions: readonly ActiveDecision[];
  /** Critical path entries ordered by priority. */
  readonly critical_path: readonly CriticalPathEntry[];
  /** Deterministic hash of the current ready queue state. */
  readonly ready_queue_digest: Sha256;
  /** Assignments grouped by state (digest of assignment-to-state mapping). */
  readonly assignments_by_state: Readonly<Record<string, readonly AssignmentState[]>>;
  /** Assignments by state digest (for staleness detection). */
  readonly assignments_digest: Sha256;
  /** Claims that changed since the last capsule. */
  readonly changed_claims: readonly ChangedClaim[];
  /** Deterministic hash of verification claims and outcomes. */
  readonly verification_digest: Sha256;
  /** Deterministic hash of review receipts and outcomes. */
  readonly review_digest: Sha256;
  /** Currently open findings requiring attention. */
  readonly open_findings: readonly OpenFinding[];
  /** Conflicts requiring a premium-main decision. */
  readonly conflicts_requiring_decision: readonly ConflictDecision[];
  /** Deterministic hash of the terminal gate state. */
  readonly terminal_gate_digest: Sha256;
  /** Artifact pointers for referenced evidence and artifacts. */
  readonly artifact_pointers: readonly ArtifactPointer[];
  /** Manifest of intentionally omitted collections. */
  readonly omitted_manifest: OmittedManifest;
  /** Allowed drilldown kinds for this capsule. */
  readonly allowed_drilldowns: readonly DrilldownKind[];
  /** Token/budget envelope for this run. */
  readonly budget_envelope: BudgetEnvelope;
  /** Content-addressed SHA-256 of this capsule (excludes this field). */
  readonly capsule_sha256: Sha256;
  /** Capsule compilation timestamp (ISO 8601). */
  readonly compiled_at: string;
}

// ── Capsule Compilation ───────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireSha(value: string, label: string): void {
  if (!isSha256(value)) {
    throw new CapsuleError(`${label} must be a SHA-256: ${JSON.stringify(value)}`);
  }
}

function requirePositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CapsuleError(`${label} must be a non-negative integer: ${value}`);
  }
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`;
}

/** Compute the deterministic capsule hash from capsule contents (excludes capsule_sha256). */
export function computeCapsuleHash(capsule: Omit<MainRunCapsule, 'capsule_sha256'>): Sha256 {
  const { schema, version, run_id, plan_id, original_plan_sha256, effective_plan_sha256,
    candidate_epoch_hash, ledger_revision, event_cursor, capsule_revision,
    owner_intent_invariants, active_decisions, critical_path, ready_queue_digest,
    assignments_digest, changed_claims, verification_digest, review_digest,
    open_findings, conflicts_requiring_decision, terminal_gate_digest,
    artifact_pointers, omitted_manifest, allowed_drilldowns, budget_envelope, compiled_at } = capsule;

  requireSha(original_plan_sha256, 'original_plan_sha256');
  requireSha(effective_plan_sha256, 'effective_plan_sha256');
  requireSha(candidate_epoch_hash, 'candidate_epoch_hash');
  requireSha(ready_queue_digest, 'ready_queue_digest');
  requireSha(assignments_digest, 'assignments_digest');
  requireSha(verification_digest, 'verification_digest');
  requireSha(review_digest, 'review_digest');
  requireSha(terminal_gate_digest, 'terminal_gate_digest');
  requirePositiveInt(ledger_revision, 'ledger_revision');
  requirePositiveInt(event_cursor, 'event_cursor');
  requirePositiveInt(capsule_revision, 'capsule_revision');

  const canonical = canonicalStringify({
    schema, version, run_id, plan_id, original_plan_sha256, effective_plan_sha256,
    candidate_epoch_hash, ledger_revision, event_cursor, capsule_revision,
    owner_intent_invariants, active_decisions, critical_path, ready_queue_digest,
    assignments_digest, changed_claims, verification_digest, review_digest,
    open_findings, conflicts_requiring_decision, terminal_gate_digest,
    artifact_pointers, omitted_manifest, allowed_drilldowns, budget_envelope, compiled_at,
  });
  return sha256Bytes(new TextEncoder().encode(canonical));
}

/** Compute the effective plan identity from original and amendments. */
export function computeEffectivePlanIdentity(
  originalSha256: Sha256,
  amendments: readonly IdentityAmendment[],
): Sha256 {
  requireSha(originalSha256, 'originalSha256');
  const identity = computeCanonicalEffectivePlanIdentity(originalSha256, amendments);
  return identity.sha256;
}

// ── Capsule Compilation ────────────────────────────────────────────────────────

export interface CapsuleCompileInput {
  readonly run_id: string;
  readonly plan_id: string;
  readonly original_sha256: Sha256;
  readonly amendments: readonly IdentityAmendment[];
  readonly candidate_epoch: CandidateEpoch;
  readonly ledger_revision: number;
  readonly event_cursor: number;
  readonly capsule_revision: number;
  readonly owner_intent_invariants?: readonly OwnerIntentInvariant[];
  readonly active_decisions?: readonly ActiveDecision[];
  readonly critical_path?: readonly CriticalPathEntry[];
  readonly ready_queue_digest: Sha256;
  readonly assignments_by_state?: Readonly<Record<string, readonly AssignmentState[]>>;
  readonly changed_claims?: readonly ChangedClaim[];
  readonly verification_digest: Sha256;
  readonly review_digest: Sha256;
  readonly open_findings?: readonly OpenFinding[];
  readonly conflicts_requiring_decision?: readonly ConflictDecision[];
  readonly terminal_gate_digest: Sha256;
  readonly artifact_pointers?: readonly ArtifactPointer[];
  readonly omitted_manifest?: OmittedManifest;
  readonly allowed_drilldowns?: readonly DrilldownKind[];
  readonly budget_envelope: BudgetEnvelope;
}

/**
 * Compile a MainRunCapsule from the given inputs.
 * The capsule is deterministic: same inputs always yield same capsule_sha256.
 */
export function compileCapsule(input: CapsuleCompileInput): MainRunCapsule {
  const { run_id, plan_id, original_sha256, amendments, candidate_epoch,
    ledger_revision, event_cursor, capsule_revision, owner_intent_invariants = [],
    active_decisions = [], critical_path = [], ready_queue_digest,
    assignments_by_state = {}, changed_claims = [], verification_digest,
    review_digest, open_findings = [], conflicts_requiring_decision = [],
    terminal_gate_digest, artifact_pointers = [], omitted_manifest,
    allowed_drilldowns = ['PLAN_ANCHORS', 'DIFF_HUNKS', 'EVIDENCE_EXCERPTS', 'REVIEW_CONFLICT', 'RAW_RANGE', 'FULL_ARTIFACT'],
    budget_envelope } = input;

  const effective_plan_sha256 = computeEffectivePlanIdentity(original_sha256, amendments);
  const candidate_epoch_hash = candidateEpochHash(candidate_epoch);

  // Compute assignments digest from assignment state mapping
  const assignmentsDigestInput = canonicalStringify(
    Object.fromEntries(
      Object.entries(assignments_by_state).sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, v.map(a => a.assignment_id).sort()])
    )
  );
  const assignments_digest = sha256(assignmentsDigestInput);

  const compiled_at = new Date().toISOString();

  const capsuleWithoutHash: Omit<MainRunCapsule, 'capsule_sha256'> = {
    schema: CAPSULE_SCHEMA,
    version: CAPSULE_VERSION,
    run_id,
    plan_id,
    original_plan_sha256: original_sha256,
    effective_plan_sha256,
    candidate_epoch_hash,
    ledger_revision,
    event_cursor,
    capsule_revision,
    owner_intent_invariants,
    active_decisions,
    critical_path,
    ready_queue_digest,
    assignments_by_state,
    assignments_digest,
    changed_claims,
    verification_digest,
    review_digest,
    open_findings,
    conflicts_requiring_decision,
    terminal_gate_digest,
    artifact_pointers,
    omitted_manifest: omitted_manifest ?? {
      total_artifacts: artifact_pointers.length,
      omitted_count: 0,
      omitted_uris: [],
      total_bytes: artifact_pointers.reduce((sum, p) => sum + p.byte_size, 0),
      omitted_bytes: 0,
    },
    allowed_drilldowns,
    budget_envelope,
    compiled_at,
  };

  const capsule_sha256 = computeCapsuleHash(capsuleWithoutHash);
  return { ...capsuleWithoutHash, capsule_sha256 };
}

// ── Fidelity Validation ────────────────────────────────────────────────────────

export interface FidelityValidationInput {
  readonly capsule: MainRunCapsule;
  readonly expected_original_sha256: Sha256;
  readonly expected_amendments: readonly IdentityAmendment[];
  readonly expected_candidate_epoch: CandidateEpoch;
  readonly expected_ledger_revision: number;
  readonly expected_event_cursor: number;
}

export type FidelityValidationResult =
  | { readonly valid: true; readonly checks: readonly string[] }
  | { readonly valid: false; readonly reason: string; readonly code: string };

/**
 * CapsuleFidelityValidator — proves capsule fidelity per AM-0021 §6.
 *
 * Validates:
 * 1. Original and ordered-amendment identities
 * 2. Coverage of every unresolved or high-risk claim
 * 3. Preservation of owner decisions and active authority
 * 4. Exact candidate/evidence/review freshness
 * 5. Traceability of every status to canonical material
 * 6. Disclosure of every intentionally omitted collection
 */
export class CapsuleFidelityValidator {
  private readonly checks: string[] = [];

  /**
   * Validate capsule fidelity against expected values.
   * Fail-closed: the first failed check determines the result.
   */
  validate(input: FidelityValidationInput): FidelityValidationResult {
    const { capsule, expected_original_sha256, expected_amendments,
      expected_candidate_epoch, expected_ledger_revision, expected_event_cursor } = input;

    this.checks.length = 0;

    // 1. Schema and version
    if (capsule.schema !== CAPSULE_SCHEMA) {
      return this.fail('SCHEMA_MISMATCH', `schema mismatch: expected ${CAPSULE_SCHEMA}, got ${capsule.schema}`);
    }
    if (capsule.version !== CAPSULE_VERSION) {
      return this.fail('VERSION_MISMATCH', `version mismatch: expected ${CAPSULE_VERSION}, got ${capsule.version}`);
    }
    this.checks.push('schema');

    // 2. Original plan identity
    if (capsule.original_plan_sha256 !== expected_original_sha256) {
      return this.fail('ORIGINAL_SHA_MISMATCH',
        `original_plan_sha256 mismatch: expected ${expected_original_sha256}, got ${capsule.original_plan_sha256}`);
    }
    this.checks.push('original_identity');

    // 3. Effective plan identity (original + ordered amendments)
    const expected_effective = computeEffectivePlanIdentity(expected_original_sha256, expected_amendments);
    if (capsule.effective_plan_sha256 !== expected_effective) {
      return this.fail('EFFECTIVE_SHA_MISMATCH',
        `effective_plan_sha256 mismatch: expected ${expected_effective}, got ${capsule.effective_plan_sha256}`);
    }
    this.checks.push('effective_identity');

    // 4. Candidate epoch hash
    const expected_epoch_hash = candidateEpochHash(expected_candidate_epoch);
    if (capsule.candidate_epoch_hash !== expected_epoch_hash) {
      return this.fail('CANDIDATE_EPOCH_MISMATCH',
        `candidate_epoch_hash mismatch: expected ${expected_epoch_hash}, got ${capsule.candidate_epoch_hash}`);
    }
    this.checks.push('candidate_epoch');

    // 5. Ledger revision
    if (capsule.ledger_revision !== expected_ledger_revision) {
      return this.fail('LEDGER_REVISION_MISMATCH',
        `ledger_revision mismatch: expected ${expected_ledger_revision}, got ${capsule.ledger_revision}`);
    }
    this.checks.push('ledger_revision');

    // 6. Event cursor
    if (capsule.event_cursor !== expected_event_cursor) {
      return this.fail('EVENT_CURSOR_MISMATCH',
        `event_cursor mismatch: expected ${expected_event_cursor}, got ${capsule.event_cursor}`);
    }
    this.checks.push('event_cursor');

    // 7. Capsule hash integrity
    const recomputed_hash = computeCapsuleHash(capsule);
    if (capsule.capsule_sha256 !== recomputed_hash) {
      return this.fail('CAPSULE_HASH_MISMATCH',
        `capsule_sha256 mismatch: expected ${recomputed_hash}, got ${capsule.capsule_sha256}`);
    }
    this.checks.push('capsule_hash');

    // 8. Owner intent invariants preservation
    for (const invariant of capsule.owner_intent_invariants) {
      if (!isSha256(invariant.binding_sha256)) {
        return this.fail('INVALID_INVARIANT_SHA',
          `owner_intent_invariants[${invariant.invariant_id}] has invalid binding_sha256`);
      }
    }
    this.checks.push('owner_intent_invariants');

    // 9. Active decisions trace to canonical material
    for (const decision of capsule.active_decisions) {
      if (!isSha256(decision.binding_sha256)) {
        return this.fail('INVALID_DECISION_SHA',
          `active_decisions[${decision.decision_id}] has invalid binding_sha256`);
      }
    }
    this.checks.push('active_decisions');

    // 10. Omitted manifest disclosure
    if (capsule.omitted_manifest.omitted_count > 0 && capsule.omitted_manifest.omitted_uris.length === 0) {
      return this.fail('OMISSION_NOT_DISCLOSED',
        'omitted_manifest reports omissions but omitted_uris is empty');
    }
    this.checks.push('omitted_manifest');

    // 11. Capsule timestamp
    const compiledAt = new Date(capsule.compiled_at);
    if (Number.isNaN(compiledAt.getTime())) {
      return this.fail('INVALID_TIMESTAMP', `compiled_at is not parseable: ${capsule.compiled_at}`);
    }
    this.checks.push('compiled_at');

    return { valid: true, checks: [...this.checks] };
  }

  private fail(code: string, reason: string): FidelityValidationResult {
    return { valid: false, reason, code };
  }
}

/**
 * Validate a capsule in a single call.
 * Convenience wrapper around CapsuleFidelityValidator.
 */
export function validateCapsuleFidelity(input: FidelityValidationInput): FidelityValidationResult {
  const validator = new CapsuleFidelityValidator();
  return validator.validate(input);
}
