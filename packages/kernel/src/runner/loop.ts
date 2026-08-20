import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { Journal, type JournalIdentity } from './journal.js';
import { TaskQueue, type QueuedTask } from './queue.js';
import type { BaselineGate } from './baseline-gate.js';
import { HeadlessExecutor, detectAgent, DEFAULT_TIMEOUT_MS, type AgentKind } from './headless-executor.js';
import { captureWorkingTreeDelta, snapshotWorkingTree, isDocOnly } from './diff.js';
import { SafeArgvRunner } from '../worker-adapter.js';
import { TelemetryCollector, DEFAULT_CONFIG, type TelemetryConfig } from '../telemetry.js';
import { createCheckpoint, createCommittedDecision, buildResumeContext, validateCheckpointIntegrity, type Checkpoint } from '../state/checkpoint-resume.js';
import type { CommandInvocation } from '../contracts.js';
import { VerificationEngine, type VerificationOutcome, type EvidenceRef } from './verifier.js';
import { liftVerification, type VerificationProfile } from './profile.js';
import { materializeMcpConfig, type McpConfigPaths } from './mcp-config.js';
import { resolveGitPath } from './platform.js';
import { deriveExecutionBudget, type ExecutionBudget } from './execution-policy.js';
import { TaskHeartbeat } from './heartbeat.js';
import { isCurrentExecution, staleExecutionReason, type ExecutionAuthority } from '../state/execution-authority.js';
import { bindAgentDriverReceipt, type AgentDriver } from './agent-driver.js';

export type { AgentKind };

/**
 * The runner loop.
 *
 * Two properties are the whole point:
 *
 * 1. **No model in the loop.** This is a plain Node process, so it has no context
 *    window to exhaust and nothing to compact. It can drive tasks for as long as the
 *    machine stays up. Each task's reasoning happens in a separate short-lived
 *    process (see headless-executor.ts).
 *
 * 2. **Bounded repair.** A failing task may be retried at most `maxRepairDepth` times,
 *    after which it becomes `needs-user` and mints nothing further. The previous
 *    protocol had no such bound — `grep maxRepairDepth` found nothing — so every
 *    review finding created a child task that itself required review, producing chains
 *    like `ASN-P1-R2 -> R2B -> R2C-A/B -> PARITY-V3-01 -> 01-R1 -> 01-R2` that could
 *    not terminate.
 *
 * All state is on disk (queue directories + hash-chained journal). Killing the runner
 * at any point loses nothing: `recoverAbandoned()` returns in-flight tasks to `ready`.
 */

export const DEFAULT_MAX_REPAIR_DEPTH = 2;

/** Stand-in commit hash for a task that settled without producing a diff. */
const EMPTY_SHA256 = '0'.repeat(64);

export interface RunnerConfig {
  /** Repo the agent operates in. */
  cwd: string;
  /** Queue root, e.g. `.agent/runs/<run-id>/queue`. */
  queueRoot: string;
  /** Hash-chained journal path. */
  journalPath: string;
  identity: JournalIdentity;
  agent: AgentKind;
  /** Optional managed/native host driver. Omit to use the portable headless process driver. */
  driver?: AgentDriver;
  maxRepairDepth?: number;
  taskTimeoutMs?: number;
  logDir?: string;
  permissionMode?: string;
  /** Stop after this many tasks. Undefined drains the queue. */
  maxTasks?: number;
  /** Persisted checkpoint file. Defaults to `<runRoot>/checkpoint.json`. */
  checkpointPath?: string;
  /** Extra fields recorded once in RUN_START, e.g. the git SHA the run began from. */
  runContext?: Record<string, unknown>;
  /**
   * Telemetry sink for analytics and OTLP export. Distinct from the journal: the
   * journal is a tamper-evident record of what happened, telemetry is aggregate
   * measurement. Both were present in the old engine; neither was ever written to,
   * which is why `.agent/trace.jsonl` held 3 records for the project's whole history.
   * Omit to use local JSONL under the queue root.
   */
  telemetry?: TelemetryConfig | false;
  /**
   * Override the argv used to launch the agent. Lets tests drive the real process
   * lifecycle against a harmless binary, and lets a host with a differently-named
   * binary be accommodated without patching the executor.
   */
  invocationOverride?: (prompt: string) => { executable: string; args: string[] };
  /** Skip the PATH probe. Only meaningful together with `invocationOverride`. */
  skipAgentDetection?: boolean;
  /** Fail closed when a worker deletes tests or introduces common verification-bypass constructs. */
  guardVerificationIntegrity?: boolean;
  /**
   * MCP integration IDs to materialise into the agent's per-task config.
   * Common values: `'playwright-mcp'`, `'chrome-devtools-mcp'`. When set,
   * the spawned agent will have those MCP servers available so it can drive
   * browser-based verification itself (no human opening Chrome needed).
   */
  mcpIntegrationIds?: readonly string[];
  /** Registry root, defaults to `<repo>/integrations`. */
  mcpRegistryRoot?: string;
  /** North-Star uses fail-closed MCP selection; legacy callers may retain tolerant discovery. */
  strictMcpIntegrations?: boolean;
  /** Optional preflight result used for scope-aware baseline scheduling. */
  baselineGate?: BaselineGate;
  /** Latest owner authority. When present, stale tasks/results fail closed. */
  executionAuthority?: () => ExecutionAuthority;
  /** Optional bounded context/retrieval hints injected only after a failed attempt. */
  repairPromptHints?: (task: QueuedTask, reason: string, exitCodes: number[]) => string[];
  /** Optional durable sink invoked after a task is settled/checkpointed. A throwing sink aborts the run fail-closed. */
  onTaskSettled?: (report: TaskReport) => void;
  /** F07/REQ-007: optional lane controller. Writer lane always serializes; the
   *  verifier lane gates the verification step. When omitted the legacy
   *  unconstrained behavior is preserved. */
  laneController?: {
    acquire(lane: 'writer' | 'verifier'): boolean;
    release(lane: 'writer' | 'verifier'): void;
  };
}

