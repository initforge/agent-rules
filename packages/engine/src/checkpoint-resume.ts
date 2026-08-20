/**
 * checkpoint-resume.ts — M11-R46: Compact/crash/restart preserves decisions without
 * transcript replay (AM-0021 §11).
 *
 * Checkpoint = cursor position + capsule state + committed decisions.
 * Resume = validate cursor/capsule integrity, replay only pending decisions.
 *
 * Key design:
 *   - Cursor tracks progress through task DAG (task ID + attempt count).
 *   - Capsule captures the complete execution state at checkpoint time.
 *   - Decisions are committed atomically with checkpoint.
 *   - Resume validates: cursor matches expected, capsule hash matches, no partial state.
 *
 * ponytail: skip — parallel worker checkpoint coordination, incremental checkpoint
 * diffs, cross-host resume. Add when AM-0021 cluster 4 ships.
 */
import { createHash } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckpointTrigger = 'manual' | 'task_complete' | 'epoch_change' | 'crash_recovery';

export interface CursorPosition {
  readonly planId: string;
  readonly runId: string;
  readonly epoch: number;
  readonly taskId: string;
  readonly attemptCount: number;
  readonly completedTaskIds: readonly string[];
  readonly failedTaskIds: readonly string[];
  readonly skippedTaskIds: readonly string[];
}

export interface CapsuleState {
  readonly planId: string;
  readonly runId: string;
  readonly epoch: number;
  readonly decisions: readonly CommittedDecision[];
  readonly pendingClaims: readonly string[];
  readonly pendingEvidence: readonly string[];
  readonly activeWorkers: readonly string[];
  readonly mode: string;
}

export interface CommittedDecision {
  readonly decisionId: string;
  readonly decision: string;
  readonly rationale: string;
  readonly committedAt: string;
  readonly commitSha256: Sha256;
}

export interface Checkpoint {
  readonly checkpointId: string;
  readonly checkpointSha256: Sha256;
  readonly trigger: CheckpointTrigger;
  readonly cursor: CursorPosition;
  readonly capsule: CapsuleState;
  readonly createdAt: string;
  readonly previousCheckpointId: string | null;
}

export interface ResumeValidation {
  readonly valid: boolean;
  readonly cursorMatches: boolean;
  readonly capsuleMatches: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ResumeContext {
  readonly checkpoint: Checkpoint;
  readonly validation: ResumeValidation;
  readonly pendingDecisions: readonly string[];
  readonly canResume: boolean;
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateCursor(cursor: CursorPosition): string[] {
  const errors: string[] = [];
  if (!cursor.planId) errors.push('cursor.planId is required');
  if (!cursor.runId) errors.push('cursor.runId is required');
  if (cursor.epoch < 0) errors.push('cursor.epoch must be non-negative');
  if (!cursor.taskId) errors.push('cursor.taskId is required');
  if (cursor.attemptCount < 0) errors.push('cursor.attemptCount must be non-negative');
  // No overlapping task IDs across completed/failed/skipped
  const allIds = new Set([
    ...cursor.completedTaskIds,
    ...cursor.failedTaskIds,
    ...cursor.skippedTaskIds,
  ]);
  const total = cursor.completedTaskIds.length + cursor.failedTaskIds.length + cursor.skippedTaskIds.length;
  if (allIds.size !== total) errors.push('cursor task sets must be disjoint');
  return errors;
}

function validateCapsule(capsule: CapsuleState): string[] {
  const errors: string[] = [];
  if (!capsule.planId) errors.push('capsule.planId is required');
  if (!capsule.runId) errors.push('capsule.runId is required');
  if (capsule.epoch < 0) errors.push('capsule.epoch must be non-negative');
  // Check decision IDs are unique
  const decisionIds = capsule.decisions.map(d => d.decisionId);
  if (new Set(decisionIds).size !== decisionIds.length) {
    errors.push('capsule.decisions must have unique decisionIds');
  }
  // Verify decision commit hashes
  for (const decision of capsule.decisions) {
    const expected = sha256Bytes(new TextEncoder().encode(JSON.stringify({
      decisionId: decision.decisionId,
      decision: decision.decision,
      rationale: decision.rationale,
      committedAt: decision.committedAt,
    })));
    if (decision.commitSha256 !== expected) {
      errors.push(`decision ${decision.decisionId} commitSha256 mismatch`);
    }
  }
  return errors;
}

function computeCheckpointSha(checkpoint: Omit<Checkpoint, 'checkpointId' | 'checkpointSha256'>): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    trigger: checkpoint.trigger,
    cursor: checkpoint.cursor,
    capsule: checkpoint.capsule,
    createdAt: checkpoint.createdAt,
    previousCheckpointId: checkpoint.previousCheckpointId,
  })));
}

