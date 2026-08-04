/**
 * validate-candidate-plan.ts — M11-R32 read-only candidate/evidence/plan validator.
 *
 * Combines three independent concerns:
 *   1. Candidate epoch   — snapshot + currency check
 *   2. Evidence freshness — pre/post epoch binding (does NOT mutate evidence)
 *   3. Plan identity      — amendment ordering + effective identity
 *
 * All functions are read-only with respect to the canonical repository.
 * snapshotCandidateEpoch is called with allowDirty:false (validation only; throws on dirty).
 * assertEpochCurrent is read-only (allowDirty:true, temp index in os.tmpdir, outside repo).
 * bindEvidence is called on a shallow copy; the caller's evidence is never mutated.
 * Plan identity validation is pure (no filesystem access).
 *
 * Mutation API sequence (the ONLY operations that write):
 *   1. snapshotCandidateEpoch(repoRoot)   → re-derives epoch (allowDirty:true creates temp index only)
 *   2. candidateEpochHash(epoch)         → pure hash (no mutation)
 *   3. bindEvidence(copy(evidence), epoch) → returns stamped copy (caller must use copy, not original)
 *   4. computeCanonicalEffectivePlanIdentity → pure (no mutation)
 *
 * Exported read-only validators:
 *   validateCandidateEpoch          — snapshot + current check, returns exact changed fields
 *   validateEvidenceFreshness      — bindEvidence on a copy, returns binding result without mutation
 *   validatePlanIdentity           — amendment ordering + effective identity, pure function
 *   validateCandidatePlan          — combines all three; returns all failures + safe mutation sequence
 */
import { createHash } from 'node:crypto';
import {
  snapshotCandidateEpoch, candidateEpochHash, bindEvidence, assertEpochCurrent,
  type CandidateEpoch, type EpochCurrency, CandidateEpochError,
} from './candidate-epoch.js';
import {
  computeCanonicalEffectivePlanIdentity, validateAmendmentIds,
  type IdentityAmendment,
} from './plan-identity.js';
import type { Sha256 } from './contracts.js';

// ── Freshness check (read-only wrapper around bindEvidence) ──────────────────

/**
 * Read-only evidence freshness check.
 * Calls bindEvidence on a shallow copy so the caller's evidence object is never mutated.
 *
 * Returns the same EvidenceBinding result as bindEvidence, but the caller's
 * evidence Record is guaranteed unchanged. The `record` field in the result
 * is the shallow copy (not the caller's object).
 */
export function checkEvidenceFreshness(
  evidence: Record<string, unknown>,
  epoch: CandidateEpoch,
  now?: string,
): { bound: boolean; reason: string; record: Record<string, unknown> } {
  // Shallow copy is sufficient: bindEvidence adds top-level keys only.
  // No nested objects are mutated.
  const copy: Record<string, unknown> = { ...evidence };
  const result = bindEvidence(copy, epoch, now);
  return { bound: result.bound, reason: result.reason, record: result.record };
}

// ── Candidate epoch validation (read-only) ────────────────────────────────────

export interface CandidateEpochValidation {
  /** Whether the epoch snapshot succeeded and is current. */
  valid: boolean;
  /** The re-derived epoch snapshot (null on snapshot failure). */
  snapshot: CandidateEpoch | null;
  /** Fields that changed between stored and current epoch (empty if valid). */
  changed: string[];
  /** Hash of the current (re-derived) epoch. */
  currentHash: string | null;
  /** Exact error code if snapshot failed. */
  snapshotError: string | null;
  /** Exact error message if snapshot failed. */
  snapshotMessage: string | null;
  /** All failing fields with human-readable detail. */
  failures: Array<{ field: string; detail: string }>;
}

/**
 * Read-only candidate epoch validation: snapshot + currency check.
 * Uses allowDirty:false — fails closed if the worktree has tracked changes
 * or build-critical untracked files. Does NOT mutate the canonical repository.
 *
 * The only filesystem write is a temporary git index in os.tmpdir (outside repo).
 */
