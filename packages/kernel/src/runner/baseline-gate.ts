/**
 * Scope-aware baseline gate shared by the durable queue and runner.
 *
 * A baseline report is intentionally an input to scheduling, not a worker
 * instruction.  Unknown/forbidden baseline findings block only tasks whose
 * owned scope intersects the affected paths; a task with no explicit scope is
 * treated as repository-wide and is therefore blocked fail-closed.
 */

export type BaselineGateStatus =
  | 'BASELINE_CLEAN'
  | 'BASELINE_REPAIRED'
  | 'BASELINE_FAIL'
  | 'NEEDS_RECONCILIATION';

export interface BaselineGate {
  status: BaselineGateStatus;
  /** Relative file/directory paths implicated by non-clean findings. */
  affectedPaths: string[];
  /** Short, non-secret reason copied into the durable task receipt. */
  reason?: string;
  /** Hash of the portable baseline manifest, when one was supplied. */
  manifestSha256?: string;
}

const BLOCKING_STATUSES = new Set<BaselineGateStatus>(['BASELINE_FAIL', 'NEEDS_RECONCILIATION']);

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new Error(`baseline gate contains unsafe relative path: ${value}`);
  }
  return normalized;
}

function touches(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

/** Return a durable reason when a task must not execute, otherwise null. */
export function baselineBlockReason(
  gate: BaselineGate | undefined,
  ownedPaths: readonly string[] = [],
): string | null {
  if (!gate || !BLOCKING_STATUSES.has(gate.status)) return null;
  const affected = [...new Set(gate.affectedPaths.map(normalizePath))];
  const owned = ownedPaths.map(normalizePath);
  // A task without an explicit scope can touch anything, so an unresolved
  // baseline must stop it even when the report could not name a path.
  const intersects = owned.length === 0 || affected.length === 0 || affected.some((path) => owned.some((scope) => touches(path, scope)));
  if (!intersects) return null;
  const detail = gate.reason ? `: ${gate.reason}` : '';
  return `baseline ${gate.status} blocks affected task${detail}`;
}

/** Convert the JSON manifest emitted by automation/baseline-reconciliation.py. */
export function baselineGateFromManifest(value: unknown): BaselineGate {
  if (!value || typeof value !== 'object') throw new Error('baseline manifest must be an object');
  const manifest = value as Record<string, unknown>;
  const status = manifest.status;
  if (status !== 'BASELINE_CLEAN' && status !== 'BASELINE_REPAIRED' && status !== 'BASELINE_FAIL' && status !== 'NEEDS_RECONCILIATION') {
    throw new Error(`unsupported baseline manifest status: ${String(status)}`);
  }
  const rawFindings = Array.isArray(manifest.findings) ? manifest.findings : [];
  const affectedPaths = rawFindings
    .filter((finding): finding is Record<string, unknown> => Boolean(finding) && typeof finding === 'object')
    .filter((finding) => finding.classification !== 'accepted-dirty')
    .map((finding) => finding.path)
    .filter((path): path is string => typeof path === 'string')
    .map(normalizePath);
  const reason = rawFindings.length > 0
    ? `${rawFindings.length} baseline finding(s) require reconciliation`
    : undefined;
  const manifestSha256 = typeof manifest.manifest_sha256 === 'string'
    ? manifest.manifest_sha256
    : typeof manifest.sha256 === 'string' ? manifest.sha256 : undefined;
  return {
    status,
    affectedPaths: [...new Set(affectedPaths)].sort(),
    ...(reason ? { reason } : {}),
    ...(manifestSha256 ? { manifestSha256 } : {}),
  };
}
