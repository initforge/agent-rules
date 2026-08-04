import type { CompiledPlan } from './plan-compiler.js';

export type RunState = 'PENDING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

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
  state: 'PENDING' | 'READY' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED';
  /** DISC-004: acknowledgment required before starting. */
  ackStatus: 'pending' | 'acknowledged';
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
  exitCodes?: number[];
  testsRun: string[];
  evidencePaths: string[];
  diffHashes?: Record<string, string>;
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

/** Validation errors for a DelegationReceipt */
export interface ReceiptValidation {
  valid: boolean;
  errors: string[];
  fakePassDetected: boolean;
}

/**
 * Validates a receipt against its assignment and run context.
 * Rejects fabricated PASS (no evidence/commands/exits/diffs).
 * Validates owned paths, command integrity, exit codes.
 */
export function validateWorkerReceipt(
  receipt: DelegationReceipt,
  assignment: DelegationAssignment,
  expectedSession?: string,
): ReceiptValidation {
  const errors: string[] = [];
  let fakePassDetected = false;

  // 1. Assignment validation
  if (!receipt.taskId) {
    errors.push('Receipt missing taskId');
  } else if (receipt.taskId !== assignment.taskId) {
    errors.push(`Receipt taskId mismatch: expected ${assignment.taskId}, got ${receipt.taskId}`);
  }

  // 2. Owned path validation - filesChanged must be subset of ownedPaths
  for (const changed of receipt.filesChanged) {
    if (!assignment.ownedPaths.includes(changed)) {
      errors.push(`File changed outside owned paths: ${changed}`);
    }
  }

  // 3. Evidence path validation - evidencePaths must be subset of filesChanged
  for (const ev of receipt.evidencePaths) {
    if (!receipt.filesChanged.includes(ev)) {
      errors.push(`Evidence path not in filesChanged: ${ev}`);
    }
  }

  // 4. Diff hash validation - must have hash for each changed file (when diffHashes provided)
  if (receipt.diffHashes) {
    for (const changed of receipt.filesChanged) {
      if (!receipt.diffHashes[changed]) {
        errors.push(`Missing diff hash for changed file: ${changed}`);
      }
    }
  }

  // 5. Command/exit code integrity - if commands run, must have exit codes (when exitCodes provided)
  if (receipt.exitCodes !== undefined) {
    if (receipt.commandsRun.length > 0 && receipt.exitCodes.length === 0) {
      errors.push('Commands executed but no exit codes recorded');
    }
    if (receipt.exitCodes.length !== receipt.commandsRun.length) {
      errors.push(`Exit code count mismatch: ${receipt.exitCodes.length} codes for ${receipt.commandsRun.length} commands`);
    }
    // 6. Exit code validation - all must be 0
    const nonZeroExits = receipt.exitCodes.filter(c => c !== 0);
    if (nonZeroExits.length > 0) {
      errors.push(`Non-zero exit codes: ${nonZeroExits.join(', ')}`);
    }
  }

  // 7. Fake PASS rejection (backward compatible - works with or without exitCodes/diffHashes)
  const hasEvidence = receipt.evidencePaths.length > 0;
  const hasCommand = receipt.commandsRun.length > 0;
  const hasExit = receipt.exitCodes !== undefined && receipt.exitCodes.length > 0 && receipt.exitCodes.every(c => c === 0);
  const hasDiffs = receipt.diffHashes !== undefined && Object.keys(receipt.diffHashes).length > 0;

  if (receipt.status === 'PASS' && !hasEvidence && !hasCommand && !hasExit && !hasDiffs) {
    fakePassDetected = true;
    errors.push('FABRICATED PASS: no evidence/commands/exits/diffs');
  }

  return {
    valid: errors.length === 0 && !fakePassDetected,
    errors,
    fakePassDetected,
  };
}

/**
 * Asserts receipt validity; throws on invalid or fake PASS.
 */
export function assertWorkerReceipt(
  receipt: DelegationReceipt,
  assignment: DelegationAssignment,
  expectedSession?: string,
): void {
  const validation = validateWorkerReceipt(receipt, assignment, expectedSession);
  if (!validation.valid) {
    throw new Error(`Receipt validation failed: ${validation.errors.join('; ')}`);
  }
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
      ackStatus: 'pending',
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
    default:
      // BUG-3: reject unknown receipt statuses — prevents silent state corruption
      // on tampered receipts or future protocol extensions.
      throw new Error(`Unknown receipt status: ${(receipt as { status: string }).status}`);
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
