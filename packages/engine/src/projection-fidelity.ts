import { isSha256 } from './contracts.js';

export interface ActivePlanAnchor {
  readonly planId: string;
  readonly effectivePlanSha256: string;
  readonly ledgerRevision: number;
  readonly headSha256: string;
}

export interface ProjectionStamp {
  readonly name: string;
  readonly planId: string;
  readonly effectivePlanSha256: string;
  readonly ledgerRevision: number;
  readonly headSha256: string;
  /** False while a producer is staging an atomic projection snapshot. */
  readonly complete: boolean;
}

export interface ActiveProjectionSnapshot {
  readonly active: ActivePlanAnchor;
  readonly requiredProjectionNames: readonly string[];
  readonly projections: readonly ProjectionStamp[];
}

export type ProjectionFidelityCode =
  | 'INVALID_ACTIVE_ANCHOR'
  | 'DUPLICATE_PROJECTION'
  | 'MISSING_PROJECTION'
  | 'INCOMPLETE_PROJECTION'
  | 'PLAN_ID_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'HEAD_MISMATCH';

export interface ProjectionFidelityIssue {
  readonly code: ProjectionFidelityCode;
  readonly projection: string;
  readonly detail: string;
}

export type ProjectionFidelityResult =
  | { readonly valid: true; readonly snapshot: ActiveProjectionSnapshot }
  | { readonly valid: false; readonly snapshot: ActiveProjectionSnapshot; readonly issues: readonly ProjectionFidelityIssue[] };

export interface ActiveProjectionProvider {
  load(): Promise<ActiveProjectionSnapshot>;
  /** Optional single atomic rebuild. Absence means fidelity failures fail closed. */
  rebuildOnce?(stale: ActiveProjectionSnapshot, issues: readonly ProjectionFidelityIssue[]): Promise<void>;
}

export class ProjectionFidelityError extends Error {
  readonly issues: readonly ProjectionFidelityIssue[];

  constructor(issues: readonly ProjectionFidelityIssue[]) {
    super(`active projection fidelity failed: ${issues.map((issue) => `${issue.code}:${issue.projection}`).join(', ')}`);
    this.name = 'ProjectionFidelityError';
    this.issues = issues;
  }
}

function issue(code: ProjectionFidelityCode, projection: string, detail: string): ProjectionFidelityIssue {
  return { code, projection, detail };
}

export function validateProjectionFidelity(snapshot: ActiveProjectionSnapshot): ProjectionFidelityResult {
  const issues: ProjectionFidelityIssue[] = [];
  const { active } = snapshot;
  if (!active.planId || !isSha256(active.effectivePlanSha256) || !isSha256(active.headSha256)
      || !Number.isSafeInteger(active.ledgerRevision) || active.ledgerRevision < 0) {
    issues.push(issue('INVALID_ACTIVE_ANCHOR', 'active', 'active plan anchor is incomplete or malformed'));
  }

  const byName = new Map<string, ProjectionStamp>();
  for (const projection of snapshot.projections) {
    if (byName.has(projection.name)) {
      issues.push(issue('DUPLICATE_PROJECTION', projection.name, 'projection name is duplicated'));
      continue;
    }
    byName.set(projection.name, projection);
  }

  for (const name of [...new Set(snapshot.requiredProjectionNames)].sort()) {
    const projection = byName.get(name);
    if (!projection) {
      issues.push(issue('MISSING_PROJECTION', name, 'required projection is absent'));
      continue;
    }
    if (!projection.complete) issues.push(issue('INCOMPLETE_PROJECTION', name, 'projection is not atomically complete'));
    if (projection.planId !== active.planId) issues.push(issue('PLAN_ID_MISMATCH', name, `${projection.planId} != ${active.planId}`));
    if (projection.effectivePlanSha256 !== active.effectivePlanSha256) {
      issues.push(issue('IDENTITY_MISMATCH', name, 'effective plan identity differs from the active ledger'));
    }
    if (projection.ledgerRevision !== active.ledgerRevision) {
      issues.push(issue('REVISION_MISMATCH', name, `${projection.ledgerRevision} != ${active.ledgerRevision}`));
    }
    if (projection.headSha256 !== active.headSha256) {
      issues.push(issue('HEAD_MISMATCH', name, 'projection HEAD differs from the active ledger'));
    }
  }

  return issues.length === 0
    ? { valid: true, snapshot }
    : { valid: false, snapshot, issues };
}

/** Validate, optionally perform one producer-owned atomic rebuild, then fail closed. */
export async function ensureProjectionFidelity(
  provider: ActiveProjectionProvider,
): Promise<{ snapshot: ActiveProjectionSnapshot; rebuilt: boolean }> {
  const initial = await provider.load();
  const first = validateProjectionFidelity(initial);
  if (first.valid) return { snapshot: first.snapshot, rebuilt: false };
  if (!provider.rebuildOnce) throw new ProjectionFidelityError(first.issues);

  await provider.rebuildOnce(initial, first.issues);
  const rebuilt = await provider.load();
  const second = validateProjectionFidelity(rebuilt);
  if (!second.valid) throw new ProjectionFidelityError(second.issues);
  return { snapshot: second.snapshot, rebuilt: true };
}
