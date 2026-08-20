/**
 * R-007 — window attribution: explicit fingerprint matching (window id +
 * _NET_WM_PID + WM_CLASS + process start time + workspace + mapped/iconic),
 * never a first-window heuristic, never an all-window fallback; stale/reused
 * window ids are rejected.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { X11Backend } from '../src/guardian/x11.js';
import { attributeProviderWindow, revalidateWindow, captureLaunchIdentity } from '../src/guardian/attribution.js';
import { createFakeX11 } from './helpers/fake-x11.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_MCP = path.join(__dirname, 'helpers', 'fake-mcp-server.mjs');

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
});

function spawnProvider(): ReturnType<typeof spawn> {
  return spawn(process.execPath, [FAKE_MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
}

describe('window attribution', () => {
  it('attributes exactly the provider window by PID + start time + class', async () => {
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const proc = spawnProvider();
    const identity = captureLaunchIdentity(proc.pid!);
    expect(identity).not.toBeNull();
    await new Promise((r) => setTimeout(r, 300));

    const win = await attributeProviderWindow(x11, identity!, { expectedWmClass: 'FakeMCP' });
    expect(win).not.toBeNull();
    expect(win!.wm_pid).toBe(proc.pid);
    expect(win!.wm_class).toBe('FakeMCP');
    expect(win!.process_start_time).toBe(identity!.start_time);
    expect(win!.visible).toBe(true);
    proc.kill('SIGKILL');
  });

  it('never falls back to the first window: an unrelated window with another pid is skipped', async () => {
    const fake = createFakeX11({ staticWindows: [{ id: '0x1001', pid: 99999, cls: 'Unrelated', workspace: 0, state: 1 }] });
    const x11 = new X11Backend(fake.exec, ':0');
    const proc = spawnProvider();
    const identity = captureLaunchIdentity(proc.pid!);
    expect(identity).not.toBeNull();
    await new Promise((r) => setTimeout(r, 300));

    const win = await attributeProviderWindow(x11, identity!, {});
    expect(win).not.toBeNull();
    expect(win!.wm_pid).toBe(proc.pid); // never the unrelated window
    proc.kill('SIGKILL');
  });

  it('returns null (no attribution) when only unrelated windows exist', async () => {
    const fake = createFakeX11({ staticWindows: [{ id: '0x1002', pid: 99999, cls: 'Unrelated', workspace: 0, state: 1 }] });
    const x11 = new X11Backend(fake.exec, ':0');
    // identity of a process that has no window (pid not in /proc client scan)
    const identity = { pid: 999999, start_time: '123', exe: '/bin/false', cmdline: ['/bin/false'], resource_token: undefined };
    const win = await attributeProviderWindow(x11, identity, {});
    expect(win).toBeNull();
  });

  it('rejects a stale/reused window id after revalidation', async () => {
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const proc = spawnProvider();
    const identity = captureLaunchIdentity(proc.pid!);
    expect(identity).not.toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    const win = await attributeProviderWindow(x11, identity!, {});
    expect(win).not.toBeNull();

    // revalidation passes while the window is intact
    const ok = await revalidateWindow(x11, win!);
    expect(ok.ok).toBe(true);

    // window id reused by another pid -> rejected (the fake now maps the same
    // window id to an unrelated pid via a static window)
    fake.model.staticWindows.push({ id: win!.window_id, pid: 999999, cls: 'Other', workspace: 0, state: 1 });
    const reused = await revalidateWindow(x11, win!);
    expect(reused.ok).toBe(false);
    expect(reused.reason).toContain('now belongs to pid');

    // process start time changed -> rejected
    const stale = await revalidateWindow(x11, { ...win!, process_start_time: '000000' });
    expect(stale.ok).toBe(false);
    expect(stale.reason).toContain('start time changed');
    proc.kill('SIGKILL');
  });

  it('a window id with a dead provider pid fails closed', async () => {
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const res = await revalidateWindow(x11, {
      window_id: '0x9999',
      wm_pid: 999999,
      wm_class: 'x',
      wm_name: null,
      process_start_time: '123',
      workspace: 0,
      wm_state: 1,
      visible: true,
      resource_markers: [],
      observed_at: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
  });
});
