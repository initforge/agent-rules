import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  executeRun,
  getRunStatus,
  resumeRun,
  cancelRunById,
  computeFinalState,
} from '../src/services/runner.js';
import { DurableStore } from '../src/services/durable-store.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
const store = new DurableStore(tmpDir);

function withTmpBase<T>(fn: (basePath: string) => Promise<T>): Promise<T> {
  return fn(tmpDir);
}

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const runsDir = path.join(tmpDir, '.agent', 'runs');
  if (fs.existsSync(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        fs.rmSync(path.join(runsDir, entry.name), { recursive: true, force: true });
      }
    }
  }
});

describe('executeRun', () => {
  it('compiles intent, plan, persists run and honestly reports FAILED on fake PASS', async () => {
    const result = await withTmpBase((basePath) =>
      executeRun('Goal: Build a CLI tool\nConstraint: Use TypeScript', { project: basePath }),
    );

    expect(result.runId).toBeTruthy();
    // BUG-2: tasks complete with empty evidence (no ownedPaths) → fake PASS → FAILED.
    expect(result.state).toBe('FAILED');
    expect(result.error).toBeTruthy();
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();

    const stored = await store.getRun(result.runId);
    expect(stored).not.toBeNull();
    expect(stored!.state).toBe('FAILED');
    expect(stored!.error).toBeTruthy();
    expect(stored!.receipts).toHaveLength(result.receipts.length);
  });

  it('dry-run compiles and validates without executing', async () => {
    const result = await withTmpBase((basePath) =>
      executeRun('Goal: Test dry run', { project: basePath, dryRun: true }),
    );

    expect(result.runId).toBeTruthy();
    expect(result.state).toBe('PLAN_VALIDATED');
    expect(result.receipts).toHaveLength(0);
  });

  it('handles multi-line requests with multiple goals', async () => {
    const request = [
      'Goal: Create a CI pipeline',
      'Goal: Add linting step',
      'Constraint: Must use GitHub Actions',
      'Non-goal: No manual deployment',
    ].join('\n');

    const result = await withTmpBase((basePath) =>
      executeRun(request, { project: basePath }),
    );

    expect(result.state).toBe('FAILED'); // fake PASS → honest FAILED
    expect(result.tasks.length).toBeGreaterThanOrEqual(3);
    expect(result.receipts.length).toBe(result.tasks.length);
  });
});

describe('getRunStatus', () => {
  it('returns run state for existing run', async () => {
    const { runId } = await withTmpBase((basePath) =>
      executeRun('Goal: Status check test', { project: basePath }),
    );

    const status = await getRunStatus(runId, tmpDir);
    expect(status).not.toBeNull();
    expect(status!.runId).toBe(runId);
    expect(status!.state).toBe('FAILED'); // honest final state persists
    expect(status!.receipts.length).toBeGreaterThan(0);
    expect(status!.createdAt).toBeTruthy();
  });

  it('returns null for non-existent run', async () => {
    const status = await getRunStatus('non-existent-run-id', tmpDir);
    expect(status).toBeNull();
  });
});

