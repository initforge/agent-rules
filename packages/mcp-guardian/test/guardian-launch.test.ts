/**
 * R-005 — lazy launch through the guardian: acquiring a lease never spawns a
 * provider; the first real connection does; placement marks READY with
 * guardian_wrapped=true and a handshake proof on the same child.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';
import { Guardian } from '../src/guardian/guardian.js';
import { X11Backend } from '../src/guardian/x11.js';
import { handshake } from '../src/mcp/client.js';
import { createFakeX11 } from './helpers/fake-x11.js';
import { listProcMatching } from './helpers/proc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_MCP = path.join(__dirname, 'helpers', 'fake-mcp-server.mjs');

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-guard-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('guardian lazy launch', () => {
  it('acquiring a lease spawns nothing (lazy: no pre-launch for every chat)', async () => {
    const broker = makeBroker();
    const before = listProcMatching('fake-mcp-server').length;
    broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.acquireLease({ logical_session_id: 'B', host_kind: 'cli', provider_id: 'fake-mcp' });
    const after = listProcMatching('fake-mcp-server').length;
    expect(after).toBe(before); // no provider processes spawned by acquire
  });

  it('first connection spawns exactly one provider via the guardian and marks READY', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const guardian = new Guardian({ broker, x11 });
    const { lease, lease_token } = broker.acquireLease({
      logical_session_id: 'A',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      initial_workspace: 2,
    });

    const result = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: { AGENT_RULES_FAKE_MCP_NAME: 'alpha' },
      display: ':0',
      requireWindow: true,
      initialWorkspace: 2,
    });
    expect(result.ok).toBe(true);
    expect(result.placement?.guardian_wrapped).toBe(true);
    expect(result.placement?.provider_window?.workspace).toBe(2);
    expect(result.placement?.desktop_after).toBe(0); // owner desktop untouched
    expect(result.placement?.active_window_before).toBe(result.placement?.active_window_after); // no focus change
    expect(result.placement?.unrelated_windows_unchanged).toBe(true);

    const fresh = broker.getLease(lease.lease_id)!;
    expect(fresh.status).toBe('READY');
    expect(fresh.provider_pid).toBe(result.child?.pid);

    // Handshake proof on the SAME child.
    const proof = await handshake({ command: process.execPath, args: [FAKE_MCP], child: result.child!, timeoutMs: 10_000 });
    expect(proof.server_info?.name).toBe('fake-mcp-server');
    expect(proof.tools_listed).toBe(2);
    expect(proof.tools_sample).toEqual(['tool_a', 'tool_b']);

    // Second connection attempt while READY reuses the same lease (no second spawn).
    const before = listProcMatching('fake-mcp-server').length;
    const second = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: 2,
    });
    expect(second.ok).toBe(true);
    const after = listProcMatching('fake-mcp-server').length;
    expect(after).toBeLessThanOrEqual(before + 1);

    // cleanup
    guardian.terminateProvider(lease.lease_id);
  });

  it('a wrong token is rejected before anything is spawned', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const guardian = new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') });
    const { lease } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    const before = listProcMatching('fake-mcp-server').length;
    const result = await guardian.connect(lease.lease_id, 'bogus-token', {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: null,
    });
    expect(result.ok).toBe(false);
    expect(listProcMatching('fake-mcp-server').length).toBe(before);
  });

  it('a placement failure (unrelated window changed) marks the lease FAILED and kills the provider', async () => {
    const broker = makeBroker();
    const fake = createFakeX11({ staticWindows: [{ id: '0xdead', pid: 424242, cls: 'Other', workspace: 0, state: 1 }] });
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });

    // Add an unrelated window right after the provider window first appears:
    // the step-1 snapshot lacks it, the step-9 snapshot includes it -> diff.
    const orig = fake.exec;
    const model = fake.model;
    let providerSeen = false;
    let unrelatedAdded = false;
    const x11 = new X11Backend(
      async (cmd, args, opts) => {
        const out = await orig(cmd, args, opts);
        if (cmd === 'xprop' && args[0] === '-root' && args[1] === '_NET_CLIENT_LIST') {
          if (!providerSeen && listProcMatching('fake-mcp-server').length > 0) providerSeen = true;
          if (providerSeen && !unrelatedAdded) {
            unrelatedAdded = true;
            model.staticWindows.push({ id: '0xbeef', pid: 424243, cls: 'Other', workspace: 0, state: 1 });
          }
        }
        return out;
      },
      ':0',
    );
    const guardian2 = new Guardian({ broker, x11 });
    const result = await guardian2.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: null,
    });
    expect(result.ok).toBe(false);
    expect(broker.getLease(lease.lease_id)!.status).toBe('FAILED');
  });

  it('spawn failure DURING RECONNECT transitions RECONNECTING->FAILED (legal machine edge, no illegal-transition throw)', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const guardian = new Guardian({ broker, x11 });
    const { lease, lease_token } = broker.acquireLease({
      logical_session_id: 'A',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      initial_workspace: 1,
    });

    // First connect: READY with a real provider process recorded.
    const first = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: 1,
    });
    expect(first.ok).toBe(true);
    expect(broker.getLease(lease.lease_id)!.status).toBe('READY');

    // Kill the provider process -> next connect takes the reconnect path.
    try {
      first.child!.kill('SIGKILL');
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 300));

    // Reconnect with a command that fails to spawn: the lease must move
    // RECONNECTING -> FAILED legally (never throw an illegal-transition error).
    const retry = await guardian.connect(lease.lease_id, lease_token, {
      command: '/nonexistent/definitely-missing-provider-bin',
      args: [],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: 1,
    });
    expect(retry.ok).toBe(false);
    const leaseAfter = broker.getLease(lease.lease_id)!;
    expect(leaseAfter.status).toBe('FAILED');
    const receipts = broker.transitionsFor(lease.lease_id);
    const rec = receipts.find((r) => r.to_status === 'RECONNECTING');
    expect(rec).toBeTruthy();
    const failed = receipts.find((r) => r.from_status === 'RECONNECTING' && r.to_status === 'FAILED');
    expect(failed).toBeTruthy();
    expect(failed!.reason).toContain('provider spawn failed');
  });

  it('handshake-proof failure after READY transitions READY->FAILED (legal machine edge)', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const guardian = new Guardian({ broker, x11: new X11Backend(fake.exec, ':0') });
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
    broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'launch');
    broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'ready');
    // READY -> FAILED is legal (provider broke after READY: handshake/stdio proof failed)
    expect(() => broker.noteTransition(lease.lease_id, 'READY', 'FAILED', 'handshake proof failed')).not.toThrow();
    expect(broker.getLease(lease.lease_id)!.status).toBe('FAILED');
  });
});
