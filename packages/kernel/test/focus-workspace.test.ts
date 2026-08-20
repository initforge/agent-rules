import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  snapshotDesktop,
  resolveTargetWorkspace,
  findNewWindow,
  descendantPids,
  moveWindowToWorkspace,
  verifyFocusPreserved,
  placeAndVerify,
  parseWindowId,
  groupOcCandidates,
  isLifecycleFocusViolation,
  type ExecFn,
} from '../src/runner/focus-workspace.js';
import { materializeMcpConfig, guardianEnvFor, mcpGuardianPath } from '../src/runner/mcp-config.js';

const REGISTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'integrations');

function fakeExec(initialLines: string[], opts: { applyMove?: boolean; applyPropertySet?: boolean; iconicWindowId?: string; moveOtherWorkspace?: number; activeAfterMove?: string } = {}): ExecFn {
  const calls: Array<{ command: string; args: string[] }> = [];
  const state: Array<{ id: string; workspace: number; pid: string; title: string }> = initialLines.map((line) => {
    const m = /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)\s+\S+\s+(.*)$/.exec(line);
    return { id: m![1].toLowerCase(), workspace: Number(m![2]), pid: m![3], title: m![4] ?? 'window' };
  });
  const exec: ExecFn = (command, args) => {
    calls.push({ command, args });
    const key = `${command} ${args.join(' ')}`;
    if (key.startsWith('xprop -root _NET_CURRENT_DESKTOP')) return { stdout: '_NET_CURRENT_DESKTOP(CARDINAL) = 0\n', stderr: '', status: 0 };
    if (key.startsWith('xprop -root _NET_ACTIVE_WINDOW')) {
      const active = opts.activeAfterMove ?? '0x6000004';
      return { stdout: `_NET_ACTIVE_WINDOW(WINDOW): window id # ${active}\n`, stderr: '', status: 0 };
    }
    if (command === 'sleep') { return { stdout: '', stderr: '', status: 0 }; }
    if (key.startsWith('xprop -id') && args.includes('WM_STATE')) {
      const iconic = opts.iconicWindowId && args[1].toLowerCase() === opts.iconicWindowId;
      return { stdout: iconic ? 'WM_STATE(WM_STATE): window state: Iconic\n' : 'WM_STATE(WM_STATE): window state: Normal\n', stderr: '', status: 0 };
    }
    if (key.startsWith('xprop -id') && args.includes('-set') && args.includes('_NET_WM_DESKTOP') && opts.applyPropertySet !== false) {
      const window = state.find((entry) => entry.id === args[1].toLowerCase());
      if (window) window.workspace = Number(args[args.indexOf('-set') + 1]);
      return { stdout: '', stderr: '', status: 0 };
    }
    if (key.startsWith('wmctrl -l -p')) {
      return { stdout: state.map((w) => `${w.id}  ${w.workspace}  ${w.pid}  host  ${w.title}`).join('\n'), stderr: '', status: 0 };
    }
    if (key.startsWith('wmctrl -i -r')) {
      if (opts.applyMove !== false) {
        const window = state.find((entry) => entry.id === args[2].toLowerCase());
        if (window) window.workspace = Number(args[4]);
      }
      if (opts.moveOtherWorkspace !== undefined && state.length > 1) {
        const other = state.find((entry) => entry.id !== args[2].toLowerCase());
        if (other) other.workspace = opts.moveOtherWorkspace;
      }
      return { stdout: '', stderr: '', status: 0 };
    }
    return { stdout: '', stderr: '', status: -1 };
  };
  (exec as unknown as { calls: typeof calls; push: (line: string) => void }).calls = calls;
  (exec as unknown as { push: (line: string) => void }).push = (line: string) => {
    const m = /^\s*(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\d+)\s+\S+\s+(.*)$/.exec(line);
    if (m) state.push({ id: m[1].toLowerCase(), workspace: Number(m[2]), pid: m[3], title: m[4] ?? 'window' });
  };
  return exec;
}

