/**
 * R-004 — sharing model: exclusive is the default; shared-readonly /
 * shared-explicit require explicit policy; shared-safe registry marking is
 * required; no sharing_mode defaults to exclusive.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../src/state/store.js';
import { Broker, BrokerError, BROKER_ERRORS } from '../src/broker/broker.js';

const tmpDirs: string[] = [];
function makeBroker(): Broker {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-share-'));
  tmpDirs.push(d);
  return new Broker({ stateStore: new StateStore({ stateDir: d }) });
}
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('sharing model', () => {
  it('defaults to exclusive when no sharing_mode is given', () => {
    const broker = makeBroker();
    const { lease } = broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    expect(lease.sharing_mode).toBe('exclusive');
  });

  it('rejects implicit sharing: shared modes require an explicit owner policy hash', () => {
    const broker = makeBroker();
    expect(() =>
      broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp', sharing_mode: 'shared-readonly' }),
    ).toThrowError(/sharing_mode=shared/);
    expect(() =>
      broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp', sharing_mode: 'shared-explicit' }),
    ).toThrowError(/sharing_mode=shared/);
  });

  it('accepts shared-readonly with explicit policy hash AND registry shared-safe evidence', () => {
    const broker = makeBroker();
    const { lease } = broker.acquireLease({
      logical_session_id: 'A',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      sharing_mode: 'shared-readonly',
      owner_policy_hash: 'policy-abc',
      shared_safe_provider: true,
    });
    expect(lease.sharing_mode).toBe('shared-readonly');
  });

  it('rejects shared mode for providers NOT marked shared-safe in the registry', () => {
    const broker = makeBroker();
    expect(() =>
      broker.acquireLease({
        logical_session_id: 'A',
        host_kind: 'cli',
        provider_id: 'fake-mcp',
        sharing_mode: 'shared-readonly',
        owner_policy_hash: 'policy-abc',
      }),
    ).toThrowError(/sharing_mode=shared/);
  });

  it('keeps leases exclusive: a shared join is rejected while an exclusive holder exists', () => {
    const broker = makeBroker();
    broker.acquireLease({ logical_session_id: 'A', host_kind: 'cli', provider_id: 'fake-mcp' });
    expect(() =>
      broker.acquireLease({
        logical_session_id: 'B',
        host_kind: 'cli',
        provider_id: 'fake-mcp',
        sharing_mode: 'shared-readonly',
        owner_policy_hash: 'policy-abc',
        shared_safe_provider: true,
      }),
    ).toThrowError(/held exclusively/);
  });

  it('allows two explicitly-shared leases on a shared-safe provider (pool join)', () => {
    const broker = makeBroker();
    const a = broker.acquireLease({
      logical_session_id: 'A',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      sharing_mode: 'shared-readonly',
      owner_policy_hash: 'policy-abc',
      shared_safe_provider: true,
    });
    const b = broker.acquireLease({
      logical_session_id: 'B',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
      sharing_mode: 'shared-readonly',
      owner_policy_hash: 'policy-abc',
      shared_safe_provider: true,
    });
    expect(a.lease.lease_id).not.toBe(b.lease.lease_id);
  });
});
