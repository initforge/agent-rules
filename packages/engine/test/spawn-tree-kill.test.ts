import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { killProcessTree, findOrphanNodePids } from './spawn-tree-kill.js';

describe('killProcessTree', () => {
  it('returns a no-op result for invalid pids', async () => {
    const r = await killProcessTree(0);
    expect(r.killed).toBe(0);
    expect(r.reason).toBe('none');

    const r2 = await killProcessTree(-1);
    expect(r2.killed).toBe(0);
  });

  it('kills a real spawned child on this platform', async () => {
    // Spawn a long-lived `node -e "setInterval(()=>{},1000)"` child and verify
    // we can reap it. The exact kill path differs between Windows and POSIX;
    // we just assert the child is dead after the call.
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
      stdio: 'ignore',
      detached: os.platform() !== 'win32',
    });
    if (os.platform() !== 'win32' && child.pid !== undefined) {
      // On POSIX, attach the new process to its own group so kill -PGID works.
      try { process.kill(-child.pid, 0); } catch { /* group already valid */ }
    }
    const pid = child.pid;
    expect(pid).toBeGreaterThan(0);

    // Sanity: the child is alive before we kill it.
    const aliveBefore = (() => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    })();
    expect(aliveBefore).toBe(true);

    const r = await killProcessTree(pid);
    expect(r.killed).toBeGreaterThan(0);

    // Wait briefly for the OS to reap.
    await new Promise((res) => setTimeout(res, 250));
    const aliveAfter = (() => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    })();
    expect(aliveAfter).toBe(false);
  });
});

describe('findOrphanNodePids', () => {
  it('returns an array (possibly empty) on this platform', () => {
    const pids = findOrphanNodePids();
    expect(Array.isArray(pids)).toBe(true);
    expect(pids.every((p) => Number.isInteger(p) && p > 0)).toBe(true);
  });

  it('finds a freshly-spawned child', () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 5000)'], { stdio: 'ignore' });
    const pid = child.pid;
    expect(pid).toBeGreaterThan(0);
    try {
      // The helper is specifically intended to discover Node children that can
      // survive a failed worker cleanup. A missing freshly-spawned direct child
      // is therefore a real regression, not a condition to swallow.
      const pids = findOrphanNodePids();
      expect(pids).toContain(pid);
    } finally {
      if (os.platform() === 'win32') {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
      } else {
        try { process.kill(pid!, 'SIGKILL'); } catch { /* already exited */ }
      }
    }
  }, 5_000);
});

// Confirm the helper does not throw on a non-existent path; the harness test
// surface should always be runnable even on a host with zero children.
describe('killProcessTree robustness', () => {
  it('does not throw on missing pid', async () => {
    // Spawn a child, kill it, then try to kill again — must resolve cleanly.
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 200));
    const r1 = await killProcessTree(child.pid!);
    const r2 = await killProcessTree(child.pid!);
    expect(r1.killed).toBeGreaterThanOrEqual(0);
    expect(r2.killed).toBe(0);
    expect(r2.reason).toBe('none');
  });
});

// Suppress unused-import warning for `path`/`fs`/`spawnSync` if the linter
// is unhappy; the file keeps them as future hooks.
void path; void fs;