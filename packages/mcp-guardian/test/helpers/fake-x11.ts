/**
 * test/helpers/fake-x11.ts — deterministic fake wmctrl/xprop backend.
 *
 * The fake attributes windows from REAL processes: `xprop -root
 * _NET_CLIENT_LIST` scans /proc for processes whose cmdline contains the
 * configured marker, so window attribution exercises the same
 * process-fingerprint logic as a live desktop.
 */
import { readdirSync, readFileSync } from 'node:fs';
import type { ExecBackend } from '../../src/guardian/x11.js';

export interface FakeWindowModel {
  desktops: number;
  activeDesktop: number;
  activeWindow: string | null;
  /** cmdline marker -> synthetic window for every matching live process */
  providerMarkers: string[];
  /** WM_CLASS returned for provider windows */
  providerClass: string;
  /** records every non-activating move call: [windowId, desktop] */
  moveCalls: Array<{ windowId: string; desktop: number }>;
  /** when true, windowInfo for provider windows reports iconic */
  providerIconic: boolean;
  /** when true, `wmctrl -d` reports a different active desktop on next call */
  desktopShiftOnNextCall: boolean;
  /** shift the active desktop on the Nth `wmctrl -d` call (1-based) */
  shiftDesktopOnCallNumber: number | null;
  /** static unrelated windows not backed by a process */
  staticWindows: Array<{ id: string; pid: number; cls: string; workspace: number; state: number }>;
  /** when set, provider windows report this workspace instead of active */
  providerWorkspaceOverride: number | null;
  failNextMove: boolean;
}

export function createFakeX11(model?: Partial<FakeWindowModel>): { exec: ExecBackend; model: FakeWindowModel } {
  const m: FakeWindowModel = {
    desktops: 4,
    activeDesktop: 0,
    activeWindow: null,
    providerMarkers: ['fake-mcp-server'],
    providerClass: 'FakeMCP',
    moveCalls: [],
    providerIconic: false,
    desktopShiftOnNextCall: false,
    shiftDesktopOnCallNumber: null,
    staticWindows: [],
    providerWorkspaceOverride: null,
    failNextMove: false,
    ...model,
  };
  let desktopCallCount = 0;

  function providerPids(): number[] {
    const out: number[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync('/proc');
    } catch {
      return out;
    }
    for (const name of entries) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8');
        if (m.providerMarkers.some((marker) => cmd.includes(marker))) out.push(Number(name));
      } catch {
        /* gone */
      }
    }
    return out;
  }

  function providerWindowId(pid: number): string {
    return `0x${pid.toString(16)}`;
  }

  function workspaceFor(pid: number): number {
    if (m.providerWorkspaceOverride !== null) return m.providerWorkspaceOverride;
    return m.activeDesktop;
  }

  function clientList(): string[] {
    const ids = m.staticWindows.map((w) => w.id);
    for (const pid of providerPids()) ids.push(providerWindowId(pid));
    return ids;
  }

  function windowInfoFor(id: string): { pid: number | null; cls: string | null; workspace: number; state: number; name: string | null } {
    const stat = m.staticWindows.find((w) => w.id === id);
    if (stat) return { pid: stat.pid, cls: stat.cls, workspace: stat.workspace, state: stat.state, name: 'static' };
    const pid = parseInt(id.replace(/^0x/, ''), 16);
    if (Number.isFinite(pid) && providerPids().includes(pid)) {
      return {
        pid,
        cls: m.providerClass,
        workspace: workspaceFor(pid),
        state: m.providerIconic ? 3 : 1,
        name: 'fake-provider-window',
      };
    }
    return { pid: null, cls: null, workspace: -1, state: 0, name: null };
  }

  const exec: ExecBackend = async (cmd, args) => {
    if (cmd === 'wmctrl' && args[0] === '-d') {
      desktopCallCount += 1;
      if (m.desktopShiftOnNextCall || m.shiftDesktopOnCallNumber === desktopCallCount) {
        m.desktopShiftOnNextCall = false;
        m.activeDesktop = Math.min(m.activeDesktop + 1, m.desktops - 1);
      }
      const lines: string[] = [];
      for (let d = 0; d < m.desktops; d++) {
        // real wmctrl -d format (DG:/VP:/WA: prefixed)
        lines.push(`${d} ${d === m.activeDesktop ? '*' : '-'} DG: 1920x1200  VP: 0,0  WA: 0,0 1920x1160  desktop-${d}`);
      }
      return { stdout: lines.join('\n') + '\n', stderr: '' };
    }
    if (cmd === 'wmctrl' && args[0] === '-i' && args[1] === '-r' && args[3] === '-t') {
      if (m.failNextMove) {
        m.failNextMove = false;
        return { stdout: '', stderr: 'Cannot get client list properties' };
      }
      const windowId = args[2];
      const desktop = Number(args[4]);
      m.moveCalls.push({ windowId, desktop });
      const stat = m.staticWindows.find((w) => w.id === windowId);
      if (stat) stat.workspace = desktop;
      // provider windows follow the target desktop after a move
      const pid = parseInt(windowId.replace(/^0x/, ''), 16);
      if (providerPids().includes(pid)) {
        m.providerWorkspaceOverride = desktop;
        setTimeout(() => {
          m.providerWorkspaceOverride = null;
        }, 3000);
      }
      return { stdout: '', stderr: '' };
    }
    if (cmd === 'xprop' && args[0] === '-root' && args[1] === '_NET_ACTIVE_WINDOW') {
      const win = m.activeWindow ?? '0x0';
      return { stdout: `_NET_ACTIVE_WINDOW(WINDOW): window id # ${win}\n`, stderr: '' };
    }
    if (cmd === 'xprop' && args[0] === '-root' && args[1] === '_NET_CLIENT_LIST') {
      const list = clientList().join(', ');
      return { stdout: `_NET_CLIENT_LIST(WINDOW): window id # ${list}\n`, stderr: '' };
    }
    if (cmd === 'xprop' && args[0] === '-id') {
      const id = args[1];
      const info = windowInfoFor(id);
      if (info.pid === null) {
        return { stdout: '', stderr: `X Error: BadWindow` };
      }
      const stateName = info.state === 1 ? 'NormalState' : info.state === 3 ? 'IconicState' : 'WithdrawnState';
      return {
        stdout: [
          `WM_CLASS(STRING) = "fake", "${info.cls ?? 'unknown'}"`,
          `_NET_WM_PID(CARDINAL) = ${info.pid}`,
          `_NET_WM_DESKTOP(CARDINAL) = ${info.workspace}`,
          `WM_STATE(WM_STATE):\n\t\twindow state: ${stateName}`,
          `_NET_WM_NAME(UTF8_STRING) = "${info.name ?? ''}"`,
        ].join('\n') + '\n',
        stderr: '',
      };
    }
    return { stdout: '', stderr: `unexpected fake command: ${cmd} ${args.join(' ')}` };
  };

  return { exec, model: m };
}
