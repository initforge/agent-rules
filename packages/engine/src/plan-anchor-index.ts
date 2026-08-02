/**
 * plan-anchor-index.ts — C5 M11R37/R38/R42 PlanAnchor chunk index.
 *
 * Content-addressed chunk index for PlanAnchors within a plan. Chunks are
 * ordered by (lineStart, lineEnd, requirementId, sectionHeading) and the
 * index is content-addressed so it is stable across re-ordering of the
 * anchor array.
 *
 * References:
 * - AM-0021 §3: capsule binds to original/effective plan identity
 * - AM-0021 §6: CapsuleFidelityValidator proves coverage of every claim
 * - M11-R37: attribute context by plan/candidate epoch
 * - M11-R38: every premium-main wake uses a signed MainRunCapsule
 * - M11-R42: capsule fidelity binds plan, ledger and candidate epoch
 */
import { sha256Bytes, isSha256, type Sha256 } from './contracts.js';

export type { Sha256 } from './contracts.js';

/** Fail-closed validation error for plan anchor operations. */
export class PlanAnchorIndexError extends Error {
  constructor(m: string) { super(m); this.name = 'PlanAnchorIndexError'; }
}

/** Canonical chunk index for a PlanAnchor within its plan. */
export interface PlanAnchorChunkIndex {
  /** Zero-based position within the sorted chunk array. */
  readonly chunkIndex: number;
  /** Total number of chunks in the plan. */
  readonly chunkCount: number;
  /** Content-addressed SHA-256 of this chunk's canonical serialization. */
  readonly chunkSha256: Sha256;
}

/** PlanAnchor shape required for chunk indexing. */
export interface IndexablePlanAnchor {
  readonly planSha256: Sha256;
  readonly sectionHeading: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly anchorTextSha256: Sha256;
  readonly requirementId: string;
}

/**
 * Assert that a value is a valid SHA-256 hex string.
 * @throws PlanAnchorIndexError
 */
function requireSha(value: string, label: string): asserts value is Sha256 {
  if (!isSha256(value)) {
    throw new PlanAnchorIndexError(`${label} must be a lowercase hex SHA-256 (64 hex chars): ${JSON.stringify(value)}`);
  }
}

/**
 * Compute a canonical chunk index for a PlanAnchor within its plan.
 * Chunks are ordered by (lineStart, lineEnd, requirementId, sectionHeading) and
 * content-addressed so the index is stable across re-ordering of the anchor array.
 *
 * @param anchor - The anchor to index
 * @param allAnchors - All anchors in the plan (used for computing chunkCount)
 * @returns PlanAnchorChunkIndex with chunkIndex, chunkCount, and content-addressed chunkSha256
 * @throws PlanAnchorIndexError if anchor is not found in allAnchors
 *
 * ponytail: add stable sort key output for debugging when chunkCount > 1
 */
export function computePlanAnchorChunkIndex(
  anchor: IndexablePlanAnchor,
  allAnchors: readonly IndexablePlanAnchor[],
): PlanAnchorChunkIndex {
  requireSha(anchor.planSha256, 'anchor.planSha256');
  requireSha(anchor.anchorTextSha256, 'anchor.anchorTextSha256');

  if (!Number.isInteger(anchor.lineStart) || anchor.lineStart < 1) {
    throw new PlanAnchorIndexError(`anchor.lineStart must be a positive integer: ${anchor.lineStart}`);
  }
  if (!Number.isInteger(anchor.lineEnd) || anchor.lineEnd < anchor.lineStart) {
    throw new PlanAnchorIndexError(`anchor.lineEnd must be >= lineStart: ${anchor.lineEnd} vs ${anchor.lineStart}`);
  }
  if (!anchor.sectionHeading || typeof anchor.sectionHeading !== 'string') {
    throw new PlanAnchorIndexError('anchor.sectionHeading must be a non-empty string');
  }
  if (!anchor.requirementId || typeof anchor.requirementId !== 'string') {
    throw new PlanAnchorIndexError('anchor.requirementId must be a non-empty string');
  }

  // Sort anchors by position then identity for stable chunk ordering
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

  if (index < 0) {
    throw new PlanAnchorIndexError('PlanAnchor not found in chunk index set');
  }

  // Content-addressed chunk SHA: same chunk content always yields same SHA
  const chunkBytes = new TextEncoder().encode(JSON.stringify({
    planSha256: anchor.planSha256,
    sectionHeading: anchor.sectionHeading,
    lineStart: anchor.lineStart,
    lineEnd: anchor.lineEnd,
    anchorTextSha256: anchor.anchorTextSha256,
    requirementId: anchor.requirementId,
    chunkIndex: index,
    chunkCount: sorted.length,
  }));
  return { chunkIndex: index, chunkCount: sorted.length, chunkSha256: sha256Bytes(chunkBytes) };
}

/**
 * Build a complete chunk index for all anchors in a plan.
 * @returns Map of anchor identity key to PlanAnchorChunkIndex
 *
 * ponytail: add streaming mode for large plans (>1000 anchors)
 */
export function buildPlanAnchorChunkIndex(
  anchors: readonly IndexablePlanAnchor[],
): ReadonlyMap<string, PlanAnchorChunkIndex> {
  const index = new Map<string, PlanAnchorChunkIndex>();
  for (const anchor of anchors) {
    const chunk = computePlanAnchorChunkIndex(anchor, anchors);
    const key = anchorKey(anchor);
    index.set(key, chunk);
  }
  return index;
}

/** Deterministic key for an anchor (stable across re-ordering). */
function anchorKey(anchor: IndexablePlanAnchor): string {
  return [
    anchor.planSha256,
    anchor.sectionHeading,
    anchor.lineStart,
    anchor.lineEnd,
    anchor.anchorTextSha256,
    anchor.requirementId,
  ].join(':');
}
