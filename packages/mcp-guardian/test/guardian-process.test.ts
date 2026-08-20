/**
 * R-006 — process identity and safe termination: PID + /proc start time +
 * exe + cmdline hash; termination only via fingerprint revalidation; PID
 * reuse is detected and BLOCKED; caller process groups and unrelated
 * processes are never touched.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprintProcess,
  revalidateFingerprint,
  terminateFingerprintedTree,
  findDescendants,
  procStartTime,
} from '../src/util/procfs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLEEPER = path.join(__dirname, 'helpers', 'sleeper.mjs');

afterAll(async () => {
  // let any stray helpers exit
  await new Promise((r) => setTimeout(r, 300));
});

function spawnTree(): { root: ReturnType<typeof spawn>; childPids: number[] } {
  // root spawns N children — a small process tree
  const root = spawn(process.execPath, [SLEEPER, '8000', '--children', '2'], { stdio: 'ignore' });
  return { root, childPids: [] };
}

describe('process fingerprinting', () => {
  it('captures pid + start time + exe + cmdline hash from /proc', async () => {
    const proc = spawn(process.execPath, [SLEEPER, '2000'], { stdio: 'ignore' });
    const fp = fingerprintProcess(proc.pid!);
    expect(fp).not.toBeNull();
    expect(fp!.pid).toBe(proc.pid);
    expect(fp!.start_time).toMatch(/^\d+$/);
    expect(fp!.exe).toContain('node');
    expect(fp!.cmdline_hash).toMatch(/^[a-f0-9]{64}$/);
    proc.kill('SIGKILL');
  });

  it('detects PID reuse: revalidation fails closed when start time changes', async () => {
    const proc = spawn(process.execPath, [SLEEPER, '500'], { stdio: 'ignore' });
    const fp = fingerprintProcess(proc.pid!);
    expect(fp).not.toBeNull();
    // simulate a reused pid with a different start time
    const reused = revalidateFingerprint(proc.pid!, '999999999999');
    expect(reused).not.toBeNull();
    if (reused) expect(reused.start_time.startsWith('REUSED:')).toBe(true);
    // correct start time revalidates fine
    const ok = revalidateFingerprint(proc.pid!, fp!.start_time);
    expect(ok?.start_time.startsWith('REUSED:')).toBe(false);
    proc.kill('SIGKILL');
  });

  it('terminates only the fingerprinted tree; unrelated processes survive', async () => {
    const { root } = spawnTree();
    const rootFp = fingerprintProcess(root.pid!);
    expect(rootFp).not.toBeNull();
    // wait for the tree to form
    await new Promise((r) => setTimeout(r, 500));

    const unrelated = spawn(process.execPath, [SLEEPER, '5000'], { stdio: 'ignore' });
    const unrelatedFp = fingerprintProcess(unrelated.pid!);
    expect(unrelatedFp).not.toBeNull();

    const descendants = findDescendants(root.pid!);
    expect(descendants.length).toBeGreaterThanOrEqual(1);

    const result = terminateFingerprintedTree(root.pid!, rootFp!.start_time, { graceMs: 1500 });
    expect(result.reused.length).toBe(0);
    expect(result.blocked.length).toBe(0);
    expect(result.terminated.length).toBeGreaterThanOrEqual(1);

    // root and its descendants are gone
    await new Promise((r) => setTimeout(r, 300));
    expect(procStartTime(root.pid!)).toBeNull();
    for (const pid of descendants) {
      expect(procStartTime(pid)).toBeNull();
    }
    // unrelated process is untouched
    expect(procStartTime(unrelated.pid!)).toBe(unrelatedFp!.start_time);
    unrelated.kill('SIGKILL');
  });

  it('refuses to terminate when the root fingerprint no longer matches (BLOCKED, no kill)', async () => {
    const proc = spawn(process.execPath, [SLEEPER, '3000'], { stdio: 'ignore' });
    const fp = fingerprintProcess(proc.pid!);
    expect(fp).not.toBeNull();
    const result = terminateFingerprintedTree(proc.pid!, '000000000000', { graceMs: 100 });
    expect(result.reused).toContain(proc.pid);
    expect(result.terminated.length).toBe(0);
    // the process still runs
    expect(procStartTime(proc.pid!)).toBe(fp!.start_time);
    proc.kill('SIGKILL');
  });
});
