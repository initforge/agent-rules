import { describe, it, expect } from 'vitest';
import {
  createRun,
  getNextReadyTasks,
  assignTask,
  completeTask,
  cancelRun,
  getBlockers,
  validateWorkerReceipt,
  type OrchestrationRun,
  type DelegationReceipt,
} from '../src/services/orchestrator.js';
import type { CompiledPlan, PlanTask } from '../src/services/plan-compiler.js';

function validPlan(overrides?: Partial<CompiledPlan>): CompiledPlan {
  const tasks: PlanTask[] = [
    {
      id: 'T-001',
      description: 'Implement REQ-001',
      requirementIds: ['REQ-001'],
      dependsOn: [],
      ownedPaths: ['src/foo.ts'],
      acceptanceCriteria: ['REQ-001 is implemented and verified'],
      estimatedEffort: 'small',
    },
    {
      id: 'T-002',
      description: 'Implement REQ-002',
      requirementIds: ['REQ-002'],
      dependsOn: ['T-001'],
      ownedPaths: ['src/bar.ts'],
      acceptanceCriteria: ['REQ-002 is implemented and verified'],
      estimatedEffort: 'medium',
    },
    {
      id: 'T-003',
      description: 'Implement REQ-003',
      requirementIds: ['REQ-003'],
      dependsOn: ['T-002'],
      ownedPaths: ['src/baz.ts'],
      acceptanceCriteria: ['REQ-003 is implemented and verified'],
      estimatedEffort: 'large',
    },
  ];
  return {
    schema: 'artifact/plan',
    version: 1,
    repository_baseline: { branch: 'main', sha: 'a'.repeat(40) },
    intent_reference: { hash: 'abc123', summary: 'Test plan' },
    tasks,
    completion_policy: { require_all_tasks: true, require_verification: true },
    validation: {
      valid: true,
      errors: [],
      warnings: [],
      requirementCoverage: [
        { id: 'REQ-001', covered: true, taskId: 'T-001' },
        { id: 'REQ-002', covered: true, taskId: 'T-002' },
        { id: 'REQ-003', covered: true, taskId: 'T-003' },
      ],
    },
    ...overrides,
  };
}

describe('createRun', () => {
  it('creates a run with PENDING state and matching tasks', () => {
    const plan = validPlan();
    const run = createRun(plan);

    expect(run.runId).toBeDefined();
    expect(run.state).toBe('PENDING');
    expect(run.plan).toBe(plan);
    expect(run.tasks).toHaveLength(3);
    expect(run.tasks.map(t => t.taskId)).toEqual(['T-001', 'T-002', 'T-003']);
    expect(run.createdAt).toBeDefined();
    expect(run.updatedAt).toBe(run.createdAt);
  });

  it('initialises each task as PENDING', () => {
    const plan = validPlan();
    const run = createRun(plan);

    for (const task of run.tasks) {
      expect(task.state).toBe('PENDING');
      expect(task.retryCount).toBe(0);
    }
  });

  it('copies estimatedEffort from plan tasks', () => {
    const plan = validPlan();
    const run = createRun(plan);

    expect(run.tasks[0].effort).toBe('small');
    expect(run.tasks[1].effort).toBe('medium');
    expect(run.tasks[2].effort).toBe('large');
  });
});

describe('getNextReadyTasks', () => {
  it('returns tasks with no dependencies first', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const ready = getNextReadyTasks(run);

    expect(ready).toHaveLength(1);
    expect(ready[0].taskId).toBe('T-001');
  });

  it('skips tasks whose dependencies are not completed', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const ready = getNextReadyTasks(run);

    expect(ready.map(t => t.taskId)).not.toContain('T-002');
    expect(ready.map(t => t.taskId)).not.toContain('T-003');
  });

  it('returns dependent tasks after dependencies complete', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const firstBatch = getNextReadyTasks(run);
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0].taskId).toBe('T-001');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['git status'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    completeTask(run, 'T-001', receipt);

    const secondBatch = getNextReadyTasks(run);
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].taskId).toBe('T-002');
  });
});