export type TaskOutcome = 'done' | 'failed' | 'needs-user';

export interface TaskReport {
  taskId: string;
  contractTaskId?: string;
  outcome: TaskOutcome;
  reason?: string;
  exitCode: number;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
  diffSha256: string | null;
  filesChanged: string[];
  verificationExitCodes: number[];
  verificationEvidence?: EvidenceRef[];
  verificationSteps?: Array<{ exitCode: number; durationMs: number; evidence: readonly EvidenceRef[]; diagnostic?: string }>;
  scopeViolations?: string[];
  policyViolations?: string[];
  executionClass?: ExecutionBudget['executionClass'];
  hardTimeoutMs?: number;
  termination?: 'natural' | 'graceful-stop' | 'forced-stop';
  cleanupConfirmed?: boolean;
  /** The worker finished after its owner generation became stale. */
  stale?: boolean;
}

export interface RunSummary {
  tasksProcessed: number;
  done: number;
  failed: number;
  needsUser: number;
  recovered: number;
  reports: TaskReport[];
}

function isPathOwned(file: string, ownedPaths: readonly string[], forbiddenPaths: readonly string[]): boolean {
  const normalized = file.replace(/\\/g, '/');
  const owned = ownedPaths.length === 0 || ownedPaths.some((scope) => {
    const normalizedScope = scope.replace(/\\/g, '/');
    return normalized === normalizedScope || normalized.startsWith(`${normalizedScope}/`);
  });
  const forbidden = forbiddenPaths.some((scope) => {
    const normalizedScope = scope.replace(/\\/g, '/');
    return normalized === normalizedScope || normalized.startsWith(`${normalizedScope}/`);
  });
  return owned && !forbidden;
}

/**
 * Fingerprint the post-attempt state rather than the transition diff. A repeated
 * failure may produce no new diff on the second attempt, and an oscillating repair
 * can produce different transitions while returning to the same state (A -> B -> A).
 * Only hashes are retained; file contents never enter the journal fingerprint.
 */
function failureStateFingerprint(
  task: QueuedTask,
  workingTree: Record<string, string>,
  verificationExitCodes: readonly number[],
  diagnostics: string,
  excludedPaths: readonly string[],
): string {
  const state = Object.entries(workingTree)
    .filter(([file]) => !excludedPaths.some((scope) => {
      const normalizedScope = scope.replace(/\\/g, '/');
      const normalizedFile = file.replace(/\\/g, '/');
      return normalizedFile === normalizedScope || normalizedFile.startsWith(`${normalizedScope}/`);
    }))
    .filter(([file]) => isPathOwned(file, task.ownedPaths, task.forbiddenPaths ?? []))
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify({
    contractTaskId: task.contractTaskId ?? task.id,
    state,
    verificationExitCodes,
    diagnostics,
  })).digest('hex');
}

/** Parse a shell-ish verification string into argv without invoking a shell. */
export function parseCommand(command: string, cwd: string): CommandInvocation {
  // Deliberately no shell: splitting on whitespace means metacharacters cannot be
  // interpreted, and SafeArgvRunner rejects them outright rather than quoting around
  // the problem.
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('empty verification command');
  return { executable: parts[0], args: parts.slice(1), cwd };
}


type VerificationIntegritySnapshot = Record<string, string | null>;

