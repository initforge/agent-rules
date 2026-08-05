import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { Journal, type JournalIdentity } from './journal.js';
import { TaskQueue, type QueuedTask } from './queue.js';
import { HeadlessExecutor, detectAgent, DEFAULT_TIMEOUT_MS, type AgentKind } from './headless-executor.js';
import { captureDiff, isDocOnly } from './diff.js';
import { SafeArgvRunner } from '../worker-adapter.js';
import { TelemetryCollector, DEFAULT_CONFIG, type TelemetryConfig } from '../telemetry.js';
import { createCheckpoint, buildResumeContext, type Checkpoint } from '../checkpoint-resume.js';
import type { CommandInvocation } from '../contracts.js';
import { VerificationEngine, type VerificationOutcome, type EvidenceRef } from './verifier.js';
import { liftVerification, type VerificationProfile } from './profile.js';
import { materializeMcpConfig, type McpConfigPaths } from './mcp-config.js';

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
  maxRepairDepth?: number;
  taskTimeoutMs?: number;
  logDir?: string;
  permissionMode?: string;
  /** Stop after this many tasks. Undefined drains the queue. */
  maxTasks?: number;
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
  /**
   * MCP integration IDs to materialise into the agent's per-task config.
   * Common values: `'playwright-mcp'`, `'chrome-devtools-mcp'`. When set,
   * the spawned agent will have those MCP servers available so it can drive
   * browser-based verification itself (no human opening Chrome needed).
   */
  mcpIntegrationIds?: readonly string[];
  /** Registry root, defaults to `<repo>/integrations/required`. */
  mcpRegistryRoot?: string;
}

export type TaskOutcome = 'done' | 'failed' | 'needs-user';

export interface TaskReport {
  taskId: string;
  outcome: TaskOutcome;
  reason?: string;
  exitCode: number;
  durationMs: number;
  diffSha256: string | null;
  filesChanged: string[];
  verificationExitCodes: number[];
}

export interface RunSummary {
  tasksProcessed: number;
  done: number;
  failed: number;
  needsUser: number;
  recovered: number;
  reports: TaskReport[];
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

export class Runner {
  private readonly queue: TaskQueue;
  private readonly journal: Journal;
  private readonly executor: HeadlessExecutor;
  private readonly telemetry: TelemetryCollector | null;
  private readonly maxRepairDepth: number;
  private lastCheckpoint: Checkpoint | null = null;
  private stopRequested = false;

  constructor(private readonly config: RunnerConfig) {
    this.queue = new TaskQueue(config.queueRoot);
    this.journal = new Journal(config.journalPath, config.identity);
    this.maxRepairDepth = config.maxRepairDepth ?? DEFAULT_MAX_REPAIR_DEPTH;
    this.telemetry =
      config.telemetry === false
        ? null
        : new TelemetryCollector(
            config.telemetry ?? DEFAULT_CONFIG,
            path.join(config.queueRoot, '..', 'telemetry.jsonl')
          );
    this.executor = new HeadlessExecutor({
      kind: config.agent,
      cwd: config.cwd,
      timeoutMs: config.taskTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      logDir: config.logDir ?? path.join(config.queueRoot, '..', 'logs'),
      permissionMode: config.permissionMode,
      invocationOverride: config.invocationOverride,
    });
  }

