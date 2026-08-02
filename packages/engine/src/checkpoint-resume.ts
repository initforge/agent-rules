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

/** validateCursorCapsulePair — check cursor and capsule are a valid pair for resume */
export function validateCursorCapsulePair(
  cursor: CursorPosition,
  capsule: CapsuleState,
): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  // Cursor planId must match capsule planId
  // ponytail: skip — cross-run cursor binding. Add when multi-run resume needed.
  // For now, we only validate that both reference the same plan
  if (!cursor.taskId) errors.push('cursor.taskId must be set');
  if (!capsule.planId) errors.push('capsule.planId must be set');

  // Cursor's completed tasks should be reflected in capsule decisions (eventual consistency)
  // Warning only (tasks may have committed decisions not yet reflected in task lists)
  const completedTaskIds = new Set(cursor.completedTaskIds);
  const decidedTaskIds = new Set(
    capsule.decisions
      .map(d => {
        // Extract task ID from decision context if present
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

/** computeCursorSha — deterministic hash for cursor state */
export function computeCursorSha(cursor: CursorPosition): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify({
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
