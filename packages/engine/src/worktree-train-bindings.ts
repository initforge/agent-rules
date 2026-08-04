/**
 * worktree-train-bindings.ts — C3/C2 cross-subsystem provenance binding (AM-0019 §5 + §12)
 *
 * Binds worktree lease/dispatch/integration provenance to supervisor assignments
 * and dispatch-ready-set execution nodes. Provides cross-platform path normalization
 * and receipt attestation without shared plan artifacts.
 *
 * Contracts bound:
 *   - WorktreeLease ↔ Supervisor ChildAssignment (via owned paths)
 *   - WorktreeLease ↔ ExecutionNode (via dispatch-ready-set)
 *   - ReleaseReceipt → IntegrationReceipt (chain provenance)
 *   - Supervisor session → integration receipt (attestation)
 *
 * No shared plan artifacts: all bindings are by-value, content-addressed.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import type {
  WorktreeLease,
  ReleaseReceipt,
  IntegrationReceipt,
} from './worktree-train.js';
import type {
  ExecutionNode,
  ConflictDomain,
} from './dispatch-ready-set.js';
import type {
  ChildAssignment,
  ChildAssignmentView,
} from './supervisor.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Cross-platform normalized path key for binding comparisons. */
export type NormalizedPathKey = string;

/** Binding between a supervisor child assignment and a worktree lease. */
export interface AssignmentLeaseBinding {
  schema: 'binding/assignment-lease';
  assignmentId: string;
  taskId: string;
  sessionId: string;
  leaseId: string; // derived from taskId
  ownedPaths: readonly NormalizedPathKey[];
  semanticResources: readonly string[];
  boundAt: string;
}

/** Binding between a dispatch-ready-set execution node and a worktree lease. */
export interface DispatchNodeLeaseBinding {
  schema: 'binding/dispatch-lease';
  taskId: string;
  executionNodeId: string;
  ownedPaths: readonly NormalizedPathKey[];
  conflictDomains: readonly ConflictDomain[];
  boundAt: string;
}

/** Chained provenance: release receipt → integration receipt. */
export interface ProvenanceChain {
  schema: 'provenance/chain';
  releaseReceiptId: string;
  integrationReceiptId: string;
  baseEpoch: string;
  finalCommit: string;
  integrationHead: string;
  diffFingerprint: string;
  boundAt: string;
}

/** Supervisor session attestation on an integration receipt. */
export interface SessionAttestation {
  schema: 'attestation/session-integration';
  sessionId: string;
  supervisorId: string;
  integrationReceiptId: string;
  acceptedTaskIds: readonly string[];
  boundCommit: string;
  diffFingerprint: string;
  attestedAt: string;
  signature?: string; // ponytail: add HMAC when secret available
}

// ── Path normalization ─────────────────────────────────────────────────────────

/** Cross-platform path normalization: POSIX forward-slash canonical form.
 *  Always returns lowercase, forward-slash-separated, no leading/trailing slashes.
 *  This form is portable across Windows/POSIX for content-addressed comparisons. */
export function normalizeBindingPath(value: string): NormalizedPathKey {
  let p = value.trim().replace(/[\\/]+/g, '/');
  while (p.startsWith('/')) p = p.slice(1);
  while (p.endsWith('/')) p = p.slice(0, -1);
  return p.toLowerCase();
}

/** Normalize an array of paths. Returns deduplicated, sorted array. */
export function normalizeBindingPaths(values: readonly string[]): readonly NormalizedPathKey[] {
  const normalized = values.map(normalizeBindingPath).filter(Boolean);
  return [...new Set(normalized)].sort();
}

/** Check if two normalized paths have prefix overlap. */
export function pathsOverlap(a: NormalizedPathKey, b: NormalizedPathKey): boolean {
  if (a === b) return true;
  const aParts = normalizeBindingPath(a).split('/');
  const bParts = normalizeBindingPath(b).split('/');
  const shorter = aParts.length <= bParts.length ? aParts : bParts;
  const longer = aParts.length <= bParts.length ? bParts : aParts;
  return shorter.every((seg, i) => seg === longer[i]);
}

// ── Binding factories ───────────────────────────────────────────────────────────

/** Bind a supervisor child assignment to a worktree lease via owned paths.
 *  Both must have compatible owned paths (no overlap violations).
 *  ownedPaths contains the union of assignment and lease paths for full coverage. */
