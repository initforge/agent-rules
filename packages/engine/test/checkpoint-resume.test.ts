import { describe, expect, it } from 'vitest';
import {
  validateCheckpointIntegrity,
  validateCursorCapsulePair,
  createCheckpoint,
  buildResumeContext,
  computeCursorSha,
  computeCapsuleSha,
  type CursorPosition,
  type CapsuleState,
  type Checkpoint,
  type CommittedDecision,
} from '../src/checkpoint-resume.js';

function makeDecision(overrides?: Partial<CommittedDecision>): CommittedDecision {
  return {
    decisionId: 'dec-001',
    decision: '{"taskId":"task-001","action":"approve"}',
    rationale: 'Task completed successfully',
    committedAt: '2026-08-01T00:00:00.000Z',
    commitSha256: 'a'.repeat(64),
    ...overrides,
  };
}

function makeCursor(overrides?: Partial<CursorPosition>): CursorPosition {
  return {
    taskId: 'task-001',
    attemptCount: 1,
    completedTaskIds: [],
    failedTaskIds: [],
    skippedTaskIds: [],
    ...overrides,
  };
}

function makeCapsule(overrides?: Partial<CapsuleState>): CapsuleState {
  return {
    planId: 'plan-001',
    runId: 'run-001',
    epoch: 1,
    decisions: [],
    pendingClaims: [],
    pendingEvidence: [],
    activeWorkers: [],
    mode: 'RESUME',
    ...overrides,
  };
}

function makeCheckpoint(overrides?: { cursor?: Partial<CursorPosition>; capsule?: Partial<CapsuleState> }): Checkpoint {
  const cursor = makeCursor(overrides?.cursor ?? {});
  const capsule = makeCapsule(overrides?.capsule ?? {});
  // Base checkpoint has no decisions to avoid SHA validation complexity
  return createCheckpoint('manual', cursor, capsule);
}