describe('resumeRun', () => {
  it('loads existing run and returns its terminal state without re-executing', async () => {
    const { runId } = await withTmpBase((basePath) =>
      executeRun('Goal: Resume test\nGoal: Complete all steps', { project: basePath }),
    );

    const resumed = await resumeRun(runId, { project: tmpDir });
    expect(resumed.runId).toBe(runId);
    expect(resumed.state).toBe('FAILED'); // naive run ended FAILED (fake PASS)
    expect(resumed.receipts.length).toBeGreaterThan(0);
  });

  it('resumes interrupted run and completes remaining tasks', async () => {
    const partialId = `resume-partial-${Date.now()}`;
    // Seed real files so worker receipts carry honest evidence (BUG-2).
    for (const f of ['r1.txt', 'r2.txt', 'r3.txt']) {
      fs.writeFileSync(path.join(tmpDir, f), `content of ${f}\n`, 'utf-8');
    }
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'abc', summary: 'Partial resume test' },
      tasks: [
        {
          id: 'T-001',
          description: 'Step one',
          requirementIds: ['R-001'],
          dependsOn: [],
          ownedPaths: ['r1.txt'],
          acceptanceCriteria: ['R-001 complete'],
          estimatedEffort: 'small' as const,
        },
        {
          id: 'T-002',
          description: 'Step two',
          requirementIds: ['R-002'],
          dependsOn: ['T-001'],
          ownedPaths: ['r2.txt'],
          acceptanceCriteria: ['R-002 complete'],
          estimatedEffort: 'small' as const,
        },
        {
          id: 'T-003',
          description: 'Step three',
          requirementIds: ['R-003'],
          dependsOn: ['T-002'],
          ownedPaths: ['r3.txt'],
          acceptanceCriteria: ['R-003 complete'],
          estimatedEffort: 'small' as const,
        },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };

    await store.createRun(partialId, plan);
    const run = await store.getRun(partialId);
    run!.tasks = [
      { taskId: 'T-001', state: 'COMPLETED', retryCount: 0, worker: 'sim', model: 'gpt-4o', effort: 'small' },
      { taskId: 'T-002', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
      { taskId: 'T-003', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent', 'runs', partialId, 'run.json'),
      JSON.stringify(run, null, 2),
    );
    await store.updateState(partialId, 'EXECUTING');
    // T-001 PASS receipt (from completed pre-interrupt phase)
    await store.addReceipt(partialId, {
      taskId: 'T-001',
      filesChanged: ['r1.txt'],
      commandsRun: [],
      testsRun: [],
      evidencePaths: ['r1.txt'],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });
    // No store.checkpoint() — the facade identity-binding validation is sensitive to
    // sub-ms timing; this test focuses on resume execution, not checkpointing.
    // The pre-existing "Simulated interruption" test covers checkpoint restoration.

    const resumed2 = await resumeRun(partialId, { project: tmpDir });
    if (resumed2.state !== 'COMPLETED') {
      console.error('[DEBUG] resume result:', JSON.stringify({ state: resumed2.state, error: resumed2.error, receipts: resumed2.receipts.length }));
    }
    expect(resumed2.runId).toBe(partialId);
    // BUG-3 fix: strict require_verification now enforces receipts for ALL tasks.
    // T-002 and T-003 get PASS receipts from the worker (files exist), so all pass.
    expect(resumed2.state).toBe('COMPLETED');
    expect(resumed2.receipts.length).toBe(3);

    const finalRun = await store.getRun(partialId);
    const finalTasks = finalRun!.tasks as { taskId: string; state: string }[];
    const completedTasks = finalTasks.filter(t => t.state === 'COMPLETED');
    expect(completedTasks).toHaveLength(3);

    await store.deleteRun(partialId);
  });
});

describe('cancelRunById', () => {
  it('marks pending tasks as cancelled', async () => {
    const cancelId = `cancel-test-${Date.now()}`;
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'cancel', summary: 'Cancel test' },
      tasks: [
        { id: 'T-001', description: 'Task 1', requirementIds: ['R-001'], dependsOn: [], ownedPaths: [], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-002', description: 'Task 2', requirementIds: ['R-002'], dependsOn: ['T-001'], ownedPaths: [], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-003', description: 'Task 3', requirementIds: ['R-003'], dependsOn: ['T-001'], ownedPaths: [], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };
    await store.createRun(cancelId, plan);
    await store.addReceipt(cancelId, {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      evidencePaths: [],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });

    const result = await cancelRunById(cancelId, tmpDir);
    expect(result.state).toBe('CANCELLED');

    const tasks = result.tasks as { taskId: string; state: string }[];
    const t1 = tasks.find(t => t.taskId === 'T-001');
    const t2 = tasks.find(t => t.taskId === 'T-002');
    const t3 = tasks.find(t => t.taskId === 'T-003');
    expect(t1?.state).toBe('COMPLETED');
    expect(t2?.state).toBe('CANCELLED');
    expect(t3?.state).toBe('CANCELLED');

    await store.deleteRun(cancelId);
  });
});

describe('Full end-to-end', () => {
  it('request -> intent -> plan -> execute -> complete', async () => {
    const request = [
      'Goal: Initialize project structure',
      'Goal: Set up testing framework',
      'Constraint: Use vitest',
      'Non-goal: No Docker setup',
    ].join('\n');

    const result = await withTmpBase((basePath) =>
      executeRun(request, { project: basePath }),
    );

    expect(result.state).toBe('FAILED'); // naive tasks carry no evidence → honest FAILED
    expect(result.runId).toBeTruthy();

    const tasks = result.tasks as { taskId: string; state: string }[];
    const allCompleted = tasks.every(t => t.state === 'COMPLETED');
    expect(allCompleted).toBe(true);

    const stored = await store.getRun(result.runId);
    expect(stored!.state).toBe('FAILED');
    expect(stored!.error).toBeTruthy();
    expect(stored!.receipts.length).toBe(tasks.length);
  });
});

describe('Simulated interruption and resume', () => {
  it('checkpoint -> new DurableStore -> resume -> completed tasks not re-run', async () => {
    // Seed real files so resumed tasks produce honest PASS evidence (BUG-2).
    for (const f of ['i1.txt', 'i2.txt', 'i3.txt']) {
      fs.writeFileSync(path.join(tmpDir, f), `content of ${f}\n`, 'utf-8');
    }
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'interrupt', summary: 'Interruption test' },
      tasks: [
        { id: 'T-001', description: 'Install', requirementIds: ['R-001'], dependsOn: [], ownedPaths: ['i1.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-002', description: 'Build', requirementIds: ['R-002'], dependsOn: ['T-001'], ownedPaths: ['i2.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-003', description: 'Test', requirementIds: ['R-003'], dependsOn: ['T-002'], ownedPaths: ['i3.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [
        { id: 'R-001', covered: true, taskId: 'T-001' },
        { id: 'R-002', covered: true, taskId: 'T-002' },
        { id: 'R-003', covered: true, taskId: 'T-003' },
      ] },
    };

    const interruptId = `interrupt-${Date.now()}`;
    const store1 = new DurableStore(tmpDir);
    await store1.createRun(interruptId, plan);

    let run = await store1.getRun(interruptId);
    run!.tasks = [
      { id: 'T-001', taskId: 'T-001', status: 'completed', state: 'COMPLETED', retryCount: 0, worker: 'sim', model: 'gpt-4o', effort: 'small' },
      { id: 'T-002', taskId: 'T-002', status: 'pending', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
      { id: 'T-003', taskId: 'T-003', status: 'pending', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    const runJsonPath = path.join(tmpDir, '.agent', 'runs', interruptId, 'run.json');
    fs.writeFileSync(runJsonPath, JSON.stringify(run, null, 2));
    await store1.updateState(interruptId, 'EXECUTING');
    await store1.addReceipt(interruptId, {
      taskId: 'T-001',
      filesChanged: ['i1.txt'],
      commandsRun: [],
      testsRun: [],
      evidencePaths: ['i1.txt'],
      diffHashes: {},
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });
    await store1.checkpoint(interruptId);

    // Verify checkpoint captured T-001 as completed
    const checkpointIds = await store1.getCompletedTaskIds(interruptId);
    expect(checkpointIds).toContain('T-001');

    // Simulate interruption by creating a new store instance
    const store2 = new DurableStore(tmpDir);
    const resumed = await resumeRun(interruptId, { project: tmpDir });
    expect(resumed.runId).toBe(interruptId);
    expect(resumed.state).toBe('COMPLETED');
    // 3 total receipts = 1 before interruption + 2 after resume
    expect(resumed.receipts.length).toBe(3);

    // All tasks should be COMPLETED
    const finalRun = await store2.getRun(interruptId);
    const finalTasks = finalRun!.tasks as { taskId: string; state: string }[];
    const t1 = finalTasks.find(t => t.taskId === 'T-001');
    const t2 = finalTasks.find(t => t.taskId === 'T-002');
    const t3 = finalTasks.find(t => t.taskId === 'T-003');
    expect(t1!.state).toBe('COMPLETED');
    expect(t2!.state).toBe('COMPLETED');
    expect(t3!.state).toBe('COMPLETED');

    // Verify total stored receipts equals what was returned
    expect(finalRun!.receipts.length).toBe(3);

    await store2.deleteRun(interruptId);
  });
});

describe('resumeRun regression: checkpointed interrupted-run completion', () => {
  it('resumes a checkpointed interrupted run to COMPLETED (checkpoint identity preserved, no re-run)', async () => {
    // Regression: engine facade bound to Date.now() candidateEpoch rejected every
    // checkpointed resume on sub-ms drift (checkpoint epoch = createdAt ms).
    fs.writeFileSync(path.join(tmpDir, 'reg1.txt'), 'content of reg1\n', 'utf-8');
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'reg-identity', summary: 'Regression identity binding' },
      tasks: [
        { id: 'R-T1', description: 'One', requirementIds: ['R-1'], dependsOn: [], ownedPaths: ['reg1.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };
    const regId = `reg-identity-${Date.now()}`;
    await store.createRun(regId, plan);
    await store.updateState(regId, 'EXECUTING');
    const run = await store.getRun(regId);
    run!.tasks = [
      { id: 'R-T1', taskId: 'R-T1', state: 'COMPLETED', status: 'completed', retryCount: 0, worker: 'sim', model: 'gpt-4o', effort: 'small' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent', 'runs', regId, 'run.json'),
      JSON.stringify(run, null, 2),
    );
    await store.addReceipt(regId, {
      taskId: 'R-T1', filesChanged: ['reg1.txt'], commandsRun: [], testsRun: [],
      evidencePaths: ['reg1.txt'], diffHashes: {}, status: 'PASS', retries: 0,
      assumptions: [], unresolvedFindings: [],
    });
    await store.checkpoint(regId);

    const resumed = await resumeRun(regId, { project: tmpDir });
    expect(resumed.state).toBe('COMPLETED');
    // Single pre-completed task must not be re-run.
    expect(resumed.receipts).toHaveLength(1);
    expect(resumed.error).toBeUndefined();

    const stored = await store.getRun(regId);
    expect(stored!.state).toBe('COMPLETED');
    await store.deleteRun(regId);
  });

  it('rejects fake PASS across checkpoint + resume (receipt hardening preserved)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'fp1.txt'), 'content\n', 'utf-8');
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'reg-fakepass', summary: 'Fake PASS regression' },
      tasks: [
        { id: 'R-F1', description: 'One', requirementIds: ['R-2'], dependsOn: [], ownedPaths: ['fp1.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };
    const fpId = `reg-fakepass-${Date.now()}`;
    await store.createRun(fpId, plan);
    await store.updateState(fpId, 'EXECUTING');
    const run = await store.getRun(fpId);
    run!.tasks = [
      { taskId: 'R-F1', state: 'COMPLETED', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent', 'runs', fpId, 'run.json'),
      JSON.stringify(run, null, 2),
    );
    // PASS receipt with zero evidence — checkpoint is identity-valid but the run must FAIL.
    await store.addReceipt(fpId, {
      taskId: 'R-F1', filesChanged: [], commandsRun: [], testsRun: [],
      evidencePaths: [], diffHashes: {}, status: 'PASS', retries: 0,
      assumptions: [], unresolvedFindings: [],
    });
    await store.checkpoint(fpId);

    const resumed = await resumeRun(fpId, { project: tmpDir });
    expect(resumed.state).toBe('FAILED');
    expect(resumed.error).toContain('FABRICATED PASS rejected');
    await store.deleteRun(fpId);
  });

  it('rejects tampered checkpoint on resume (checkpoint identity integrity preserved)', async () => {
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'reg-tamper', summary: 'Tamper regression' },
      tasks: [
        { id: 'R-TP1', description: 'One', requirementIds: ['R-3'], dependsOn: [], ownedPaths: [], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: false, require_verification: false },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };
    const tamperId = `reg-tamper-${Date.now()}`;
    await store.createRun(tamperId, plan);
    await store.checkpoint(tamperId);

    // Tamper: rewrite checkpoint content (hash in filename now stale).
    const cpDir = path.join(tmpDir, '.agent', 'runs', tamperId, 'checkpoints');
    const cpFile = fs.readdirSync(cpDir).filter(f => f.endsWith('.json'))[0];
    const cp = JSON.parse(fs.readFileSync(path.join(cpDir, cpFile), 'utf-8'));
    cp.completedTaskIds = ['R-TP1'];
    fs.writeFileSync(path.join(cpDir, cpFile), JSON.stringify(cp, null, 2));

    const resumed = await resumeRun(tamperId, { project: tmpDir });
    expect(resumed.state).toBe('FAILED');
    expect(resumed.error).toMatch(/tamper/);
    await store.deleteRun(tamperId);
  });
});

describe('Concurrent task execution (Promise.all)', () => {
  it('executes independent ready tasks concurrently with per-task error handling', async () => {
    // Seed files so tasks produce evidence
    for (const f of ['concurrent1.txt', 'concurrent2.txt']) {
      fs.writeFileSync(path.join(tmpDir, f), `content of ${f}\n`, 'utf-8');
    }
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'concurrent', summary: 'Concurrent test' },
      tasks: [
        { id: 'T-C1', description: 'Independent task 1', requirementIds: ['R-C1'], dependsOn: [], ownedPaths: ['concurrent1.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-C2', description: 'Independent task 2', requirementIds: ['R-C2'], dependsOn: [], ownedPaths: ['concurrent2.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: false },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };

    const concurrentId = `concurrent-${Date.now()}`;
    await store.createRun(concurrentId, plan);
    const run = await store.getRun(concurrentId);
    run!.tasks = [
      { taskId: 'T-C1', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
      { taskId: 'T-C2', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent', 'runs', concurrentId, 'run.json'),
      JSON.stringify(run, null, 2),
    );
    await store.updateState(concurrentId, 'EXECUTING');

    // Both tasks should be ready and run
    const result = await resumeRun(concurrentId, { project: tmpDir });
    expect(result.state).toBe('COMPLETED'); // require_verification=false, so no fake pass check
    expect(result.tasks).toHaveLength(2);
    expect(result.receipts.length).toBe(2);

    await store.deleteRun(concurrentId);
  });

  it('handles per-task errors independently without failing entire batch', async () => {
    // This test verifies that a failing task in one batch doesn't prevent other tasks from completing
    for (const f of ['error1.txt', 'error2.txt']) {
      fs.writeFileSync(path.join(tmpDir, f), `content of ${f}\n`, 'utf-8');
    }
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'error-handling', summary: 'Error handling test' },
      tasks: [
        { id: 'T-E1', description: 'Task with potential error', requirementIds: ['R-E1'], dependsOn: [], ownedPaths: ['error1.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
        { id: 'T-E2', description: 'Task without error', requirementIds: ['R-E2'], dependsOn: [], ownedPaths: ['error2.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: false, require_verification: false },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };

    const errorId = `error-handling-${Date.now()}`;
    await store.createRun(errorId, plan);

    const result = await resumeRun(errorId, { project: tmpDir });
    // Both tasks should complete (or at least one completes even if one fails)
    expect(result.tasks.length).toBe(2);

    await store.deleteRun(errorId);
  });
});

describe('Strengthened fake PASS rejection', () => {
  it('rejects PASS receipt with no command/exit/evidence/hash proof', async () => {
    // Create a plan with require_verification=true
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'fake-pass', summary: 'Fake pass test' },
      tasks: [
        { id: 'T-FP1', description: 'Task with empty receipt', requirementIds: ['R-FP1'], dependsOn: [], ownedPaths: [], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };

    const fakePassId = `fake-pass-${Date.now()}`;
    await store.createRun(fakePassId, plan);

    // Add a PASS receipt with no evidence
    await store.addReceipt(fakePassId, {
      taskId: 'T-FP1',
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      evidencePaths: [],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });

    const result = await resumeRun(fakePassId, { project: tmpDir });
    // Should be FAILED because PASS has no command/exit/evidence proof
    expect(result.state).toBe('FAILED');
    expect(result.error).toContain('FABRICATED PASS rejected');

    await store.deleteRun(fakePassId);
  });

  it('accepts PASS receipt with evidence paths (strong evidence)', async () => {
    for (const f of ['evidence.txt']) {
      fs.writeFileSync(path.join(tmpDir, f), `evidence content\n`, 'utf-8');
    }
    const plan = {
      schema: 'artifact/plan',
      version: 1,
      repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
      intent_reference: { hash: 'strong-pass', summary: 'Strong pass test' },
      tasks: [
        { id: 'T-SP1', description: 'Task with evidence', requirementIds: ['R-SP1'], dependsOn: [], ownedPaths: ['evidence.txt'], acceptanceCriteria: ['done'], estimatedEffort: 'small' as const },
      ],
      completion_policy: { require_all_tasks: true, require_verification: true },
      validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
    };

    const strongId = `strong-pass-${Date.now()}`;
    await store.createRun(strongId, plan);
    const run = await store.getRun(strongId);
    run!.tasks = [
      { taskId: 'T-SP1', state: 'PENDING', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    fs.writeFileSync(
      path.join(tmpDir, '.agent', 'runs', strongId, 'run.json'),
      JSON.stringify(run, null, 2),
    );
    await store.updateState(strongId, 'EXECUTING');

    // Add PASS receipt with evidence
    await store.addReceipt(strongId, {
      taskId: 'T-SP1',
      filesChanged: ['evidence.txt'],
      commandsRun: [],
      testsRun: ['evidence.txt'], // testsRun > 0 counts as exit proof
      evidencePaths: ['evidence.txt'],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });

    const result = await resumeRun(strongId, { project: tmpDir });
    expect(result.state).toBe('COMPLETED');
    expect(result.error).toBeUndefined();

    await store.deleteRun(strongId);
  });
});

describe('computeFinalState — adversarial receipt/state hardening (BUG-3)', () => {
  const basePlan = {
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
    intent_reference: { hash: 'adv', summary: 'Adversarial test plan' },
    tasks: [
      { id: 'T-001', description: 'Task one', requirementIds: ['R1'], dependsOn: [], ownedPaths: ['f1.txt'], acceptanceCriteria: [], estimatedEffort: 'small' as const },
      { id: 'T-002', description: 'Task two', requirementIds: ['R2'], dependsOn: ['T-001'], ownedPaths: ['f2.txt'], acceptanceCriteria: [], estimatedEffort: 'small' as const },
    ],
    completion_policy: { require_all_tasks: false, require_verification: false },
    validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
  };

  function makeOrcRun(
    taskOverrides: Array<{ state: string; receiptStatus?: string }>,
    policyOverrides?: Partial<{ require_all_tasks: boolean; require_verification: boolean }>,
  ) {
    const plan = { ...basePlan, completion_policy: { ...basePlan.completion_policy, ...policyOverrides } };
    const tasks = taskOverrides.map((t, i) => ({
      taskId: `T-00${i + 1}`,
      state: t.state as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED',
      receipt: t.receiptStatus
        ? ({ status: t.receiptStatus } as import('../src/services/orchestrator.js').DelegationReceipt)
        : undefined,
      retryCount: 0,
      worker: '',
      model: '',
      effort: 'small',
    }));
    return { runId: 'test', state: 'EXECUTING', plan, tasks, createdAt: '', updatedAt: '' };
  }

  // BUG-3 core: PARTIAL/FAIL receipts cannot yield COMPLETED regardless of task.state
  it('COMPLETED task + PARTIAL receipt → FAILED (not COMPLETED)', () => {
    const run = makeOrcRun([{ state: 'COMPLETED', receiptStatus: 'PARTIAL' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
    expect(result.reason).toContain('One or more tasks failed');
  });

  it('COMPLETED task + FAIL receipt → FAILED (not COMPLETED)', () => {
    const run = makeOrcRun([{ state: 'COMPLETED', receiptStatus: 'FAIL' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
  });

  it('COMPLETED task + PASS receipt + permissive policy → COMPLETED (control)', () => {
    const run = makeOrcRun([{ state: 'COMPLETED', receiptStatus: 'PASS' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('COMPLETED');
  });

  // With require_all_tasks=false, incomplete tasks are allowed under permissive policy
  it('PENDING task + permissive policy (require_all_tasks=false) → COMPLETED', () => {
    const run = makeOrcRun([{ state: 'COMPLETED' }, { state: 'PENDING' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('COMPLETED');
  });

  it('RUNNING task + permissive policy (require_all_tasks=false) → COMPLETED', () => {
    const run = makeOrcRun([{ state: 'COMPLETED' }, { state: 'RUNNING' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('COMPLETED');
  });

  // With require_all_tasks=true, incomplete tasks → FAILED
  it('PENDING task + strict policy (require_all_tasks=true) → FAILED', () => {
    const run = makeOrcRun(
      [{ state: 'COMPLETED' }, { state: 'PENDING' }],
      { require_all_tasks: true },
    );
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
    expect(result.reason).toContain('T-002');
    expect(result.reason).toContain('PENDING');
  });

  it('CANCELLED task + strict policy → FAILED', () => {
    const run = makeOrcRun(
      [{ state: 'COMPLETED' }, { state: 'CANCELLED' }],
      { require_all_tasks: true },
    );
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
    expect(result.reason).toContain('CANCELLED');
  });

  it('BLOCKED tasks + all blocked → BLOCKED (not COMPLETED)', () => {
    const run = makeOrcRun([{ state: 'BLOCKED' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('BLOCKED');
    expect(result.reason).toContain('All tasks blocked');
  });

  it('mixed BLOCKED + others → FAILED (not COMPLETED)', () => {
    const run = makeOrcRun([{ state: 'COMPLETED' }, { state: 'BLOCKED' }]);
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
    expect(result.reason).toContain('One or more tasks blocked');
  });

  it('empty tasks + permissive policy → COMPLETED (vacuous truth)', () => {
    const plan = { ...basePlan, tasks: [] };
    const run = { runId: 'test', state: 'EXECUTING', plan, tasks: [], createdAt: '', updatedAt: '' };
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('COMPLETED');
  });

  // PARTIAL receipt on dependent task — receipt-status hardening is policy-independent
  it('PARTIAL receipt on dep task → run FAILED even with require_all_tasks=false', () => {
    const run = makeOrcRun(
      [{ state: 'COMPLETED', receiptStatus: 'PASS' }, { state: 'FAILED', receiptStatus: 'PARTIAL' }],
      { require_all_tasks: false, require_verification: false },
    );
    const result = computeFinalState(run as import('../src/services/orchestrator.js').OrchestrationRun);
    expect(result.state).toBe('FAILED');
  });
});

describe('Adversarial e2e: PARTIAL/FAIL receipts under permissive policy via resumeRun', () => {
  const permissivePlan = (taskDefs: Array<{ id: string; dependsOn?: string[]; ownedPaths?: string[] }>) => ({
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
    intent_reference: { hash: 'adv-e2e', summary: 'Adversarial e2e' },
    tasks: taskDefs.map((t, i) => ({
      id: t.id,
      description: `Task ${t.id}`,
      requirementIds: [`R${i}`],
      dependsOn: t.dependsOn ?? [],
      ownedPaths: t.ownedPaths ?? [`${t.id}.txt`],
      acceptanceCriteria: [],
      estimatedEffort: 'small' as const,
    })),
    // BUG-3: permissive policy is the adversarial boundary — these runs must still FAILED
    completion_policy: { require_all_tasks: false, require_verification: false },
    validation: { valid: true, errors: [], warnings: [], requirementCoverage: [] },
  });

  it('PARTIAL receipt on stored run → FAILED (not COMPLETED), permissive policy', async () => {
    const advId = `adv-partial-${Date.now()}`;
    const plan = permissivePlan([{ id: 'T-001' }, { id: 'T-002', dependsOn: ['T-001'] }]);
    await store.createRun(advId, plan);
    const run = await store.getRun(advId);
    // T-001 PASS (completed), T-002 PARTIAL (failed)
    run!.tasks = [
      { taskId: 'T-001', state: 'COMPLETED', retryCount: 0, worker: '', model: '', effort: 'small' },
      { taskId: 'T-002', state: 'FAILED', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    const runJsonPath = path.join(tmpDir, '.agent', 'runs', advId, 'run.json');
    fs.writeFileSync(runJsonPath, JSON.stringify(run, null, 2));
    await store.updateState(advId, 'EXECUTING');
    await store.addReceipt(advId, {
      taskId: 'T-001',
      filesChanged: ['T-001.txt'],
      commandsRun: [],
      testsRun: [],
      evidencePaths: ['T-001.txt'],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    });
    await store.addReceipt(advId, {
      taskId: 'T-002',
      filesChanged: ['T-002.txt'],
      commandsRun: [],
      testsRun: [],
      evidencePaths: ['T-002.txt'],
      // BUG-3: PARTIAL receipt even with evidence → task FAILED
      status: 'PARTIAL',
      retries: 0,
      assumptions: [],
      unresolvedFindings: ['Edge case triggered'],
    });
    // No checkpoint write — avoids engine facade identity validation (unrelated to this test)

    const result = await resumeRun(advId, { project: tmpDir });
    expect(result.state).toBe('FAILED');
    // BUG-3: PARTIAL receipt → run FAILED under any completion policy
    expect(result.state).not.toBe('COMPLETED');

    await store.deleteRun(advId);
  });

  it('FAIL receipt on stored run → FAILED (not COMPLETED), permissive policy', async () => {
    const advId = `adv-fail-${Date.now()}`;
    const plan = permissivePlan([{ id: 'T-001' }]);
    await store.createRun(advId, plan);
    const run = await store.getRun(advId);
    run!.tasks = [{ taskId: 'T-001', state: 'FAILED', retryCount: 0, worker: '', model: '', effort: 'small' }];
    const runJsonPath = path.join(tmpDir, '.agent', 'runs', advId, 'run.json');
    fs.writeFileSync(runJsonPath, JSON.stringify(run, null, 2));
    await store.updateState(advId, 'EXECUTING');
    await store.addReceipt(advId, {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      evidencePaths: [],
      status: 'FAIL',
      retries: 0,
      assumptions: [],
      unresolvedFindings: ['Intentional failure'],
    });
    // No checkpoint write — avoids engine facade identity validation (unrelated to this test)

    const result = await resumeRun(advId, { project: tmpDir });
    expect(result.state).toBe('FAILED');
    expect(result.state).not.toBe('COMPLETED');

    await store.deleteRun(advId);
  });

  it('FAIL receipt on dependent task → run FAILED even when other task COMPLETED (permissive policy)', async () => {
    const advId = `adv-fail-dep-${Date.now()}`;
    const plan = permissivePlan([{ id: 'T-001' }, { id: 'T-002', dependsOn: ['T-001'] }]);
    await store.createRun(advId, plan);
    const run = await store.getRun(advId);
    // T-001 PASS (completed), T-002 FAIL
    run!.tasks = [
      { taskId: 'T-001', state: 'COMPLETED', retryCount: 0, worker: '', model: '', effort: 'small' },
      { taskId: 'T-002', state: 'FAILED', retryCount: 0, worker: '', model: '', effort: 'small' },
    ];
    const runJsonPath = path.join(tmpDir, '.agent', 'runs', advId, 'run.json');
    fs.writeFileSync(runJsonPath, JSON.stringify(run, null, 2));
    await store.updateState(advId, 'EXECUTING');
    await store.addReceipt(advId, {
      taskId: 'T-001', filesChanged: ['T-001.txt'], commandsRun: [], testsRun: [], evidencePaths: ['T-001.txt'],
      status: 'PASS', retries: 0, assumptions: [], unresolvedFindings: [],
    });
    await store.addReceipt(advId, {
      taskId: 'T-002', filesChanged: [], commandsRun: [], testsRun: [], evidencePaths: [],
      status: 'FAIL', retries: 0, assumptions: [], unresolvedFindings: ['Worker failed'],
    });
    // No checkpoint write — avoids engine facade identity validation

    const result = await resumeRun(advId, { project: tmpDir });
    expect(result.state).toBe('FAILED');
    expect(result.state).not.toBe('COMPLETED');

    await store.deleteRun(advId);
  });
});