export function validateCandidateEpoch(
  storedEpoch: CandidateEpoch,
  repoRoot: string,
): CandidateEpochValidation {
  let snapshot: CandidateEpoch | null = null;
  let snapshotError: string | null = null;
  let snapshotMessage: string | null = null;

  try {
    snapshot = snapshotCandidateEpoch(repoRoot, { allowDirty: false });
  } catch (err) {
    if (err instanceof CandidateEpochError) {
      snapshotError = err.code;
      snapshotMessage = err.message;
    } else {
      snapshotError = 'UNKNOWN';
      snapshotMessage = String(err);
    }
  }

  if (!snapshot) {
    const snapshotFailures: Array<{ field: string; detail: string }> = [{
      field: 'snapshot',
      detail: `${snapshotError ?? 'UNKNOWN'}: ${snapshotMessage ?? 'snapshot failed'}`,
    }];
    return { valid: false, snapshot: null, changed: [], currentHash: null, snapshotError, snapshotMessage, failures: snapshotFailures };
  }

  const currency = assertEpochCurrent(storedEpoch, repoRoot);
  const staleFailures = currency.changed.map(field => ({
    field,
    detail: `epoch field '${field}' changed since snapshot — new epoch required`,
  }));
  return {
    valid: currency.current,
    snapshot,
    changed: currency.changed,
    currentHash: currency.currentHash,
    snapshotError: null,
    snapshotMessage: null,
    failures: staleFailures,
  };
}

// ── Plan identity validation (pure, read-only) ────────────────────────────────

export interface PlanIdentityValidation {
  /** Whether amendment IDs are valid and effective identity matches. */
  valid: boolean;
  /** Computed effective identity SHA-256 (null on computation error). */
  computedIdentity: Sha256 | null;
  /** Stored effective identity SHA-256 from the ledger. */
  storedIdentity: Sha256 | null;
  /** Exact failing amendment IDs (empty if valid). */
  invalidAmendmentIds: string[];
  /** Reason for amendment ID failure (empty if valid). */
  amendmentError: string | null;
  /** Whether the effective identity SHA-256 matches stored value. */
  identityMismatch: boolean;
  /** All failing fields with human-readable detail. */
  failures: Array<{ field: string; detail: string }>;
}

function getInvalidAmendmentIds(amendmentError: string | null, amendmentIds: readonly string[]): string[] {
  if (!amendmentError || amendmentIds.length === 0) return [];
  // Extract the quoted amendment ID from the error string (e.g. 'Unknown or invalid amendment ID: "AM-0099"').
  const match = /"([^"]+)"/.exec(amendmentError);
  if (match) return [match[1]];
  // Fallback: first malformed or tombstoned ID.
  const idx = amendmentIds.findIndex(id => !/^AM-\d{4}$/.test(id) || id === 'AM-0004');
  return idx >= 0 ? [amendmentIds[idx]] : amendmentIds.slice(0, 1);
}

function extractSha256(value: unknown): Sha256 | null {
  if (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) return value as Sha256;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if (typeof rec.sha256 === 'string' && /^[a-f0-9]{64}$/.test(rec.sha256)) return rec.sha256 as Sha256;
  }
  return null;
}

/**
 * Read-only plan identity validation: amendment ordering + effective identity.
 * Pure function — no filesystem access, no mutation.
 *
 * ledger shape accepted (mixed camelCase/snake_case):
 *   effective_plan_identity: { sha256: string }
 *   effectivePlanIdentity: string
 *   amendments: Array<{ amendment_id: string; sha256: string }>
 *   amendment_ids: string[]
 */
export function validatePlanIdentity(
  ledger: Record<string, unknown>,
): PlanIdentityValidation {
  const storedIdentity = extractSha256(
    (ledger.effective_plan_identity as Record<string, unknown> | undefined)?.sha256
    ?? ledger.effectivePlanIdentity,
  );

  // Collect amendment IDs and SHA-256s from ledger.
  let amendmentIds: readonly string[] = [];
  let amendmentSha256s: readonly string[] = [];

  const amdArray = ledger.amendments as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(amdArray) && amdArray.length > 0) {
    amendmentIds = amdArray.map(a => String(a.amendment_id ?? a.amendmentId ?? ''));
    amendmentSha256s = amdArray.map(a => {
      const s = a.sha256 ?? a.sha ?? '';
      return typeof s === 'string' ? s : '';
    });
  } else {
    const idArray = ledger.amendment_ids as string[] | undefined;
    if (Array.isArray(idArray)) {
      amendmentIds = idArray;
      // amendment_sha256s not available from ledger when using legacy shape — skip hash check.
    }
  }

  const amendmentError = validateAmendmentIds(amendmentIds);

  const amendments: IdentityAmendment[] = amendmentIds.map((id, i) => ({
    amendment_id: id,
    sha256: (amendmentSha256s[i] && /^[a-f0-9]{64}$/.test(amendmentSha256s[i]))
      ? amendmentSha256s[i] as Sha256
      : '0'.repeat(64) as Sha256, // placeholder; computeCanonicalEffectivePlanIdentity validates this
  }));

  let computedIdentity: Sha256 | null = null;
  let identityMismatch = false;
  // Track whether we could verify the identity (need both originalSha and at least one amendment SHA).
  let verifiable = false;

  if (storedIdentity) {
    try {
      // Use the stored original SHA from the ledger's effective_plan_identity.
      const originalSha = extractSha256(
        (ledger.effective_plan_identity as Record<string, unknown> | undefined)?.original_plan_sha256
        ?? ledger.originalPlanSha256,
      );
      if (originalSha) {
        verifiable = true;
        const result = computeCanonicalEffectivePlanIdentity(originalSha, amendments);
        computedIdentity = result.sha256;
        identityMismatch = computedIdentity !== storedIdentity;
      }
      // else: no original_sha256 in ledger — cannot compute effective identity; skip mismatch check.
    } catch {
      computedIdentity = null;
      if (verifiable) identityMismatch = true;
    }
  }

  // valid = amendment IDs are correct AND (either identity matches OR we couldn't verify it).
  const valid = !amendmentError && (!verifiable || !identityMismatch);

  const failures: Array<{ field: string; detail: string }> = [];
  if (amendmentError) {
    failures.push({ field: 'amendment_ids', detail: amendmentError });
  }
  if (identityMismatch && verifiable) {
    failures.push({
      field: 'effective_plan_identity.sha256',
      detail: `computed identity ${computedIdentity?.slice(0, 12) ?? '?'} != stored ${storedIdentity?.slice(0, 12) ?? '?'}`,
    });
  }

  return {
    valid,
    computedIdentity,
    storedIdentity,
    invalidAmendmentIds: getInvalidAmendmentIds(amendmentError, amendmentIds),
    amendmentError,
    identityMismatch,
    failures,
  };
}