  /**
   * Materialise MCP config for one task into `<runRoot>/mcp/<taskId>/`.
   * Returns `undefined` if no MCP integrations are configured, so the
   * executor falls back to a plain agent invocation with no MCP servers.
   */
  private mcpConfigForTask(taskId: string): import('./mcp-config.js').McpConfigPaths | undefined {
    const ids = this.config.mcpIntegrationIds;
    if (!ids || ids.length === 0) return undefined;
    const registryRoot =
      this.config.mcpRegistryRoot ??
      path.join(this.config.cwd, 'integrations', 'required');
    const outDir = path.join(
      this.config.logDir ?? path.join(this.config.queueRoot, '..', 'logs'),
      'mcp',
      taskId,
    );
    return materializeMcpConfig(outDir, {
      registryRoot,
      integrationIds: ids,
    });
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
    ];
    return candidates
      .map((p) => path.relative(this.config.cwd, p))
      // Anything outside the repo needs no exclusion, and a `..` path is not a valid
      // git pathspec.
      .filter((rel) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel));
  }

  /** Drain the queue. Returns when it is empty, `maxTasks` is hit, or stop is requested. */
  async run(): Promise<RunSummary> {
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
    const recovered = this.queue.recoverAbandoned();
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

      const task = this.queue.claim();
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

    // Materialise MCP config per task so two concurrent tasks cannot race on
    // a shared browser profile / cookie jar. Returns undefined when the
    // runner was started without MCP integrations, in which case the agent
    // runs plain with no MCP servers available.
    const mcpConfig = this.mcpConfigForTask(task.id);
    const execution = await this.executor.execute(task, mcpConfig);
    const diff = captureDiff(this.config.cwd, task.ownedPaths, this.runnerOwnedPaths());

    this.journal.append('AGENT_EXIT', {
      taskId: task.id,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      durationMs: execution.durationMs,
      stdoutSha256: execution.stdoutSha256,
      stderrSha256: execution.stderrSha256,
      // Pointer, not content: transcripts stay on disk.
      stdoutPath: path.relative(this.config.cwd, execution.stdoutPath),
      diffSha256: diff.diffSha256,
      diffBytes: diff.diffBytes,
      filesChanged: diff.filesChanged,
    });

    const { codes: verificationExitCodes, evidence } = await this.verify(task);
    const allPassed = verificationExitCodes.length > 0 && verificationExitCodes.every((c) => c === 0);

    this.journal.append('VERIFICATION', {
      taskId: task.id,
      commands: task.verification,
      exitCodes: verificationExitCodes,
      passed: allPassed,
      evidence: evidence.map((e) => ({ kind: e.kind, path: e.path, sha256: e.sha256 })),
    });
    this.telemetry?.record({
      kind: 'verification',
      assignmentId: task.id,
      result: allPassed ? 'PASS' : 'FAIL',
    });

    const base: Omit<TaskReport, 'outcome' | 'reason'> = {
      taskId: task.id,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      diffSha256: diff.diffSha256,
      filesChanged: diff.filesChanged,
      verificationExitCodes,
    };

    // A task claiming success while changing nothing is the failure mode the old
    // receipt validation existed to catch; keep catching it here.
    if (allPassed && diff.diffSha256 === null) {
      return this.settle(task, { ...base, outcome: 'failed', reason: 'verification passed but no diff was produced' });
    }
    if (allPassed && isDocOnly(diff.filesChanged)) {
      return this.settle(task, { ...base, outcome: 'failed', reason: 'only documentation changed' });
    }
    if (allPassed) {
      return this.settle(task, { ...base, outcome: 'done' });
    }

    const reason = execution.timedOut
      ? `agent timed out after ${execution.durationMs}ms`
      : `verification failed (exit codes: ${verificationExitCodes.join(', ')})`;

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
      verification: task.verification,
      ownedPaths: task.ownedPaths,
      repairDepth: task.repairDepth + 1,
      requirementId: task.requirementId,
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
    this.queue.settle(task, report.outcome, report.reason);
    this.journal.append('TASK_END', {
      taskId: task.id,
      outcome: report.outcome,
      reason: report.reason,
    });
    this.recordCheckpoint(task, report);
    return report;
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
          runId: this.config.identity.revision,
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
          runId: this.config.identity.revision,
          epoch: 0,
          decisions: [
            {
              decisionId: task.id,
              decision: report.outcome,
              rationale: report.reason ?? 'all verification commands exited 0',
              committedAt: new Date().toISOString(),
              commitSha256: (report.diffSha256 ?? EMPTY_SHA256) as never,
            },
          ],
          pendingClaims: this.queue.list('ready').map((x) => x.id),
          pendingEvidence: [],
          // One task at a time by design; a pool is what removed the executor.
          activeWorkers: [],
          mode: `max-repair-depth=${this.maxRepairDepth}`,
        },
        this.lastCheckpoint?.checkpointId ?? null
      );
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
  private async verify(task: QueuedTask): Promise<{ codes: number[]; evidence: EvidenceRef[]; outcome: VerificationOutcome }> {
    let profile: VerificationProfile;
    try {
      profile = liftVerification(task.verification);
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
    const failed = task.verification.filter((_, i) => exitCodes[i] !== 0);
    return [
      `A previous attempt at this task did not pass verification.`,
      ``,
      `Original task:`,
      task.prompt,
      ``,
      `Why it failed: ${reason}`,
      ``,
      failed.length > 0 ? `Commands that did not exit 0:\n${failed.map((c) => `  - ${c}`).join('\n')}` : '',
      ``,
      `Fix the cause. Do not weaken or skip the verification commands.`,
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
