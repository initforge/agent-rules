import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileIntent } from './intent-compiler.js';
import { compilePlan, validatePlan } from './plan-compiler.js';
import type { CompiledPlan } from './plan-compiler.js';
import {
  createRun as createOrchestrationRun,
  getNextReadyTasks,
  assignTask,
  completeTask,
  cancelRun as orchestratorCancelRun,
} from './orchestrator.js';
import type { OrchestrationRun, TaskState, DelegationReceipt } from './orchestrator.js';
import { DurableStore, RUN_LOCKED_ERROR, RUN_ACTIVE_ERROR } from './durable-store.js';
import type { RunState } from './durable-store.js';
import { LocalWorkerAdapter } from '../adapters/local-worker.js';

export interface RunOptions {
  project?: string;
  profile?: string;
  platform?: string;
  adapter?: string;
  dryRun?: boolean;
  autonomy?: number;
}

export interface RunResult {
  runId: string;
  state: string;
  receipts: unknown[];
  tasks: unknown[];
  createdAt: string;
  updatedAt: string;
  error?: string;
  staleProcess?: boolean;
  orphanPid?: number;
}

const _hasTaskStatus = (
  t: unknown,
): t is { id: string; state: string } =>
  typeof t === 'object' && t !== null && 'id' in (t as Record<string, unknown>);

function runJsonPath(basePath: string, runId: string): string {
  return path.join(basePath, '.agent', 'runs', runId, 'run.json');
}

function syncTasksToStore(
  basePath: string,
  runId: string,
  tasks: TaskState[],
): void {
  const fp = runJsonPath(basePath, runId);
  if (!fs.existsSync(fp)) return;
  const raw = JSON.parse(fs.readFileSync(fp, 'utf-8')) as Record<string, unknown>;
  raw.tasks = tasks as unknown[];
  raw.updatedAt = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(raw, null, 2));
}

function discoverRepoFacts(
  projectDir?: string,
): { branch: string; sha: string } {
  const cwd = projectDir || process.cwd();
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    const sha = execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return { branch, sha };
  } catch {
    return { branch: 'unknown', sha: '0'.repeat(40) };
  }
}

function rebuildOrchestrationFromRun(
  plan: CompiledPlan,
  runId: string,
  receipts: DelegationReceipt[],
): OrchestrationRun {
  const orcRun = createOrchestrationRun(plan);
  orcRun.runId = runId;
  for (const receipt of receipts) {
    const task = orcRun.tasks.find(t => t.taskId === receipt.taskId);
    if (task) {
      completeTask(orcRun, receipt.taskId, receipt);
    }
  }
  return orcRun;
}

function runResultFromOrchestration(
  orcRun: OrchestrationRun,
  receipts: DelegationReceipt[],
  state: string,
  error?: string,
): RunResult {
  return {
    runId: orcRun.runId,
    state,
    receipts,
    tasks: orcRun.tasks,
    createdAt: orcRun.createdAt,
    updatedAt: orcRun.updatedAt,
    error,
  };
}

// BUG-2: honest terminal state per completion_policy. A run is COMPLETED only
// when every task is COMPLETED with a PASS receipt backed by evidence.
function computeFinalState(
  orcRun: OrchestrationRun,
): { state: RunState; reason?: string } {
  const plan = orcRun.plan;
  const tasks = orcRun.tasks;

  let hasFailed = false;
  let hasBlocked = false;
  let allBlocked = tasks.length > 0;
  for (const t of tasks) {
    if (t.state === 'FAILED') hasFailed = true;
    if (t.state === 'BLOCKED') hasBlocked = true;
    if (t.state !== 'BLOCKED') allBlocked = false;
  }

  if (hasFailed) return { state: 'FAILED', reason: 'One or more tasks failed' };
  if (allBlocked && hasBlocked) return { state: 'BLOCKED', reason: 'All tasks blocked' };
  if (hasBlocked) return { state: 'FAILED', reason: 'One or more tasks blocked' };

  if (plan.completion_policy.require_all_tasks) {
    const pending = tasks.find(t => t.state !== 'COMPLETED');
    if (pending) {
      return { state: 'FAILED', reason: `Task not completed: ${pending.taskId} (${pending.state})` };
    }
  }

  if (plan.completion_policy.require_verification) {
    for (const t of tasks) {
      const receipt = t.receipt;
      if (!receipt || receipt.status !== 'PASS') {
        return { state: 'FAILED', reason: `Task ${t.taskId} lacks a PASS receipt` };
      }
      const fakePass = receipt.evidencePaths.length === 0
        && receipt.filesChanged.length === 0
        && receipt.testsRun.length === 0;
      if (fakePass) {
        return { state: 'FAILED', reason: `Task ${t.taskId} fake PASS with no evidence` };
      }
    }
  }

  return { state: 'COMPLETED' };
}