// ── Combined read-only validator ──────────────────────────────────────────────

export type PlanMutationStep =
  | { action: 'commit'; reason: string }
  | { action: 'rebuild'; reason: string }
  | { action: 'resnapshot'; reason: string }
  | { action: 'rebind_evidence'; evidenceId: string; reason: string }
  | { action: 'rebind_all_evidence'; count: number; reason: string }
  | { action: 'update_plan_identity'; computedIdentity: string; storedIdentity: string };

export interface ConcernValidation {
  valid: boolean;
  /** All failing fields with human-readable detail. */
  failures: Array<{ field: string; detail: string }>;
  /** Raw validation result for each concern. */
  detail: CandidateEpochValidation | PlanIdentityValidation | ReturnType<typeof checkEvidenceFreshness>;
}

export interface ValidationResult {
  /** True only when ALL three concerns pass. */
  valid: boolean;
  candidateEpoch: ConcernValidation;
  evidenceFreshness: ConcernValidation;
  planIdentity: ConcernValidation;
  /** Ordered sequence of safe mutations to fix all failures (empty if valid). */
  mutationSequence: PlanMutationStep[];
}

/**
 * Read-only validation of candidate epoch, evidence freshness, and plan identity.
 *
 * Does NOT mutate canonical artifacts:
 *   - candidate epoch: allowDirty:false (validation only)
 *   - evidence: bindEvidence called on shallow copy
 *   - plan identity: pure function
 *   - filesystem: only git status reads and temp index (os.tmpdir) for snapshot
 *
 * Returns exact failing fields and safe mutation API sequence for each failure.
 */