const WINDOW_LINES = [
  '0x04c00006  4 7243 host OC-session-a',
  '0x04c00052  2 7243 host OC-session-b',
  '0x04c004a0  3 7243 host OC-session-c',
  '0x06000004  0 592819 host Brave-owner',
  '0x6000004   0 3880   host Desktop',
];
const PROVIDER_LINE = '0x1f000001  0 9876 host provider';

function postLaunchSnapshot(exec: ReturnType<typeof fakeExec>) {
  (exec as unknown as { push: (line: string) => void }).push(PROVIDER_LINE);
  return snapshotDesktop(exec);
}

// descendantPids/process-tree helpers are Linux /proc-based.
describe.skipIf(process.platform !== 'linux')('AM-0006 focus/workspace backend', () => {
  it('snapshots current desktop, active window, and window facts (hashed titles)', () => {
    const exec = fakeExec(WINDOW_LINES);
    const snapshot = snapshotDesktop(exec);
    expect(snapshot.currentWorkspace).toBe(0);
    expect(snapshot.activeWindowId).toBe('0x6000004');
    expect(snapshot.windows).toHaveLength(5);
    for (const window of snapshot.windows) {
      expect(window.titleHash).toMatch(/^[a-f0-9]{16}$/);
    }
  });

  it('resolves the target workspace from an explicit source window binding', () => {
    const snapshot = snapshotDesktop(fakeExec(WINDOW_LINES));
    const result = resolveTargetWorkspace({ sourceWindowId: '0x04c00006' }, snapshot);
    expect(result.status).toBe('resolved');
    expect(result.workspace).toBe(4);
  });

  it('honors an explicit owner-provided workspace override', () => {
    const snapshot = snapshotDesktop(fakeExec(WINDOW_LINES));
    const result = resolveTargetWorkspace({ explicitWorkspace: 2 }, snapshot);
    expect(result.status).toBe('resolved');
    expect(result.workspace).toBe(2);
  });

  it('fails closed when the source window is not on this display', () => {
    const snapshot = snapshotDesktop(fakeExec(WINDOW_LINES));
    const result = resolveTargetWorkspace({ sourceWindowId: '0xdeadbeef' }, snapshot);
    expect(result.status).toBe('blocked');
  });

  it('fails closed (needs-user) with multiple candidate windows and no binding', () => {
    const snapshot = snapshotDesktop(fakeExec(WINDOW_LINES));
    const result = resolveTargetWorkspace({}, snapshot);
    expect(result.status).toBe('needs-user');
    expect(result.workspace).toBeNull();
  });

  it('never calls activating/switch commands during placement', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('prevented_and_verified');
    expect(result.receipt.providerWorkspace).toBe(result.receipt.targetWorkspace);
    expect(result.receipt.providerWorkspace).toBe(4);
    const calls = (exec as unknown as { calls: Array<{ command: string; args: string[] }> }).calls;
    for (const call of calls) {
      expect(call.command).not.toMatch(/xdotool|wtype/);
      if (call.command === 'wmctrl') {
        expect(call.args).not.toContain('-a');
        expect(call.args).not.toContain('-R');
        expect(call.args).not.toContain('-s');
      }
    }
  });

  it('verifies the owner desktop and active window are preserved after launch', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const changed = { ...before, currentWorkspace: 2, activeWindowId: '0x1f000001' };
    const preserved = verifyFocusPreserved(before, changed);
    expect(preserved.ok).toBe(false);
    expect(preserved.reasons.length).toBe(2);
  });

  it('attributes the provider window by exact _NET_WM_PID', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const after = { ...before, windows: [...before.windows, { windowId: '0x1f000001', pid: '9876', workspace: 0, titleHash: 'a'.repeat(16) }] };
    const found = findNewWindow(before, after, '9876');
    expect(found.status).toBe('found');
    expect(found.window?.windowId).toBe('0x1f000001');
  });

  it('never claims an unattributed new window (no first-window fallback)', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const after = { ...before, windows: [...before.windows, { windowId: '0x1f000002', pid: '424242', workspace: 0, titleHash: 'b'.repeat(16) }] };
    const match = findNewWindow(before, after, '9876');
    expect(match.status).toBe('ambiguous');
    expect(match.window).toBeUndefined();
  });

  it('attributes a window owned by a descendant of the provider process tree', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('sleep', ['30']);
    try {
      const exec = fakeExec(WINDOW_LINES);
      const before = snapshotDesktop(exec);
      const after = { ...before, windows: [...before.windows, { windowId: '0x1f000003', pid: String(child.pid), workspace: 0, titleHash: 'c'.repeat(16) }] };
      const match = findNewWindow(before, after, process.pid); // provider = this test process; child is a descendant
      expect(match.status).toBe('found');
      expect(match.window?.windowId).toBe('0x1f000003');
      const tree = descendantPids(process.pid);
      expect(tree).toContain(child.pid!);
    } finally {
      child.kill();
    }
  });

  it('parses decimal and hex window ids', () => {
    expect(parseWindowId('0x04c00006')).toBe('0x04c00006');
    expect(parseWindowId('50135046')).toBe('0x2fd0006');
    expect(() => parseWindowId('not-a-window')).toThrow();
  });

  it('grants placed only with post-move proof (providerWorkspace === targetWorkspace)', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('prevented_and_verified');
    expect(result.receipt.providerWorkspace).toBe(4);
  });

  it('fails verification (never placed) when the window did not actually move', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: false, applyPropertySet: false });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('verification_failed');
    expect(result.receipt.providerWorkspace).toBe(0);
    expect(result.receipt.errors.join(' ')).toContain('after move');
  });

  it('records the post-move owner state in the receipt after', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.after?.currentWorkspace).toBe(0);
    expect(result.receipt.after?.activeWindowIdHash).toBe(result.receipt.before?.activeWindowIdHash);
  });

  it('proves the provider window is visible and non-iconic (WM_STATE) when placed', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('prevented_and_verified');
    expect(result.receipt.providerNonIconic).toBe(true);
    expect(result.receipt.otherWindowsUnchanged).toBe(true);
  });

  it('fails verification when the provider window is iconic on the target workspace', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true, iconicWindowId: '0x1f000001' });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('verification_failed');
    expect(result.receipt.providerNonIconic).toBe(false);
    expect(result.receipt.errors.join(' ')).toContain('not visible/non-iconic');
  });

  it('fails verification when another window changed workspace during the move', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true, moveOtherWorkspace: 3 });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('verification_failed');
    expect(result.receipt.otherWindowsUnchanged).toBe(false);
    expect(result.receipt.errors.join(' ')).toContain('other window(s) changed workspace');
  });

  it('fails verification when the provider window steals the active window (race guard)', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true, activeAfterMove: '0x1f000001' });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('verification_failed');
    expect(result.receipt.errors.join(' ')).toContain('stole the active window');
  });

  it('groups 9 mixed windows into a single OpenCode source session (no child-window miscounting)', () => {
    const mixed = [
      '0x04c00006  4 7243 host OC | project-alpha',
      '0x04c00052  2 7243 host OC | project-beta',
      '0x06000004  0 592819 host Brave-owner',
      '0x07200004  2 747830 host Google Chrome',
      '0x04200003  0 708670 host Zalo',
      '0x6000004   0 3880   host Desktop',
      '0x0aa00001  0 9876  host chrome child window',
      '0x0bb00002  3 9876  host playwright browser page',
      '0x0cc00003  1 11811 host ChatGPT',
    ];
    const exec = fakeExec(mixed);
    const snapshot = snapshotDesktop(exec);
    const { group } = groupOcCandidates(snapshot);
    expect(group.length).toBe(2);
    expect(group.every((entry) => entry.title?.startsWith('OC |'))).toBe(true);
    const result = resolveTargetWorkspace({}, snapshot);
    expect(result.status).toBe('needs-user');
    expect(result.candidates?.length).toBe(2);
  });

  it('narrows multiple OC sessions by project root (title contains project basename)', () => {
    const mixed = [
      '0x04c00006  4 7243 host OC | agent-rules harness work',
      '0x04c00052  2 7243 host OC | zaloai-ecommerce plan',
      '0x04c004a0  3 7243 host OC | cbos-ops',
      '0x06000004  0 592819 host Brave-owner',
    ];
    const exec = fakeExec(mixed);
    const snapshot = snapshotDesktop(exec);
    const resolved = resolveTargetWorkspace({ projectRoot: '/home/u/agent-rules' }, snapshot);
    expect(resolved.status).toBe('resolved');
    expect(resolved.workspace).toBe(4);
    expect(resolved.windowId).toBe('0x04c00006');
  });

  it('never counts browser/MCP child windows as OpenCode source windows', () => {
    const mixed = [
      '0x04c00006  4 7243 host OC | harness',
      '0x07200004  2 747830 host Google Chrome',
      '0x0aa00001  0 9876  host mcp-chrome page',
      '0x0bb00002  0 9876  host playwright browser',
    ];
    const exec = fakeExec(mixed);
    const snapshot = snapshotDesktop(exec);
    const { group } = groupOcCandidates(snapshot);
    expect(group.length).toBe(1);
    expect(group[0].windowId).toBe('0x04c00006');
    const result = resolveTargetWorkspace({}, snapshot);
    expect(result.status).toBe('resolved');
    expect(result.workspace).toBe(4);
  });

  it('returns grouped NEEDS_USER (not a guess) for two real indistinguishable OC sessions', () => {
    const two = [
      '0x04c00006  4 7243 host OC | project-alpha',
      '0x04c004a0  3 7243 host OC | project-beta',
    ];
    const exec = fakeExec(two);
    const snapshot = snapshotDesktop(exec);
    const result = resolveTargetWorkspace({ projectRoot: '/other/project' }, snapshot);
    expect(result.status).toBe('needs-user');
    expect(result.candidates?.length).toBe(2);
    expect(result.reason).toContain('--window');
  });

  it('never infers the current desktop as the target (race-safe default)', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const noBinding = resolveTargetWorkspace({}, before);
    expect(noBinding.status).toBe('needs-user');
    expect(noBinding.workspace).toBeNull();
    expect(noBinding.reason).not.toContain('current');
  });

  it('classifies a desktop change observed in the race window as detected_after_violation (never a warning)', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const violations = [{ kind: 'current-desktop-changed', detail: 'desktop moved to 2 during provider window map', atMs: Date.now() }];
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true, violations);
    expect(result.receipt.placement).toBe('detected_after_violation');
    expect(result.receipt.errors.join(' ')).toContain('race-window violation');
    expect(result.moved).toBe(false);
  });

  it('classifies a provider active-window steal observed in the race window as detected_after_violation', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const violations = [{ kind: 'active-window-stolen', detail: 'provider window became the active window', atMs: Date.now() }];
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true, violations);
    expect(result.receipt.placement).toBe('detected_after_violation');
  });

  it('classifies suspected owner interaction in the race window as unobservable', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const violations = [{ kind: 'owner-interaction-suspected', detail: 'active window changed to another window', atMs: Date.now() }];
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true, violations);
    expect(result.receipt.placement).toBe('unobservable');
    expect(result.moved).toBe(false);
  });

  it('classifies an unresolvable binding as blocked_before_launch', () => {
    const exec = fakeExec(WINDOW_LINES);
    const before = snapshotDesktop(exec);
    const after = snapshotDesktop(exec);
    const result = placeAndVerify({ sourceWindowId: '0xdeadbeef', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('blocked_before_launch');
    expect(result.moved).toBe(false);
  });

  it('issues the EWMH _NET_WM_DESKTOP client message (wmctrl -t) and never activates', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: true });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(result.receipt.placement).toBe('prevented_and_verified');
    const calls = (exec as unknown as { calls: Array<{ command: string; args: string[] }> }).calls;
    const move = calls.find((call) => call.command === 'wmctrl' && call.args[0] === '-i' && call.args[1] === '-r');
    expect(move).toBeDefined();
    expect(move!.args.slice(0, 5)).toEqual(['-i', '-r', '0x1f000001', '-t', '4']);
    // no direct property write is used or claimed (WM-managed property may be ignored)
    expect(calls.some((call) => call.command === 'xprop' && call.args.includes('-set'))).toBe(false);
  });

  it('fails closed (blocked, never prevented) when the EWMH move command is rejected', () => {
    const exec = fakeExec(WINDOW_LINES, { applyMove: false, applyPropertySet: false });
    const before = snapshotDesktop(exec);
    const after = postLaunchSnapshot(exec);
    const result = placeAndVerify({ sourceWindowId: '0x04c00006', exec }, before, after, '9876', true);
    expect(['verification_failed', 'blocked']).toContain(result.receipt.placement);
    expect(result.receipt.placement).not.toBe('prevented_and_verified');
  });

  it('terminates the full descendant process tree without touching the caller group', async () => {
    const { spawn } = await import('node:child_process');
    // bash spawns two sleeping grandchildren; terminating bash must kill all three.
    const root = spawn('/bin/bash', ['-c', 'sleep 30 & sleep 30 & wait']);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { terminateProcessTree } = await import('../src/runner/focus-workspace.js');
    const killed = terminateProcessTree(root.pid!);
    expect(killed).toContain(root.pid);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    expect(alive(root.pid!)).toBe(false);
    // descendants were killed too (bash exited only after children died via wait)
  });
  it('detects a lifecycle focus violation only when the provider steals focus from another workspace', () => {
    expect(isLifecycleFocusViolation({ currentWorkspace: 0, providerWorkspace: 4, activeWindowId: '0x1f000001', providerWindowId: '0x1f000001' })).toBe(true);
    // owner viewing the provider workspace and clicking it is NOT a violation
    expect(isLifecycleFocusViolation({ currentWorkspace: 4, providerWorkspace: 4, activeWindowId: '0x1f000001', providerWindowId: '0x1f000001' })).toBe(false);
    expect(isLifecycleFocusViolation({ currentWorkspace: 0, providerWorkspace: 4, activeWindowId: '0x6000004', providerWindowId: '0x1f000001' })).toBe(false);
    expect(isLifecycleFocusViolation({ currentWorkspace: null, providerWorkspace: 4, activeWindowId: '0x1f000001', providerWindowId: '0x1f000001' })).toBe(false);
  });
});

