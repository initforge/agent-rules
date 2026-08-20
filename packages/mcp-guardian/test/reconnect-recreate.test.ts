/**
 * R-009 — reconnect and recreate: when the MCP process dies but the resource
 * survives, reconnect reattaches the SAME resource; when the resource truly
 * died, a NEW resource is created and RESOURCE_RECREATED is recorded with the
 * new identity — never pretend continuity, never attach to another lease.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-recon-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function readyLease(broker: Broker, sessionId = 'A', providerId = 'playwright-mcp'): { leaseId: string; token: string } {
  const { lease, lease_token } = broker.acquireLease({ logical_session_id: sessionId, host_kind: 'cli', provider_id: providerId });
  broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
  broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'launch');
  broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'ready');
  broker.attachProvider(lease.lease_id, lease_token, {
    provider_instance_id: 'provider_1',
    mcp_connection_id: 'conn_1',
    resource_id: 'cdp-127.0.0.1:9222-profile-qa',
    provider_pid: 10001,
    provider_start_time: '100',
    transport: 'stdio',
  });
  return { leaseId: lease.lease_id, token: lease_token };
}

describe('reconnect / recreate', () => {
  it('MCP process died, browser resource alive -> reattach same resource', () => {
    const broker = makeBroker();
    const { leaseId, token } = readyLease(broker);
    const lease = broker.reconnectProvider(leaseId, token, 'reattached', {
      new_provider_instance_id: 'provider_2',
      new_mcp_connection_id: 'conn_2',
      reason: 'MCP process died (exit 1); CDP endpoint still responding',
    });
    expect(lease.status).toBe('READY');
    expect(lease.resource_id).toBe('cdp-127.0.0.1:9222-profile-qa'); // same resource
    expect(lease.provider_instance_id).toBe('provider_2'); // new MCP process
    expect(lease.reconnect_attempts).toBe(1);
  });

  it('resource truly dead -> RESOURCE_RECREATED with a new resource id (no fake continuity)', () => {
    const broker = makeBroker();
    const { leaseId, token } = readyLease(broker);
    const lease = broker.reconnectProvider(leaseId, token, 'resource-recreated', {
      new_provider_instance_id: 'provider_3',
      new_mcp_connection_id: 'conn_3',
      new_resource_id: 'cdp-127.0.0.1:9223-profile-qa-2',
      reason: 'browser crashed; CDP endpoint unreachable',
    });
    expect(lease.status).toBe('RESOURCE_RECREATED');
    expect(lease.resource_id).toBe('cdp-127.0.0.1:9223-profile-qa-2');
    expect(lease.resource_id).not.toBe('cdp-127.0.0.1:9222-profile-qa');

    const receipts = broker.transitionsFor(leaseId);
    expect(receipts.some((r) => r.to_status === 'RESOURCE_RECREATED')).toBe(true);
    const recreate = receipts.find((r) => r.to_status === 'RESOURCE_RECREATED')!;
    expect(recreate.payload.resource_recreated).toBe(true);
    expect(recreate.payload.new_resource_id).toBe('cdp-127.0.0.1:9223-profile-qa-2');
  });

  it('a wrong token cannot reconnect or release a lease', () => {
    const broker = makeBroker();
    const { leaseId } = readyLease(broker);
    expect(() => broker.reconnectProvider(leaseId, 'bogus', 'reattached', { reason: 'x' })).toThrowError(/token does not prove ownership/);
    expect(() => broker.releaseLease(leaseId, 'bogus', 'x')).toThrowError(/token does not prove ownership/);
  });

  it('reconnect never attaches to another chat lease: token binding is strict', () => {
    const broker = makeBroker();
    const a = readyLease(broker, 'chat-a');
    const b = readyLease(broker, 'chat-b');
    // using A's token on B's lease fails
    expect(() => broker.reconnectProvider(b.leaseId, a.token, 'reattached', { reason: 'x' })).toThrowError(/token does not prove ownership/);
    // A's token cannot release B
    expect(() => broker.releaseLease(b.leaseId, a.token, 'x')).toThrowError(/token does not prove ownership/);
  });
});
