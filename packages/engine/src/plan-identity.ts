import { sha256Bytes, isSha256, type Sha256 } from './contracts.js';

export type { Sha256 } from './contracts.js';

export const APPROVED_AMENDMENT_IDS = ['AM-0001', 'AM-0002', 'AM-0003', 'AM-0005', 'AM-0006', 'AM-0007', 'AM-0008'] as const;
export const APPROVED_AMENDMENT_SET = new Set<string>(APPROVED_AMENDMENT_IDS);
export const SHADOW_ALLOWLIST = ['tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md'];
export const FILENAME_RE = /^[a-zA-Z0-9._-]+\.md$/;
export const LEGACY_KEYS = ['execution_state', 'effective_plan_identity', 'mutation_gate', 'original_plan', 'artifact_lineage', 'architecture_decisions', 'semantic_migrations', 'foundation_slices', 'reviews', 'orphan_side_effects', 'audit_events'];

export class PlanValidationError extends Error {
  constructor(m: string) { super(m); this.name = 'PlanValidationError'; }
}

export class PlanNotFoundError extends Error {
  constructor(m: string) { super(m); this.name = 'PlanNotFoundError'; }
}

export interface IntegrityFinding {
  kind: 'ORIGINAL_TAMPER' | 'SHADOW_DRIFT' | 'PLANID_MISMATCH' | 'MISSING_ORIGINAL' | 'MISSING_SHADOW' | 'LEGACY_SHAPE' | 'MISSING_AMENDMENT' | 'AMENDMENT_TAMPER' | 'AMENDMENT_ORDER' | 'SYMLINK' | 'MANIFEST' | 'PATH_ESCAPE' | 'ENGINE_VALIDATION' | 'IO_FAULT' | 'WRONG_TYPE';
  detail: string;
}

export class PlanIntegrityError extends Error {
  findings: IntegrityFinding[];
  errno?: string;
  constructor(f: IntegrityFinding[], errno?: string) {
    super(`Plan integrity check failed: ${f.map(x => x.kind).join(', ')}`);
    this.name = 'PlanIntegrityError';
    this.findings = f;
    this.errno = errno;
  }
}

export class LegacyRejectionError extends Error {
  constructor(d: string) { super(`Legacy ledger shape rejected: ${d}`); this.name = 'LegacyRejectionError'; }
}

function requireSha(value: string, label: string): asserts value is Sha256 {
  if (!isSha256(value)) {
    throw new Error(`${label} must be a lowercase hex SHA-256 (64 hex chars): ${JSON.stringify(value)}`);
  }
}

export function computeEffectivePlanSha256(
  originalSha256: Sha256,
  amendmentSha256s: readonly string[],
): Sha256 {
  requireSha(originalSha256, 'originalSha256');
  for (let i = 0; i < amendmentSha256s.length; i++) {
    requireSha(amendmentSha256s[i], `amendmentSha256s[${i}]`);
  }
  const ordered = [originalSha256, ...amendmentSha256s];
  return sha256Bytes(new TextEncoder().encode(ordered.join('\x00')));
}

export function isLegacyShape(j: Record<string, unknown>): boolean {
  return LEGACY_KEYS.some(k => k in j);
}

export function validateAmendmentIds(ids: readonly string[]): string | null {
  let lastIdx = -1;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!APPROVED_AMENDMENT_SET.has(id)) {
      if (id === 'AM-0004') return 'AM-0004 is tombstoned and rejected';
      return `Unknown or invalid amendment ID: ${JSON.stringify(id)}`;
    }
    const orderIdx = APPROVED_AMENDMENT_IDS.indexOf(id as typeof APPROVED_AMENDMENT_IDS[number]);
    if (orderIdx <= lastIdx) return `Amendment ${id} out of approved order`;
    lastIdx = orderIdx;
  }
  return null;
}