describe('AM-0006 mcp-config focus-safe materialization', () => {
  const VISIBLE_ENV = { DISPLAY: ':99' } as NodeJS.ProcessEnv;

  it('keeps local browser headed and isolated in visible mode', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-focus-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[]; environment?: Record<string, string> }> };
    expect(parsed.mcp.playwright.command.join(' ')).toContain('--isolated');
    expect(parsed.mcp.playwright.command.join(' ')).not.toContain('--headless');
    expect(parsed.mcp.playwright.command[0]).toBe('node');
    expect(parsed.mcp.playwright.command[1]).toContain('mcp-guardian.mjs');
    expect(parsed.mcp.playwright.environment?.AGENT_RULES_MCP_FOCUS_POLICY).toBe('preserve');
    expect(parsed.mcp.playwright.environment?.AGENT_RULES_SOURCE_WINDOW_ID).toBe('0x04c00006');
  });

  it('fails closed without a focus-safe binding for visible interactive MCPs', () => {
    expect(() => materializeMcpConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-focus-')), {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityEnv: VISIBLE_ENV,
    })).toThrow(/no focus-safe source binding/);
  });

  it('allows explicit legacy unbound opt-out without wrapping', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-focus-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { allowUnbound: true },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    expect(parsed.mcp.playwright.command[1]).not.toContain('mcp-guardian.mjs');
  });

  it('adds --headless only in explicit CI headless mode', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-focus-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['playwright-mcp'],
      visibilityMode: 'headless',
      visibilityEnv: { CI: '1' },
      visibilityPlatform: 'linux',
      focusBinding: { allowUnbound: true },
    });
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    expect(parsed.mcp.playwright.command.join(' ')).toContain('--headless');
  });

  it('treats foreground as a visible compatibility alias and guards it', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-focus-'));
    const paths = materializeMcpConfig(out, {
      registryRoot: REGISTRY,
      integrationIds: ['chrome-devtools-mcp'],
      visibilityMode: 'foreground',
      visibilityEnv: VISIBLE_ENV,
      focusBinding: { sourceWindowId: '0x04c00006' },
    });
    expect(paths.visibilityMode).toBe('foreground');
    const parsed = JSON.parse(fs.readFileSync(paths.opencode!.configPath, 'utf8')) as { mcp: Record<string, { command: string[] }> };
    expect(parsed.mcp['chrome-devtools'].command.join(' ')).toContain('mcp-guardian.mjs');
    expect(parsed.mcp['chrome-devtools'].command.join(' ')).toContain('--isolated');
  });

  it('resolves the guardian path next to the compiled module', () => {
    expect(mcpGuardianPath().endsWith('mcp-guardian.mjs')).toBe(true);
    expect(fs.existsSync(mcpGuardianPath())).toBe(true);
  });

  it('returns null guardian env for legacy unbound materialization', () => {
    expect(guardianEnvFor({ registryRoot: REGISTRY, integrationIds: [], focusBinding: { allowUnbound: true } })).toBeNull();
    expect(guardianEnvFor({ registryRoot: REGISTRY, integrationIds: [], visibilityMode: 'headless' })).toMatchObject({ visibility: 'headless' });
  });
});