export async function executeRun(
  request: string,
  options?: RunOptions,
): Promise<RunResult> {
  const intent = compileIntent(request, { facts: [], files: [] });

  const repoFacts = discoverRepoFacts(options?.project);

  const plan = compilePlan(intent, undefined, {
    branch: repoFacts.branch,
    sha: repoFacts.sha,
  });

  const validation = validatePlan(plan);
  if (!validation.valid) {
    throw new Error(`Plan validation failed: ${validation.errors.join('; ')}`);
  }

  const orcRun = createOrchestrationRun(plan);
  const runId = orcRun.runId;
  const basePath = options?.project || process.cwd();
  const store = new DurableStore(basePath);

  await store.createRun(runId, plan);
  syncTasksToStore(basePath, runId, orcRun.tasks);
  await store.checkpoint(runId);

  await store.updateState(runId, 'DISCOVERING');
  syncTasksToStore(basePath, runId, orcRun.tasks);
  await store.checkpoint(runId);

  await store.updateState(runId, 'PLANNED');
  syncTasksToStore(basePath, runId, orcRun.tasks);
  await store.checkpoint(runId);

  await store.updateState(runId, 'PLAN_VALIDATED');
  syncTasksToStore(basePath, runId, orcRun.tasks);
  await store.checkpoint(runId);

  if (options?.dryRun) {
    return runResultFromOrchestration(orcRun, [], 'PLAN_VALIDATED');
  }

  await store.updateState(runId, 'EXECUTING');
  syncTasksToStore(basePath, runId, orcRun.tasks);
  await store.checkpoint(runId);

  const receipts: DelegationReceipt[] = [];
  const adapterName = options?.adapter ?? 'local-worker';
  if (adapterName !== 'local-worker') {
    throw new Error(`Unknown adapter: ${adapterName}`);
  }
  const adapter = new LocalWorkerAdapter();
  store.registerProcess(runId);

  try {
    while (true) {
      const readyTasks = getNextReadyTasks(orcRun);
      if (readyTasks.length === 0) break;

      for (const task of readyTasks) {
        assignTask(orcRun, task.taskId, 'local-worker', basePath);
        syncTasksToStore(basePath, runId, orcRun.tasks);

        let receipt: DelegationReceipt;
        try {
          receipt = await adapter.submitAssignment(task.assignment!);
        } catch (err) {
          receipt = {
            taskId: task.taskId,
            filesChanged: [],
            commandsRun: [],
            testsRun: [],
            evidencePaths: [],
            status: 'FAIL',
            retries: 0,
            assumptions: [],
            unresolvedFindings: [(err as Error).message],
          };
        }
        completeTask(orcRun, task.taskId, receipt);
        receipts.push(receipt);

        await store.addReceipt(runId, receipt);
        syncTasksToStore(basePath, runId, orcRun.tasks);
        await store.checkpoint(runId);
      }
    }

    // BUG-2: honest terminal state — never mark COMPLETED on failed/fake-pass work.
    const final = computeFinalState(orcRun);
    if (final.state !== 'COMPLETED' && final.reason) {
      await store.updateError(runId, final.reason);
    }
    await store.updateState(runId, final.state);
    syncTasksToStore(basePath, runId, orcRun.tasks);
    await store.checkpoint(runId);

    return runResultFromOrchestration(orcRun, receipts, final.state, final.reason);
  } finally {
    store.unregisterProcess(runId);
    store.releaseLock(runId);
  }
}

export async function getRunStatus(
  runId: string,
  basePath?: string,
): Promise<RunResult | null> {
  const store = new DurableStore(basePath || process.cwd());
  await store.checkAndFlagStaleProcess(runId);
  const run = await store.getRun(runId);
  if (!run) return null;
  return {
    runId: run.runId,
    state: run.state,
    receipts: run.receipts,
    tasks: run.tasks,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    error: run.error,
    staleProcess: run.staleProcess,
    orphanPid: run.orphanPid,
  };
}

