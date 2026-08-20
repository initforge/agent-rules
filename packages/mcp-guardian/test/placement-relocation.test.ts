/**
 * R-008 — placement and relocation: 10-step X11 EWMH placement with snapshots,
 * non-activating move, READY after verification; after READY the guardian
 * never auto-moves the provider and operator relocations become RELOCATED
 * events with unchanged provider/resource/lease identity.
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
import { createFakeX11 } from './helpers/fake-x11.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE_MCP = path.join(__dirname, 'helpers', 'fake-mcp-server.mjs');

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-place-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('placement', () => {
  it('moves the provider to the initial workspace with a non-activating move and keeps the owner desktop', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const guardian = new Guardian({ broker, x11 });
    const { lease, lease_token } = broker.acquireLease({
      logical_session_id: 'A',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      initial_workspace: 3,
    });
    const res = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: 3,
    });
    expect(res.ok).toBe(true);
    expect(res.placement?.provider_window?.workspace).toBe(3);
    expect(res.placement?.desktop_after).toBe(0); // owner desktop unchanged
    expect(res.placement?.active_window_after).toBeNull(); // never activated
    // the move used wmctrl -i -r -t (non-activating) — recorded in fake model
    expect(fake.model.moveCalls.length).toBeGreaterThanOrEqual(1);
    const leaseAfter = broker.getLease(lease.lease_id)!;
    expect(leaseAfter.status).toBe('READY');
    expect(leaseAfter.initial_workspace).toBe(3);
    expect(leaseAfter.current_workspace).toBe(3);
    guardian.terminateProvider(lease.lease_id);
  });

  it('records an operator relocation as RELOCATED and never auto-moves back', async () => {
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
    const res = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: 2,
    });
    expect(res.ok).toBe(true);
    const movesBefore = fake.model.moveCalls.length;

    // Owner drags the browser from desktop 2 to desktop 5.
    fake.model.providerWorkspaceOverride = 5;
    const observed = await guardian.observe(lease.lease_id);
    expect(observed.workspace).toBe(5);
    const leaseAfter = broker.getLease(lease.lease_id)!;
    expect(leaseAfter.status).toBe('RELOCATED');
    expect(leaseAfter.current_workspace).toBe(5);
    // provider/resource/lease identity unchanged
    expect(leaseAfter.lease_id).toBe(lease.lease_id);
    expect(leaseAfter.provider_instance_id).toBe(res.provider_instance_id);

    // The guardian did NOT move the provider back and did NOT switch desktops.
    expect(fake.model.moveCalls.length).toBe(movesBefore);
    expect(fake.model.activeDesktop).toBe(0);

    // Multiple moves keep RELOCATED with new workspace.
    fake.model.providerWorkspaceOverride = 4;
    await guardian.observe(lease.lease_id);
    expect(broker.getLease(lease.lease_id)!.current_workspace).toBe(4);
    expect(broker.getLease(lease.lease_id)!.status).toBe('RELOCATED');
    expect(fake.model.moveCalls.length).toBe(movesBefore);

    const receipts = broker.transitionsFor(lease.lease_id);
    expect(receipts.some((r) => r.reason.includes('moved to another virtual desktop'))).toBe(true);
    guardian.terminateProvider(lease.lease_id);
  });

  it('owner minimize/close are operator events, never auto-restored', async () => {
    const broker = makeBroker();
    const fake = createFakeX11();
    const x11 = new X11Backend(fake.exec, ':0');
    const guardian = new Guardian({ broker, x11 });
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    const res = await guardian.connect(lease.lease_id, lease_token, {
      command: process.execPath,
      args: [FAKE_MCP],
      env: {},
      display: ':0',
      requireWindow: true,
      initialWorkspace: null,
    });
    expect(res.ok).toBe(true);

    fake.model.providerIconic = true;
    await guardian.observe(lease.lease_id);
    const receipts = broker.transitionsFor(lease.lease_id);
    expect(receipts.some((r) => r.payload?.operator_event === 'minimized')).toBe(true);
    // no unminimize call was issued
    expect(fake.model.moveCalls.length).toBe(0);
    guardian.terminateProvider(lease.lease_id);
  });
});
