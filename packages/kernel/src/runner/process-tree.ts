import { spawnSync, type ChildProcess } from 'node:child_process';

export interface ProcessTreeTermination {
  confirmedExited: boolean;
  forced: boolean;
}

export interface ProcessTreeOptions {
  graceMs?: number;
}

/**
 * Wait until a child emits close, or until the bounded wait expires. A timeout
 * must never resolve the caller while the old child is still able to mutate the
 * workspace.
 */
export function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(exited);
    };
    const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
    child.once('close', () => finish(true));
    child.once('error', () => finish(true));
  });
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function signalProcessTree(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    // Windows has no POSIX process-group signal. taskkill /T is the portable
    // tree boundary; use /F only for the hard-stop phase.
    if (signal === 'SIGKILL') {
      try {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 5_000,
        });
      } catch {
        // Fall through to the direct Node emulation below.
      }
    }
    try { process.kill(pid, signal); } catch { /* already gone */ }
    return;
  }

  // POSIX callers must spawn detached so the negative PID reaches descendants.
  try { process.kill(-pid, signal); } catch {
    try { process.kill(pid, signal); } catch { /* already gone */ }
  }
}

/**
 * Stop a worker/verifier tree and wait for the tree boundary before returning.
 * The caller can therefore safely claim the next task without overlap.
 */
export async function terminateProcessTree(
  pid: number,
  child?: ChildProcess,
  options: ProcessTreeOptions = {},
): Promise<ProcessTreeTermination> {
  if (!isAlive(pid)) return { confirmedExited: true, forced: false };
  const graceMs = Math.max(0, options.graceMs ?? 5_000);

  signalProcessTree(pid, 'SIGTERM');
  const gracefullyExited = child ? await waitForChildExit(child, graceMs) : !isAlive(pid);
  if (gracefullyExited && !isAlive(pid)) return { confirmedExited: true, forced: false };

  signalProcessTree(pid, 'SIGKILL');
  const forceWaitMs = Math.max(500, Math.min(graceMs, 5_000));
  const forceExited = child ? await waitForChildExit(child, forceWaitMs) : !isAlive(pid);
  return { confirmedExited: forceExited || !isAlive(pid), forced: true };
}

/** POSIX process-group isolation; Windows keeps taskkill as the tree boundary. */
export function processGroupSpawnOptions(): { detached: boolean; windowsHide: boolean } {
  return { detached: process.platform !== 'win32', windowsHide: true };
}
