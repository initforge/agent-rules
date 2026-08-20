import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { QueuedTask } from './queue.js';
import type { McpConfigPaths } from './mcp-config.js';
import { processGroupSpawnOptions, terminateProcessTree } from './process-tree.js';
import type { ExecutionBudget } from './execution-policy.js';

/**
 * Spawns a real headless agent process per task.
 *
 * This replaces `LocalWorkerAdapter.buildWorkerScript()`, which returned
 * `console.log('Worker starting for', assignmentId)` — the "worker" did no work while
 * the surrounding machinery still issued receipts attesting that it had.
 *
 * The design point that matters for overnight runs: each task is a **separate process
 * with a fresh context** that lives for minutes and exits. A long-lived agent session
 * accumulates context until it is compacted and starts losing earlier work; a process
 * that exits cannot be compacted. The runner that spawns these holds no model context
 * at all, so the number of tasks it can drive is bounded by wall-clock, not tokens.
 */

export type AgentKind = 'claude' | 'codex' | 'opencode';

export interface AgentInvocation {
  executable: string;
  args: string[];
}

export interface ExecutorConfig {
  kind: AgentKind;
  /** Absolute repo path the agent runs in. */
  cwd: string;
  /** Hard ceiling per task. A hung agent must not stall the queue overnight. */
  timeoutMs: number;
  /** Grace period after cooperative stop before the whole process tree is forced down. */
  killGraceMs?: number;
  /** Where to spill stdout/stderr so transcripts never enter anyone's context. */
  logDir: string;
  /** Tool permission posture. Unattended runs need edits to apply without a prompt. */
  permissionMode?: string;
  /**
   * Per-task MCP config produced by `materializeMcpConfig`. When set, the
   * executor wires the corresponding config file into the agent invocation
   * (claude via `--mcp-config`, codex via `CODEX_HOME`, opencode via
   * `OPENCODE_CONFIG`)
   * so the agent can drive browser-based verification through registered
   * MCP servers (playwright, chrome-devtools) without manual setup.
   */
  mcpConfigPaths?: import('./mcp-config.js').McpConfigPaths;
  /**
   * Override the argv builder. Exists so tests can drive the real process lifecycle
   * against a harmless binary instead of a vendor CLI, and so a host with a
   * differently-named binary can be accommodated without patching this file.
   */
  invocationOverride?: (prompt: string) => AgentInvocation;
}

export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Build the CLI invocation for a headless, non-interactive run.
 *
 * Kept as a pure function so the argv is testable without spawning anything — the
 * previous adapter's fatal flaw was that nothing asserted what it actually ran.
 */
export function buildInvocation(kind: AgentKind, prompt: string, config: Pick<ExecutorConfig, 'permissionMode' | 'mcpConfigPaths'>): AgentInvocation {
  const base = (() => {
    switch (kind) {
      case 'claude':
        return {
          executable: 'claude',
          args: [
            '-p',
            prompt,
            '--output-format',
            'stream-json',
            '--verbose',
            '--permission-mode',
            config.permissionMode ?? 'acceptEdits',
          ],
        };
      case 'codex':
        return { executable: 'codex', args: ['exec', prompt] };
      case 'opencode':
        return { executable: 'opencode', args: ['run', prompt] };
    }
  })();
  const mcp = config.mcpConfigPaths;
  if (!mcp) return base;
  // Wire MCP for the kind we are about to invoke. Per-task materialisation
  // (mcp-config.ts) produces agent-specific config files; the agent reads
  // them at startup. Two tasks must never share a config because both
  // would race on the same browser profile / cookie jar.
  if (kind === 'claude' && mcp.claude) {
    base.args.push('--mcp-config', mcp.claude.configPath);
  }
  // codex is wired via CODEX_HOME env (set in the spawn env below).
  return base;
}

export interface ExecutionResult {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  stdoutSha256: string;
  stderrSha256: string;
  termination: 'natural' | 'graceful-stop' | 'forced-stop';
  cleanupConfirmed: boolean;
  executionClass?: ExecutionBudget['executionClass'];
}