describe('assignTask', () => {
  it('creates a proper delegation assignment', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const assignment = assignTask(run, 'T-001', 'worker-alpha');

    expect(assignment.taskId).toBe('T-001');
    expect(assignment.reqIds).toEqual(['REQ-001']);
    expect(assignment.objective).toBe('Implement REQ-001');
    expect(assignment.ownedPaths).toEqual(['src/foo.ts']);
    expect(assignment.forbiddenPaths).toEqual(['src/bar.ts', 'src/baz.ts']);
    expect(assignment.acceptanceCriteria).toEqual(['REQ-001 is implemented and verified']);
    expect(assignment.model).toBe('gpt-4o');
    expect(assignment.effort).toBe('small');
  });

  it('sets task state to RUNNING and records worker', () => {
    const plan = validPlan();
    const run = createRun(plan);

    assignTask(run, 'T-001', 'worker-alpha');

    const task = run.tasks.find(t => t.taskId === 'T-001');
    expect(task?.state).toBe('RUNNING');
    expect(task?.worker).toBe('worker-alpha');
    expect(task?.assignment).toBeDefined();
  });

  it('computes forbidden paths from all other tasks', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const assignment = assignTask(run, 'T-002', 'worker-beta');

    expect(assignment.forbiddenPaths).toEqual(['src/foo.ts', 'src/baz.ts']);
  });

  it('throws for unknown task', () => {
    const plan = validPlan();
    const run = createRun(plan);

    expect(() => assignTask(run, 'T-999', 'worker-x')).toThrow('Task T-999 not found');
  });
});

describe('completeTask', () => {
  it('marks task as COMPLETED on PASS receipt', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['npm run build'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['test-results.json'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };

    completeTask(run, 'T-001', receipt);

    const task = run.tasks.find(t => t.taskId === 'T-001');
    expect(task?.state).toBe('COMPLETED');
    expect(task?.receipt).toBe(receipt);
    expect(task?.retryCount).toBe(0);
  });

  it('marks task as FAILED on FAIL receipt', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'FAIL',
      retries: 2,
      assumptions: [],
      unresolvedFindings: ['Test coverage below threshold'],
    };

    completeTask(run, 'T-001', receipt);

    const task = run.tasks.find(t => t.taskId === 'T-001');
    expect(task?.state).toBe('FAILED');
    expect(task?.error).toContain('Test coverage below threshold');
    expect(task?.retryCount).toBe(2);
  });
});

describe('cancelRun', () => {
  it('marks all pending tasks as cancelled', () => {
    const plan = validPlan();
    const run = createRun(plan);

    assignTask(run, 'T-001', 'worker-alpha');
    const result = cancelRun(run);

    expect(result.state).toBe('CANCELLED');

    const t1 = run.tasks.find(t => t.taskId === 'T-001');
    const t2 = run.tasks.find(t => t.taskId === 'T-002');
    const t3 = run.tasks.find(t => t.taskId === 'T-003');

    expect(t1?.state).toBe('RUNNING');
    expect(t2?.state).toBe('CANCELLED');
    expect(t3?.state).toBe('CANCELLED');
  });

  it('does not affect completed or failed tasks', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    completeTask(run, 'T-001', receipt);

    cancelRun(run);

    const t1 = run.tasks.find(t => t.taskId === 'T-001');
    expect(t1?.state).toBe('COMPLETED');
  });
});

describe('getBlockers', () => {
  it('returns empty array when no tasks are blocked', () => {
    const plan = validPlan();
    const run = createRun(plan);

    const blockers = getBlockers(run);
    expect(blockers).toEqual([]);
  });

  it('reports tasks blocked by failed dependencies', () => {
    const plan = validPlan();
    const run = createRun(plan);

    assignTask(run, 'T-001', 'worker-alpha');
    const failReceipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'FAIL',
      retries: 3,
      assumptions: [],
      unresolvedFindings: ['Implementation broken'],
    };
    completeTask(run, 'T-001', failReceipt);

    getNextReadyTasks(run);

    const blockers = getBlockers(run);
    expect(blockers.length).toBeGreaterThanOrEqual(1);
    expect(blockers[0]).toContain('T-002');
    expect(blockers[0]).toContain('T-001');
  });
});

