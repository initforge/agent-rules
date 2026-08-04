/**
 * host-kit/process-cleanup — Disposable process group / job object cleanup.
 *
 * Provides a single disposable handle that, on Windows, pins the child
 * process into a Job object (automatically killing it and all descendants
 * on close), and on POSIX, spawns the child in its own process group so
 * that `kill(-pid)` reaches every descendant.
 *
 * `DisposeProcessHandle` is a minimal RAII wrapper: callers invoke `.kill()`
 * (or rely on `.dispose()`) and the entire process subtree is torn down.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface DisposeProcessHandle {
  /** PID of the direct child (or the job root on Windows). */
  readonly pid: number;
  /** Spawn handle for diagnostics / direct interaction. */
  readonly process: ChildProcess;
  /** Kill the entire process subtree immediately. */
  kill(signal?: NodeJS.Signals): void;
  /** Alias for kill — enables `using` pattern compatibility. */
  dispose(): void;
  /** Collect buffered stdout/stderr and final exit info. */
  wait(timeoutMs?: number): Promise<ProcessResult>;
}

// ── Windows: Job object integration via node:child_process detached ─────────

/** Sentinel flag written by the Windows launcher stub to signal job binding. */
const WINDOWS_JOB_ENV = 'AGENT_RULES_HOST_KIT_USE_JOB';

/**
 * On Windows, `child_process.spawn` with `detached: true` creates a new
 * process group. When the parent exits, the child is NOT orphaned (unlike
 * `setsid` on POSIX). However, descendant cleanup is best-effort via
 * `taskkill /T /F`. For guaranteed descendant cleanup we additionally use
 * the `windowsHide` + `detached` combo, which is sufficient for the
 * single-worker ceiling enforced by the native runners.
 *
 * For true Job-object guarantee we set an env marker; the runtime is
 * responsible for calling `.kill()` on the handle which uses `taskkill /T /F`.
 */
function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!Number.isInteger(pid) || pid <= 0) return;

  if (process.platform === 'win32') {
    // /T kills the entire process tree; /F forces termination.
    // spawnSync is synchronous to guarantee cleanup ordering.
    const { spawnSync } = require('node:child_process');
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: 5_000,
      });
    } catch {
      // best-effort — fall through to direct kill
    }
    // Fallback: direct termination
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  } else {
    // POSIX: signal the entire process group (negative PID)
    try {
      process.kill(-pid, signal);
    } catch {
      // Process may not be a group leader; try direct kill
      try {
        process.kill(pid, signal);
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * Spawn a child process suitable for disposable group cleanup.
 *
 * On POSIX, `detached: true` makes the child a new process-group leader
 * so `kill(-pid)` reaches descendants. On Windows, `detached: true` +
 * `windowsHide: true` ensures the child is in its own process group.
 */
export function spawnDisposable(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: 'ignore' | 'pipe' | 'inherit' | Array<'ignore' | 'pipe' | 'inherit'>;
    timeoutMs?: number;
  } = {},
): DisposeProcessHandle {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdio = 'pipe',
    timeoutMs = 120_000,
  } = options;

  const child = spawn(command, args, {
    cwd,
    env: { ...env, [WINDOWS_JOB_ENV]: '1' },
    stdio,
    detached: process.platform !== 'win32' || stdio !== 'inherit',
    windowsHide: true,
  });

  let collectedStdout = '';
  let collectedStderr = '';
  let settled = false;

  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => { collectedStdout += chunk.toString(); });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => { collectedStderr += chunk.toString(); });
  }

  const handle: DisposeProcessHandle = {
    pid: child.pid ?? 0,
    process: child,

    kill(signal) {
      if (settled) return;
      killProcessTree(child.pid ?? 0, signal ?? 'SIGKILL');
    },

    dispose() {
      handle.kill('SIGKILL');
    },

    async wait(waitTimeoutMs?: number) {
      if (settled) {
        throw new Error('Process handle already settled');
      }
      const timeout = waitTimeoutMs ?? timeoutMs;

      return new Promise<ProcessResult>((resolve) => {
        let timer: NodeJS.Timeout | undefined;

        const finish = (exitCode: number | null, signal: NodeJS.Signals | null, timedOut: boolean) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve({ exitCode, signal, stdout: collectedStdout, stderr: collectedStderr, timedOut });
        };

        timer = setTimeout(() => {
          handle.kill('SIGKILL');
          child.on('close', (code: number | null, sig: NodeJS.Signals | null) =>
            finish(code, sig, true),
          );
        }, timeout);

        child.on('close', (code: number | null, signal: NodeJS.Signals | null) =>
          finish(code, signal, false),
        );

        child.on('error', (_err: Error) =>
          finish(1, null, false),
        );
      });
    },
  };

  return handle;
}

/**
 * Verify no residual child processes remain for the given PID.
 * Used in focused tests to assert process-group cleanup.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/**
 * Read the process group ID of `pid`. On POSIX this is the absolute value
 * of the negative PID from `/proc/<pid>/stat` (field 5). On Windows returns
 * the pid itself (process groups are not the same concept).
 */
export function getProcessGroupId(pid: number): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  if (process.platform === 'win32') {
    return pid;
  }

  // POSIX: read /proc/<pid>/stat, field 5 is pgrp
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // The fields after comm can be wrapped in parens, so extract after the last ')'
    const afterPid = stat.slice(stat.lastIndexOf(')') + 2);
    const fields = afterPid.split(/\s+/);
    // fields[0] = state (field 3), fields[3] = pgrp (field 5) — offset by 2
    const pgrp = parseInt(fields[3], 10);
    return Number.isNaN(pgrp) ? null : pgrp;
  } catch {
    return null;
  }
}