export function validateSourceRef(s: string): IntegrityFinding | null {
  if (typeof s !== 'string' || s.length === 0) return { kind: 'PATH_ESCAPE', detail: 'sourceRef is empty or not a string' };
  if (s.startsWith('/') || /^[A-Za-z]:[/\\]/.test(s)) return { kind: 'PATH_ESCAPE', detail: `sourceRef absolute path: ${s}` };
  if (s.startsWith('\\\\')) return { kind: 'PATH_ESCAPE', detail: `sourceRef UNC path: ${s}` };
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(s)) return { kind: 'PATH_ESCAPE', detail: `sourceRef dot-dot traversal: ${s}` };
  if (s.includes('\x00')) return { kind: 'PATH_ESCAPE', detail: 'sourceRef contains NUL' };
  if (/%(?:2[eE]|5[cC]|2[fF])/.test(s)) return { kind: 'PATH_ESCAPE', detail: `sourceRef percent-encoded path: ${s}` };
  return null;
}

export function validateFileName(fn: string): IntegrityFinding | null {
  if (typeof fn !== 'string' || fn.length === 0) return { kind: 'MANIFEST', detail: 'filename is empty' };
  if (fn.startsWith('.')) return { kind: 'MANIFEST', detail: `filename starts with dot: ${fn}` };
  if (fn.includes('/') || fn.includes('\\')) return { kind: 'MANIFEST', detail: `filename contains separator: ${fn}` };
  if (fn.includes('..')) return { kind: 'MANIFEST', detail: `filename contains double-dot: ${fn}` };
  if (!FILENAME_RE.test(fn)) return { kind: 'MANIFEST', detail: `filename does not match pattern: ${fn}` };
  return null;
}

export function validatePlanId(planId: string): void {
  if (typeof planId !== 'string' || planId.length === 0) throw new PlanValidationError(`Invalid planId: ${JSON.stringify(planId)}`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(planId)) throw new PlanValidationError(`Invalid planId: ${planId}`);
  if (/[\x00-\x1f\x7f]/.test(planId)) throw new PlanValidationError(`Control characters in planId: ${planId}`);
  if (planId.includes('..')) throw new PlanValidationError(`Path traversal in planId: ${planId}`);
  if (planId.length > 128) throw new PlanValidationError(`planId too long: ${planId}`);
}

export function buildManifestJson(
  planId: string,
  originalSha256: string,
  amendments: ReadonlyArray<{ amendmentId: string; sha256: string; filename: string; order: number }>,
): string {
  validatePlanId(planId);
  if (!isSha256(originalSha256)) {
    throw new PlanValidationError(`Invalid originalSha256 in buildManifestJson: ${JSON.stringify(originalSha256)}`);
  }

  const ids = amendments.map(a => a.amendmentId);
  const amdErr = validateAmendmentIds(ids);
  if (amdErr) throw new PlanValidationError(`buildManifestJson: ${amdErr}`);

  const seenIds = new Set<string>();
  const seenFns = new Set<string>();

  for (let i = 0; i < amendments.length; i++) {
    const a = amendments[i];
    if (typeof a.order !== 'number' || !Number.isInteger(a.order) || a.order !== i) {
      throw new PlanValidationError(`buildManifestJson: amendments[${i}] order must be ${i}, got ${a.order}`);
    }
    if (!isSha256(a.sha256)) {
      throw new PlanValidationError(`buildManifestJson: amendments[${i}] invalid sha256: ${JSON.stringify(a.sha256)}`);
    }
    if (seenIds.has(a.amendmentId)) throw new PlanValidationError(`buildManifestJson: duplicate amendmentId ${a.amendmentId}`);
    seenIds.add(a.amendmentId);
    const fnErr = validateFileName(a.filename);
    if (fnErr) throw new PlanValidationError(`buildManifestJson: ${fnErr.detail}`);
    if (seenFns.has(a.filename)) throw new PlanValidationError(`buildManifestJson: duplicate filename ${a.filename}`);
    seenFns.add(a.filename);
  }

  const entries = amendments.map(a => ({
    amendmentId: a.amendmentId,
    sha256: a.sha256,
    filename: a.filename,
    order: a.order,
  }));

  return JSON.stringify({
    schema: 'harness/amendments-manifest/v1',
    planId,
    originalSha256,
    amendments: entries,
  }, null, 2);
}
