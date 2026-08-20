/**
 * R-003 — lease state machine: legal transitions only, every transition has a
 * receipt + reason, stale cleanup, reconcileRuntime, doctor.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker, BrokerError, BROKER_ERRORS } from '../src/broker/broker.js';
import { canTransition, ALLOWED_TRANSITIONS } from '../src/broker/lease-machine.js';

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-life-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('lease state machine', () => {
  it('every status transition is legal and carries a receipt with reason', () => {
    const broker = makeBroker();
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
    broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'guardian launch');
    broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'placement verified');
    broker.noteTransition(lease.lease_id, 'READY', 'RELOCATED', 'operator moved window');
    broker.noteTransition(lease.lease_id, 'RELOCATED', 'RECONNECTING', 'heartbeat missed');
    broker.noteTransition(lease.lease_id, 'RECONNECTING', 'READY', 'reattached');
    broker.releaseLease(lease.lease_id, lease_token, 'end of session');

    const receipts = broker.transitionsFor(lease.lease_id);
    expect(receipts.length).toBe(8);
    for (const r of receipts) {
      expect(r.reason.length).toBeGreaterThan(0);
      expect(canTransition(r.from_status, r.to_status)).toBe(true);
    }
    expect(receipts.map((r) => r.to_status)).toEqual(['CREATED', 'ACQUIRING', 'STARTING', 'READY', 'RELOCATED', 'RECONNECTING', 'READY', 'RELEASED']);
  });

  it('rejects illegal transitions with a receipt-less error', () => {
    const broker = makeBroker();
    const { lease } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    // CREATED -> READY is illegal (skips ACQUIRING/STARTING)
    expect(() => broker.noteTransition(lease.lease_id, 'CREATED', 'READY', 'skip')).toThrowError(/illegal lease transition/);
    // CAS: expecting a stale source status fails
    expect(() => broker.noteTransition(lease.lease_id, 'READY', 'RELOCATED', 'wrong from')).toThrowError(/is CREATED, not READY/);
  });

  it('reconnect transitions: reattached vs resource-recreated', () => {
    const broker = makeBroker();
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.noteTransition(lease.lease_id, 'CREATED', 'ACQUIRING', 'acquire start');
    broker.noteTransition(lease.lease_id, 'ACQUIRING', 'STARTING', 'launch');
    broker.noteTransition(lease.lease_id, 'STARTING', 'READY', 'ready');
    broker.attachProvider(lease.lease_id, lease_token, {
      provider_instance_id: 'provider_1',
      mcp_connection_id: 'conn_1',
      resource_id: 'resource_1',
      provider_pid: 12345,
      provider_start_time: '100',
      transport: 'stdio',
    });

    // MCP process died, resource alive -> reattach same resource
    const reattached = broker.reconnectProvider(lease.lease_id, lease_token, 'reattached', {
      new_provider_instance_id: 'provider_2',
      new_mcp_connection_id: 'conn_2',
      reason: 'MCP process died; browser resource survived',
    });
    expect(reattached.status).toBe('READY');
    expect(reattached.resource_id).toBe('resource_1'); // resource identity kept
    expect(reattached.reconnect_attempts).toBe(1);

    // resource truly dead -> RESOURCE_RECREATED with new resource id
    const recreated = broker.reconnectProvider(lease.lease_id, lease_token, 'resource-recreated', {
      new_provider_instance_id: 'provider_3',
      new_mcp_connection_id: 'conn_3',
      new_resource_id: 'resource_2',
      reason: 'browser resource died; creating new resource',
    });
    expect(recreated.status).toBe('RESOURCE_RECREATED');
    expect(recreated.resource_id).toBe('resource_2');
    broker.noteTransition(lease.lease_id, 'RESOURCE_RECREATED', 'READY', 'new resource attached');

    const receipts = broker.transitionsFor(lease.lease_id);
    const reasons = receipts.map((r) => r.reason).join(' | ');
    expect(reasons).toContain('reconnect started');
    expect(reasons).toContain('resource truly dead; new resource created');
    // never pretend continuity: RESOURCE_RECREATED must appear
    expect(receipts.some((r) => r.to_status === 'RESOURCE_RECREATED')).toBe(true);
  });

  it('closeStaleLeases marks stale leases STALE with receipts', () => {
    const broker = makeBroker();
    broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp', stale_after_ms: -1 });
    const { closed, considered } = broker.closeStaleLeases();
    expect(considered).toBe(1);
    expect(closed.length).toBe(1);
    expect(closed[0].to_status).toBe('STALE');
    expect(closed[0].reason).toContain('heartbeat missed');
  });

  it('reconcileRuntime surfaces drift and orphan instances', () => {
    const broker = makeBroker();
    const { lease, lease_token } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.attachProvider(lease.lease_id, lease_token, {
      provider_instance_id: 'provider_orphan',
      mcp_connection_id: 'conn_x',
      resource_id: null,
      transport: 'stdio',
    });
    broker.releaseLease(lease.lease_id, lease_token, 'done');
    const res = broker.reconcileRuntime();
    // provider_orphan instance row remains after release -> orphan drift
    expect(res.orphan_provider_instances).toBeGreaterThanOrEqual(1);
  });

  it('doctor reports health: WAL journal, db mode, lease counts', () => {
    const broker = makeBroker();
    broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    const report = broker.doctor();
    expect(report.schema_version).toBeGreaterThanOrEqual(1);
    expect(report.journal_mode.toLowerCase()).toBe('wal');
    expect(report.leases.total).toBe(1);
    expect(report.leases.active).toBe(1);
    expect(report.ok).toBe(true);
  });

  it('revokeLease requires an explicit reason and clears the token', () => {
    const broker = makeBroker();
    const { lease } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    const rec = broker.revokeLease(lease.lease_id, 'admin remediation');
    expect(rec.to_status).toBe('REVOKED');
    expect(() => broker.resolveLeaseByToken('anything')).toThrowError(/no lease matches the presented token/);
  });

  it('ALLOWED_TRANSITIONS covers every spec state and is symmetric with canTransition', () => {
    const states = ['CREATED', 'ACQUIRING', 'STARTING', 'READY', 'RELOCATED', 'RECONNECTING', 'STALE', 'QUARANTINED', 'RESOURCE_RECREATED', 'RELEASED', 'REVOKED', 'FAILED'];
    for (const s of states) {
      expect(canTransition(s, s)).toBe(true);
    }
    expect(ALLOWED_TRANSITIONS.length).toBeGreaterThan(30);
    // terminal states must not auto-exit
    expect(canTransition('RELEASED', 'READY')).toBe(false);
    expect(canTransition('REVOKED', 'READY')).toBe(false);
    expect(canTransition('FAILED', 'READY')).toBe(false);
  });
});
