import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  executeRun,
  getRunStatus,
  resumeRun,
  cancelRunById,
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
    await store.checkpoint(partialId);

    const resumed2 = await resumeRun(partialId, { project: tmpDir });
    expect(resumed2.runId).toBe(partialId);
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
