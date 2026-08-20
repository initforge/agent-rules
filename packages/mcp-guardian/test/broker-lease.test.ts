/**
 * R-002 — lease acquisition is idempotent per (logical_session_id, provider);
 * concurrent acquires converge; exclusive leases are never shared across
 * logical sessions without explicit policy.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker, BrokerError, BROKER_ERRORS } from '../src/broker/broker.js';

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-lease-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('acquireLease idempotency', () => {
  it('returns the same lease for the same logical session + provider', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({ logical_session_id: 'A', host_kind: 'opencode', provider_id: 'playwright-mcp' });
    const b = broker.acquireLease({ logical_session_id: 'A', host_kind: 'opencode', provider_id: 'playwright-mcp' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.lease.lease_id).toBe(a.lease.lease_id);
    expect(broker.listLeases({ logicalSessionId: 'A' }).length).toBe(1);
  });

  it('concurrent acquires converge on one lease (single writer via SQLite CAS)', () => {
    const broker = makeBroker();
    const results = Array.from({ length: 6 }, () =>
      broker.acquireLease({ logical_session_id: 'conc', host_kind: 'cli', provider_id: 'fake-mcp' }),
    );
    const ids = new Set(results.map((r) => r.lease.lease_id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created).length).toBe(1);
  });

  it('different logical sessions never REUSE an exclusive lease (each gets its own instance)', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({ logical_session_id: 'A', host_kind: 'opencode', provider_id: 'playwright-mcp' });
    const b = broker.acquireLease({ logical_session_id: 'B', host_kind: 'opencode', provider_id: 'playwright-mcp' });
    expect(b.lease.lease_id).not.toBe(a.lease.lease_id);
    expect(b.created).toBe(true);
    // A's token does not work on B's lease
    expect(() => broker.resolveLease(b.lease.lease_id, a.lease_token)).toThrowError(/token does not prove ownership/);
  });

  it('token is one-time: only the creator receives it; resolve requires it', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({ logical_session_id: 'tok', host_kind: 'cli', provider_id: 'fake-mcp' });
    const b = broker.acquireLease({ logical_session_id: 'tok', host_kind: 'cli', provider_id: 'fake-mcp' });
    expect(b.lease_token).toBe(''); // existing lease: no token re-issued
    expect(() => broker.resolveLease(a.lease.lease_id, 'wrong-token')).toThrowError(/token does not prove ownership/);
    expect(broker.resolveLease(a.lease.lease_id, a.lease_token).lease_id).toBe(a.lease.lease_id);
  });

  it('a released lease can be re-acquired by another logical session (new lease)', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    broker.releaseLease(a.lease.lease_id, a.lease_token, 'end of session');
    const b = broker.acquireLease({ logical_session_id: 'B', host_kind: 'cli', provider_id: 'fake-mcp' });
    expect(b.created).toBe(true);
    expect(b.lease.lease_id).not.toBe(a.lease.lease_id);
  });

  it('stale leases are not silently reclaimed without ownership proof', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp', stale_after_ms: -1 });
    const { closed } = broker.closeStaleLeases();
    expect(closed.length).toBe(1);
    expect(closed[0].to_status).toBe('STALE');
    // A different session gets its OWN new lease; the stale lease is never
    // silently reclaimed or reused.
    const b = broker.acquireLease({ logical_session_id: 'B', host_kind: 'cli', provider_id: 'fake-mcp' });
    expect(b.created).toBe(true);
    expect(b.lease.lease_id).not.toBe(a.lease.lease_id);
    expect(broker.getLease(a.lease.lease_id)!.status).toBe('STALE'); // untouched
    // The owner can still release the stale lease with token proof.
    broker.releaseLease(a.lease.lease_id, a.lease_token, 'owner reclaimed after staleness');
    expect(broker.getLease(a.lease.lease_id)!.status).toBe('RELEASED');
  });

  it('persistent lease has no TTL: idle time never expires it (only explicit stop or closeStaleLeases does)', () => {
    const broker = makeBroker();
    const { lease, lease_token } = broker.acquireLease({
      logical_session_id: 'no-ttl',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      stale_after_ms: 1, // owner §6: no idle expiry — even a tiny staleness window must NOT auto-transition
    });
    // a fresh closeStaleLeases pass is the ONLY way a lease can become STALE;
    // nothing else in the broker ever touches it while the session is quiet.
    const before = broker.getLease(lease.lease_id)!;
    expect(before.status).toBe('CREATED');
    expect(before.expires_at ?? null).toBeNull(); // no TTL column/field exists
    // repeated list/reconcile-style reads leave the lease untouched
    broker.listLeases({ logicalSessionId: 'no-ttl' });
    broker.reconcileRuntime();
    expect(broker.getLease(lease.lease_id)!.status).toBe('CREATED');
    // explicit stop is the normal terminal path
    broker.releaseLease(lease.lease_id, lease_token, 'end of session');
    expect(broker.getLease(lease.lease_id)!.status).toBe('RELEASED');
  });
});