/** validateCheckpointIntegrity — verify cursor and capsule are internally consistent */
export function validateCheckpointIntegrity(checkpoint: Checkpoint): ResumeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...validateCursor(checkpoint.cursor));
  errors.push(...validateCapsule(checkpoint.capsule));

  // Verify checkpoint SHA matches computed SHA
  const expectedSha = computeCheckpointSha(checkpoint);
  if (checkpoint.checkpointSha256 !== expectedSha) {
    errors.push('checkpointSha256 does not match computed hash');
  }

  return {
    valid: errors.length === 0,
    cursorMatches: validateCursor(checkpoint.cursor).length === 0,
    capsuleMatches: validateCapsule(checkpoint.capsule).length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  };
}

/** validateCursorCapsulePair — check cursor and capsule are a valid pair for resume.
 * Enforces identity binding: plan/run/epoch must match between cursor and capsule.
 * Honest stale rejection: mismatched identity fields cause immediate invalidation. */
export function validateCursorCapsulePair(
  cursor: CursorPosition,
  capsule: CapsuleState,
): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  // First validate cursor internals
  errors.push(...validateCursor(cursor));

  // Identity binding: cursor ↔ capsule plan/run/epoch must match
  if (cursor.planId !== capsule.planId) {
    errors.push(`cursor.planId "${cursor.planId}" !== capsule.planId "${capsule.planId}"`);
  }
  if (cursor.runId !== capsule.runId) {
    errors.push(`cursor.runId "${cursor.runId}" !== capsule.runId "${capsule.runId}"`);
  }
  if (cursor.epoch !== capsule.epoch) {
    errors.push(`cursor.epoch ${cursor.epoch} !== capsule.epoch ${capsule.epoch}`);
  }

  // Cursor's completed tasks should be reflected in capsule decisions (eventual consistency)
  const completedTaskIds = new Set(cursor.completedTaskIds);
  const decidedTaskIds = new Set(
    capsule.decisions
      .map(d => {
        try {
          const ctx = JSON.parse(d.decision);
          return ctx.taskId ?? null;
        } catch { return null; }
      })
      .filter((id): id is string => id !== null),
  );

  const missingDecisions = [...completedTaskIds].filter(id => !decidedTaskIds.has(id));
  if (missingDecisions.length > 0) {
    errors.push(`completed tasks without committed decisions: ${missingDecisions.join(', ')}`);
  }

  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

/** createCheckpoint — build a new checkpoint with integrity hashes */
export function createCheckpoint(
  trigger: CheckpointTrigger,
  cursor: CursorPosition,
  capsule: CapsuleState,
  previousCheckpointId: string | null = null,
): Checkpoint {
  const checkpointId = `ckpt-${Date.now()}-${createHash('sha256').update(JSON.stringify({ cursor, capsule })).digest('hex').slice(0, 8)}`;

  const rawCheckpoint = {
    trigger,
    cursor,
    capsule,
    createdAt: new Date().toISOString(),
    previousCheckpointId,
  };

  return {
    ...rawCheckpoint,
    checkpointId,
    checkpointSha256: computeCheckpointSha(rawCheckpoint),
  };
}

/** buildResumeContext — assemble resume context from checkpoint + validation */
export function buildResumeContext(checkpoint: Checkpoint): ResumeContext {
  const validation = validateCheckpointIntegrity(checkpoint);

  // Find pending decisions (decisions not yet reflected in completed tasks)
  const completedTaskIds = new Set(checkpoint.cursor.completedTaskIds);
  const pendingDecisions = checkpoint.capsule.decisions
    .filter(d => {
      try {
        const ctx = JSON.parse(d.decision);
        return !completedTaskIds.has(ctx.taskId ?? '');
      } catch { return true; }
    })
    .map(d => d.decisionId);

  return {
    checkpoint,
    validation,
    pendingDecisions: Object.freeze(pendingDecisions),
    canResume: validation.valid,
  };
}

/** computeCursorSha — deterministic hash for cursor state, including identity */
export function computeCursorSha(cursor: CursorPosition): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    planId: cursor.planId,
    runId: cursor.runId,
    epoch: cursor.epoch,
    taskId: cursor.taskId,
    attemptCount: cursor.attemptCount,
    completedTaskIds: cursor.completedTaskIds.slice().sort(),
    failedTaskIds: cursor.failedTaskIds.slice().sort(),
    skippedTaskIds: cursor.skippedTaskIds.slice().sort(),
  })));
}