/** True when the CLI for `kind` is on PATH and responds to `--version`. */
export async function detectAgent(kind: AgentKind): Promise<{ available: boolean; version?: string }> {
  const executable = kind;
  return new Promise((resolve) => {
    const proc = spawn(executable, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve({ available: false });
    }, 15_000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { available: true, version: out.trim() } : { available: false });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ available: false });
    });
  });
}

export class HeadlessExecutor {
  constructor(private readonly config: ExecutorConfig) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }

/**
   * Run one task to completion in its own process.
   *
   * Output is streamed to files rather than buffered: an agent transcript can be
   * megabytes, and holding it in memory (or, worse, returning it up the call stack
   * into a model context) is what `tool-output-broker` exists to prevent.
   *
   * `mcpConfigPaths` overrides the executor-level config when supplied, so the
   * runner can materialise a per-task MCP config without rebuilding the
   * executor for every task. Pass `undefined` to skip MCP for this task
   * (even if the executor-level default had it on).
   */
  async execute(task: QueuedTask, mcpConfigPaths?: McpConfigPaths, budget?: ExecutionBudget): Promise<ExecutionResult> {
    const effectiveMcp = mcpConfigPaths ?? this.config.mcpConfigPaths;
    const execConfig = { ...this.config, mcpConfigPaths: effectiveMcp };
    const { executable, args } = this.config.invocationOverride
      ? this.config.invocationOverride(task.prompt)
      : buildInvocation(this.config.kind, task.prompt, execConfig);
    const stem = `${task.id}-${randomUUID().slice(0, 8)}`;
    const stdoutPath = path.join(this.config.logDir, `${stem}.stdout.log`);
    const stderrPath = path.join(this.config.logDir, `${stem}.stderr.log`);

    const stdoutFd = fs.openSync(stdoutPath, 'w', 0o600);
    const stderrFd = fs.openSync(stderrPath, 'w', 0o600);
    const startedAt = Date.now();
    const effectiveTimeoutMs = budget?.hardTimeoutMs ?? this.config.timeoutMs;
    const killGraceMs = budget?.killGraceMs ?? this.config.killGraceMs ?? 5_000;

    let exitCode = -1;
    let timedOut = false;
    let termination: ExecutionResult['termination'] = 'natural';
    let cleanupConfirmed = true;
    let agentPid = -1;

    try {
      const proc = spawn(executable, args, {
        cwd: this.config.cwd,
        stdio: ['ignore', stdoutFd, stderrFd],
        env: {
          ...process.env,
          // Marks the child as harness-driven so it can adapt (and so a human reading
          // a transcript later knows it was not interactive).
          AGENT_RULES_TASK_ID: task.id,
          AGENT_RULES_HEADLESS: '1',
          // CODEX_HOME points codex at a per-task config directory so its
          // MCP servers come from the run materialisation, not the user's
          // global config. Other agents ignore this env var.
          ...(effectiveMcp?.codex
            ? { [effectiveMcp.codex.envVarName]: effectiveMcp.codex.configDir }
            : {}),
          // OpenCode's -c flag means --continue. A custom config path is
          // selected through OPENCODE_CONFIG per the current OpenCode CLI contract.
          ...(effectiveMcp?.opencode
            ? { OPENCODE_CONFIG: effectiveMcp.opencode.configPath }
            : {}),
        },
        ...processGroupSpawnOptions(),
      });
      agentPid = proc.pid ?? -1;

      exitCode = await new Promise<number>((resolve) => {
        let settled = false;
        const settle = (code: number): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(code);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          // Do not release the task until the process tree is confirmed dead.
          void terminateProcessTree(proc.pid ?? 0, proc, { graceMs: killGraceMs }).then((result) => {
            cleanupConfirmed = result.confirmedExited;
            termination = result.forced ? 'forced-stop' : 'graceful-stop';
            settle(124);
          });
        }, effectiveTimeoutMs);

        proc.on('close', (code) => {
          // Once the deadline wins, the termination promise owns settlement.
          // A platform may emit close with a signal-derived code before the
          // process-tree cleanup has been observed; never let that race turn a
          // timed-out task into an ordinary non-zero completion.
          if (timedOut) return;
          if (!timedOut) termination = 'natural';
          settle(code ?? -1);
        });
        proc.on('error', () => {
          if (timedOut) return;
          settle(-1);
        });
      });

      // REQ-010 idle-zero: after settlement (natural end, timeout, crash or
      // cancellation), sweep the recorded process tree once more so any MCP
      // server that outlived the agent is terminated and observed. This makes
      // "no task -> no managed MCP process" verifiable instead of assumed.
      if (agentPid > 0) {
        const sweep = await terminateProcessTree(agentPid, undefined, { graceMs: killGraceMs });
        if (timedOut) cleanupConfirmed = cleanupConfirmed && sweep.confirmedExited;
      }
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }

    this.writeMcpLifecycleReceipt(task, effectiveMcp, { exitCode, timedOut, termination, cleanupConfirmed, agentPid });
    return {
      exitCode,
      timedOut,
      durationMs: Date.now() - startedAt,
      stdoutPath,
      stderrPath,
      stdoutSha256: hashFile(stdoutPath),
      stderrSha256: hashFile(stderrPath),
      termination,
      cleanupConfirmed,
      ...(budget ? { executionClass: budget.executionClass } : {}),
    };
  }

  /**
   * REQ-010/REQ-006 — durable per-task MCP lifecycle receipt: which MCP set this
   * task routed, where its configs were materialised, and that the whole process
   * tree (agent + any MCP servers) was observed down at settlement. Written even
   * when the task routed no MCP (the "0 managed processes" guarantee is then
   * trivially attested).
   *
   * idle_zero_attested is DISTINCT from cleanup_confirmed: cleanup_confirmed
   * only proves the harness observer recorded the process tree down, while
   * idle-zero additionally asserts no harness-owned process/socket/lease/
   * provider/orphan/schema exposure remains. A receipt-write failure fails the
   * task closed (a lost receipt must never look like successful teardown).
   */
  private writeMcpLifecycleReceipt(task: QueuedTask, mcpConfigPaths: McpConfigPaths | undefined, outcome: { exitCode: number; timedOut: boolean; termination: string; cleanupConfirmed: boolean; agentPid: number }): void {
    const dir = mcpConfigPaths?.dir ?? this.config.logDir;
    fs.mkdirSync(dir, { recursive: true });
    const receiptPath = path.join(dir, 'mcp-process-receipt.json');
    const receipt = {
      schema: 'agent-rules/mcp-process-receipt',
      version: 1,
      task_id: task.id,
      work_id: task.workId,
      execution_generation: task.executionGeneration ?? 0,
      routed_mcp_integration_ids: task.mcpIntegrationIds ?? [],
      mcp_config_dir: mcpConfigPaths?.dir ?? null,
      resolved_integrations: mcpConfigPaths?.resolved ?? [],
      agent: {
        kind: this.config.kind,
        pid: outcome.agentPid,
        exit_code: outcome.exitCode,
        timed_out: outcome.timedOut,
        termination: outcome.termination,
        cleanup_confirmed: outcome.cleanupConfirmed,
      },
      // idle-zero is a stronger claim than cleanup confirmation. It asserts no
      // harness-owned process/socket/lease/advertised provider/orphan/schema
      // exposure remains. Without a live no-exposure attestation it must not be
      // conflated with cleanup confirmation.
      idle_zero_attested: outcome.cleanupConfirmed && (task.mcpIntegrationIds?.length ?? 0) === 0,
      ended_at: new Date().toISOString(),
    };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  }

  host(): string {
    return os.hostname();
  }
}

function hashFile(file: string): string {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return createHash('sha256').update('').digest('hex');
  }
}
