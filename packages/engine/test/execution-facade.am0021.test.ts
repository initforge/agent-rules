/**
 * execution-facade.am0021.test.ts — Focused tests for AM-0021 runtime wiring.
 *
 * Tests: event integrity, broker artifact, capsule/checkpoint/wake, idempotency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createExecutionFacade,
  runAndCheckpoint,
  validateCheckpointForResume,
  type ExecutionCommand,
  type ExecutionFacadeOptions,
} from '../src/execution-facade.js';
import { createCheckpoint, buildResumeContext, isCheckpointCompatible } from '../src/checkpoint-resume.js';
import { createEventDelta, verifyEventDeltaIntegrity } from '../src/event-delta.js';
import { sha256Bytes } from '../src/contracts.js';

describe('AM-0021 execution-facade wiring', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am0021-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Event Integrity ─────────────────────────────────────────────────────────

  describe('Event Integrity', () => {
    it('submitCommand produces verifiable event delta with SHA-256 integrity', () => {
      const facade = createExecutionFacade({
        planId: 'event-integrity-test',
        runId: 'run-001',
        baseDir: tmpDir,
        candidateEpoch: 1700000000000,
      });

      const cmd: ExecutionCommand = { command: 'echo', args: ['test'] };
      const receipt = facade.submitCommand(cmd, 'test output\n', '', 0, 10);

      // Event has SHA-256 hash
      expect(receipt.event.eventSha256).toMatch(/^[a-f0-9]{64}$/);

      // Event can be verified
      expect(verifyEventDeltaIntegrity(receipt.event)).toBe(true);

      // Event is immutable
      expect(() => {
        (receipt.event as { sequence: number }).sequence = 999;
      }).toThrow();
    });

    it('tampered event fails integrity verification', () => {
      const facade = createExecutionFacade({
        planId: 'tamper-test',
        runId: 'run-002',
        baseDir: tmpDir,
      });

      const cmd: ExecutionCommand = { command: 'false', args: [] };
      const receipt = facade.submitCommand(cmd, '', 'error', 1, 5);

      // Tamper with event
      const tamperedEvent = { ...receipt.event, eventSha256: 'tampered' as any };

      // Verification fails
      expect(verifyEventDeltaIntegrity(tamperedEvent)).toBe(false);
    });

    it('event sequence increments deterministically', () => {
      const facade = createExecutionFacade({
        planId: 'sequence-test',
        runId: 'run-003',
        baseDir: tmpDir,
      });

      const cmd1: ExecutionCommand = { command: 'echo', args: ['1'] };
      const cmd2: ExecutionCommand = { command: 'echo', args: ['2'] };

      const r1 = facade.submitCommand(cmd1, 'out1', '', 0, 1);
      // Each submitCommand creates 2 events: WORKER_COMPLETE + CHECKPOINT
      // So cmd2's event is at sequence 2 (not 1)
      const r2 = facade.submitCommand(cmd2, 'out2', '', 0, 1);

      expect(r2.event.sequence).toBe(r1.event.sequence + 2);
    });
  });

  // ── Broker Artifact ─────────────────────────────────────────────────────────

  describe('Broker Artifact', () => {
    it('submitCommand creates content-addressed artifact with SHA-256', () => {
      const facade = createExecutionFacade({
        planId: 'broker-test',
        runId: 'run-004',
        baseDir: tmpDir,
      });

      const cmd: ExecutionCommand = { command: 'cat', args: ['file.txt'] };
      const stdout = 'file contents\n';
      const receipt = facade.submitCommand(cmd, stdout, '', 0, 20);

      // Artifact has SHA-256 hash
      expect(receipt.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);

      // Artifact URI follows tool:// scheme
      expect(receipt.artifact.uri).toMatch(/^tool:\/\//);

      // Artifact file exists in content-addressed storage
      const artifactBase = path.join(tmpDir, '.agent', 'artifacts');
      const artifactFile = path.join(
        artifactBase,
        receipt.artifact.artifactId.slice(0, 2),
        `${receipt.artifact.artifactId}.content`
      );
      expect(fs.existsSync(artifactFile)).toBe(true);
      expect(fs.readFileSync(artifactFile, 'utf-8')).toBe(stdout);
    });

    it('multiple commands create unique artifacts', () => {
      const facade = createExecutionFacade({
        planId: 'unique-artifact-test',
        runId: 'run-005',
        baseDir: tmpDir,
      });

      const r1 = facade.submitCommand({ command: 'echo', args: ['a'] }, 'content-a', '', 0, 1);
      const r2 = facade.submitCommand({ command: 'echo', args: ['b'] }, 'content-b', '', 0, 1);

      expect(r1.artifact.artifactId).not.toBe(r2.artifact.artifactId);
      expect(r1.artifact.sha256).not.toBe(r2.artifact.sha256);
    });
  });

  // ── Capsule/Checkpoint/Wake ──────────────────────────────────────────────────

  describe('Capsule/Checkpoint/Wake', () => {
    it('checkpoint captures complete capsule state', () => {
      const facade = createExecutionFacade({
        planId: 'capsule-test',
        runId: 'run-006',
        baseDir: tmpDir,
      });

      // Commit a decision
      facade.commitDecision('dec-1', JSON.stringify({ taskId: 'task-1' }), 'Test decision');

      const cmd: ExecutionCommand = { command: 'true', args: [] };
      const receipt = facade.submitCommand(cmd, '', '', 0, 5);

      // Checkpoint contains capsule with decisions
      expect(receipt.checkpoint.capsule.planId).toBe('capsule-test');
      expect(receipt.checkpoint.capsule.runId).toBe('run-006');
      expect(receipt.checkpoint.capsule.decisions).toHaveLength(1);
      expect(receipt.checkpoint.capsule.decisions[0]!.decisionId).toBe('dec-1');

      // Checkpoint has integrity hash
      expect(receipt.checkpoint.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('wake decision computed from checkpoint state', () => {
      const facade = createExecutionFacade({
        planId: 'wake-test',
        runId: 'run-007',
        baseDir: tmpDir,
      });

      // Evaluate wake for success
      const successWake = facade.evaluateWake('WORKER_COMPLETE');
      expect(successWake.shouldWake).toBe(true);
      expect(successWake.reason).toBe('WORKER_COMPLETE');

      // Evaluate wake for failure
      const failWake = facade.evaluateWake('WORKER_FAILED');
      expect(failWake.shouldWake).toBe(true);
      expect(failWake.reason).toBe('WORKER_FAILED');
    });

    it('validateResume checks checkpoint integrity', () => {
      const options: ExecutionFacadeOptions = {
        planId: 'resume-test',
        runId: 'run-008',
        baseDir: tmpDir,
        candidateEpoch: 1,
      };

      const facade = createExecutionFacade(options);

      // Create valid checkpoint with properly hashed decision and matching identity
      const committedAt = new Date().toISOString();
      const decisionId = 'decision-resume';
      const taskId = 'task-1';
      const decision = JSON.stringify({ taskId });
      const rationale = 'Resume test';
      const commitSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify({
        decisionId,
        decision,
        rationale,
        committedAt,
      })));

      const checkpoint = createCheckpoint(
        'manual',
        { planId: 'resume-test', runId: 'run-008', epoch: 1, taskId, attemptCount: 1, completedTaskIds: [taskId], failedTaskIds: [], skippedTaskIds: [] },
        { planId: 'resume-test', runId: 'run-008', epoch: 1, decisions: [{ decisionId, decision, rationale, committedAt, commitSha256 }], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'EXECUTION' },
        null,
      );

      const validation = facade.validateResume(checkpoint);
      expect(validation.valid).toBe(true);
      expect(validation.wakeDecision).toBeDefined();
    });

    it('tampered checkpoint fails validation', () => {
      const options: ExecutionFacadeOptions = {
        planId: 'tamper-resume-test',
        runId: 'run-009',
        baseDir: tmpDir,
      };

      const checkpoint = createCheckpoint(
        'manual',
        { taskId: 'task-1', attemptCount: 0, completedTaskIds: [], failedTaskIds: [], skippedTaskIds: [] },
        { planId: 'original-plan', runId: 'original-run', epoch: 1, decisions: [], pendingClaims: [], pendingEvidence: [], activeWorkers: [], mode: 'EXECUTION' },
        null,
      );

      // Tamper with capsule
      const tampered = {
        ...checkpoint,
        capsule: { ...checkpoint.capsule, planId: 'hacked-plan' },
      };

      const validation = validateCheckpointForResume(tampered, options);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  describe('Idempotency', () => {
    it('duplicate commands produce same idempotency key but increment sequence', () => {
      const facade = createExecutionFacade({
        planId: 'idempotency-test',
        runId: 'run-010',
        baseDir: tmpDir,
      });

      const cmd: ExecutionCommand = { command: 'echo', args: ['idempotent'] };

      const r1 = facade.submitCommand(cmd, 'out1', '', 0, 1);
      const r2 = facade.submitCommand(cmd, 'out2', '', 0, 1);

      // Same command, sequence increments by 2 (command + checkpoint event each)
      expect(r2.event.sequence).toBe(r1.event.sequence + 2);

      // Same idempotency key in currentState
      expect(r1.event.currentState.idempotencyKey).toBe(r2.event.currentState.idempotencyKey);

      // Both processed (2 command events, 2 checkpoint events = 4 total events)
      // But getProcessedEventCount tracks only the events added to eventLog
      expect(facade.getProcessedEventCount()).toBeGreaterThanOrEqual(2);
    });

    it('hasProcessedEvent returns true for processed events', () => {
      const facade = createExecutionFacade({
        planId: 'processed-test',
        runId: 'run-011',
        baseDir: tmpDir,
      });

      const cmd: ExecutionCommand = { command: 'echo', args: ['check'] };
      const receipt = facade.submitCommand(cmd, 'output', '', 0, 1);

      expect(facade.hasProcessedEvent(receipt.event.eventSha256)).toBe(true);
    });

    it('getEventLog returns all emitted events', () => {
      const facade = createExecutionFacade({
        planId: 'event-log-test',
        runId: 'run-012',
        baseDir: tmpDir,
      });

      const cmd1: ExecutionCommand = { command: 'echo', args: ['1'] };
      const cmd2: ExecutionCommand = { command: 'echo', args: ['2'] };

      facade.submitCommand(cmd1, 'out1', '', 0, 1);
      facade.submitCommand(cmd2, 'out2', '', 0, 1);

      const log = facade.getEventLog();
      expect(log).toHaveLength(2);
      expect(log[0]!.eventType).toBe('WORKER_COMPLETE');
      expect(log[1]!.eventType).toBe('WORKER_COMPLETE');
    });

    it('getArtifactPointers returns all created artifacts', () => {
      const facade = createExecutionFacade({
        planId: 'artifact-log-test',
        runId: 'run-013',
        baseDir: tmpDir,
      });

      const cmd1: ExecutionCommand = { command: 'echo', args: ['a'] };
      const cmd2: ExecutionCommand = { command: 'echo', args: ['b'] };

      const r1 = facade.submitCommand(cmd1, 'content-a', '', 0, 1);
      const r2 = facade.submitCommand(cmd2, 'content-b', '', 0, 1);

      const pointers = facade.getArtifactPointers();
      expect(pointers).toHaveLength(2);
      expect(pointers[0]!.artifactId).toBe(r1.artifact.artifactId);
      expect(pointers[1]!.artifactId).toBe(r2.artifact.artifactId);
    });
  });

  // ── runAndCheckpoint helper ────────────────────────────────────────────────

  describe('runAndCheckpoint', () => {
    it('single-shot execute + broker + checkpoint produces complete receipt', () => {
      const options: ExecutionFacadeOptions = {
        planId: 'single-shot-test',
        runId: 'run-014',
        baseDir: tmpDir,
      };

      const cmd: ExecutionCommand = { command: 'ls', args: ['-la'] };
      const receipt = runAndCheckpoint(cmd, 'total 0\n', '', 0, 15, options);

      expect(receipt.executionId).toBeDefined();
      expect(receipt.event).toBeDefined();
      expect(receipt.artifact).toBeDefined();
      expect(receipt.toolOutput).toBeDefined();
      expect(receipt.checkpoint).toBeDefined();
      expect(receipt.createdAt).toBeDefined();
    });

    it('handles failure exit code with WORKER_FAIL event', () => {
      const options: ExecutionFacadeOptions = {
        planId: 'failure-test',
        runId: 'run-015',
        baseDir: tmpDir,
      };

      const cmd: ExecutionCommand = { command: 'false', args: [] };
      const receipt = runAndCheckpoint(cmd, '', 'Command failed', 1, 5, options);

      expect(receipt.event.eventType).toBe('WORKER_FAIL');
      expect(receipt.event.severity).toBe('WARNING');
      expect(receipt.event.wakeReason).toBe('WORKER_FAILED');
    });
  });
});
