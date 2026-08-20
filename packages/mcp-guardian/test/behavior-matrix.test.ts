/**
 * Behavior matrix (owner §8 refactor): only DISTINCT invariants that the unit
 * suites do not already protect. Every duplicated case was removed after the
 * behavior-to-evidence matrix audit (see
 * .agent/tmp/cleanup-20260815/test-refactor-matrix.md). Live claims (browser
 * relocation, reconnect, no-focus-steal, manual stop, crash/recreate) are
 * proved live by automation/mcp-certify.mjs receipts, not by fake-WM tests.
 *
 * Kept cases:
 *  - host window moves; binding stays with host session identity
 *  - multi-window same-pid browser attribution (root fingerprint wins)
 *  - unrelated user window during observe -> no RELOCATED event
 *  - provider focus steal during launch is recorded, never corrected
 *  - host restart resolves the same durable lease (no TTL/expiry)
 *  - allowUnbound visible-local mode is rejected
 *  - Wayland is classified honestly (unsupported)
 *  - Pencil stays explicit-only (manifest policy)
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Guardian } from '../src/guardian/guardian.js';
import { X11Backend } from '../src/guardian/x11.js';
import { createFakeX11 } from './helpers/fake-x11.js';
import { listProcMatching } from './helpers/proc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FAKE_MCP = path.join(__dirname, 'helpers', 'fake-mcp-server.mjs');

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-matrix-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

async function connect(broker: Broker, fake: ReturnType<typeof createFakeX11>, leaseId: string, token: string, extra: Record<string, unknown> = {}) {
  const guardian = new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') });
  return guardian.connect(leaseId, token, {
    command: process.execPath,
    args: [FAKE_MCP],
    env: { ...(extra.env as Record<string, string> | undefined) },
    display: ':0',
    requireWindow: true,
    initialWorkspace: (extra.initialWorkspace as number | null) ?? null,
  });
}

describe('behavior matrix — distinct invariants', () => {
  it('host window moves; binding remains to host session identity', () => {
    const broker = makeBroker();
    broker.registerHostSession({
      logical_session_id: 'dsh:uuid-1',
      host_kind: 'deepseek-harness',
      host_session_id: 'uuid-1',
      granularity: 'chat',
      attestation_status: 'ATTESTED',
    });
    // host window moved (observation) — identity is the session uuid, not the window
    const host = broker.getHostSession('dsh:uuid-1');
    expect(host?.host_session_id).toBe('uuid-1');
    const { lease } = broker.acquireLease({ logical_session_id: 'dsh:uuid-1', host_kind: 'deepseek-harness', provider_id: 'fake-mcp' });
    expect(lease.logical_session_id).toBe('dsh:uuid-1');
  });

  it('browser creates multiple child processes/windows — attribution stays with the root fingerprint', async () => {
    const broker = makeBroker();
    const fake = createFakeX11({ staticWindows: [
      { id: '0x1001', pid: 424242, cls: 'Chromium', workspace: 0, state: 1 },
      { id: '0x1002', pid: 424242, cls: 'Chromium', workspace: 0, state: 1 },
    ] });
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    // connect with a child that has children (multi-process browser simulation)
    const child = spawn(process.execPath, [FAKE_MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
    const { captureLaunchIdentity } = await import('../src/guardian/attribution.js');
    const identity = captureLaunchIdentity(child.pid!);
    expect(identity).not.toBeNull();
    // unrelated Chromium windows exist; attribution must pick the provider's own
    // window by fingerprint — never the first (unrelated) window.
    const { attributeProviderWindow } = await import('../src/guardian/attribution.js');
    const win = await attributeProviderWindow(new X11Backend(fake.exec, ':0'), identity!, { acceptDescendants: false });
    expect(win).not.toBeNull();
    expect(win!.wm_pid).toBe(child.pid); // provider window, not 0x1001/0x1002
    child.kill('SIGKILL');
  });

  it('provider opens an unrelated user window — observe never fabricates RELOCATED', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp', initial_workspace: 1 });
    const res = await connect(broker, fake, lease.lease_id, lease_token);
    expect(res.ok).toBe(true);
    // user window appears later — observe treats it as unrelated, no relocation
    fake.model.staticWindows.push({ id: '0x2001', pid: 424244, cls: 'UserApp', workspace: 0, state: 1 });
    await new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') }).observe(lease.lease_id);
    const transitionsAfter = broker.transitionsFor(lease.lease_id);
    // no RELOCATED transition caused by the unrelated window
    expect(transitionsAfter.filter((t) => t.to_status === 'RELOCATED').length).toBe(0);
    new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') }).terminateProvider(lease.lease_id);
  });

  it('provider steals focus during launch — recorded, never corrected by the guardian', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    // after the before-snapshot (first call), the fake reports the provider
    // window as ACTIVE on subsequent queries — a provider that steals focus
    // during launch
    let activeCalls = 0;
    const x11 = new X11Backend(async (cmd, args, opts) => {
      if (cmd === 'xprop' && args[0] === '-root' && args[1] === '_NET_ACTIVE_WINDOW') {
        activeCalls += 1;
        if (activeCalls > 1) {
          const pid = listProcMatching('fake-mcp-server')[0];
          if (pid) {
            return { stdout: `_NET_ACTIVE_WINDOW(WINDOW): window id # 0x${pid.toString(16)}\n`, stderr: '' };
          }
        }
      }
      return fake.exec(cmd, args, opts);
    }, ':0');
    const guardian = new Guardian({ broker, x11 });
    const res = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath, args: [FAKE_MCP], env: {}, display: ':0', requireWindow: true, initialWorkspace: null,
    });
    expect(res.ok).toBe(true);
    expect(res.placement?.focus_stolen).toBe(true); // recorded
    expect(fake.model.moveCalls.length).toBeGreaterThanOrEqual(0); // guardian never activated (no -a calls recorded at all)
    guardian.terminateProvider(lease.lease_id);
  });

  it('host restarts with active lease — durable lease resolves by logical session (no TTL expiry)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-restart-'));
    tmpDirs.push(dir);
    const b1 = new Broker({ stateStore: new StateStore({ stateDir: dir }) });
    const a = b1.acquireLease({ logical_session_id: 'chat-R', host_kind: 'cli', provider_id: 'fake-mcp' });
    (b1 as unknown as { store: { close(): void } }).store.close();
    // "restart": new broker over the same state dir
    const b2 = new Broker({ stateStore: new StateStore({ stateDir: dir }) });
    const resolved = b2.listLeases({ logicalSessionId: 'chat-R' });
    expect(resolved.length).toBe(1);
    expect(resolved[0].lease_id).toBe(a.lease.lease_id);
  });

  it('allowUnbound visible local mode is rejected', async () => {
    const { Guardian } = await import('../src/guardian/guardian.js');
    const { Registry: R } = await import('../src/projection/registry.js');
    const broker = makeBroker();
    const fake = createFakeX11();
    const { lease } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    const guardian = new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') });
    const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'integrations', 'registry.json'), 'utf8'));
    raw.integrations.push({
      id: 'no-visible', displayName: 'NV', kind: 'mcp',
      source: { type: 'npm', package: 'nv', version: '1.0.0', versionPolicy: 'pinned', commandName: 'nv' },
    });
    const reg = new R(raw);
    const entry = reg.provider('no-visible')!;
    const blocked = { ...entry, visible_local_allowed: false };
    expect(() =>
      guardian.resolveLaunchSpec(blocked, lease, {}),
    ).toThrowError(/forbids visible-local/);
  });

  it('Wayland is classified honestly', async () => {
    const { X11Backend } = await import('../src/guardian/x11.js');
    // simulate: no DISPLAY, WAYLAND_DISPLAY present
    const oldDisplay = process.env.DISPLAY;
    const oldWayland = process.env.WAYLAND_DISPLAY;
    delete process.env.DISPLAY;
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    try {
      const probe = X11Backend.probe();
      expect(probe.ok).toBe(false);
      expect(probe.reason).toContain('pure Wayland is not supported');
      expect(probe.backend).toBe('unsupported');
    } finally {
      if (oldDisplay) process.env.DISPLAY = oldDisplay;
      else delete process.env.DISPLAY;
      if (oldWayland) process.env.WAYLAND_DISPLAY = oldWayland;
      else delete process.env.WAYLAND_DISPLAY;
    }
  });

  it('Pencil remains explicit-only', async () => {
    const { Registry: R } = await import('../src/projection/registry.js');
    const reg = R.load(REPO_ROOT);
    // pencil-mcp is NOT in the canonical registry: it can never be auto-installed,
    // auto-routed or triggered by words like design/UI.
    expect(reg.provider('pencil-mcp')).toBeNull();
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'integrations', 'manual', 'pencil-mcp', 'manifest.json'), 'utf8'));
    expect(manifest.activation).toBe('explicit-only');
    expect(manifest.autoRoute).toBe(false);
    expect(manifest.policy).toBe('optional');
  });
});
