import type { CompiledPlan } from './plan-compiler.js';

export type RunState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface OrchestrationRun {
  runId: string;
  state: RunState;
  plan: CompiledPlan;
  tasks: TaskState[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskState {
  taskId: string;
  state: 'PENDING' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED';
  assignment?: DelegationAssignment;
  receipt?: DelegationReceipt;
  verificationResult?: VerificationResult;
  retryCount: number;
  error?: string;
  worker: string;
  model: string;
  effort: string;
}

export interface DelegationAssignment {
  taskId: string;
  reqIds: string[];
  objective: string;
  ownedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  model: string;
  effort: string;
  /** Project root that ownedPaths are confined to. */
  root?: string;
}

export interface DelegationReceipt {
  taskId: string;
  filesChanged: string[];
  commandsRun: string[];
  testsRun: string[];
  evidencePaths: string[];
  status: 'PASS' | 'PARTIAL' | 'FAIL' | 'BLOCKED';
  retries: number;
  assumptions: string[];
  unresolvedFindings: string[];
}

export interface VerificationResult {
  taskId: string;
  verified: boolean;
  falsePassDetected: boolean;
  errors: string[];
  evidencePaths: string[];
  verifier: string;
}

export function createRun(plan: CompiledPlan): OrchestrationRun {
  const now = new Date().toISOString();
  return {
    runId: crypto.randomUUID(),
    state: 'PENDING',
    plan,
    tasks: plan.tasks.map(t => ({
      taskId: t.id,
      state: 'PENDING',
      retryCount: 0,
      worker: '',
      model: '',
      effort: t.estimatedEffort,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function getNextReadyTasks(run: OrchestrationRun): TaskState[] {
  const taskMap = new Map(run.tasks.map(t => [t.taskId, t]));
  const ready: TaskState[] = [];

  for (const task of run.tasks) {
    if (task.state !== 'PENDING') continue;

    const planTask = run.plan.tasks.find(pt => pt.id === task.taskId);
    if (!planTask) continue;

    let allDepsCompleted = true;
    let hasFailedDep = false;

    for (const depId of planTask.dependsOn) {
      const dep = taskMap.get(depId);
      if (!dep || dep.state === 'FAILED') {
        hasFailedDep = true;
        allDepsCompleted = false;
        break;
      }
      if (dep.state !== 'COMPLETED') {
        allDepsCompleted = false;
      }
    }

    if (hasFailedDep) {
      task.state = 'BLOCKED';
    } else if (allDepsCompleted) {
      ready.push(task);
    }
  }

  return ready;
}

export function assignTask(run: OrchestrationRun, taskId: string, worker: string, root?: string): DelegationAssignment {
  const task = run.tasks.find(t => t.taskId === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const planTask = run.plan.tasks.find(pt => pt.id === taskId);
  if (!planTask) throw new Error(`Plan task ${taskId} not found`);

  const allOwnedPaths = run.plan.tasks.flatMap(t => t.ownedPaths);
  const forbiddenPaths = allOwnedPaths.filter(p => !planTask.ownedPaths.includes(p));

  task.state = 'RUNNING';
  task.worker = worker;

  const assignment: DelegationAssignment = {
    taskId,
    reqIds: [...planTask.requirementIds],
    objective: planTask.description,
    ownedPaths: [...planTask.ownedPaths],
    forbiddenPaths,
    acceptanceCriteria: [...planTask.acceptanceCriteria],
    verificationCommands: [],
    model: task.model || 'gpt-4o',
    effort: task.effort || planTask.estimatedEffort,
    root,
  };

  task.assignment = assignment;
  task.model = assignment.model;
  task.effort = assignment.effort;
  run.updatedAt = new Date().toISOString();
  return assignment;
}

export function completeTask(run: OrchestrationRun, taskId: string, receipt: DelegationReceipt): void {
  const task = run.tasks.find(t => t.taskId === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  task.receipt = receipt;
  task.retryCount = receipt.retries;

  switch (receipt.status) {
    case 'PASS':
      task.state = 'COMPLETED';
      break;
    case 'FAIL':
      task.state = 'FAILED';
      if (receipt.unresolvedFindings.length > 0) {
        task.error = receipt.unresolvedFindings.join('; ');
      }
      break;
    case 'PARTIAL':
      task.state = 'FAILED';
      if (receipt.unresolvedFindings.length > 0) {
        task.error = receipt.unresolvedFindings.join('; ');
      }
      break;
    case 'BLOCKED':
      task.state = 'BLOCKED';
      if (receipt.unresolvedFindings.length > 0) {
        task.error = receipt.unresolvedFindings.join('; ');
      }
      break;
  }

  run.updatedAt = new Date().toISOString();
}

export function cancelRun(run: OrchestrationRun): OrchestrationRun {
  for (const task of run.tasks) {
    if (task.state === 'PENDING' || task.state === 'BLOCKED') {
      task.state = 'CANCELLED';
    }
  }
  run.state = 'CANCELLED';
  run.updatedAt = new Date().toISOString();
  return run;
}

export function getBlockers(run: OrchestrationRun): string[] {
  const taskMap = new Map(run.tasks.map(t => [t.taskId, t]));
  const blockers: string[] = [];

  for (const task of run.tasks) {
    if (task.state !== 'BLOCKED') continue;

    const planTask = run.plan.tasks.find(pt => pt.id === task.taskId);
    if (!planTask) continue;

    const failedDeps = planTask.dependsOn.filter(depId => {
      const dep = taskMap.get(depId);
      return dep && dep.state === 'FAILED';
    });

    if (failedDeps.length > 0) {
      blockers.push(`${task.taskId} blocked by failed dependencies: ${failedDeps.join(', ')}`);
    } else {
      const pendingDeps = planTask.dependsOn.filter(depId => {
        const dep = taskMap.get(depId);
        return dep && dep.state !== 'COMPLETED';
      });
      if (pendingDeps.length > 0) {
        blockers.push(`${task.taskId} blocked by unfinished dependencies: ${pendingDeps.join(', ')}`);
      } else {
        blockers.push(`${task.taskId} blocked (unresolved)`);
      }
    }
  }

  return blockers;
}
