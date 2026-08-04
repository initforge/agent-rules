import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compileIntent } from './intent-compiler.js';
import { compilePlan, validatePlan } from './plan-compiler.js';
import type { CompiledPlan } from './plan-compiler.js';
import {
  createRun as createOrchestrationRun,
  getNextReadyTasks,
  assignTask,
  completeTask,
  cancelRun as orchestratorCancelRun,
  validateWorkerReceipt,
} from './orchestrator.js';
import type { OrchestrationRun, TaskState, DelegationReceipt } from './orchestrator.js';
import { DurableStore, RUN_LOCKED_ERROR, RUN_ACTIVE_ERROR, type Checkpoint as DurableCheckpoint, type Receipt as DurableReceipt } from './durable-store.js';
import type { RunState } from './durable-store.js';
import { adapterRegistry, type AdapterName } from '../adapters/registry.js';
import type { WorkerAdapter } from '../adapters/registry.js';
// Engine facade integration for event-delta, artifact-broker, checkpoint wiring
import { createExecutionFacade } from '@initforge/agent-rules-engine/execution-facade';
import type { Checkpoint as EngineCheckpoint, CursorPosition, CapsuleState, CommittedDecision } from '@initforge/agent-rules-engine/checkpoint-resume';

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

/**
 * runExecutionRuntime — wire adapter through registry; fail closed on unknown.
 * Returns configured adapter instance. Persist handle before await callers.
 */
export function runExecutionRuntime(params: {
  adapterName: AdapterName;
  orcRun: OrchestrationRun;
  basePath: string;
  store: DurableStore;
}): WorkerAdapter {
  const { adapterName } = params;

  // Fail closed: unknown adapter throws before any async work.
  if (!adapterRegistry.has(adapterName)) {
    throw new Error(`Unknown adapter: ${adapterName}. Supported: ${adapterRegistry.available().join(', ')}`);
  }

  return adapterRegistry.get(adapterName);
}

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

/**
 * buildEngineCheckpoint — convert durable-store checkpoint to engine Checkpoint format.
 * Decisions are derived from completedTaskIds (one per completed task).
 * This enables facade validation on checkpoints written by DurableStore.
 */
function buildEngineCheckpoint(durableCp: DurableCheckpoint, planId: string, runId: string): EngineCheckpoint {
  const completedAt = durableCp.createdAt;
  const epoch = new Date(completedAt).getTime() || 0;

  // Derive decisions from completed task IDs
  const decisions: CommittedDecision[] = durableCp.completedTaskIds.map((taskId) => {
    const decision = JSON.stringify({ taskId, result: 'pass' });
    const rationale = 'task completed from durable-store checkpoint';
    const commitSha256 = createHash('sha256')
      .update(new TextEncoder().encode(JSON.stringify({ decisionId: taskId, decision, rationale, committedAt: completedAt })))
      .digest('hex');
    return Object.freeze({ decisionId: taskId, decision, rationale, committedAt: completedAt, commitSha256 });
  });

  const cursor: CursorPosition = Object.freeze({
    planId,
    runId,
    epoch,
    taskId: durableCp.completedTaskIds.at(-1) ?? 'start',
    attemptCount: 0,
    completedTaskIds: Object.freeze([...durableCp.completedTaskIds]),
    failedTaskIds: Object.freeze([]),
    skippedTaskIds: Object.freeze([]),
  });

  const capsule: CapsuleState = Object.freeze({
    planId,
    runId,
    epoch,
    decisions: Object.freeze(decisions),
    pendingClaims: Object.freeze([]),
    pendingEvidence: Object.freeze([]),
    activeWorkers: Object.freeze([]),
    mode: 'EXECUTION',
  });

  // Compute checkpoint SHA256
  const rawCheckpoint = {
    trigger: 'crash_recovery' as const,
    cursor,
    capsule,
    createdAt: completedAt,
    previousCheckpointId: null,
  };
  const checkpointSha256 = createHash('sha256')
    .update(new TextEncoder().encode(JSON.stringify(rawCheckpoint)))
    .digest('hex');

  const checkpointId = `ckpt-${Date.now()}-${createHash('sha256').update(JSON.stringify({ cursor, capsule })).digest('hex').slice(0, 8)}`;

  return Object.freeze({
    checkpointId,
    checkpointSha256,
    trigger: 'crash_recovery',
    cursor,
    capsule,
    createdAt: completedAt,
    previousCheckpointId: null,
  });
}

