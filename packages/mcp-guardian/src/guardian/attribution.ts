/**
 * guardian/attribution.ts — process + window attribution.
 *
 * Attribution rules (owner contract §VI, §VII):
 * - provider identity = PID + /proc start time + exe + cmdline hash + optional
 *   profile/endpoint token; never PID alone, never first-window heuristics.
 * - window identity = window id + _NET_WM_PID + WM_CLASS + process start time
 *   + workspace + mapped/iconic state + resource markers.
 * - matching a provider window requires the window's wm_pid to be the provider
 *   process (or a start-time-verified descendant) AND the process start time to
 *   match the launch-time fingerprint.
 */
import { procStartTime, procExe, procCmdline, processAlive, fingerprintProcess, findDescendants } from '../util/procfs.js';
import { createHash } from 'node:crypto';
import type { ProcessFingerprint, WindowFingerprint } from '../types.js';
import type { WindowSnapshotEntry, X11Backend } from './x11.js';

export interface LaunchIdentity {
  pid: number;
  start_time: string;
  exe: string | null;
  cmdline: string[];
  resource_token?: string;
}

export function captureLaunchIdentity(pid: number): LaunchIdentity | null {
  const fp = fingerprintProcess(pid);
  if (fp === null) return null;
  return {
    pid,
    start_time: fp.start_time,
    exe: fp.exe,
    cmdline: procCmdline(pid) ?? [],
    resource_token: undefined,
  };
}

export function toProcessFingerprint(identity: LaunchIdentity): ProcessFingerprint {
  return {
    pid: identity.pid,
    start_time: identity.start_time,
    exe: identity.exe ?? '',
    cmdline_hash: createHash('sha256').update(identity.cmdline.join('\0')).digest('hex'),
    resource_token: identity.resource_token,
  };
}

export function processMatches(identity: LaunchIdentity, pid: number): { match: boolean; reason: string } {
  const start = procStartTime(pid);
  if (start === null) return { match: false, reason: 'process gone' };
  if (start !== identity.start_time) return { match: false, reason: 'PID reused (start time mismatch)' };
  const exe = procExe(pid);
  if (identity.exe && exe && identity.exe !== exe) {
    return { match: false, reason: `exe mismatch: expected ${identity.exe}, observed ${exe}` };
  }
  return { match: true, reason: 'process fingerprint matches launch identity' };
}

/**
 * Find the provider window among candidates. Explicit matching only:
 * 1. window.wm_pid must be the provider pid (or a verified descendant);
 * 2. the pid's start time must equal the launch fingerprint start time;
 * 3. when the provider declares a WM_CLASS or resource token, it must match.
 * Returns null when no window can be attributed (never "first window").
 */
export async function attributeProviderWindow(
  x11: X11Backend,
  identity: LaunchIdentity,
  opts: {
    expectedWmClass?: string | null;
    resourceMarker?: string | null;
    candidates?: WindowSnapshotEntry[];
    acceptDescendants?: boolean;
  } = {},
): Promise<WindowFingerprint | null> {
  const candidates = opts.candidates ?? (await x11.windowSnapshot());
  const descendants = opts.acceptDescendants === false ? [] : collectDescendantPids(identity.pid);
  for (const cand of candidates) {
    if (cand.wm_pid === null) continue;
    let pidOk = false;
    if (cand.wm_pid === identity.pid) {
      pidOk = processMatches(identity, cand.wm_pid).match;
    } else if (opts.acceptDescendants !== false && descendants.includes(cand.wm_pid)) {
      pidOk = true;
    }
    if (!pidOk) continue;
    if (opts.expectedWmClass && cand.wm_class && !cand.wm_class.includes(opts.expectedWmClass)) {
      continue;
    }
    if (opts.resourceMarker) {
      const marker = [cand.wm_name ?? '', cand.wm_class ?? ''].join(' ');
      if (!marker.includes(opts.resourceMarker)) continue;
    }
    const info = await x11.windowInfo(cand.window_id);
    info.process_start_time = procStartTime(cand.wm_pid);
    info.resource_markers = opts.resourceMarker ? [opts.resourceMarker] : [];
    return info;
  }
  return null;
}

function collectDescendantPids(pid: number): number[] {
  return findDescendants(pid);
}

/**
 * Revalidate a previously attributed window: same id, same wm_pid, same start
 * time, still mapped. A stale/reused window id must be rejected.
 */
export async function revalidateWindow(
  x11: X11Backend,
  expected: WindowFingerprint,
): Promise<{ ok: boolean; reason: string; current?: WindowFingerprint }> {
  if (!processAlive(expected.wm_pid ?? -1)) {
    return { ok: false, reason: `window process ${expected.wm_pid} is gone` };
  }
  const start = procStartTime(expected.wm_pid!);
  if (start === null) return { ok: false, reason: 'window process start time unreadable' };
  if (start !== expected.process_start_time) {
    return { ok: false, reason: 'window PID start time changed (window id/PID reused)' };
  }
  let current: WindowFingerprint;
  try {
    current = await x11.windowInfo(expected.window_id);
  } catch {
    return { ok: false, reason: `window ${expected.window_id} no longer exists` };
  }
  if (current.wm_pid !== expected.wm_pid) {
    return { ok: false, reason: `window ${expected.window_id} now belongs to pid ${current.wm_pid} (reused window id)` };
  }
  if (current.wm_class !== null && expected.wm_class !== null && current.wm_class !== expected.wm_class) {
    return { ok: false, reason: 'window WM_CLASS changed (window id reused by another app)' };
  }
  if (current.wm_state === 0 || current.wm_state === null) {
    return { ok: false, reason: 'window is withdrawn/unmapped' };
  }
  return { ok: true, reason: 'window fingerprint revalidated', current };
}
