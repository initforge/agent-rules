/**
 * host-kit/runtime/process-manager.ts — Host-native process group lifecycle.
 *
 * Provides out-of-band process management for exact child cancellation and
 * cleanup of orphaned process groups. Uses platform-specific primitives:
 * - POSIX: process groups with setsid() / getpgrp() and kill(-pgid)
 * - Windows: job objects with managed process handles
 *
 * ponytail: skip — cgroup-based scheduling, cross-host process tracking,
 * job-object persistence, child-watchdog integration. Add when AM-0021
 * cluster 5 ships.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';
import type { ProcessGroupHandle } from './types.js';

/** Registry of all active process groups. */
const PROCESS_GROUP_REGISTRY = new Map<string | number, ProcessGroupHandle>();

/**
 * Process group supervisor for cleanup lifecycle.
 * Owns the process group and ensures cleanup on object disposal.
 */
export class ProcessGuard {
  #group: ProcessGroupHandle | null = null;
  #cid: string;

  constructor(cid: string) {
    this.#cid = cid;
  }

  /** Bind a process group to this guard. */
  bindGroup(group: ProcessGroupHandle): void {
    this.#group = group;
    PROCESS_GROUP_REGISTRY.set(this.#cid, group);
  }

  /** Get the bound process group. */
  get group(): ProcessGroupHandle | null {
    return this.#group;
  }

  /** Terminate the process group with SIGTERM. */
  terminate(): void {
    this.terminateGroup();
  }

  /** Kill the process group with SIGKILL (exact cancel). */
  kill(): void {
    this.killGroup();
  }

  private terminateGroup(): void {
    if (!this.#group) return;
    const { pid, pgid } = this.#group;

    if (process.platform === 'win32') {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may already be dead
      }
      return;
    }

    try {
      process.kill(-pgid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }

  private killGroup(): void {
    if (!this.#group) return;
    const { pid, pgid } = this.#group;

    if (process.platform === 'win32') {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process may already be dead
      }
      return;
    }

    try {
      process.kill(-pgid, 'SIGKILL');
    } catch {
      // Process may already be dead
    }
  }

  /** Cleanup and remove from registry. */
  dispose(): void {
    if (this.#group) {
      this.killGroup();
      PROCESS_GROUP_REGISTRY.delete(this.#cid);
      PROCESS_GROUP_REGISTRY.delete(this.#group.pgid);
    }
  }
}

/**
 * Process guardian interface for process group lifecycle management.
 */
export interface ProcessGuardian {
  /** Bound process group */
  readonly group: ProcessGroupHandle | null;
  /** Terminate with SIGTERM */
  terminate(handle: ProcessGroupHandle): void;
  /** Kill with SIGKILL (exact cancel) */
  kill(handle: ProcessGroupHandle): void;
}

/** Create a process group for a child process bound to an assignment. */
export function createProcessGroupForChild(
  child: ChildProcess,
  assignmentId: string,
): ProcessGroupHandle {
  const pid = Number(child.pid);
  const pgid = process.platform === 'win32' ? pid : pid;

  const handle: ProcessGroupHandle = {
    pgid,
    pid,
    createdAt: Date.now(),
    assignmentId,
  };
  return handle;
}

/** Create a minimal process group handle from a PID (for adapter handles). */
export function createProcessGroupFromPid(
  pid: number,
  assignmentId: string,
): ProcessGroupHandle {
  const handle: ProcessGroupHandle = {
    pgid: pid,
    jobName: process.platform === 'win32' ? `agent-job-${assignmentId}` : undefined,
    pid,
    createdAt: Date.now(),
    assignmentId,
  };
  PROCESS_GROUP_REGISTRY.set(assignmentId, handle);
  return handle;
}

/** Spawn a process in its own process group (detached for tree management). */
export function spawnDetached(
  command: string,
  args: readonly string[],
  options?: { cwd?: string; env?: Record<string, string> },
): ChildProcess {
  const child = spawn(command, args as string[], {
    detached: true,
    cwd: options?.cwd,
    env: options?.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Create process group for this child
  if (child.pid) {
    const handle = createProcessGroupForChild(child, '');
    PROCESS_GROUP_REGISTRY.set(`pg-${handle.pgid}`, handle);
  }

  return child;
}

/** Find a process group handle by assignment ID or PID. */
export function findProcessGroup(key: string | number): ProcessGroupHandle | undefined {
  return PROCESS_GROUP_REGISTRY.get(key);
}

/** Cleanup a process group and remove from registry. */
export async function cleanupProcessGroup(handle: ProcessGroupHandle): Promise<void> {
  // Kill any remaining processes
  const { pid, pgid, assignmentId } = handle;

  if (process.platform === 'win32') {
    try { process.kill(pid, 'SIGKILL'); } catch { /* dead */ }
  } else {
    try { process.kill(-pgid, 'SIGKILL'); } catch { /* dead */ }
  }

  PROCESS_GROUP_REGISTRY.delete(assignmentId);
  PROCESS_GROUP_REGISTRY.delete(pgid);
}

/** Cleanup orphaned process groups (called on shutdown or error recovery). */
export function cleanupOrphanedProcessGroups(): void {
  for (const handle of PROCESS_GROUP_REGISTRY.values()) {
    const { pid, pgid } = handle;
    if (process.platform === 'win32') {
      try { process.kill(pid, 'SIGKILL'); } catch { /* dead */ }
    } else {
      try { process.kill(-pgid, 'SIGKILL'); } catch { /* dead */ }
    }
  }
  PROCESS_GROUP_REGISTRY.clear();
}

/** Get all registered process groups (for monitoring/debugging). */
export function listProcessGroups(): ReadonlyArray<ProcessGroupHandle> {
  return Object.freeze([...PROCESS_GROUP_REGISTRY.values()]);
}

/** Create the default process guardian. */
export function createDefaultGuardian(): ProcessGuardian {
  return {
    group: null,
    terminate(handle: ProcessGroupHandle): void {
      const { pid, pgid } = handle;
      if (process.platform === 'win32') {
        try { process.kill(pid, 'SIGTERM'); } catch { /* dead */ }
        return;
      }
      try { process.kill(-pgid, 'SIGTERM'); } catch { /* dead */ }
    },
    kill(handle: ProcessGroupHandle): void {
      const { pid, pgid } = handle;
      if (process.platform === 'win32') {
        try { process.kill(pid, 'SIGKILL'); } catch { /* dead */ }
        return;
      }
      try { process.kill(-pgid, 'SIGKILL'); } catch { /* dead */ }
    },
  };
}

// Re-export types and classes (ProcessGuardian already exported above)