import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { QueuedTask } from './queue.js';
import type { McpConfigPaths } from './mcp-config.js';

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
  /** Where to spill stdout/stderr so transcripts never enter anyone's context. */
  logDir: string;
  /** Tool permission posture. Unattended runs need edits to apply without a prompt. */
  permissionMode?: string;
  /**
   * Per-task MCP config produced by `materializeMcpConfig`. When set, the
   * executor wires the corresponding config file into the agent invocation
   * (claude via `--mcp-config`, codex via `CODEX_HOME`, opencode via `-c`)
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
  } else if (kind === 'opencode' && mcp.opencode) {
    // opencode reads `opencode.json` from cwd; copy it next to where the
    // agent will be spawned, or pass an explicit path through the runtime
    // contract. Here we append it as a positional arg because opencode
    // honours a leading config path before the `run` subcommand.
    base.args.unshift('-c', mcp.opencode.configPath);
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
  async execute(task: QueuedTask, mcpConfigPaths?: McpConfigPaths): Promise<ExecutionResult> {
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

    let exitCode = -1;
    let timedOut = false;

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
          ...(this.config.mcpConfigPaths?.codex
            ? { [this.config.mcpConfigPaths.codex.envVarName]: this.config.mcpConfigPaths.codex.configDir }
            : {}),
        },
        windowsHide: true,
      });

      exitCode = await new Promise<number>((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          // SIGTERM first so the agent can flush; SIGKILL only if it ignores us.
          try {
            proc.kill('SIGTERM');
          } catch {
            /* already gone */
          }
          setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {
              /* already gone */
            }
          }, 10_000);
          resolve(124);
        }, this.config.timeoutMs);

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve(code ?? -1);
        });
        proc.on('error', () => {
          clearTimeout(timer);
          resolve(-1);
        });
      });
    } finally {
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
    }

    return {
      exitCode,
      timedOut,
      durationMs: Date.now() - startedAt,
      stdoutPath,
      stderrPath,
      stdoutSha256: hashFile(stdoutPath),
      stderrSha256: hashFile(stderrPath),
    };
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
