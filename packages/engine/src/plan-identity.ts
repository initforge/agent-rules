import { sha256Bytes, isSha256, type Sha256 } from './contracts.js';

export type { Sha256 } from './contracts.js';

/** Historical IDs only. Identity validation has no amendment-number ceiling. */
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

/** Explicit compatibility algorithm for pre-canonical NUL-joined identities. */
export function computeLegacyEffectivePlanSha256(
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

export interface IdentityAmendment { readonly amendment_id: string; readonly sha256: Sha256 }
export interface EffectivePlanIdentity { readonly sha256: Sha256; readonly canonical: string; readonly bytes: number }

function amendmentNumber(id: string): number {
  const match = /^AM-(\d{4})$/.exec(id);
  if (!match) throw new PlanValidationError(`Non-canonical amendment ID: ${id}`);
  return Number(match[1]);
}

/** Canonical effective-plan identity shared by readers and activation writers. */
export function computeCanonicalEffectivePlanIdentity(
  originalSha256: Sha256,
  approvedAmendments: readonly IdentityAmendment[],
): EffectivePlanIdentity {
  requireSha(originalSha256, 'originalSha256');
  let previous = 0;
  for (let i = 0; i < approvedAmendments.length; i++) {
    const amendment = approvedAmendments[i];
    requireSha(amendment.sha256, `approvedAmendments[${i}].sha256`);
    const number = amendmentNumber(amendment.amendment_id);
    const expected = previous === 3 ? 5 : previous + 1; // AM-0004 is permanently tombstoned.
    if (number !== expected) throw new PlanValidationError(`Amendment order/gap at ${amendment.amendment_id}; expected AM-${String(expected).padStart(4, '0')}`);
    previous = number;
  }
  const manifest = { algorithm: 'SHA-256', approved_amendments: approvedAmendments, composition: 'original-plus-ordered-approved-amendment-sha256', original_plan_sha256: originalSha256, version: 1 };
  const canonical = canonicalJson(manifest);
  return { sha256: sha256Bytes(new TextEncoder().encode(canonical)), canonical, bytes: new TextEncoder().encode(canonical).byteLength };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

/** Compatibility wrapper. Hash-only callers are legacy and intentionally retain the old algorithm. */
export const computeEffectivePlanSha256 = computeLegacyEffectivePlanSha256;

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

export interface PlanAnchorChunkIndex {
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly chunkSha256: Sha256;
}

/**
 * Compute a canonical chunk index for a PlanAnchor within its plan.
 * Chunks are ordered by (lineStart, lineEnd, requirementId, sectionHeading) and
 * content-addressed so the index is stable across re-ordering of the anchor array.
 */
export function computePlanAnchorChunkIndex(
  anchor: { readonly planSha256: Sha256; readonly sectionHeading: string; readonly lineStart: number; readonly lineEnd: number; readonly anchorTextSha256: Sha256; readonly requirementId: string },
  allAnchors: readonly { readonly planSha256: Sha256; readonly sectionHeading: string; readonly lineStart: number; readonly lineEnd: number; readonly anchorTextSha256: Sha256; readonly requirementId: string }[],
): PlanAnchorChunkIndex {
  const sorted = [...allAnchors].sort((left, right) => {
    if (left.lineStart !== right.lineStart) return left.lineStart - right.lineStart;
    if (left.lineEnd !== right.lineEnd) return left.lineEnd - right.lineEnd;
    if (left.requirementId !== right.requirementId) return left.requirementId < right.requirementId ? -1 : 1;
    return left.sectionHeading < right.sectionHeading ? -1 : 1;
  });
  const index = sorted.findIndex(candidate =>
    candidate.planSha256 === anchor.planSha256 &&
    candidate.sectionHeading === anchor.sectionHeading &&
    candidate.lineStart === anchor.lineStart &&
    candidate.lineEnd === anchor.lineEnd &&
    candidate.anchorTextSha256 === anchor.anchorTextSha256 &&
    candidate.requirementId === anchor.requirementId,
  );
  if (index < 0) throw new PlanValidationError('PlanAnchor not found in chunk index set');
  const chunkBytes = new TextEncoder().encode(JSON.stringify({ planSha256: anchor.planSha256, sectionHeading: anchor.sectionHeading, lineStart: anchor.lineStart, lineEnd: anchor.lineEnd, anchorTextSha256: anchor.anchorTextSha256, requirementId: anchor.requirementId, chunkIndex: index, chunkCount: sorted.length }));
  return { chunkIndex: index, chunkCount: sorted.length, chunkSha256: sha256Bytes(chunkBytes) };
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