/**
 * Safe cast: durable-store Receipt (open shape) → DelegationReceipt.
 * Drops receipts that lack required DelegationReceipt fields at runtime.
 * ponytail: add `strict: true` flag to reject partial receipts when schema is stable.
 */
function toDelegationReceipts(receipts: DurableReceipt[]): DelegationReceipt[] {
  const result: DelegationReceipt[] = [];
  for (const r of receipts) {
    const d = r as unknown as DelegationReceipt;
    if (
      typeof d.taskId === 'string' &&
      typeof d.status === 'string' &&
      Array.isArray(d.filesChanged) &&
      Array.isArray(d.commandsRun) &&
      Array.isArray(d.testsRun) &&
      Array.isArray(d.assumptions) &&
      Array.isArray(d.unresolvedFindings) &&
      Array.isArray(d.evidencePaths) &&
      typeof d.retries === 'number'
    ) {
      result.push(d);
    }
  }
  return result;
}

/**
 * rebuildOrchestrationFromRun — rebuild OrchestrationRun from checkpoint data.
 * IMP-003: uses restored checkpoint tasks as base to preserve assignment/retryCount metadata.
 * Tasks with receipts get COMPLETED state; stale RUNNING tasks (from durable-store fix)
 * get PENDING state for retry. Tasks without receipts or RUNNING state stay as-is.
 */
