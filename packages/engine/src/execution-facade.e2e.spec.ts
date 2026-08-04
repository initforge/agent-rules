/**
 * execution-facade.e2e.spec.ts — End-to-end regression test for execution-facade wiring.
 *
 * Test: submitted command produces broker artifact/event and resume validates checkpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  createExecutionFacade,
  runAndCheckpoint,
  validateCheckpointForResumeViaFacade,
  restoreFromCheckpoint,
  type ExecutionCommand,
  type ExecutionFacadeOptions,
  type ResumeValidation,
} from './execution-facade.js';
import { createCheckpoint, validateCheckpointIntegrity, buildResumeContext, type Checkpoint } from './checkpoint-resume.js';
import { createEventDelta, verifyEventDeltaIntegrity } from './event-delta.js';
import { sha256Bytes } from './contracts.js';

describe('execution-facade e2e', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('submitted command produces broker artifact, event delta, and checkpoint', () => {
    // 1. Create execution facade
    const options: ExecutionFacadeOptions = {
      planId: 'test-plan',
      runId: 'test-run-001',
      baseDir: tmpDir,
      candidateEpoch: 1700000000000,
    };
    const facade = createExecutionFacade(options);

    // 2. Submit a command (simulated)
    const cmd: ExecutionCommand = {
      command: 'echo',
      args: ['hello world'],
    };
    const stdout = 'hello world\n';
    const stderr = '';
    const exitCode = 0;
    const durationMs = 42;

    const receipt = facade.submitCommand(cmd, stdout, stderr, exitCode, durationMs);

    // 3. Verify broker artifact produced
    expect(receipt.artifact).toBeDefined();
    expect(receipt.artifact.artifactId).toBeDefined();
    expect(receipt.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.artifact.uri).toContain('tool://echo');

    // 4. Verify artifact file exists
    const artifactBase = path.join(tmpDir, '.agent', 'artifacts');
    const artifactDir = path.join(artifactBase, receipt.artifact.artifactId.slice(0, 2));
    const artifactFile = path.join(artifactDir, `${receipt.artifact.artifactId}.content`);
    expect(fs.existsSync(artifactFile)).toBe(true);
    expect(fs.readFileSync(artifactFile, 'utf-8')).toBe(stdout);

    // 5. Verify event delta produced
    expect(receipt.event).toBeDefined();
    expect(receipt.event.eventType).toBe('WORKER_COMPLETE');
    expect(receipt.event.actor).toBe('execution-facade');
    expect(receipt.event.artifactRefs).toHaveLength(1);
    expect(receipt.event.artifactRefs[0]!.artifactId).toBe(receipt.artifact.artifactId);
    expect(receipt.event.eventSha256).toMatch(/^[a-f0-9]{64}$/);

    // 6. Verify event delta integrity
    expect(verifyEventDeltaIntegrity(receipt.event)).toBe(true);

    // 7. Verify checkpoint produced
    expect(receipt.checkpoint).toBeDefined();
    expect(receipt.checkpoint.checkpointId).toMatch(/^ckpt-\d+-[a-f0-9]{8}$/);
    expect(receipt.checkpoint.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.checkpoint.trigger).toBe('task_complete');
    expect(receipt.checkpoint.capsule.planId).toBe('test-plan');
    expect(receipt.checkpoint.capsule.runId).toBe('test-run-001');

    // 8. Verify checkpoint integrity
    const validation = validateCheckpointIntegrity(receipt.checkpoint);
    expect(validation.valid).toBe(true);
    expect(validation.cursorMatches).toBe(true);
    expect(validation.capsuleMatches).toBe(true);
  });

  it('runAndCheckpoint produces broker artifact with failure event', () => {
    const options: ExecutionFacadeOptions = {
      planId: 'test-plan-fail',
      runId: 'test-run-002',
      baseDir: tmpDir,
    };

    const cmd: ExecutionCommand = { command: 'false', args: [] };
    const receipt = runAndCheckpoint(cmd, '', 'command failed', 1, 10, options);

    expect(receipt.artifact).toBeDefined();
    expect(receipt.event.eventType).toBe('WORKER_FAIL');
    expect(receipt.event.severity).toBe('WARNING');
    expect(receipt.checkpoint).toBeDefined();
  });

  it('checkpoint validates on resume and wake decision computed', () => {
    // Create a valid checkpoint with properly computed commitSha256
    // and matching identity between cursor and capsule
    const options: ExecutionFacadeOptions = {
      planId: 'test-plan-resume',
      runId: 'test-run-resume',
      baseDir: tmpDir,
      candidateEpoch: 1700000000000,
    };
    const facade = createExecutionFacade(options);

    // Use the facade to create a checkpoint with consistent state
    facade.commitDecision('decision-1', JSON.stringify({ taskId: 'task-1', result: 'pass' }), 'Task completed');
    const cmd: ExecutionCommand = { command: 'true', args: [] };
    const receipt = facade.submitCommand(cmd, '', '', 0, 5);
    const checkpoint = receipt.checkpoint;

    // Validate checkpoint integrity
    const validation = validateCheckpointIntegrity(checkpoint);
    expect(validation.valid).toBe(true);

    // Validate resume via facade - should succeed with matching identity
    const resumeResult = validateCheckpointForResumeViaFacade(checkpoint, options);

    expect(resumeResult.valid).toBe(true);
    expect(resumeResult.checkpoint.checkpointId).toBe(checkpoint.checkpointId);
    expect(resumeResult.wakeDecision).toBeDefined();
    expect(resumeResult.wakeDecision.shouldWake).toBe(true);
    expect(resumeResult.wakeDecision.confidence).toBeGreaterThan(0);
  });

  it('tampered checkpoint fails validation', () => {
    // 1. Create valid checkpoint
    const checkpoint = createCheckpoint(
      'manual',
      {
        planId: 'test-plan-resume',
        runId: 'test-run-resume',
        epoch: 1700000000000,
        taskId: 'task-1',
        attemptCount: 0,
        completedTaskIds: [],
        failedTaskIds: [],
        skippedTaskIds: [],
      },
      {
        planId: 'tampered-plan',
        runId: 'tampered-run',
        epoch: 1,
        decisions: [],
        pendingClaims: [],
        pendingEvidence: [],
        activeWorkers: [],
        mode: 'EXECUTION',
      },
      null,
    );

    // 2. Tamper with checkpoint data
    const tampered: Checkpoint = {
      ...checkpoint,
      capsule: {
        ...checkpoint.capsule,
        planId: 'hacked-plan',
      },
    };

    // 3. Validation should fail
    const validation = validateCheckpointIntegrity(tampered);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('facade commits decisions and checkpoints include them', () => {
    const options: ExecutionFacadeOptions = {
      planId: 'decisions-plan',
      runId: 'decisions-run',
      baseDir: tmpDir,
    };
    const facade = createExecutionFacade(options);

    // Commit a decision
    facade.commitDecision('dec-1', JSON.stringify({ taskId: 'task-1', result: 'pass' }), 'Task completed');

    // Submit a command
    const cmd: ExecutionCommand = { command: 'true', args: [] };
    const receipt = facade.submitCommand(cmd, '', '', 0, 5);

    // Checkpoint should include committed decision
    expect(receipt.checkpoint.capsule.decisions).toHaveLength(1);
    expect(receipt.checkpoint.capsule.decisions[0]!.decisionId).toBe('dec-1');
  });

  it('wake policy evaluates for manual and failure reasons', () => {
    const options: ExecutionFacadeOptions = {
      planId: 'wake-plan',
      runId: 'wake-run',
      baseDir: tmpDir,
    };
    const facade = createExecutionFacade(options);

    // Evaluate wake for MANUAL_WAKE
    const manualWake = facade.evaluateWake('MANUAL_WAKE');
    expect(manualWake.shouldWake).toBe(true);
    expect(manualWake.reason).toBe('MANUAL_WAKE');
    expect(manualWake.confidence).toBe(1.0);

    // Evaluate wake for WORKER_FAILED
    const failedWake = facade.evaluateWake('WORKER_FAILED');
    expect(failedWake.shouldWake).toBe(true);
    expect(failedWake.reason).toBe('WORKER_FAILED');
    expect(failedWake.confidence).toBe(1.0);
  });

  it('event delta integrity verifiable after creation', () => {
    const event = createEventDelta({
      sequence: 1,
      eventType: 'DISPATCH',
      actor: 'test-actor',
      currentState: { taskId: 'task-1' },
      candidateEpoch: 1,
    });

    // Verify integrity
    expect(verifyEventDeltaIntegrity(event)).toBe(true);

    // Tamper and verify failure
    const tampered = { ...event, sequence: 999 };
    expect(verifyEventDeltaIntegrity(tampered as any)).toBe(false);
  });

  describe('identity binding on resume', () => {
    const FACADE_OPTIONS: ExecutionFacadeOptions = {
      planId: 'identity-plan',
      runId: 'identity-run',
      baseDir: tmpDir,
      candidateEpoch: 1700000000000,
    };

    function makeCheckpoint(overrides: Partial<{
      planId: string; runId: string; epoch: number;
      cursorPlanId: string; cursorRunId: string; cursorEpoch: number;
    }> = {}): Checkpoint {
      const planId = overrides.planId ?? overrides.cursorPlanId ?? FACADE_OPTIONS.planId;
      const runId = overrides.runId ?? overrides.cursorRunId ?? FACADE_OPTIONS.runId;
      const epoch = overrides.epoch ?? overrides.cursorEpoch ?? FACADE_OPTIONS.candidateEpoch!;
      const committedAt = new Date().toISOString();
      const decisionId = 'decision-1';
      const taskId = 'task-1';
      const decision = JSON.stringify({ taskId, result: 'pass' });
      const rationale = 'Task completed';
      const commitSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify({
        decisionId,
        decision,
        rationale,
        committedAt,
      })));
      return createCheckpoint(
        'crash_recovery',
        {
          planId,
          runId,
          epoch,
          taskId,
          attemptCount: 0,
          completedTaskIds: [taskId],
          failedTaskIds: [],
          skippedTaskIds: [],
        },
        {
          planId,
          runId,
          epoch,
          decisions: [{
            decisionId,
            decision,
            rationale,
            committedAt,
            commitSha256,
          }],
          pendingClaims: [],
          pendingEvidence: [],
          activeWorkers: [],
          mode: 'EXECUTION',
        },
        null,
      );
    }

    it('rejects checkpoint with foreign planId', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const foreignCp = makeCheckpoint({ planId: 'foreign-plan', cursorPlanId: 'foreign-plan' });
      const result = facade.validateResume(foreignCp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('identity mismatch') && e.includes('planId'))).toBe(true);
    });

    it('rejects checkpoint with foreign runId', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const foreignCp = makeCheckpoint({ runId: 'foreign-run', cursorRunId: 'foreign-run' });
      const result = facade.validateResume(foreignCp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('identity mismatch') && e.includes('runId'))).toBe(true);
    });

    it('rejects checkpoint with foreign epoch', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const foreignCp = makeCheckpoint({ epoch: 9999999999999, cursorEpoch: 9999999999999 });
      const result = facade.validateResume(foreignCp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('identity mismatch') && e.includes('epoch'))).toBe(true);
    });

    it('epoch mismatch causes validation failure (fail closed)', () => {
      const facade = createExecutionFacade({ ...FACADE_OPTIONS, candidateEpoch: 1000000000000 });
      // Create checkpoint with different epoch than facade
      const cp = createCheckpoint(
        'crash_recovery',
        { planId: FACADE_OPTIONS.planId, runId: FACADE_OPTIONS.runId, epoch: 9999999999999, taskId: 'task-1', attemptCount: 0, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] },
        { planId: FACADE_OPTIONS.planId, runId: FACADE_OPTIONS.runId, epoch: 9999999999999, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'EXECUTION' },
        null,
      );
      const result = facade.validateResume(cp);
      expect(result.valid).toBe(false);
      // Epoch mismatch must be an ERROR, not a warning
      expect(result.errors.some(e => e.includes('epoch'))).toBe(true);
      // Ensure it's in errors, not warnings
      expect(result.errors.every(e => !e.includes('(checkpoint may be stale)'))).toBe(true);
    });

    it('rejects checkpoint where cursor and capsule planIds differ', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const mismatchedCp = createCheckpoint(
        'crash_recovery',
        { planId: 'cursor-plan', runId: FACADE_OPTIONS.runId, epoch: FACADE_OPTIONS.candidateEpoch!, taskId: 'task-1', attemptCount: 0, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] },
        { planId: 'capsule-plan', runId: FACADE_OPTIONS.runId, epoch: FACADE_OPTIONS.candidateEpoch!, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'EXECUTION' },
        null,
      );
      const result = facade.validateResume(mismatchedCp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cursor.planId') && e.includes('capsule.planId'))).toBe(true);
    });

    it('accepts checkpoint with matching identity and computes wake decision', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const cp = makeCheckpoint();
      const result = facade.validateResume(cp);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.wakeDecision).toBeDefined();
      expect(result.wakeDecision.shouldWake).toBe(true);
    });
  });

  describe('restoreFromCheckpoint', () => {
    const FACADE_OPTIONS: ExecutionFacadeOptions = {
      planId: 'restore-plan',
      runId: 'restore-run',
      baseDir: tmpDir,
      candidateEpoch: 1700000000000,
    };

    it('restores facade state from valid checkpoint', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      // Submit a command first to populate state
      const cmd: ExecutionCommand = { command: 'echo', args: ['test'] };
      facade.submitCommand(cmd, 'output', '', 0, 10);
      const cp = facade.getLatestCheckpoint()!;
      const initialSeq = facade.getEventSequence();

      // Create fresh facade and restore
      const freshFacade = createExecutionFacade(FACADE_OPTIONS);
      expect(freshFacade.getEventSequence()).toBe(0);
      const result = freshFacade.restoreFromCheckpoint(cp);

      expect(result.valid).toBe(true);
      // eventSequence restored from cursor.attemptCount + 1
      expect(freshFacade.getEventSequence()).toBeGreaterThan(0);
      // restoreFromCheckpoint restores state but doesn't add to checkpoints array
      // The checkpoint is returned in the validation result
      expect(result.checkpoint.checkpointId).toBe(cp.checkpointId);
    });

    it('does NOT restore state on identity-mismatched checkpoint', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const cmd: ExecutionCommand = { command: 'echo', args: ['test'] };
      facade.submitCommand(cmd, 'output', '', 0, 10);
      const cp = facade.getLatestCheckpoint()!;

      // Try to restore into facade with different planId
      const foreignFacade = createExecutionFacade({ ...FACADE_OPTIONS, planId: 'wrong-plan' });
      const result = foreignFacade.restoreFromCheckpoint(cp);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // State should not be mutated
      expect(foreignFacade.getEventSequence()).toBe(0);
    });

    it('does NOT restore state on SHA-mismatched (tampered) checkpoint', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const cmd: ExecutionCommand = { command: 'echo', args: ['test'] };
      facade.submitCommand(cmd, 'output', '', 0, 10);
      const cp = { ...facade.getLatestCheckpoint()!, checkpointSha256: 'dead'.padEnd(64, '0') };

      const result = facade.restoreFromCheckpoint(cp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('checkpointSha256'))).toBe(true);
    });

    it('standalone restoreFromCheckpoint function delegates to facade method', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const cmd: ExecutionCommand = { command: 'true', args: [] };
      facade.submitCommand(cmd, '', '', 0, 5);
      const cp = facade.getLatestCheckpoint()!;

      const result = restoreFromCheckpoint(cp, FACADE_OPTIONS);
      expect(result.valid).toBe(true);
      expect(result.checkpoint.checkpointId).toBe(cp.checkpointId);
    });

    it('validateCheckpointForResumeViaFacade and restoreFromCheckpoint differ: restore mutates, validate does not', () => {
      const facade = createExecutionFacade(FACADE_OPTIONS);
      const cmd: ExecutionCommand = { command: 'echo', args: ['x'] };
      facade.submitCommand(cmd, 'x', '', 0, 7);
      const cp = facade.getLatestCheckpoint()!;

      const validateFacade = createExecutionFacade(FACADE_OPTIONS);
      const seqBeforeValidate = validateFacade.getEventSequence();
      validateCheckpointForResumeViaFacade(cp, FACADE_OPTIONS);
      // validateCheckpointForResumeViaFacade creates a fresh facade internally and does not mutate the caller's facade
      // (it uses its own internal facade)

      const restoreFacade = createExecutionFacade(FACADE_OPTIONS);
      restoreFacade.restoreFromCheckpoint(cp);
      // restoreFromCheckpoint on the caller's facade DOES mutate it
      expect(restoreFacade.getEventSequence()).not.toBe(seqBeforeValidate);
    });
  });
});