const GUARDED_PATH = /(?:^|\/)(?:automation\/.*(?:verify|test)|(?:test|tests)\/|[^/]+\.(?:test|spec)\.[^/]+$)|(?:^|\/)(?:vitest|jest)[^/]*\.config\.[^/]+$|(?:^|\/)package\.json$/i;
const BYPASS_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'passWithNoTests', re: /--passWithNoTests\b/g },
  { label: 'disabled test (.skip)', re: /\b(?:it|test|describe)\.skip\s*\(/g },
  { label: 'focused test (.only)', re: /\b(?:it|test|describe)\.only\s*\(/g },
  { label: 'hard-disabled PowerShell gate', re: /if\s*\(\s*\$false\b/gi },
  { label: 'hard-disabled boolean gate', re: /if\s*\(\s*false\s*(?:&&|\))/gi },
  { label: 'commented throw gate', re: /^\s*(?:#|\/\/)\s*throw\b/gm },
];

function gitTrackedFiles(cwd: string): string[] {
  const git = resolveGitPath();
  if (!git) throw new Error('git is required for verification-integrity guard');
  const result = spawnSync(git, ['ls-files'], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ls-files failed while building verification-integrity guard: ${(result.stderr ?? '').trim()}`);
  return (result.stdout ?? '').split('\n').filter(Boolean);
}

function snapshotVerificationIntegrity(cwd: string): VerificationIntegritySnapshot {
  const out: VerificationIntegritySnapshot = {};
  for (const relative of gitTrackedFiles(cwd).filter((file) => GUARDED_PATH.test(file))) {
    const absolute = path.join(cwd, relative);
    out[relative] = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  }
  return out;
}

function countPattern(text: string | null | undefined, re: RegExp): number {
  if (!text) return 0;
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))].length;
}

function verificationIntegrityViolations(before: VerificationIntegritySnapshot, after: VerificationIntegritySnapshot): string[] {
  const violations: string[] = [];
  for (const file of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const prior = before[file];
    const next = after[file];
    if (prior === next) continue;
    if (prior !== undefined && prior !== null && (next === undefined || next === null)) {
      violations.push(`verification/test artifact deleted: ${file}`);
      continue;
    }
    for (const pattern of BYPASS_PATTERNS) {
      const delta = countPattern(next, pattern.re) - countPattern(prior, pattern.re);
      if (delta > 0) violations.push(`${pattern.label} introduced in ${file}`);
    }
  }
  return violations;
}

export class Runner {
  private readonly queue: TaskQueue;
  private readonly journal: Journal;
  private readonly executor: AgentDriver;
  private readonly telemetry: TelemetryCollector | null;
  private readonly maxRepairDepth: number;
  private lastCheckpoint: Checkpoint | null = null;
  private stopRequested = false;

  constructor(private readonly config: RunnerConfig) {
    this.queue = new TaskQueue(config.queueRoot, config.baselineGate);
    this.journal = new Journal(config.journalPath, config.identity);
    this.maxRepairDepth = config.maxRepairDepth ?? DEFAULT_MAX_REPAIR_DEPTH;
    this.telemetry =
      config.telemetry === false
        ? null
        : new TelemetryCollector(
            config.telemetry ?? DEFAULT_CONFIG,
            path.join(config.queueRoot, '..', 'telemetry.jsonl')
          );
    this.executor = config.driver ?? new HeadlessExecutor({
      kind: config.agent,
      cwd: config.cwd,
      timeoutMs: config.taskTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      logDir: config.logDir ?? path.join(config.queueRoot, '..', 'logs'),
      permissionMode: config.permissionMode,
      invocationOverride: config.invocationOverride,
    });

    this.lastCheckpoint = this.loadCheckpoint();
  }

  /**
   * Materialise MCP config for one task into `<runRoot>/mcp/<taskId>/`.
   * Returns `undefined` if no MCP integrations are configured, so the
   * executor falls back to a plain agent invocation with no MCP servers.
   */
  private mcpConfigForTask(task: QueuedTask): import('./mcp-config.js').McpConfigPaths | undefined {
    const ids = task.mcpIntegrationIds ?? this.config.mcpIntegrationIds;
    if (!ids || ids.length === 0) return undefined;
    const registryRoot =
      this.config.mcpRegistryRoot ??
      path.join(this.config.cwd, 'integrations');
    const outDir = path.join(
      this.config.logDir ?? path.join(this.config.queueRoot, '..', 'logs'),
      'mcp',
      task.id,
    );
    const materialized = materializeMcpConfig(outDir, {
      registryRoot,
      integrationIds: ids,
      allowRemoteMcp: task.mcpAllowRemote === true,
    });
    if (this.config.strictMcpIntegrations && materialized.missing.length > 0) {
      throw new Error(`task ${task.id} requested unavailable MCP integration(s): ${materialized.missing.join(', ')}`);
    }
    return materialized;
  }

  /** Cooperative stop: finishes the current task, then returns. */
  requestStop(): void {
    this.stopRequested = true;
  }

  get tasks(): TaskQueue {
    return this.queue;
  }

  /**
   * Paths the runner itself writes, relative to the repo, so they can be excluded
   * from a task's diff. The runner's bookkeeping is not the task's work product.
   */
  private runnerOwnedPaths(): string[] {
    const candidates = [
      this.config.queueRoot,
      this.config.journalPath,
      this.config.logDir ?? path.join(this.config.queueRoot, '..', 'logs'),
      path.join(this.config.queueRoot, '..', 'heartbeats'),
      path.join(this.config.queueRoot, '..', 'telemetry.jsonl'),
      path.join(this.config.queueRoot, '..', 'checkpoint.json'),
    ];
    return candidates
      .map((p) => path.relative(this.config.cwd, p))
      // Anything outside the repo needs no exclusion, and a `..` path is not a valid
      // git pathspec.
      .filter((rel) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel));
  }

  /** Drain the queue. Returns when it is empty, `maxTasks` is hit, or stop is requested. */
  private runLockDir(): string {
    return path.join(this.config.queueRoot, '.runner.lock');
  }

  private acquireRunLock(): void {
    const lock = this.runLockDir();
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    try {
      const owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')) as { pid?: number };
      if (typeof owner.pid === 'number') {
        try {
          process.kill(owner.pid, 0);
          throw new Error(`runner already active with pid ${owner.pid}`);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('runner already active')) throw error;
          const code = (error as NodeJS.ErrnoException).code;
          // ESRCH is the only positive evidence that the owner is gone. EPERM means
          // the process exists but this user cannot signal it, so the lock is live.
          if (code === 'EPERM') throw new Error(`runner already active with pid ${owner.pid}`);
          if (code !== 'ESRCH') throw error;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('runner already active')) throw error;
    }
    fs.rmSync(lock, { recursive: true, force: true });
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), recovered: true })}\n`, { mode: 0o600 });
  }

  private releaseRunLock(): void {
    fs.rmSync(this.runLockDir(), { recursive: true, force: true });
  }

  async run(): Promise<RunSummary> {
    this.acquireRunLock();
    try {
      return await this.runExclusive();
    } finally {
      this.releaseRunLock();
    }
  }

  private async runExclusive(): Promise<RunSummary> {
    // Fail fast and loudly: a runner with no agent silently doing nothing is exactly
    // the failure mode this whole subsystem was built to eliminate.
    let agentVersion: string | undefined;
    if (!this.config.skipAgentDetection) {
      const detection = await detectAgent(this.config.agent);
      if (!detection.available) {
        throw new Error(
          `agent CLI "${this.config.agent}" is not available on PATH — the runner cannot execute tasks without it`
        );
      }
      agentVersion = detection.version;
    }

    const runStartedAt = Date.now();
    const authority = this.config.executionAuthority?.();
    const recovered = this.queue.recoverAbandoned(false, authority);
    if (recovered.length > 0) {
      this.journal.append('RUN_RECOVERED', {
        tasks: recovered.map((t) => t.id),
        note: 'previous runner exited with tasks in flight',
      });
    }

    this.journal.append('RUN_START', {
      agent: this.config.agent,
      agentVersion,
      host: os.hostname(),
      maxRepairDepth: this.maxRepairDepth,
      pending: this.queue.counts().ready,
      ...this.config.runContext,
    });
    this.telemetry?.record({
      kind: 'run_start',
      runId: this.config.identity.plan,
      planId: this.config.identity.plan,
      host: os.hostname(),
      model: this.config.agent,
      effort: `max-repair-depth=${this.maxRepairDepth}`,
    });

    const summary: RunSummary = {
      tasksProcessed: 0,
      done: 0,
      failed: 0,
      needsUser: 0,
      recovered: recovered.length,
      reports: [],
    };

    for (;;) {
      if (this.stopRequested) break;
      if (this.config.maxTasks !== undefined && summary.tasksProcessed >= this.config.maxTasks) break;

      const task = this.queue.claim(this.config.executionAuthority?.());
      if (!task) break;

      const report = await this.runTask(task);
      summary.reports.push(report);
      summary.tasksProcessed += 1;
      if (report.outcome === 'done') summary.done += 1;
      else if (report.outcome === 'failed') summary.failed += 1;
      else summary.needsUser += 1;
    }

    this.journal.append('RUN_END', {
      tasksProcessed: summary.tasksProcessed,
      done: summary.done,
      failed: summary.failed,
      needsUser: summary.needsUser,
    });
    this.telemetry?.record({
      kind: 'run_end',
      runId: this.config.identity.plan,
      totalTokens: 0, // headless CLIs do not report token counts on stdout
      totalCost: 0,
      durationMs: Date.now() - runStartedAt,
    });
    await this.telemetry?.flush();

    return summary;
  }

  private async runTask(task: QueuedTask): Promise<TaskReport> {
    this.journal.append('TASK_START', {
      taskId: task.id,
      requirementId: task.requirementId,
      repairDepth: task.repairDepth,
      parentId: task.parentId,
    });
    this.telemetry?.record({ kind: 'task_start', taskId: task.id, assignmentId: task.id });

    const dependency = this.queue.dependencyState(task);
    if (dependency.blocked.length > 0) {
      this.journal.append('DEPENDENCY_BLOCKED', { taskId: task.id, contractTaskId: task.contractTaskId, blockedBy: dependency.blocked });
      return this.settle(task, {
        taskId: task.id, contractTaskId: task.contractTaskId, outcome: 'needs-user',
        reason: `dependency contract task(s) require user: ${dependency.blocked.join(', ')}`,
        exitCode: -1, durationMs: 0, stdoutPath: '', stderrPath: '', stdoutSha256: EMPTY_SHA256, stderrSha256: EMPTY_SHA256,
        diffSha256: null, verificationExitCodes: [], filesChanged: [], scopeViolations: [], policyViolations: [], verificationSteps: [],
      });
    }
    if (dependency.pending.length > 0) {
      // claim() never hands out pending work. Seeing it here means the durable queue changed
      // between preview and claim; fail closed instead of executing out of dependency order.
      throw new Error(`task ${task.id} was claimed with pending dependency contract task(s): ${dependency.pending.join(', ')}`);
    }
    if (dependency.baselineBlocked !== null) {
      this.journal.append('BASELINE_BLOCKED', {
        taskId: task.id,
        contractTaskId: task.contractTaskId,
        reason: dependency.baselineBlocked,
      });
      return this.settle(task, {
        taskId: task.id, contractTaskId: task.contractTaskId, outcome: 'needs-user',
        reason: dependency.baselineBlocked,
        exitCode: -2, durationMs: 0, stdoutPath: '', stderrPath: '', stdoutSha256: EMPTY_SHA256, stderrSha256: EMPTY_SHA256,
        diffSha256: null, verificationExitCodes: [], filesChanged: [], scopeViolations: [], policyViolations: [], verificationSteps: [],
      });
    }

    // Materialise MCP config per task so two concurrent tasks cannot race on
    // a shared browser profile / cookie jar. Returns undefined when the
    // runner was started without MCP integrations, in which case the agent
    // runs plain with no MCP servers available.
    const mcpConfig = this.mcpConfigForTask(task);
    const budget = deriveExecutionBudget(task, this.config.taskTimeoutMs);
    const heartbeat = new TaskHeartbeat(
      path.join(this.config.queueRoot, '..', 'heartbeats', `${task.id}.json`),
      {
        taskId: task.id,
        attempt: task.repairDepth + 1,
        phase: 'worker',
        softTimeoutMs: budget.softTimeoutMs,
        hardTimeoutMs: budget.hardTimeoutMs,
        intervalMs: budget.heartbeatIntervalMs,
        executionClass: budget.executionClass,
      },
    );
    heartbeat.start();
    const integrityBefore = this.config.guardVerificationIntegrity ? snapshotVerificationIntegrity(this.config.cwd) : null;
    const before = snapshotWorkingTree(this.config.cwd, this.runnerOwnedPaths());
    const execution = await this.executor.execute(task, mcpConfig, budget);
    this.journal.append('AGENT_DRIVER_RECEIPT', bindAgentDriverReceipt(task, execution, this.executor.host()));
    heartbeat.finish(execution.timedOut ? 'TIMED_OUT' : execution.exitCode === 0 ? 'COMPLETED' : 'FAILED', execution.timedOut ? `worker exceeded hard deadline ${budget.hardTimeoutMs}ms` : undefined);
    const after = snapshotWorkingTree(this.config.cwd, this.runnerOwnedPaths());
    const diff = captureWorkingTreeDelta(before, after, task.ownedPaths, task.forbiddenPaths ?? []);
    const integrityAfter = integrityBefore ? snapshotVerificationIntegrity(this.config.cwd) : null;
    const policyViolations = integrityBefore && integrityAfter ? verificationIntegrityViolations(integrityBefore, integrityAfter) : [];

    this.journal.append('AGENT_EXIT', {
      taskId: task.id,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      executionClass: budget.executionClass,
      softTimeoutMs: budget.softTimeoutMs,
      hardTimeoutMs: budget.hardTimeoutMs,
      termination: execution.termination,
      cleanupConfirmed: execution.cleanupConfirmed,
      durationMs: execution.durationMs,
      stdoutSha256: execution.stdoutSha256,
      stderrSha256: execution.stderrSha256,
      // Pointers, not content: transcripts stay on disk.
      stdoutPath: path.relative(this.config.cwd, execution.stdoutPath),
      stderrPath: path.relative(this.config.cwd, execution.stderrPath),
      diffSha256: diff.diffSha256,
      diffBytes: diff.diffBytes,
      filesChanged: diff.filesChanged,
      ownershipViolations: diff.ownershipViolations,
      policyViolations,
    });

    if (diff.ownershipViolations.length > 0 || policyViolations.length > 0) {
      if (diff.ownershipViolations.length) this.journal.append('SCOPE_VIOLATION', { taskId: task.id, paths: diff.ownershipViolations });
      if (policyViolations.length) this.journal.append('POLICY_VIOLATION', { taskId: task.id, violations: policyViolations });
      const report: TaskReport = {
        taskId: task.id,
        contractTaskId: task.contractTaskId,
        outcome: 'needs-user',
        reason: [diff.ownershipViolations.length ? `forbidden scope change(s): ${diff.ownershipViolations.join(', ')}` : '', policyViolations.length ? `verification integrity violation(s): ${policyViolations.join('; ')}` : ''].filter(Boolean).join('; '),
        exitCode: execution.exitCode,
        durationMs: execution.durationMs,
        stdoutPath: path.relative(this.config.cwd, execution.stdoutPath),
        stderrPath: path.relative(this.config.cwd, execution.stderrPath),
        stdoutSha256: execution.stdoutSha256,
        stderrSha256: execution.stderrSha256,
        diffSha256: diff.diffSha256,
        filesChanged: diff.filesChanged,
        verificationExitCodes: [],
        scopeViolations: diff.ownershipViolations,
        policyViolations,
        executionClass: budget.executionClass,
        hardTimeoutMs: budget.hardTimeoutMs,
        termination: execution.termination,
        cleanupConfirmed: execution.cleanupConfirmed,
      };
      return this.settle(task, report);
    }

    heartbeat.phase('verification', budget.softTimeoutMs, budget.hardTimeoutMs, budget.executionClass);
    // F07/REQ-007: the verifier lane gates the verification step; released in
    // finally so a failure can never leak the slot.
    const lane = this.config.laneController;
    const verifierAcquired = lane ? lane.acquire('verifier') : true;
    let verificationResult: { codes: number[]; evidence: EvidenceRef[]; outcome: VerificationOutcome };
    try {
      verificationResult = await this.verify(task, budget.hardTimeoutMs);
    } finally {
      if (lane && verifierAcquired) lane.release('verifier');
    }
    const { codes: verificationExitCodes, evidence, outcome } = verificationResult;
    heartbeat.finish(verificationExitCodes.length > 0 && verificationExitCodes.every((code) => code === 0) ? 'COMPLETED' : 'FAILED');
    const allPassed = verificationExitCodes.length > 0 && verificationExitCodes.every((c) => c === 0);

    this.journal.append('VERIFICATION', {
      taskId: task.id,
      commands: task.verification,
      exitCodes: verificationExitCodes,
      passed: allPassed,
      evidence: evidence.map((e) => ({ kind: e.kind, path: e.path, sha256: e.sha256 })),
    });

    // Emit a `live_verify` telemetry event per non-shell step so the
    // dashboard can render screenshots / console / mcp-response refs as
    // they happen. Pure shell tasks are already covered by the existing
    // `verification` event above.
    // AM-0005: runner-emitted observations are real executions through the
    // built runtime and are labeled NATIVE_SMOKE_VERIFIED — never LIVE_OBSERVED.
    // Live stages require explicit owner/evidence labeling, not runner prose.
    for (const step of outcome.stepResults) {
      if (step.step.kind === 'shell') continue;
      const stepEvidence = step.evidence.map((e) => e.path);
      this.telemetry?.record({
        kind: 'live_verify',
        taskId: task.id,
        profileKind: step.step.kind,
        result: step.exitCode === 0 ? 'PASS' : 'FAIL',
        evidence: stepEvidence,
        durationMs: step.durationMs,
        evidenceStage: 'NATIVE_SMOKE_VERIFIED',
        evidenceRefs: stepEvidence,
      });
    }
    this.telemetry?.record({
      kind: 'verification',
      assignmentId: task.id,
      result: allPassed ? 'PASS' : 'FAIL',
      evidenceStage: allPassed ? 'NATIVE_SMOKE_VERIFIED' : 'TEST_VERIFIED',
      evidenceRefs: evidence.map((e) => e.path),
    });

    const base: Omit<TaskReport, 'outcome' | 'reason'> = {
      taskId: task.id,
      contractTaskId: task.contractTaskId,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      stdoutPath: path.relative(this.config.cwd, execution.stdoutPath),
      stderrPath: path.relative(this.config.cwd, execution.stderrPath),
      stdoutSha256: execution.stdoutSha256,
      stderrSha256: execution.stderrSha256,
      diffSha256: diff.diffSha256,
      filesChanged: diff.filesChanged,
      verificationExitCodes,
      verificationEvidence: evidence,
      verificationSteps: outcome.stepResults.map((step) => ({ exitCode: step.exitCode, durationMs: step.durationMs, evidence: step.evidence, ...(step.diagnostic ? { diagnostic: step.diagnostic } : {}) })),
      executionClass: budget.executionClass,
      hardTimeoutMs: budget.hardTimeoutMs,
      termination: execution.termination,
      cleanupConfirmed: execution.cleanupConfirmed,
    };

    // A task claiming success while changing nothing is the failure mode the old
    // receipt validation existed to catch; keep catching it here.
    if (allPassed && diff.diffSha256 === null) {
      return this.settle(task, { ...base, outcome: 'failed', reason: 'verification passed but no diff was produced' });
    }
    if (allPassed && !task.allowDocOnly && isDocOnly(diff.filesChanged)) {
      return this.settle(task, { ...base, outcome: 'failed', reason: 'only documentation changed' });
    }
    if (allPassed) {
      return this.settle(task, { ...base, outcome: 'done' });
    }

    const failedDiagnostics = outcome.stepResults
      .filter((step) => step.exitCode !== 0 && step.diagnostic)
      .map((step) => step.diagnostic!)
      .join('\n---\n')
      .slice(0, 12_000);
    const reason = execution.timedOut
      ? `agent timed out after ${execution.durationMs}ms`
      : `verification failed (exit codes: ${verificationExitCodes.join(', ')})${failedDiagnostics ? `; diagnostics:\n${failedDiagnostics}` : ''}`;

    const contractTaskId = task.contractTaskId ?? task.id;
    const fingerprint = failureStateFingerprint(
      task,
      after,
      verificationExitCodes,
      failedDiagnostics,
      this.runnerOwnedPaths(),
    );
    const priorFingerprints = this.journal
      .ofType('FAILURE_FINGERPRINT')
      .filter((entry) => entry.data?.contractTaskId === contractTaskId)
      .map((entry) => String(entry.data?.fingerprint ?? ''))
      .filter(Boolean);
    const repeated = priorFingerprints.includes(fingerprint);
    const oscillating = priorFingerprints.length >= 2
      && priorFingerprints.at(-2) === fingerprint
      && priorFingerprints.at(-1) !== fingerprint;
    this.journal.append('FAILURE_FINGERPRINT', {
      taskId: task.id,
      contractTaskId,
      fingerprint,
      repairDepth: task.repairDepth,
      repeated,
      oscillating,
    });

    if (repeated || oscillating) {
      const stopReason = oscillating
        ? 'oscillating failure state detected (A -> B -> A)'
        : 'repeated unchanged failure state detected';
      this.journal.append('REPAIR_STOPPED', {
        taskId: task.id,
        contractTaskId,
        fingerprint,
        reason: stopReason,
      });
      return this.settle(task, {
        ...base,
        outcome: 'needs-user',
        reason: `${reason}; ${stopReason}; no unchanged replay minted`,
      });
    }

    // The bound. Beyond it the runner stops generating work and asks a human,
    // instead of minting another child that needs its own review.
    if (task.repairDepth >= this.maxRepairDepth) {
      this.journal.append('REPAIR_EXHAUSTED', {
        taskId: task.id,
        repairDepth: task.repairDepth,
        maxRepairDepth: this.maxRepairDepth,
        reason,
      });
      return this.settle(task, {
        ...base,
        outcome: 'needs-user',
        reason: `${reason}; repair depth ${task.repairDepth} reached limit ${this.maxRepairDepth}`,
      });
    }

    const repair = this.queue.add({
      prompt: this.repairPrompt(task, reason, verificationExitCodes),
      contractTaskId,
      verification: task.verification,
      verificationProfile: task.verificationProfile,
      ownedPaths: task.ownedPaths,
      forbiddenPaths: task.forbiddenPaths,
      allowDocOnly: task.allowDocOnly,
      repairDepth: task.repairDepth + 1,
      requirementId: task.requirementId,
      mcpIntegrationIds: task.mcpIntegrationIds,
      dependsOnContractTaskIds: task.dependsOnContractTaskIds,
      baselineGate: task.baselineGate,
      workId: task.workId,
      executionGeneration: task.executionGeneration,
      specRevision: task.specRevision,
      parentId: task.id,
    });
    this.journal.append('REPAIR_ENQUEUED', {
      taskId: task.id,
      repairTaskId: repair.id,
      repairDepth: repair.repairDepth,
      reason,
    });

    return this.settle(task, { ...base, outcome: 'failed', reason });
  }

  private settle(task: QueuedTask, report: TaskReport): TaskReport {
    let finalReport = report;
    const authority = this.config.executionAuthority?.();
    if (!report.stale && authority && task.workId && !isCurrentExecution({
      work_id: task.workId,
      execution_generation: task.executionGeneration ?? 0,
      spec_revision: task.specRevision,
    }, authority)) {
      finalReport = {
        ...report,
        outcome: 'needs-user',
        stale: true,
        reason: staleExecutionReason({
          work_id: task.workId,
          execution_generation: task.executionGeneration ?? 0,
          spec_revision: task.specRevision,
        }, authority),
      };
      this.queue.settle(task, 'superseded', finalReport.reason);
    } else {
      this.queue.settle(task, report.outcome, report.reason);
    }
    this.journal.append('TASK_END', {
      taskId: task.id,
      outcome: finalReport.outcome,
      reason: finalReport.reason,
      ...(finalReport.stale ? { disposition: 'STALE_RESULT' } : {}),
    });
    this.recordCheckpoint(task, finalReport);
    if (this.config.onTaskSettled && !finalReport.stale) {
      try {
        this.config.onTaskSettled(finalReport);
      } catch (error) {
        this.journal.append('REPORT_SINK_FAILED', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }
    return finalReport;
  }

  /**
   * Checkpoint after every settled task so a restarted runner can report where it was,
   * not merely that state exists. The queue already guarantees no work is lost; this
   * adds a human- and machine-readable position.
   */
  private recordCheckpoint(task: QueuedTask, report: TaskReport): void {
    const counts = this.queue.counts();
    try {
      this.lastCheckpoint = createCheckpoint(
        'task_complete',
        {
          planId: this.config.identity.plan,
          runId: String(this.config.runContext?.runId ?? this.config.identity.revision),
          // The runner is sequential, so there is exactly one epoch. The field exists
          // for the wave-based model this replaced.
          epoch: 0,
          taskId: task.id,
          attemptCount: task.repairDepth + 1,
          completedTaskIds: this.queue.list('done').map((x) => x.id),
          failedTaskIds: this.queue.list('failed').map((x) => x.id),
          skippedTaskIds: this.queue.list('needs-user').map((x) => x.id),
        },
        {
          planId: this.config.identity.plan,
          runId: String(this.config.runContext?.runId ?? this.config.identity.revision),
          epoch: 0,
          decisions: [
            ...(this.lastCheckpoint?.capsule.decisions ?? []),
            createCommittedDecision(
              task.id,
              JSON.stringify({ taskId: task.id, outcome: report.outcome, diffSha256: report.diffSha256 ?? EMPTY_SHA256 }),
              report.reason ?? 'all verification commands exited 0',
            ),
          ],
          pendingClaims: this.queue.list('ready').map((x) => x.id),
          pendingEvidence: [],
          // One task at a time by design; a pool is what removed the executor.
          activeWorkers: [],
          mode: `max-repair-depth=${this.maxRepairDepth}`,
        },
        this.lastCheckpoint?.checkpointId ?? null
      );
      this.persistCheckpoint(this.lastCheckpoint);
      this.journal.append('CHECKPOINT', {
        checkpointId: this.lastCheckpoint.checkpointId,
        taskId: task.id,
        remaining: counts.ready,
      });
    } catch (err) {
      // A checkpoint is an aid, not a gate: failing to build one must never lose a
      // settled task or halt an overnight run.
      this.journal.append('CHECKPOINT_FAILED', {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private checkpointFile(): string {
    return this.config.checkpointPath ?? path.join(this.config.queueRoot, '..', 'checkpoint.json');
  }

  private loadCheckpoint(): Checkpoint | null {
    const file = this.checkpointFile();
    if (!fs.existsSync(file)) return null;
    try {
      const checkpoint = JSON.parse(fs.readFileSync(file, 'utf8')) as Checkpoint;
      const validation = validateCheckpointIntegrity(checkpoint);
      if (!validation.valid) return null;
      return checkpoint;
    } catch {
      return null;
    }
  }

  private persistCheckpoint(checkpoint: Checkpoint): void {
    const file = this.checkpointFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  /** Where the last completed task left off, for resuming or reporting. */
  resumeContext(): ReturnType<typeof buildResumeContext> | null {
    return this.lastCheckpoint ? buildResumeContext(this.lastCheckpoint) : null;
  }

  /**
   * Run every verification step via VerificationEngine, returning one exit code
   * per step plus any evidence refs collected. Backward-compatible: a flat
   * `task.verification: string[]` is lifted into a single-shell-step profile
   * and the order of exit codes is preserved so the rest of the loop, the
   * repair prompt, and the journal event can stay unchanged.
   */
  private async verify(task: QueuedTask, timeoutMs?: number): Promise<{ codes: number[]; evidence: EvidenceRef[]; outcome: VerificationOutcome }> {
    let profile: VerificationProfile;
    try {
      profile = task.verificationProfile ?? liftVerification(task.verification);
    } catch (err) {
      this.journal.append('COMMAND_REJECTED', {
        taskId: task.id,
        reason: err instanceof Error ? err.message : String(err),
      });
      return { codes: [-1], evidence: [], outcome: { passed: false, stepResults: [], evidence: [], totalDurationMs: 0 } };
    }
    const engine = new VerificationEngine({
      cwd: this.config.cwd,
      evidenceDir: path.join(this.config.logDir ?? path.join(this.config.queueRoot, '..', 'logs'), 'evidence'),
      mcpRegistryRoot: this.config.mcpRegistryRoot,
      ...(timeoutMs ? { shellTimeoutMs: timeoutMs } : {}),
    });
    const outcome = await engine.evaluate(profile);
    const codes = outcome.stepResults.map((r) => r.exitCode);
    // Surface COMMAND_REJECTED entries for negative codes so the journal
    // contract stays the same; the verifier already recorded the underlying
    // rejection via SafeArgvRunner but the loop historically emitted its own.
    for (let i = 0; i < outcome.stepResults.length; i += 1) {
      const r = outcome.stepResults[i];
      if (r.exitCode === -1 && r.step.kind === 'shell') {
        this.journal.append('COMMAND_REJECTED', {
          taskId: task.id,
          command: r.step.command,
        });
      }
    }
    return { codes, evidence: [...outcome.evidence], outcome };
  }

  private repairPrompt(task: QueuedTask, reason: string, exitCodes: number[]): string {
    const failed = (task.verificationProfile?.steps.map((step) => step.kind === 'argv' ? `${step.executable} ${step.args.join(' ')}` : step.kind === 'shell' ? step.command : `[${step.kind}]`) ?? task.verification).filter((_, i) => exitCodes[i] !== 0);
    return [
      `A previous attempt at this task did not pass verification.`,
      ``,
      `Original task:`,
      task.prompt,
      ``,
      `Why it failed: ${reason}`,
      ``,
      failed.length > 0 ? `Commands that did not exit 0:\n${failed.map((c) => `  - ${c}`).join('\n')}` : '',
      ...(this.config.repairPromptHints?.(task, reason, exitCodes)?.length
        ? [``, `Targeted context requested by the harness:`, ...this.config.repairPromptHints(task, reason, exitCodes).map((hint) => `  - ${hint}`)]
        : []),
      ``,
      `Fix the cause. Do not weaken or skip the verification commands.`,
      ...(reason.includes('timed out') ? [
        `Adapt after the timeout: narrow the slice, use deterministic checks before high-fidelity tools, and do not repeat the same stalled action unchanged.`,
      ] : []),
      `This is repair attempt ${task.repairDepth + 1} of ${this.maxRepairDepth}; after that a human is asked.`,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }
}

/** Synchronous spawn for verification. Returns 127 when the executable is missing. */
function runSyncExitCode(invocation: CommandInvocation): number {
  const res = spawnSync(invocation.executable, [...invocation.args], {
    cwd: invocation.cwd,
    stdio: 'ignore',
    timeout: 10 * 60 * 1000,
    windowsHide: true,
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return 127;
  return res.status ?? -1;
}

/** Read a plan's requirements into runnable tasks. Used by the CLI. */
export function tasksFromRequirements(
  requirementsPath: string,
  ownedPaths: readonly string[]
): Array<Omit<QueuedTask, 'id' | 'createdAt'>> {
  const doc = parseYaml(fs.readFileSync(requirementsPath, 'utf8')) as {
    requirements?: Array<{ id: string; statement: string; status: string; verification?: string[] }>;
  };
  return (doc.requirements ?? [])
    .filter((r) => r.status === 'active' && (r.verification?.length ?? 0) > 0)
    .map((r) => ({
      prompt: `${r.statement}\n\nSatisfy this requirement (${r.id}). It passes only when every verification command exits 0.`,
      verification: r.verification ?? [],
      ownedPaths: [...ownedPaths],
      repairDepth: 0,
      requirementId: r.id,
    }));
}