function rebuildOrchestrationFromRun(
  plan: CompiledPlan,
  runId: string,
  receipts: DelegationReceipt[],
  restoredTasks?: unknown[], // IMP-003: checkpoint tasks with full TaskState metadata
): OrchestrationRun {
  const orcRun = createOrchestrationRun(plan);
  orcRun.runId = runId;

  // IMP-003: use restored tasks as base to preserve assignment/retryCount/worker/model/effort.
  // The durable-store resume() already converts stale RUNNING → PENDING.
  if (restoredTasks && restoredTasks.length > 0) {
    const restored = restoredTasks as TaskState[];
    for (let i = 0; i < orcRun.tasks.length; i++) {
      const planTask = orcRun.tasks[i]!;
      const cpTask = restored.find(t => t.taskId === planTask.taskId);
      if (cpTask) {
        // Preserve metadata that plan-derived tasks lack
        planTask.retryCount = cpTask.retryCount;
        planTask.worker = cpTask.worker;
        planTask.model = cpTask.model;
        planTask.effort = cpTask.effort;
        planTask.error = cpTask.error;
        // IMP-003: stale RUNNING → PENDING already done by durable-store resume().
        // Set state from checkpoint (could be PENDING, COMPLETED, FAILED, BLOCKED, etc.)
        planTask.state = cpTask.state;
        // Restore receipt if present (for completed tasks)
        if (cpTask.receipt) {
          planTask.receipt = cpTask.receipt;
        }
        if (cpTask.verificationResult) {
          planTask.verificationResult = cpTask.verificationResult;
        }
        if (cpTask.assignment) {
          planTask.assignment = cpTask.assignment;
        }
      }
    }
  }

  // Apply receipts on top (may override state for completed tasks)
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

// BUG-3: receipt-state hardening — a run may only reach COMPLETED when every
// task is COMPLETED, every receipt carries PASS (or no receipt is needed by
// policy), and no PARTIAL/FAIL verdict exists on any receipt, regardless of
// completion_policy settings.
export function computeFinalState(
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

    // Receipt-status hardening: PARTIAL/FAIL verdicts are hard failures no
    // matter what task.state says (state may have been coerced by tampering
    // or a future completeTask regression).
    if (t.receipt && (t.receipt.status === 'PARTIAL' || t.receipt.status === 'FAIL')) {
      hasFailed = true;
    }
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
      // Hardened validation when assignment available (live execution)
      if (t.assignment) {
        const validation = validateWorkerReceipt(receipt, t.assignment);
        if (!validation.valid) {
          return { state: 'FAILED', reason: `Task ${t.taskId} receipt validation failed: ${validation.errors.join('; ')}` };
        }
        if (validation.fakePassDetected) {
          return { state: 'FAILED', reason: `Task ${t.taskId} FABRICATED PASS rejected` };
        }
      } else {
        // Backward compat for stored receipts without assignment
        const hasEvidence = receipt.evidencePaths.length > 0;
        const hasCommand = receipt.commandsRun.length > 0;
        const hasExit = receipt.exitCodes !== undefined && receipt.exitCodes.length > 0 && receipt.exitCodes.every(c => c === 0);
        const hasDiffs = receipt.diffHashes !== undefined && Object.keys(receipt.diffHashes).length > 0;
        if (!hasEvidence && !hasCommand && !hasExit && !hasDiffs) {
          return { state: 'FAILED', reason: `Task ${t.taskId} FABRICATED PASS rejected` };
        }
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
  // F5: single try/finally covering dry-run return, adapter validation and
  // error paths so the createRun lock is always released exactly once.
  try {
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

    // runExecutionRuntime: wire through adapter registry; fail closed on unknown.
    const adapterName = options?.adapter ?? 'local-worker';
    const adapter = runExecutionRuntime({
      adapterName: adapterName as AdapterName,
      orcRun,
      basePath,
      store,
    });
    const receipts: DelegationReceipt[] = [];

    // Persist handle before await — adapter ref stored before any async.
    const adapterHandle = adapter;
    store.registerProcess(runId);

    while (true) {
      const readyTasks = getNextReadyTasks(orcRun);
      if (readyTasks.length === 0) break;

      // Execute independent ready tasks concurrently with Promise.all, honoring per-task errors
      const batchResults = await Promise.all(
        readyTasks.map(async (task) => {
          assignTask(orcRun, task.taskId, adapterName, basePath);

          let receipt: DelegationReceipt;
          try {
            receipt = await adapterHandle.submitAssignment(task.assignment!);
          } catch (err) {
            receipt = {
              taskId: task.taskId,
              filesChanged: [],
              commandsRun: [],
              exitCodes: [],
              testsRun: [],
              evidencePaths: [],
              diffHashes: {},
              status: 'FAIL',
              retries: 0,
              assumptions: [],
              unresolvedFindings: [(err as Error).message],
            };
          }
          return receipt;
        }),
      );

      // Process results sequentially for state consistency
      for (let i = 0; i < readyTasks.length; i++) {
        const task = readyTasks[i];
        const receipt = batchResults[i]!;
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

  // Engine checkpoint validation via execution facade
  const plan = durableRun.plan as CompiledPlan;
  const storedReceipts = toDelegationReceipts(durableRun.receipts ?? []);
  // IMP-003: pass restored tasks to preserve assignment/retryCount metadata
  const orcRun = rebuildOrchestrationFromRun(plan, runId, storedReceipts, durableRun.tasks);

  // ponytail: planId from intent hash (no explicit planId in CompiledPlan)
  const planId = (plan as CompiledPlan & { planId?: string }).planId
    ?? plan.intent_reference?.hash?.slice(0, 16)
    ?? runId;

  // Load the latest verified checkpoint from checkpoints/ dir (tamper-proof, not checkpoint.json).
  // Verified before facade creation so the facade can bind to the checkpoint's own epoch
  // (checkpoint createdAt ms, see buildEngineCheckpoint). Binding to Date.now() instead makes
  // identity binding reject every genuinely interrupted run on sub-ms drift — the resume
  // completion regression this restores.
  const cpDir = path.join(basePath, '.agent', 'runs', runId, 'checkpoints');
  let resumeCp: DurableCheckpoint | null = null;
  if (fs.existsSync(cpDir)) {
    const cpFiles = fs.readdirSync(cpDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    if (cpFiles.length > 0) {
      const latestCpFile = cpFiles[cpFiles.length - 1]!;
      // Use verified read (matches GAP-3 tamper detection from durable-store)
      const m = latestCpFile.match(/^checkpoint-(.+)-([0-9a-f]{16})\.json$/);
      if (!m) {
        await store.updateError(runId, 'checkpoint tamper detected: invalid filename');
        await store.updateState(runId, 'FAILED');
        return { runId: durableRun.runId, state: 'FAILED', receipts: durableRun.receipts, tasks: durableRun.tasks, createdAt: durableRun.createdAt, updatedAt: durableRun.updatedAt, error: 'checkpoint tamper detected' };
      }
      const content = fs.readFileSync(path.join(cpDir, latestCpFile), 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      if (hash !== m[2]) {
        await store.updateError(runId, 'checkpoint tamper detected: hash mismatch');
        await store.updateState(runId, 'FAILED');
        return { runId: durableRun.runId, state: 'FAILED', receipts: durableRun.receipts, tasks: durableRun.tasks, createdAt: durableRun.createdAt, updatedAt: durableRun.updatedAt, error: 'checkpoint tamper detected' };
      }
      resumeCp = JSON.parse(content) as DurableCheckpoint;
    }
  }

  if (resumeCp) {
    const engineCp = buildEngineCheckpoint(resumeCp, planId, runId);
    // Engine facade for checkpoint validation + restoration. candidateEpoch must equal the
    // checkpoint's epoch (buildEngineCheckpoint derives it from createdAt) so identity binding
    // (planId/runId/epoch) passes on genuine interrupted runs; foreign checkpoints still fail.
    const engineFacade = createExecutionFacade({
      planId,
      runId,
      baseDir: basePath,
      candidateEpoch: engineCp.cursor.epoch,
    });
    const restoreResult = engineFacade.restoreFromCheckpoint(engineCp);
    if (!restoreResult.valid) {
      await store.updateError(runId, `Checkpoint identity binding failed: ${restoreResult.errors.join('; ')}`);
      await store.updateState(runId, 'FAILED');
      return {
        runId: durableRun.runId,
        state: 'FAILED',
        receipts: durableRun.receipts,
        tasks: durableRun.tasks,
        createdAt: durableRun.createdAt,
        updatedAt: durableRun.updatedAt,
        error: `Checkpoint identity binding failed: ${restoreResult.errors.join('; ')}`,
      };
    }
    console.error(`[engine-facade] Checkpoint restored. Wake reason: ${restoreResult.wakeDecision.reason}, confidence: ${restoreResult.wakeDecision.confidence}`);
  }

  syncTasksToStore(basePath, runId, orcRun.tasks);
  if (durableRun.state !== 'EXECUTING') {
    await store.updateState(runId, 'EXECUTING');
  }

  const allReceipts = [...storedReceipts];
  const adapterName = options?.adapter ?? 'local-worker';
  const adapter = runExecutionRuntime({
    adapterName: adapterName as AdapterName,
    orcRun,
    basePath,
    store,
  });

  // Persist handle before await — adapter ref stored before any async.
  const adapterHandle = adapter;
  store.acquireLock(runId);
  store.registerProcess(runId);

  try {
    while (true) {
      const readyTasks = getNextReadyTasks(orcRun);
      if (readyTasks.length === 0) break;

      // Execute independent ready tasks concurrently with Promise.all, honoring per-task errors
      const batchResults = await Promise.all(
        readyTasks.map(async (task) => {
          assignTask(orcRun, task.taskId, adapterName, basePath);

          let receipt: DelegationReceipt;
          try {
            receipt = await adapterHandle.submitAssignment(task.assignment!);
          } catch (err) {
            receipt = {
              taskId: task.taskId,
              filesChanged: [],
              commandsRun: [],
              exitCodes: [],
              testsRun: [],
              evidencePaths: [],
              diffHashes: {},
              status: 'FAIL',
              retries: 0,
              assumptions: [],
              unresolvedFindings: [(err as Error).message],
            };
          }
          return receipt;
        }),
      );

      // Process results sequentially for state consistency
      for (let i = 0; i < readyTasks.length; i++) {
        const task = readyTasks[i];
        const receipt = batchResults[i]!;
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
  const storedReceipts = toDelegationReceipts(durableRun.receipts ?? []);
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