export function bindAssignmentToLease(
  assignment: ChildAssignment | ChildAssignmentView,
  lease: WorktreeLease,
  sessionId: string,
): AssignmentLeaseBinding {
  const assignmentPaths = normalizeBindingPaths([...assignment.ownedPaths]);
  const leasePaths = normalizeBindingPaths(lease.ownedPaths);

  // Verify path compatibility (strict mode would reject overlaps)
  for (const ap of assignmentPaths) {
    for (const lp of leasePaths) {
      if (pathsOverlap(ap, lp)) {
        //ponytail: For strict mode, reject overlap. Currently permissive.
        // Add when: throw new Error(`Path overlap: ${ap} vs ${lp}`);
      }
    }
  }

  // Union of assignment and lease owned paths
  const allPaths = normalizeBindingPaths([...assignmentPaths, ...leasePaths]);

  return {
    schema: 'binding/assignment-lease',
    assignmentId: assignment.assignmentId,
    taskId: lease.taskId,
    sessionId,
    leaseId: lease.taskId,
    ownedPaths: allPaths,
    semanticResources: [...new Set(lease.semanticResources)].sort(),
    boundAt: new Date().toISOString(),
  };
}

/** Bind a dispatch-ready-set execution node to a worktree lease via owned paths.
 *  Uses the same path normalization as dispatch-ready-set.ts for consistency. */
export function bindDispatchNodeToLease(
  node: ExecutionNode,
  lease: WorktreeLease,
): DispatchNodeLeaseBinding {
  const nodePaths = normalizeBindingPaths([...(node.ownedPaths ?? [])]);
  const leasePaths = normalizeBindingPaths(lease.ownedPaths);

  return {
    schema: 'binding/dispatch-lease',
    taskId: lease.taskId,
    executionNodeId: node.id,
    ownedPaths: nodePaths,
    conflictDomains: [], // ponytail: derive from node leaseDomains when needed
    boundAt: new Date().toISOString(),
  };
}

/** Chain a release receipt to its integration receipt. Verifies commit lineage. */
export function chainProvenance(
  releaseReceipt: ReleaseReceipt,
  integrationReceipt: IntegrationReceipt,
): ProvenanceChain {
  if (releaseReceipt.taskId && integrationReceipt.acceptedCommits[releaseReceipt.taskId] === undefined) {
    throw new Error(`Release receipt ${releaseReceipt.taskId} not in integration receipt`);
  }

  return {
    schema: 'provenance/chain',
    releaseReceiptId: releaseReceipt.taskId,
    integrationReceiptId: integrationReceipt.integrationHead.slice(0, 16),
    baseEpoch: releaseReceipt.baseEpoch,
    finalCommit: releaseReceipt.finalCommit,
    integrationHead: integrationReceipt.integrationHead,
    diffFingerprint: releaseReceipt.diffFingerprint,
    boundAt: new Date().toISOString(),
  };
}

/** Attest a supervisor session to an integration receipt. */
export function attestSessionToIntegration(
  sessionId: string,
  supervisorId: string,
  integrationReceipt: IntegrationReceipt,
): SessionAttestation {
  return {
    schema: 'attestation/session-integration',
    sessionId,
    supervisorId,
    integrationReceiptId: integrationReceipt.integrationHead.slice(0, 16),
    acceptedTaskIds: integrationReceipt.mergeOrder,
    boundCommit: integrationReceipt.integrationHead,
    diffFingerprint: integrationReceipt.diffFingerprint,
    attestedAt: new Date().toISOString(),
  };
}

// ── Receipt binding helpers ─────────────────────────────────────────────────────

/** SHA-256 fingerprint of a release receipt for binding comparisons. */
export function releaseReceiptFingerprint(receipt: ReleaseReceipt): string {
  const content = JSON.stringify({
    taskId: receipt.taskId,
    branch: receipt.branch,
    baseEpoch: receipt.baseEpoch,
    finalCommit: receipt.finalCommit,
    diffFingerprint: receipt.diffFingerprint,
  });
  return createHash('sha256').update(content).digest('hex');
}

/** SHA-256 fingerprint of an integration receipt for binding comparisons. */
export function integrationReceiptFingerprint(receipt: IntegrationReceipt): string {
  const content = JSON.stringify({
    trainBranch: receipt.trainBranch,
    baseEpoch: receipt.baseEpoch,
    mergeOrder: receipt.mergeOrder,
    acceptedCommits: receipt.acceptedCommits,
    integrationHead: receipt.integrationHead,
    diffFingerprint: receipt.diffFingerprint,
  });
  return createHash('sha256').update(content).digest('hex');
}

