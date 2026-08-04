/**
 * execution-adapter.test.ts — Focused tests for CLI integration with AM-0021 runtime wiring.
 *
 * Tests: adapter wiring to execution-facade, event emission, checkpoint creation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createExecutionAdapter,
  LocalWorkerWithFacade,
  type ExecutionAdapterOptions,
} from '../src/adapters/execution-adapter.js';

describe('AM-0021 execution-adapter CLI wiring', () => {
  let tmpDir: string;
  let adapter: LocalWorkerWithFacade;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-test-'));
  });

  afterEach(async () => {
    // Cancel any active tasks
    if (adapter) {
      for (const taskId of adapter['activeProcesses'].keys()) {
        await adapter.cancelTask(taskId);
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Adapter Initialization', () => {
    it('creates adapter with execution facade', () => {
      const options: ExecutionAdapterOptions = {
        planId: 'adapter-init-test',
        runId: 'run-001',
        baseDir: tmpDir,
        timeoutMs: 30_000,
      };

      adapter = createExecutionAdapter(options);
      expect(adapter).toBeDefined();
      expect(adapter.getFacade()).toBeDefined();
    });

    it('facade initialized with correct options', () => {
      const options: ExecutionAdapterOptions = {
        planId: 'facade-options-test',
        runId: 'run-002',
        baseDir: tmpDir,
        candidateEpoch: 1700000000000,
      };

      adapter = createExecutionAdapter(options);
      const facade = adapter.getFacade();

      // Access internal state via getEventLog
      expect(facade.getEventLog()).toBeDefined();
    });
  });

  describe('submitTask Integration', () => {
    it('submitTask executes through facade and produces execution receipt', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'submit-task-test',
        runId: 'run-003',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);

      // Create a test file for the worker to read
      fs.writeFileSync(path.join(tmpDir, 'test-file.txt'), 'test content\n');

      const result = await adapter.submitTask({
        taskId: 'task-001',
        reqIds: ['R-001'],
        objective: 'Process test file',
        ownedPaths: ['test-file.txt'],
        verificationCommands: ['node -e "require(\'fs\').readFileSync(\'test-file.txt\',\'utf8\')"'],
        model: 'test-model',
        effort: 'small',
      });

      expect(result.taskId).toBe('task-001');
      expect(result.executionReceipt).toBeDefined();
      expect(result.executionReceipt.executionId).toBeDefined();
      expect(result.executionReceipt.event).toBeDefined();
      expect(result.executionReceipt.artifact).toBeDefined();
      expect(result.executionReceipt.checkpoint).toBeDefined();
    });

    it('execution receipt has valid event integrity', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'event-integrity-test',
        runId: 'run-004',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);
      fs.writeFileSync(path.join(tmpDir, 'integrity.txt'), 'integrity test\n');

      const result = await adapter.submitTask({
        taskId: 'task-002',
        reqIds: ['R-002'],
        objective: 'Integrity check',
        ownedPaths: ['integrity.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      const { executionReceipt } = result;
      expect(executionReceipt.event.eventSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(executionReceipt.event.actor).toBe('execution-facade');
    });

    it('execution receipt creates broker artifact', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'broker-artifact-test',
        runId: 'run-005',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);
      fs.writeFileSync(path.join(tmpDir, 'artifact.txt'), 'artifact content\n');

      const result = await adapter.submitTask({
        taskId: 'task-003',
        reqIds: ['R-003'],
        objective: 'Artifact creation',
        ownedPaths: ['artifact.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      const { executionReceipt } = result;
      expect(executionReceipt.artifact.artifactId).toBeDefined();
      expect(executionReceipt.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(executionReceipt.artifact.uri).toMatch(/^tool:\/\//);

      // Artifact file exists
      const artifactPath = path.join(
        tmpDir,
        '.agent',
        'artifacts',
        executionReceipt.artifact.artifactId.slice(0, 2),
        `${executionReceipt.artifact.artifactId}.content`
      );
      expect(fs.existsSync(artifactPath)).toBe(true);
    });

    it('checkpoint captures task execution state', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'checkpoint-capture-test',
        runId: 'run-006',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);
      fs.writeFileSync(path.join(tmpDir, 'checkpoint.txt'), 'checkpoint test\n');

      const result = await adapter.submitTask({
        taskId: 'task-004',
        reqIds: ['R-004'],
        objective: 'Checkpoint capture',
        ownedPaths: ['checkpoint.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      const { executionReceipt } = result;
      expect(executionReceipt.checkpoint.checkpointId).toBeDefined();
      expect(executionReceipt.checkpoint.checkpointSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(executionReceipt.checkpoint.capsule.planId).toBe('checkpoint-capture-test');
      expect(executionReceipt.checkpoint.capsule.runId).toBe('run-006');
    });

    it('facade event log accumulates task events', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'event-log-accum-test',
        runId: 'run-007',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);
      fs.writeFileSync(path.join(tmpDir, 'event1.txt'), 'event 1\n');
      fs.writeFileSync(path.join(tmpDir, 'event2.txt'), 'event 2\n');

      await adapter.submitTask({
        taskId: 'task-005',
        reqIds: ['R-005'],
        objective: 'First task',
        ownedPaths: ['event1.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      await adapter.submitTask({
        taskId: 'task-006',
        reqIds: ['R-006'],
        objective: 'Second task',
        ownedPaths: ['event2.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      const facade = adapter.getFacade();
      const eventLog = facade.getEventLog();
      expect(eventLog.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('cancelTask', () => {
    it('cancelTask terminates active process', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'cancel-test',
        runId: 'run-008',
        baseDir: tmpDir,
        timeoutMs: 60_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);

      // Create a task that will hang (runs indefinite loop)
      fs.writeFileSync(path.join(tmpDir, 'hang.txt'), 'hang task\n');
      fs.writeFileSync(path.join(tmpDir, 'hang.js'), 'while(1);\n');

      const taskPromise = adapter.submitTask({
        taskId: 'task-cancel',
        reqIds: ['R-CANCEL'],
        objective: 'Long running task',
        ownedPaths: ['hang.txt'],
        verificationCommands: ['node hang.js'],
        model: 'test',
        effort: 'medium',
      });

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cancel
      await adapter.cancelTask('task-cancel');

      // Task should be cancelled
      await expect(taskPromise).rejects.toThrow();
    });
  });

  describe('validateResume', () => {
    it('validateResume returns null for non-existent checkpoint', () => {
      const options: ExecutionAdapterOptions = {
        planId: 'validate-resume-test',
        runId: 'run-009',
        baseDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);

      const result = adapter.validateResume('/non/existent/path.json');
      expect(result).toBeNull();
    });

    it('validateResume parses valid checkpoint file', async () => {
      const options: ExecutionAdapterOptions = {
        planId: 'valid-checkpoint-test',
        runId: 'run-010',
        baseDir: tmpDir,
        timeoutMs: 30_000,
        workDir: tmpDir,
      };

      adapter = createExecutionAdapter(options);
      fs.writeFileSync(path.join(tmpDir, 'valid.txt'), 'valid checkpoint\n');

      const result = await adapter.submitTask({
        taskId: 'task-010',
        reqIds: ['R-010'],
        objective: 'Create checkpoint',
        ownedPaths: ['valid.txt'],
        verificationCommands: [],
        model: 'test',
        effort: 'small',
      });

      // Write checkpoint to file
      const checkpointPath = path.join(tmpDir, 'checkpoint.json');
      fs.writeFileSync(checkpointPath, JSON.stringify(result.executionReceipt.checkpoint));

      // Validate
      const validation = adapter.validateResume(checkpointPath);
      expect(validation).not.toBeNull();
      expect(validation!.valid).toBe(true);
    });
  });
});
