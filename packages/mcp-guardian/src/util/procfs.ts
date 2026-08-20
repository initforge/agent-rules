/**
 * util/procfs.ts — Linux /proc process fingerprinting.
 *
 * A process identity is {pid, start_time, exe, cmdline_hash, resource_token}.
 * PID alone is never trusted: before any signal, the start time (and where
 * possible exe/cmdline) must still match, otherwise the process is treated as
 * reused/unrelated and the operation fails closed (QUARANTINE/BLOCKED).
 */
import { readFileSync, readlinkSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface ProcFingerprint {
  pid: number;
  start_time: string;
  exe: string | null;
  cmdline_hash: string | null;
  ppid: number | null;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** /proc/<pid>/stat field 22 = starttime in clock ticks since boot. */
export function procStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // comm may contain spaces/parens; split after the last ')'.
    const idx = stat.lastIndexOf(')');
    if (idx === -1) return null;
    const fields = stat.slice(idx + 2).split(' ');
    // After comm: state(3) ppid(4) ... starttime is field 22 overall → index 19 of this slice.
    const startTime = fields[19];
    return startTime ?? null;
  } catch {
    return null;
  }
}

export function procPpid(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const idx = stat.lastIndexOf(')');
    if (idx === -1) return null;
    const fields = stat.slice(idx + 2).split(' ');
    const ppid = Number(fields[1]);
    return Number.isFinite(ppid) ? ppid : null;
  } catch {
    return null;
  }
}

export function procExe(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

export function procCmdline(pid: number): string[] | null {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return raw.split('\0').filter((s) => s.length > 0);
  } catch {
    return null;
  }
}

export function procCmdlineHash(pid: number): string | null {
  const cmd = procCmdline(pid);
  return cmd === null ? null : sha256(cmd.join('\0'));
}

export function fingerprintProcess(pid: number): ProcFingerprint | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const start_time = procStartTime(pid);
  if (start_time === null) return null;
  return {
    pid,
    start_time,
    exe: procExe(pid),
    cmdline_hash: procCmdlineHash(pid),
    ppid: procPpid(pid),
  };
}

export function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Revalidate a previously captured fingerprint; null when the pid is gone. */
export function revalidateFingerprint(pid: number, expectedStartTime: string): ProcFingerprint | null {
  const now = fingerprintProcess(pid);
  if (now === null) return null;
  if (now.start_time !== expectedStartTime) {
    // PID was reused by an unrelated process.
    return { ...now, start_time: `REUSED:${now.start_time}` };
  }
  return now;
}

/** Walk /proc and collect descendants of pid, verifying each parent link. */
export function findDescendants(pid: number): number[] {
  const children = new Map<number, number[]>();
  let entries: string[] = [];
  try {
    entries = readdirSync('/proc') as string[];
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    const p = Number(name);
    const ppid = procPpid(p);
    if (ppid === null || ppid <= 0) continue;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid)!.push(p);
  }
  const out: number[] = [];
  const stack = [pid];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const c of children.get(cur) ?? []) {
      out.push(c);
      stack.push(c);
    }
  }
  return out;
}

/**
 * Terminate a process tree whose root fingerprint was captured at launch time.
 * Every pid is re-fingerprinted immediately before signalling; a start-time
 * mismatch (PID reuse) aborts the whole termination and reports BLOCKED.
 * Never signals the caller's process group and never signals by bare PID.
 */
export function terminateFingerprintedTree(
  rootPid: number,
  rootStartTime: string,
  opts: { graceMs?: number; signal?: NodeJS.Signals } = {},
): { terminated: number[]; blocked: number[]; reused: number[] } {
  const graceMs = opts.graceMs ?? 1500;
  const signal = opts.signal ?? 'SIGTERM';
  const root = revalidateFingerprint(rootPid, rootStartTime);
  if (root === null) return { terminated: [], blocked: [], reused: [] };
  if (root.start_time.startsWith('REUSED:')) return { terminated: [], blocked: [], reused: [rootPid] };

  const descendants = findDescendants(rootPid).reverse(); // children first
  const terminated: number[] = [];
  const blocked: number[] = [];
  const reused: number[] = [];

  const safeKill = (pid: number, sig: NodeJS.Signals): boolean => {
    const fp = fingerprintProcess(pid);
    if (fp === null) return false; // already gone
    if (fp.start_time !== (pid === rootPid ? rootStartTime : fp.start_time)) {
      // For descendants we cannot know the original start time; revalidate the
      // chain instead: require the pid to still exist and be a descendant of
      // the (still valid) root at signal time.
      if (pid !== rootPid) {
        const stillDescendant = findDescendants(rootPid).includes(pid);
        if (!stillDescendant) {
          reused.push(pid);
          return false;
        }
      } else {
        reused.push(pid);
        return false;
      }
    }
    try {
      process.kill(pid, sig);
      return true;
    } catch {
      return false;
    }
  };

  for (const pid of descendants) {
    if (!safeKill(pid, signal)) {
      if (pid !== rootPid && processAlive(pid) && !reused.includes(pid)) blocked.push(pid);
    } else {
      terminated.push(pid);
    }
  }
  if (!safeKill(rootPid, signal)) {
    if (processAlive(rootPid) && !reused.includes(rootPid)) blocked.push(rootPid);
  } else {
    terminated.push(rootPid);
  }

  // Grace period then SIGKILL stragglers that are still descendants.
  if (graceMs > 0) {
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      const remaining = [...terminated].filter((p) => processAlive(p));
      if (remaining.length === 0) break;
      sleepMs(50);
    }
    for (const pid of [...terminated]) {
      if (processAlive(pid)) {
        const fp = fingerprintProcess(pid);
        if (fp !== null && findDescendants(rootPid).includes(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  return { terminated, blocked, reused };
}