describe('completeTask — adversarial receipt status', () => {
  it('marks task as FAILED on PARTIAL receipt (BUG-3: cannot reach COMPLETED)', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PARTIAL',
      retries: 1,
      assumptions: [],
      unresolvedFindings: ['Some requirements unmet'],
    };

    completeTask(run, 'T-001', receipt);

    const task = run.tasks.find(t => t.taskId === 'T-001');
    expect(task?.state).toBe('FAILED');
    expect(task?.error).toContain('Some requirements unmet');
    expect(task?.retryCount).toBe(1);
    // BUG-3: PARTIAL receipt must never produce COMPLETED
    expect(task?.state).not.toBe('COMPLETED');
  });

  it('marks task as BLOCKED on BLOCKED receipt', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    const receipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'BLOCKED',
      retries: 0,
      assumptions: ['Dependency unavailable'],
      unresolvedFindings: ['Upstream dependency failed'],
    };

    completeTask(run, 'T-001', receipt);

    const task = run.tasks.find(t => t.taskId === 'T-001');
    expect(task?.state).toBe('BLOCKED');
    expect(task?.error).toContain('Upstream dependency failed');
  });

  it('throws on unknown receipt status (BUG-3: validate receipt status)', () => {
    const plan = validPlan();
    const run = createRun(plan);
    assignTask(run, 'T-001', 'worker-alpha');

    // @ts-expect-error — deliberately inject an unknown status for adversarial test
    const badReceipt: DelegationReceipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'SUCCESS' as 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };

    expect(() => completeTask(run, 'T-001', badReceipt as DelegationReceipt))
      .toThrow('Unknown receipt status: SUCCESS');
  });
});

describe('validateWorkerReceipt', () => {
  const validAssignment = {
    taskId: 'T-001',
    reqIds: ['REQ-001'],
    objective: 'Test task',
    ownedPaths: ['src/foo.ts', 'src/bar.ts'],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verificationCommands: ['npm test'],
    model: 'gpt-4o',
    effort: 'small',
  };

  it('passes valid receipt with full proof', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['npm test'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(true);
    expect(result.fakePassDetected).toBe(false);
  });

  it('rejects fabricated PASS with no evidence', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: [],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: [],
      diffHashes: {},
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(false);
    expect(result.fakePassDetected).toBe(true);
    expect(result.errors.some(e => e.includes('FABRICATED PASS'))).toBe(true);
  });

  it('rejects receipt with non-zero exit code', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['npm test'],
      exitCodes: [1],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Non-zero exit codes'))).toBe(true);
  });

  it('rejects filesChanged outside ownedPaths', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: ['src/hacked.ts'],
      commandsRun: ['npm test'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['src/hacked.ts'],
      diffHashes: { 'src/hacked.ts': 'abc123' },
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('outside owned paths'))).toBe(true);
  });

  it('rejects receipt missing diff hash for changed file', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['npm test'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: {},
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing diff hash'))).toBe(true);
  });

  it('rejects mismatched taskId', () => {
    const receipt = {
      taskId: 'T-999',
      filesChanged: ['src/foo.ts'],
      commandsRun: ['npm test'],
      exitCodes: [0],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('taskId mismatch'))).toBe(true);
  });

  it('passes PASS with evidence but no commands', () => {
    const receipt = {
      taskId: 'T-001',
      filesChanged: ['src/foo.ts'],
      commandsRun: [],
      exitCodes: [],
      testsRun: [],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
      status: 'PASS' as const,
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
    const result = validateWorkerReceipt(receipt, validAssignment);
    expect(result.valid).toBe(true);
    expect(result.fakePassDetected).toBe(false);
  });
});
