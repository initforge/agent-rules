/**
 * guardian/x11.ts — X11 EWMH backend (certified first backend: Linux/X11/Cinnamon).
 *
 * Uses wmctrl/xprop. Capability contract:
 *   backend = "x11-ewmh"; pure Wayland = unsupported/BLOCKED (WAYLAND_DISPLAY
 *   alone is never a support claim); XWayland must be live-tested separately.
 *
 * Guardian never activates/focuses windows, never switches desktops, never
 * unminimizes, and never auto-moves a provider after READY.
 *
 * The exec backend is injectable so tests can substitute a fake wmctrl/xprop.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WindowFingerprint } from '../types.js';

const execFileAsync = promisify(execFile);

export interface ExecBackend {
  (cmd: string, args: string[], opts?: { timeoutMs?: number }): Promise<{ stdout: string; stderr: string }>;
}

export const defaultExec: ExecBackend = async (cmd, args, opts = {}) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: opts.timeoutMs ?? 5000, maxBuffer: 4 * 1024 * 1024 });
  return { stdout, stderr };
};

export interface DesktopEntry {
  desktop: number;
  active: boolean;
  geometry: string;
  workarea: string;
  name: string;
}

export interface WindowSnapshotEntry {
  window_id: string;
  wm_pid: number | null;
  wm_class: string | null;
  wm_name: string | null;
  workspace: number | null;
  wm_state: number | null;
  visible: boolean;
}

export class X11Backend {
  constructor(
    private exec: ExecBackend = defaultExec,
    private display: string | null = process.env.DISPLAY ?? null,
  ) {
    if (!this.display) {
      throw new Error('X11 backend requires DISPLAY (x11-ewmh); pure Wayland is not supported');
    }
  }

  static probe(exec: ExecBackend = defaultExec): { ok: boolean; reason?: string; backend?: string } {
    if (!process.env.DISPLAY) {
      if (process.env.WAYLAND_DISPLAY) {
        return { ok: false, reason: 'WAYLAND_DISPLAY present but DISPLAY absent — pure Wayland is not supported; only x11-ewmh is certified', backend: 'unsupported' };
      }
      return { ok: false, reason: 'no DISPLAY', backend: 'unsupported' };
    }
    return { ok: true, backend: 'x11-ewmh' };
  }

  async listDesktops(): Promise<DesktopEntry[]> {
    const { stdout } = await this.exec('wmctrl', ['-d']);
    const out: DesktopEntry[] = [];
    for (const line of stdout.split('\n')) {
      // Real formats:
      //   `0  * DG: 1920x1200  VP: 0,0  WA: 0,0 1920x1160  Desktop 2`
      //   `0  - DG: 1920x1200  VP: N/A  WA: 0,0 1920x1160  Desktop 1`
      const m = /^(\d+)\s+(\*?)\s+DG:\s+(\S+)\s+VP:\s+(\S+)\s+WA:\s+(\S+)\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      out.push({
        desktop: Number(m[1]),
        active: m[2] === '*',
        geometry: m[3],
        workarea: m[5],
        name: m[6] ?? '',
      });
    }
    return out;
  }

  async currentDesktop(): Promise<number> {
    const desktops = await this.listDesktops();
    const active = desktops.find((d) => d.active);
    if (!active) throw new Error('could not determine current desktop via wmctrl -d');
    return active.desktop;
  }

  async activeWindow(): Promise<string | null> {
    const { stdout } = await this.exec('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    const m = /#\s*(0x[0-9a-fA-F]+)/.exec(stdout);
    if (!m) return null;
    const id = m[1];
    return id === '0x0' ? null : id;
  }

  async workspaceCount(): Promise<number> {
    return (await this.listDesktops()).length;
  }

  /** Move a window to a desktop WITHOUT activating it (wmctrl -i -r -t). */
  async moveToDesktop(windowId: string, desktop: number): Promise<void> {
    await this.exec('wmctrl', ['-i', '-r', windowId, '-t', String(desktop)]);
  }

  async windowInfo(windowId: string): Promise<WindowFingerprint> {
    const { stdout } = await this.exec('xprop', ['-id', windowId, 'WM_CLASS', '_NET_WM_PID', '_NET_WM_DESKTOP', 'WM_STATE', '_NET_WM_NAME']);
    const get = (key: string): string | null => {
      // xprop lines look like `_NET_WM_PID(CARDINAL) = 1234` — tolerate the
      // parenthesized type suffix.
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`^${esc}(?:\\([A-Z_0-9]+\\))?\\s*=\\s*(.*)$`, 'm').exec(stdout);
      return m ? m[1].trim() : null;
    };
    const wmPidRaw = get('_NET_WM_PID');
    const wmPid = wmPidRaw ? Number(/^(\d+)/.exec(wmPidRaw)?.[1]) : null;
    const clsRaw = get('WM_CLASS');
    // WM_CLASS(STRING) = "instance", "class" — the CLASS is the last token.
    const clsMatch = clsRaw ? /"([^"]*)"\s*$/.exec(clsRaw) : null;
    const wmClass = clsMatch ? clsMatch[1] : null;
    const wsRaw = get('_NET_WM_DESKTOP');
    const workspace = wsRaw ? Number(/^-?\d+/.exec(wsRaw)?.[0]) : null;
    // WM_STATE is not key=value: `WM_STATE(WM_STATE):` followed by
    // `window state: Normal|Iconic|Withdrawn` (Cinnamon) or
    // `window state: NormalState|IconicState|WithdrawnState` (some WMs).
    let wmState: number | null = null;
    const stateMatch = /window state:\s*(\w+)/.exec(stdout);
    if (stateMatch) {
      const s = stateMatch[1];
      wmState = s.startsWith('Normal') ? 1 : s.startsWith('Iconic') ? 3 : 0;
    }
    const nameRaw = get('_NET_WM_NAME');
    const wmName = nameRaw ? nameRaw.replace(/^"/, '').replace(/"\s*$/, '') : null;
    return {
      window_id: windowId,
      wm_pid: Number.isFinite(wmPid as number) ? wmPid : null,
      wm_class: wmClass,
      wm_name: wmName,
      process_start_time: null, // filled by attribution layer from /proc
      workspace,
      wm_state: wmState,
      visible: wmState === 1,
      resource_markers: [],
      observed_at: new Date().toISOString(),
    };
  }

  /** Snapshot all top-level windows with their identities. */
  async windowSnapshot(): Promise<WindowSnapshotEntry[]> {
    const { stdout } = await this.exec('xprop', ['-root', '_NET_CLIENT_LIST']);
    const ids = [...stdout.matchAll(/0x[0-9a-fA-F]+/g)].map((m) => m[0]);
    const out: WindowSnapshotEntry[] = [];
    for (const id of ids) {
      try {
        const info = await this.windowInfo(id);
        out.push({
          window_id: id,
          wm_pid: info.wm_pid,
          wm_class: info.wm_class,
          wm_name: info.wm_name,
          workspace: info.workspace,
          wm_state: info.wm_state,
          visible: info.visible,
        });
      } catch {
        // window vanished between listing and query — observation only
      }
    }
    return out;
  }

  /** Compare two snapshots; returns windows that changed identity. */
  static diffSnapshots(
    before: WindowSnapshotEntry[],
    after: WindowSnapshotEntry[],
  ): { added: WindowSnapshotEntry[]; removed: WindowSnapshotEntry[]; changed: WindowSnapshotEntry[] } {
    const byId = (xs: WindowSnapshotEntry[]) => new Map(xs.map((x) => [x.window_id, x]));
    const b = byId(before);
    const a = byId(after);
    const added = after.filter((x) => !b.has(x.window_id));
    const removed = before.filter((x) => !a.has(x.window_id));
    const changed = after.filter((x) => {
      const prev = b.get(x.window_id);
      if (!prev) return false;
      return prev.wm_pid !== x.wm_pid || prev.wm_class !== x.wm_class || prev.wm_state !== x.wm_state;
    });
    return { added, removed, changed };
  }
}