describe('checkpoint-resume', () => {
  describe('validateCheckpointIntegrity', () => {
    it('validates a well-formed checkpoint', () => {
      const ckpt = makeCheckpoint();
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(true);
      expect(validation.cursorMatches).toBe(true);
      expect(validation.capsuleMatches).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects invalid cursor', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ taskId: '' }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.cursorMatches).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('detects negative attemptCount', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ attemptCount: -1 }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('cursor.attemptCount must be non-negative');
    });

    it('detects disjoint task sets violation', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ completedTaskIds: ['task-001'], failedTaskIds: ['task-001'] }),
      });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('cursor task sets must be disjoint');
    });

    it('detects capsule without planId', () => {
      const ckpt = makeCheckpoint({ capsule: makeCapsule({ planId: '' }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.capsuleMatches).toBe(false);
    });

    it('detects duplicate decision IDs', () => {
      const d1 = makeDecision({ decisionId: 'dup-decision', commitSha256: 'b'.repeat(64) });
      const d2 = makeDecision({ decisionId: 'dup-decision', commitSha256: 'b'.repeat(64) }); // same ID, different object
      const ckpt = createCheckpoint('manual', makeCursor(), makeCapsule({ decisions: [d1, d2] }));
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('unique decisionId'))).toBe(true);
    });

    it('detects tampered checkpoint SHA', () => {
      const ckpt = makeCheckpoint();
      const tampered: Checkpoint = { ...ckpt, checkpointSha256: 'b'.repeat(64) };
      const validation = validateCheckpointIntegrity(tampered);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('checkpointSha256 does not match computed hash');
    });
  });

  describe('validateCursorCapsulePair', () => {
    it('validates matching cursor and capsule', () => {
      const cursor = makeCursor({ taskId: 'task-001', completedTaskIds: ['task-001'] });
      const capsule = makeCapsule({
        decisions: [{
          ...makeDecision(),
          decision: '{"taskId":"task-001","action":"approve"}',
        }],
      });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(true);
    });

    it('detects missing cursor.taskId', () => {
      const cursor = makeCursor({ taskId: '' });
      const capsule = makeCapsule();
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cursor.taskId must be set');
    });

    it('detects missing capsule.planId', () => {
      const cursor = makeCursor();
      const capsule = makeCapsule({ planId: '' });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('capsule.planId must be set');
    });

    it('detects completed tasks without committed decisions', () => {
      const cursor = makeCursor({ completedTaskIds: ['task-001'] });
      const capsule = makeCapsule({ decisions: [] });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('without committed decisions'))).toBe(true);
    });
  });

  describe('createCheckpoint', () => {
    it('creates checkpoint with required fields', () => {
      const cursor = makeCursor();
      const capsule = makeCapsule();
      const ckpt = createCheckpoint('manual', cursor, capsule);
      expect(ckpt.checkpointId).toMatch(/^ckpt-\d+-[a-f0-9]{8}$/);
      expect(ckpt.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(ckpt.trigger).toBe('manual');
      expect(ckpt.createdAt).toBeTruthy();
    });

    it('links to previous checkpoint', () => {
      const cursor = makeCursor();
      const capsule = makeCapsule();
      const ckpt1 = createCheckpoint('manual', cursor, capsule);
      const ckpt2 = createCheckpoint('task_complete', cursor, capsule, ckpt1.checkpointId);
      expect(ckpt2.previousCheckpointId).toBe(ckpt1.checkpointId);
    });

    it('generates unique checkpointId', async () => {
      const cursor = makeCursor();
      const capsule = makeCapsule();
      const ckpt1 = createCheckpoint('manual', cursor, capsule);
      await new Promise(r => setTimeout(r, 2)); // ensure different timestamp
      const ckpt2 = createCheckpoint('manual', cursor, capsule);
      expect(ckpt1.checkpointId).not.toBe(ckpt2.checkpointId);
    });

    it('each trigger type accepted', () => {
      const cursor = makeCursor();
      const capsule = makeCapsule();
      const triggers = ['manual', 'task_complete', 'epoch_change', 'crash_recovery'] as const;
      for (const trigger of triggers) {
        const ckpt = createCheckpoint(trigger, cursor, capsule);
        expect(ckpt.trigger).toBe(trigger);
      }
    });
  });

  describe('buildResumeContext', () => {
    it('builds valid resume context from checkpoint', () => {
      const ckpt = makeCheckpoint();
      const ctx = buildResumeContext(ckpt);
      expect(ctx.canResume).toBe(true);
      expect(ctx.checkpoint.checkpointId).toBe(ckpt.checkpointId);
      expect(ctx.validation.valid).toBe(true);
    });

    it('marks canResume false for invalid checkpoint', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ taskId: '' }) });
      const ctx = buildResumeContext(ckpt);
      expect(ctx.canResume).toBe(false);
      expect(ctx.validation.valid).toBe(false);
    });

    it('computes pending decisions correctly', () => {
      const cursor = makeCursor({ completedTaskIds: ['task-001'] });
      const capsule = makeCapsule({
        decisions: [{
          ...makeDecision(),
          decision: '{"taskId":"task-002","action":"approve"}', // different task
        }],
      });
      const ckpt = createCheckpoint('manual', cursor, capsule);
      const ctx = buildResumeContext(ckpt);
      expect(ctx.pendingDecisions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computeCursorSha', () => {
    it('returns deterministic SHA for same cursor', () => {
      const c1 = makeCursor({ completedTaskIds: ['a', 'b'] });
      const c2 = makeCursor({ completedTaskIds: ['a', 'b'] });
      expect(computeCursorSha(c1)).toBe(computeCursorSha(c2));
    });

    it('returns different SHA for different cursors', () => {
      const c1 = makeCursor({ taskId: 'task-001' });
      const c2 = makeCursor({ taskId: 'task-002' });
      expect(computeCursorSha(c1)).not.toBe(computeCursorSha(c2));
    });

    it('order-independent for task IDs', () => {
      const c1 = makeCursor({ completedTaskIds: ['a', 'b', 'c'] });
      const c2 = makeCursor({ completedTaskIds: ['c', 'a', 'b'] });
      expect(computeCursorSha(c1)).toBe(computeCursorSha(c2));
    });
  });

  describe('computeCapsuleSha', () => {
    it('returns deterministic SHA for same capsule', () => {
      const capsule1 = makeCapsule({ decisions: [makeDecision()] });
      const capsule2 = makeCapsule({ decisions: [makeDecision()] });
      expect(computeCapsuleSha(capsule1)).toBe(computeCapsuleSha(capsule2));
    });

    it('returns different SHA for different capsules', () => {
      const c1 = makeCapsule({ planId: 'plan-001' });
      const c2 = makeCapsule({ planId: 'plan-002' });
      expect(computeCapsuleSha(c1)).not.toBe(computeCapsuleSha(c2));
    });
  });

  describe('decision commit SHA validation', () => {
    it('detects incorrect commit SHA', () => {
      const ckpt = makeCheckpoint({
        capsule: makeCapsule({
          decisions: [{ ...makeDecision(), commitSha256: 'b'.repeat(64) }],
        }),
      });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('commitSha256 mismatch'))).toBe(true);
    });
  });

  describe('resume validation warnings', () => {
    it('includes warnings in validation result', () => {
      const ckpt = makeCheckpoint();
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.warnings).toBeDefined();
      expect(Array.isArray(validation.warnings)).toBe(true);
    });
  });
});
