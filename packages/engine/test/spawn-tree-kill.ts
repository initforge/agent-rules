import { spawn, spawnSync, execFile } from 'node:child_process';
import os from 'node:os';

/**
 * Cross-platform process-tree kill for tests that spawn children.
 *
 * Why this exists: Windows refuses to remove a temp dir while any of its
 * child processes still hold a file handle (EPERM on `rm -rf`). Forcing the
 * rm hides a real leak. Listing + killing the children first lets the
 * cleanup finish cleanly on every host. The POSIX path uses the negative
 * PID for the process group, which is what `spawn({detached:true})` writes
 * to, then falls back to the direct PID if the group kill fails.
 */
export interface KillResult {
  killed: number;
  reason: 'windows-taskkill' | 'posix-pgrp' | 'posix-direct' | 'none';
}

export async function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGKILL'): Promise<KillResult> {
  if (!Number.isInteger(pid) || pid <= 0) return { killed: 0, reason: 'none' };
  if (os.platform() === 'win32') {
    return killWindows(pid, signal);
  }
  return killPosix(pid, signal);
}

function killWindows(pid: number, signal: NodeJS.Signals): Promise<KillResult> {
  return new Promise((resolve) => {
    // If the pid is already gone, short-circuit to a no-op. A previous
    // kill in the same test may have reaped the process before this call
    // is made, and reporting a phantom kill in that case is misleading.
    try {
      process.kill(pid, 0);
    } catch {
      resolve({ killed: 0, reason: 'none' });
      return;
    }
    execFile('taskkill', ['/T', signal === 'SIGKILL' ? '/F' : '', '/PID', String(pid)], (err) => {
      // taskkill returns non-zero when the PID is already gone. Treat that
      // as "no kill needed" so tests calling kill on an already-dead pid
      // do not report a phantom kill.
      if (err && !/0x0/i.test(String(err.message ?? ''))) {
        resolve({ killed: 0, reason: 'none' });
        return;
      }
      resolve({ killed: 1, reason: 'windows-taskkill' });
    });
  });
}

async function killPosix(pid: number, signal: NodeJS.Signals): Promise<KillResult> {
  // Try the process group first; if the test spawned a detached child the
  // group kill is the correct one. Fall back to the direct PID.
  try {
    process.kill(-pid, signal);
    return { killed: 1, reason: 'posix-pgrp' };
  } catch {
    try {
      process.kill(pid, signal);
      return { killed: 1, reason: 'posix-direct' };
    } catch {
      return { killed: 0, reason: 'none' };
    }
  }
}

/** Best-effort: enumerate node child PIDs that may still be running. */
export function findOrphanNodePids(): number[] {
  if (os.platform() === 'win32') {
    const res = spawnSync('tasklist', ['/FI', 'IMAGENAME eq node.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    if (res.status !== 0) return [];
    return (res.stdout ?? '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^"|"$/g, '').split('","')[1] ?? '')
      .filter((pid) => /^\d+$/.test(pid))
      .map((pid) => Number(pid));
  }
  const res = spawnSync('pgrep', ['-P', String(process.pid)], { encoding: 'utf8' });
  if (res.status !== 0) return [];
  return (res.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => /^\d+$/.test(line))
    .map((line) => Number(line));
}

/** Wait for all child PIDs to exit (used by tests that need a clean shell). */
export async function waitForExit(pids: readonly number[], timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const remaining = pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (remaining.length === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Suppress unused warning for `spawn` — kept as an explicit import in case
// future helpers need a long-running child process.
void spawn;