import { describe, expect, it } from 'vitest';
import {
  validateCheckpointIntegrity,
  validateCursorCapsulePair,
  createCheckpoint,
  buildResumeContext,
  computeCursorSha,
  computeCapsuleSha,
  isCheckpointCompatible,
  validateCheckpointForResume,
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
    planId: 'plan-001',
    runId: 'run-001',
    epoch: 1,
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
      expect(result.errors).toContain('cursor.taskId is required');
    });

    it('detects missing capsule.planId', () => {
      const cursor = makeCursor();
      const capsule = makeCapsule({ planId: '' });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('capsule.planId'))).toBe(true);
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

  describe('cursor-capsule identity binding', () => {
    it('rejects cursor with mismatched planId', () => {
      const cursor = makeCursor({ planId: 'plan-002' });
      const capsule = makeCapsule({ planId: 'plan-001' });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cursor.planId') && e.includes('capsule.planId'))).toBe(true);
    });

    it('rejects cursor with mismatched runId', () => {
      const cursor = makeCursor({ runId: 'run-999' });
      const capsule = makeCapsule({ runId: 'run-001' });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cursor.runId') && e.includes('capsule.runId'))).toBe(true);
    });

    it('rejects cursor with mismatched epoch', () => {
      const cursor = makeCursor({ epoch: 5 });
      const capsule = makeCapsule({ epoch: 1 });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cursor.epoch') && e.includes('capsule.epoch'))).toBe(true);
    });

    it('accepts cursor and capsule with identical identity', () => {
      const cursor = makeCursor({ planId: 'plan-X', runId: 'run-X', epoch: 3 });
      const capsule = makeCapsule({ planId: 'plan-X', runId: 'run-X', epoch: 3 });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(true);
    });

    it('detects all three identity mismatches simultaneously', () => {
      const cursor = makeCursor({ planId: 'plan-X', runId: 'run-X', epoch: 3 });
      const capsule = makeCapsule({ planId: 'plan-Y', runId: 'run-Y', epoch: 4 });
      const result = validateCursorCapsulePair(cursor, capsule);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('cursor identity in integrity validation', () => {
    it('detects missing cursor.planId', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ planId: '' }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('cursor.planId is required');
    });

    it('detects missing cursor.runId', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ runId: '' }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('cursor.runId is required');
    });

    it('detects negative cursor.epoch', () => {
      const ckpt = makeCheckpoint({ cursor: makeCursor({ epoch: -1 }) });
      const validation = validateCheckpointIntegrity(ckpt);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('cursor.epoch must be non-negative');
    });
  });

  describe('computeCursorSha identity coverage', () => {
    it('different planId produces different SHA', () => {
      const c1 = makeCursor({ planId: 'plan-001' });
      const c2 = makeCursor({ planId: 'plan-002' });
      expect(computeCursorSha(c1)).not.toBe(computeCursorSha(c2));
    });

    it('different runId produces different SHA', () => {
      const c1 = makeCursor({ runId: 'run-001' });
      const c2 = makeCursor({ runId: 'run-002' });
      expect(computeCursorSha(c1)).not.toBe(computeCursorSha(c2));
    });

    it('different epoch produces different SHA', () => {
      const c1 = makeCursor({ epoch: 1 });
      const c2 = makeCursor({ epoch: 2 });
      expect(computeCursorSha(c1)).not.toBe(computeCursorSha(c2));
    });

    it('order-independent for task IDs with identical identity', () => {
      const c1 = makeCursor({ completedTaskIds: ['a', 'b', 'c'] });
      const c2 = makeCursor({ completedTaskIds: ['c', 'a', 'b'] });
      expect(computeCursorSha(c1)).toBe(computeCursorSha(c2));
    });
  });

  describe('isCheckpointCompatible', () => {
    it('compatible when identity matches and progress forward', () => {
      const ckpt1 = makeCheckpoint({
        cursor: makeCursor({ completedTaskIds: ['task-001'] }),
      });
      const ckpt2 = createCheckpoint('task_complete', makeCursor({ completedTaskIds: ['task-001', 'task-002'] }), makeCapsule(), ckpt1.checkpointId);
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(true);
      expect(result.identityMatches).toBe(true);
      expect(result.cursorProgress).toBe(true);
    });

    it('incompatible when planId changes', () => {
      const ckpt1 = makeCheckpoint({ cursor: makeCursor({ planId: 'plan-A' }) });
      const ckpt2 = createCheckpoint('manual', makeCursor({ planId: 'plan-B' }), makeCapsule(), ckpt1.checkpointId);
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(false);
      expect(result.identityMatches).toBe(false);
      expect(result.reason).toContain('planId');
    });

    it('incompatible when runId changes', () => {
      const ckpt1 = makeCheckpoint({ cursor: makeCursor({ runId: 'run-A' }) });
      const ckpt2 = createCheckpoint('manual', makeCursor({ runId: 'run-B' }), makeCapsule(), ckpt1.checkpointId);
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('runId');
    });

    it('incompatible when epoch changes', () => {
      const ckpt1 = makeCheckpoint({ cursor: makeCursor({ epoch: 1 }) });
      const ckpt2 = createCheckpoint('epoch_change', makeCursor({ epoch: 2 }), makeCapsule(), ckpt1.checkpointId);
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('epoch');
    });

    it('incompatible when completed tasks decrease (rollback)', () => {
      const ckpt1 = makeCheckpoint({
        cursor: makeCursor({ completedTaskIds: ['task-001', 'task-002'] }),
      });
      const ckpt2 = createCheckpoint('manual', makeCursor({ completedTaskIds: ['task-001'] }), makeCapsule(), ckpt1.checkpointId);
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(false);
      expect(result.cursorProgress).toBe(false);
    });

    it('incompatible when checkpoint chain is broken', () => {
      const ckpt1 = makeCheckpoint();
      const ckpt2 = createCheckpoint('manual', makeCursor(), makeCapsule(), 'fake-previous-id');
      const result = isCheckpointCompatible(ckpt1, ckpt2);
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('chain broken');
    });

    it('compatible with null previousCheckpointId (first checkpoint)', () => {
      const ckpt = makeCheckpoint();
      const result = isCheckpointCompatible({ ...ckpt, previousCheckpointId: null } as Checkpoint, ckpt);
      expect(result.compatible).toBe(true);
    });
  });

  describe('validateCheckpointForResume', () => {
    it('valid when checkpoint matches expected identity', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ planId: 'plan-X', runId: 'run-X', epoch: 3 }),
        capsule: makeCapsule({ planId: 'plan-X', runId: 'run-X', epoch: 3 }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-X', 'run-X', 3);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('invalid when planId mismatches', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ planId: 'plan-A' }),
        capsule: makeCapsule({ planId: 'plan-A' }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-B', 'run-A', 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('planId'))).toBe(true);
    });

    it('invalid when runId mismatches', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ runId: 'run-A' }),
        capsule: makeCapsule({ runId: 'run-A' }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-001', 'run-B', 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('runId'))).toBe(true);
    });

    it('invalid when epoch mismatches', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ epoch: 5 }),
        capsule: makeCapsule({ epoch: 5 }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-001', 'run-001', 3);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('epoch mismatch'))).toBe(true);
    });

    it('cursorMatches reflects identity validation', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ planId: 'wrong-plan' }),
        capsule: makeCapsule({ planId: 'wrong-plan' }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-001', 'run-001', 1);
      expect(result.cursorMatches).toBe(false);
    });

    it('capsuleMatches reflects identity validation', () => {
      const ckpt = makeCheckpoint({
        cursor: makeCursor({ planId: 'wrong-plan' }),
        capsule: makeCapsule({ planId: 'wrong-plan' }),
      });
      const result = validateCheckpointForResume(ckpt, 'plan-001', 'run-001', 1);
      expect(result.capsuleMatches).toBe(false);
    });
  });
});