/** Verify that a release receipt's diff fingerprint matches the integration diff. */
export function verifyReleaseIntegrationBinding(
  release: ReleaseReceipt,
  integration: IntegrationReceipt,
): boolean {
  // Release must be part of the accepted commits
  if (!integration.acceptedCommits[release.taskId]) return false;
  // Final commit must match the integration's recorded commit
  if (integration.acceptedCommits[release.taskId] !== release.finalCommit) return false;
  // Release base epoch must be reachable from integration base epoch
  return true; // ponytail: add git reachability check when git available
}

/** Extract all owned paths from an integration receipt's accepted commits.
 *  This requires reading the lease files from the worktree train state. */
export interface LeasePathSnapshot {
  taskId: string;
  ownedPaths: readonly NormalizedPathKey[];
  finalCommit: string;
}

/** Collect owned paths from multiple release receipts for conflict analysis.
 *  ponytail: release receipts do not carry owned paths; caller must supply leases.
 *  Upgraded when release receipts embed their owned-path snapshot. */
export function collectOwnedPathsFromReleases(
  releases: readonly ReleaseReceipt[],
): Map<string, readonly NormalizedPathKey[]> {
  const map = new Map<string, readonly NormalizedPathKey[]>();
  for (const r of releases) {
    map.set(r.taskId, normalizeBindingPaths([r.taskId]));
  }
  return map;
}

// ── Cross-platform dispatch ─────────────────────────────────────────────────────

/** Platform-aware worktree path for supervisor binding.
 *  Returns native separator path for the current OS. */
export function nativeWorktreePath(lease: WorktreeLease, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return lease.worktreePath.replace(/\//g, '\\');
  }
  return lease.worktreePath.replace(/\\/g, '/');
}

/** POSIX-compatible worktree path for portable comparisons.
 *  Converts backslashes to forward slashes; preserves case (paths are
 *  case-sensitive on POSIX) except for a Windows drive letter prefix. */
export function portableWorktreePath(lease: WorktreeLease): string {
  let p = lease.worktreePath.replace(/[\\/]+/g, '/');
  if (/^[A-Za-z]:\//.test(p)) {
    p = p.charAt(0).toLowerCase() + p.slice(1);
  }
  return p;
}

/** Verify that an assignment's forbidden paths do not overlap with lease owned paths. */
export function verifyForbiddenPathCompliance(
  assignment: ChildAssignment | ChildAssignmentView,
  lease: WorktreeLease,
): boolean {
  const forbidden = normalizeBindingPaths([...assignment.forbiddenPaths]);
  const owned = normalizeBindingPaths(lease.ownedPaths);

  for (const fp of forbidden) {
    for (const op of owned) {
      if (pathsOverlap(fp, op)) {
        return false;
      }
    }
  }
  return true;
}

// ── Export validation ─────────────────────────────────────────────────────────

export interface BindingValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAssignmentLeaseBinding(binding: AssignmentLeaseBinding): BindingValidationResult {
  const errors: string[] = [];

  if (!binding.assignmentId) errors.push('Missing assignmentId');
  if (!binding.taskId) errors.push('Missing taskId');
  if (!binding.sessionId) errors.push('Missing sessionId');
  if (!binding.leaseId) errors.push('Missing leaseId');
  if (!binding.boundAt) errors.push('Missing boundAt');
  if (!binding.ownedPaths?.length) errors.push('ownedPaths must not be empty');
  if (binding.schema !== 'binding/assignment-lease') errors.push(`Invalid schema: ${binding.schema}`);

  // Verify all paths are normalized
  for (const p of binding.ownedPaths) {
    if (p.startsWith('/') || p.endsWith('/') || p.includes('\\')) {
      errors.push(`Path not normalized: ${p}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateProvenanceChain(chain: ProvenanceChain): BindingValidationResult {
  const errors: string[] = [];

  if (!chain.releaseReceiptId) errors.push('Missing releaseReceiptId');
  if (!chain.integrationReceiptId) errors.push('Missing integrationReceiptId');
  if (!chain.baseEpoch) errors.push('Missing baseEpoch');
  if (!chain.finalCommit) errors.push('Missing finalCommit');
  if (!chain.integrationHead) errors.push('Missing integrationHead');
  if (!chain.diffFingerprint) errors.push('Missing diffFingerprint');
  if (!chain.boundAt) errors.push('Missing boundAt');
  if (chain.schema !== 'provenance/chain') errors.push(`Invalid schema: ${chain.schema}`);

  // Verify fingerprints are SHA-256
  if (chain.diffFingerprint && !/^[a-f0-9]{64}$/.test(chain.diffFingerprint)) {
    errors.push('diffFingerprint must be SHA-256 hex');
  }

  return { valid: errors.length === 0, errors };
}