export function validateCandidatePlan(
  storedEpoch: CandidateEpoch,
  evidence: Record<string, unknown> | null,
  ledger: Record<string, unknown>,
  repoRoot: string,
  now?: string,
): ValidationResult {

  // ── 1. Candidate epoch ────────────────────────────────────────────────────
  const epochValidation = validateCandidateEpoch(storedEpoch, repoRoot);
  const epochFailures: Array<{ field: string; detail: string }> = [];
  const epochMutationSteps: PlanMutationStep[] = [];

  if (epochValidation.snapshotError) {
    if (epochValidation.snapshotError === 'DIRTY_TRACKED') {
      const msg = epochValidation.snapshotMessage ?? 'DIRTY_TRACKED: terminal candidate refused';
      epochFailures.push({ field: 'source_tree_sha', detail: msg });
      epochMutationSteps.push({ action: 'resnapshot', reason: 'dirty tracked state requires re-snapshot after commit' });
      epochMutationSteps.push({ action: 'commit', reason: 'tracked changes block terminal candidate epoch' });
    } else if (epochValidation.snapshotError === 'UNTRACKED_BUILD_CRITICAL') {
      const msg = epochValidation.snapshotMessage ?? 'UNTRACKED_BUILD_CRITICAL: build-critical not tracked';
      epochFailures.push({ field: 'build_critical_manifest', detail: msg });
      epochMutationSteps.push({ action: 'resnapshot', reason: 'untracked build-critical files require re-snapshot after commit' });
      epochMutationSteps.push({ action: 'commit', reason: 'untracked build-critical files block terminal candidate' });
    } else if (epochValidation.snapshotError === 'NO_HEAD') {
      epochFailures.push({ field: 'candidate_commit_or_tree', detail: 'repository has no HEAD commit' });
    } else {
      const msg = `${epochValidation.snapshotError}: ${epochValidation.snapshotMessage}`;
      epochFailures.push({ field: 'snapshot', detail: msg });
    }
  } else if (!epochValidation.valid) {
    // Epoch snapshot succeeded but current epoch is stale.
    for (const field of epochValidation.changed) {
      epochFailures.push({ field, detail: `epoch field '${field}' changed since snapshot — new epoch required` });
    }
    epochMutationSteps.push({ action: 'resnapshot', reason: `stale epoch: ${epochValidation.changed.join(', ')}` });
    if (evidence) {
      epochMutationSteps.push({ action: 'rebind_evidence', evidenceId: String(evidence.evidence_id ?? evidence.id ?? 'unknown'), reason: 'evidence predates new epoch' });
    } else if (storedEpoch.created_at) {
      epochMutationSteps.push({ action: 'rebind_all_evidence', count: 1, reason: 'all evidence must be rebound after re-snapshot' });
    }
  }

  const candidateEpoch: ConcernValidation = {
    valid: epochValidation.valid,
    failures: epochFailures,
    detail: epochValidation,
  };

  // ── 2. Evidence freshness ────────────────────────────────────────────────
  const evidenceFailures: Array<{ field: string; detail: string }> = [];
  let evidenceResult: ReturnType<typeof checkEvidenceFreshness> | null = null;
  const evidenceMutationSteps: PlanMutationStep[] = [];

  if (evidence) {
    evidenceResult = checkEvidenceFreshness(evidence, storedEpoch, now);
    if (!evidenceResult.bound) {
      const evidenceId = String(evidence.evidence_id ?? evidence.id ?? 'unknown');
      evidenceFailures.push({
        field: 'candidate_epoch',
        detail: `[${evidenceId}] ${evidenceResult.reason}`,
      });
      // resnapshot must be ordered before rebind; check if already queued by epoch step.
      if (!epochMutationSteps.some(s => s.action === 'resnapshot')) {
        evidenceMutationSteps.push({ action: 'resnapshot', reason: `evidence '${evidenceId}' predates epoch` });
      }
      evidenceMutationSteps.push({ action: 'rebind_evidence', evidenceId, reason: 'rebind evidence after re-snapshot' });
    }
  }

  const evidenceFreshness: ConcernValidation = {
    valid: evidenceResult ? evidenceResult.bound : true,
    failures: evidenceFailures,
    detail: evidenceResult ?? { bound: true, reason: 'no evidence provided', record: {} },
  };

  // ── 3. Plan identity ──────────────────────────────────────────────────────
  const planValidation = validatePlanIdentity(ledger);
  const planFailures: Array<{ field: string; detail: string }> = [];
  const planMutationSteps: PlanMutationStep[] = [];

  if (planValidation.amendmentError) {
    planFailures.push({ field: 'amendment_ids', detail: planValidation.amendmentError });
  }
  if (planValidation.identityMismatch) {
    planFailures.push({
      field: 'effective_plan_identity.sha256',
      detail: `computed identity ${planValidation.computedIdentity?.slice(0, 12) ?? '?'} != stored ${planValidation.storedIdentity?.slice(0, 12) ?? '?'}`,
    });
    if (planValidation.computedIdentity) {
      planMutationSteps.push({
        action: 'update_plan_identity',
        computedIdentity: planValidation.computedIdentity,
        storedIdentity: planValidation.storedIdentity ?? '',
      });
    }
  }

  const planIdentity: ConcernValidation = {
    valid: planValidation.valid,
    failures: planFailures,
    detail: planValidation,
  };

  // Order: resnapshot always first, then evidence rebind, then plan identity update.
  const orderedSequence: PlanMutationStep[] = [
    ...epochMutationSteps.filter(s => s.action === 'resnapshot'),
    ...evidenceMutationSteps.filter(s => s.action === 'resnapshot'),
    ...epochMutationSteps.filter(s => s.action !== 'resnapshot'),
    ...evidenceMutationSteps.filter(s => s.action !== 'resnapshot'),
    ...planMutationSteps,
  ];

  return {
    valid: candidateEpoch.valid && evidenceFreshness.valid && planIdentity.valid,
    candidateEpoch,
    evidenceFreshness,
    planIdentity,
    mutationSequence: orderedSequence,
  };
}