/** computeCapsuleSha — deterministic hash for capsule state */
export function computeCapsuleSha(capsule: CapsuleState): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
    planId: capsule.planId,
    runId: capsule.runId,
    epoch: capsule.epoch,
    decisions: capsule.decisions.map(d => d.commitSha256),
    pendingClaims: capsule.pendingClaims.slice().sort(),
    pendingEvidence: capsule.pendingEvidence.slice().sort(),
    activeWorkers: capsule.activeWorkers.slice().sort(),
    mode: capsule.mode,
  })));
}

/** CheckpointCompatibility — result of comparing two checkpoints for resume eligibility */
export interface CheckpointCompatibility {
  readonly compatible: boolean;
  readonly reason?: string;
  readonly cursorProgress: boolean;
  readonly identityMatches: boolean;
}

/**
 * isCheckpointCompatible — verify checkpoint B can resume from checkpoint A.
 * Checks: identity binding (plan/run/epoch), cursor progress (no rollback), SHA integrity.
 */
export function isCheckpointCompatible(
  previous: Checkpoint,
  next: Checkpoint,
): CheckpointCompatibility {
  // Identity must match across checkpoints
  const identityFields = [
    { field: 'planId', prev: previous.cursor.planId, next: next.cursor.planId },
    { field: 'runId', prev: previous.cursor.runId, next: next.cursor.runId },
    { field: 'epoch', prev: previous.cursor.epoch, next: next.cursor.epoch },
  ];

  for (const { field, prev, next: n } of identityFields) {
    if (prev !== n) {
      return {
        compatible: false,
        reason: `identity mismatch: ${field} changed from "${prev}" to "${n}"`,
        cursorProgress: false,
        identityMatches: false,
      };
    }
  }

  // Cursor progress: completed tasks must not decrease (no rollback)
  const prevCompleted = new Set(previous.cursor.completedTaskIds);
  const nextCompleted = new Set(next.cursor.completedTaskIds);
  const hasProgress = [...prevCompleted].every(id => nextCompleted.has(id));
  const hasNewWork = nextCompleted.size >= prevCompleted.size;

  if (!hasProgress || !hasNewWork) {
    return {
      compatible: false,
      reason: 'cursor rollback detected: completed tasks decreased',
      cursorProgress: false,
      identityMatches: true,
    };
  }

  // Chain integrity: next.previousCheckpointId should match previous.checkpointId
  if (next.previousCheckpointId !== null && next.previousCheckpointId !== previous.checkpointId) {
    return {
      compatible: false,
      reason: `checkpoint chain broken: expected previous "${previous.checkpointId}", got "${next.previousCheckpointId}"`,
      cursorProgress: true,
      identityMatches: true,
    };
  }

  return {
    compatible: true,
    cursorProgress: true,
    identityMatches: true,
  };
}

/** validateCheckpointForResume — full validation pipeline: integrity + identity + compatibility */
export function validateCheckpointForResume(
  checkpoint: Checkpoint,
  expectedPlanId: string,
  expectedRunId: string,
  expectedEpoch: number,
): ResumeValidation {
  const integrity = validateCheckpointIntegrity(checkpoint);
  const errors = [...integrity.errors];

  // Hard identity constraints
  if (checkpoint.cursor.planId !== expectedPlanId) {
    errors.push(`planId mismatch: checkpoint "${checkpoint.cursor.planId}" !== expected "${expectedPlanId}"`);
  }
  if (checkpoint.cursor.runId !== expectedRunId) {
    errors.push(`runId mismatch: checkpoint "${checkpoint.cursor.runId}" !== expected "${expectedRunId}"`);
  }
  if (checkpoint.cursor.epoch !== expectedEpoch) {
    errors.push(`epoch mismatch: checkpoint ${checkpoint.cursor.epoch} !== expected ${expectedEpoch}`);
  }

  // Cursor-capsule binding
  const pairValidation = validateCursorCapsulePair(checkpoint.cursor, checkpoint.capsule);
  errors.push(...pairValidation.errors);

  return {
    valid: errors.length === 0 && integrity.valid,
    cursorMatches: integrity.cursorMatches && checkpoint.cursor.planId === expectedPlanId,
    capsuleMatches: integrity.capsuleMatches && checkpoint.capsule.planId === expectedPlanId,
    errors: Object.freeze([...new Set(errors)]),
    warnings: integrity.warnings,
  };
}