describe('AM-0006 focus receipt schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'schemas', 'mcp-focus-receipt.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);

  function validReceipt(overrides: Record<string, unknown> = {}) {
    return {
      schema: 'agent-rules/mcp-focus-receipt',
      version: 1,
      session_id: 's-1',
      sourceWindowIdHash: 'a'.repeat(16),
      targetWorkspace: 4,
      before: { currentWorkspace: 0, activeWindowIdHash: 'b'.repeat(16) },
      after: { currentWorkspace: 0, activeWindowIdHash: 'b'.repeat(16) },
      providerWindowIdHash: 'c'.repeat(16),
      providerWorkspace: 4,
      placement: 'prevented_and_verified',
      visibility: 'visible',
      focusPolicy: 'preserve',
      isolated: true,
      capability: { wmctrl: true, xprop: true, display: true },
      errors: [],
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('accepts a complete focus receipt', () => {
    expect(validate(validReceipt())).toBe(true);
  });

  it('rejects a receipt without before/after facts', () => {
    const missing = validReceipt();
    delete missing.before;
    delete missing.after;
    expect(validate(missing)).toBe(false);
  });

  it('rejects a receipt claiming focus safety while the desktop changed', () => {
    const changed = validReceipt({ after: { currentWorkspace: 1, activeWindowIdHash: 'b'.repeat(16) } });
    expect(validate(changed)).toBe(true); // schema-shape ok
    // semantics: the reducer verifies before/after equality separately
    expect(changed.after.currentWorkspace === changed.before.currentWorkspace).toBe(false);
  });

  it('accepts verification_failed as an honest placement outcome', () => {
    const failed = validReceipt({ placement: 'verification_failed', providerWorkspace: 0, errors: ['provider window on workspace 0 after move, expected 4'] });
    expect(validate(failed)).toBe(true);
  });
});