export async function resumeRun(
  runId: string,
  options?: RunOptions,
): Promise<RunResult> {
  const basePath = options?.project || process.cwd();
  const store = new DurableStore(basePath);

  await store.resume(runId);
  const durableRun = await store.getRun(runId);
  if (!durableRun) throw new Error(`Run not found: ${runId}`);

  // GAP-4: a live foreign lock refuses the resume — state stays BLOCKED.
  if (durableRun.state === 'BLOCKED' && durableRun.error === RUN_LOCKED_ERROR) {
    return {
      runId: durableRun.runId,
      state: durableRun.state,
      receipts: durableRun.receipts,
      tasks: durableRun.tasks,
      createdAt: durableRun.createdAt,
      updatedAt: durableRun.updatedAt,
      error: durableRun.error,
    };
  }

  // GAP-2: a live foreign process owns the run — refuse double-execution.
  if (durableRun.error === RUN_ACTIVE_ERROR) {
    return {
      runId: durableRun.runId,
      state: durableRun.state,
      receipts: durableRun.receipts,
      tasks: durableRun.tasks,
      createdAt: durableRun.createdAt,
      updatedAt: durableRun.updatedAt,
      error: durableRun.error,
    };
  }

  if (
    durableRun.state === 'COMPLETED' ||
    durableRun.state === 'FAILED' ||
    durableRun.state === 'CANCELLED' ||
    durableRun.state === 'BLOCKED'
  ) {
    return {
      runId: durableRun.runId,
      state: durableRun.state,
      receipts: durableRun.receipts,
      tasks: durableRun.tasks,
      createdAt: durableRun.createdAt,
      updatedAt: durableRun.updatedAt,
      error: durableRun.error,
      staleProcess: durableRun.staleProcess,
      orphanPid: durableRun.orphanPid,
    };
  }

  const plan = durableRun.plan as CompiledPlan;
  const storedReceipts = (durableRun.receipts ?? []) as DelegationReceipt[];
  const orcRun = rebuildOrchestrationFromRun(plan, runId, storedReceipts);

  syncTasksToStore(basePath, runId, orcRun.tasks);
  if (durableRun.state !== 'EXECUTING') {
    await store.updateState(runId, 'EXECUTING');
  }

  const allReceipts = [...storedReceipts];
  const adapterName = options?.adapter ?? 'local-worker';
  if (adapterName !== 'local-worker') {
    throw new Error(`Unknown adapter: ${adapterName}`);
  }
  const adapter = new LocalWorkerAdapter();
  store.acquireLock(runId);
  store.registerProcess(runId);

  try {
    while (true) {
      const readyTasks = getNextReadyTasks(orcRun);
      if (readyTasks.length === 0) break;

      for (const task of readyTasks) {
        assignTask(orcRun, task.taskId, 'local-worker', basePath);
        syncTasksToStore(basePath, runId, orcRun.tasks);

        let receipt: DelegationReceipt;
        try {
          receipt = await adapter.submitAssignment(task.assignment!);
        } catch (err) {
          receipt = {
            taskId: task.taskId,
            filesChanged: [],
            commandsRun: [],
            testsRun: [],
            evidencePaths: [],
            status: 'FAIL',
            retries: 0,
            assumptions: [],
            unresolvedFindings: [(err as Error).message],
          };
        }
        completeTask(orcRun, task.taskId, receipt);
        allReceipts.push(receipt);

        await store.addReceipt(runId, receipt);
        syncTasksToStore(basePath, runId, orcRun.tasks);
        await store.checkpoint(runId);
      }
    }

    // BUG-2: same honest terminal-state logic as executeRun.
    const final = computeFinalState(orcRun);
    if (final.state !== 'COMPLETED' && final.reason) {
      await store.updateError(runId, final.reason);
    }
    await store.updateState(runId, final.state);
    syncTasksToStore(basePath, runId, orcRun.tasks);
    await store.checkpoint(runId);

    return runResultFromOrchestration(orcRun, allReceipts, final.state, final.reason);
  } finally {
    store.unregisterProcess(runId);
    store.releaseLock(runId);
  }
}

export async function cancelRunById(
  runId: string,
  basePath?: string,
): Promise<RunResult> {
  const store = new DurableStore(basePath || process.cwd());
  const durableRun = await store.getRun(runId);
  if (!durableRun) throw new Error(`Run not found: ${runId}`);

  const plan = durableRun.plan as CompiledPlan;
  const storedReceipts = (durableRun.receipts ?? []) as DelegationReceipt[];
  const orcRun = rebuildOrchestrationFromRun(plan, runId, storedReceipts);

  orchestratorCancelRun(orcRun);

  const runJson = JSON.parse(
    fs.readFileSync(runJsonPath(basePath || process.cwd(), runId), 'utf-8'),
  ) as Record<string, unknown>;
  runJson.state = 'CANCELLED';
  runJson.tasks = orcRun.tasks as unknown[];
  runJson.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    runJsonPath(basePath || process.cwd(), runId),
    JSON.stringify(runJson, null, 2),
  );

  return runResultFromOrchestration(orcRun, storedReceipts, 'CANCELLED');
}
