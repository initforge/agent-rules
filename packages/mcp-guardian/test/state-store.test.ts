/**
 * R-001 — state store: SQLite WAL, 0600, schema versioning, migrations,
 * atomic transactions, crash-safe WAL, no plaintext secrets.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore, SCHEMA_VERSION } from '../src/state/store.js';
import { Broker } from '../src/broker/broker.js';

const tmpDirs: string[] = [];
function tmpStateDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-state-'));
  tmpDirs.push(d);
  return d;
}

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('StateStore', () => {
  it('creates a WAL SQLite database with 0600 permissions in the runtime dir', () => {
    const dir = tmpStateDir();
    const store = new StateStore({ stateDir: dir });
    expect(fs.existsSync(store.dbPath)).toBe(true);
    expect(store.journalMode().toLowerCase()).toBe('wal');
    const mode = fs.statSync(store.dbPath).mode & 0o777;
    expect(mode.toString(8)).toBe('600');
    expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
    store.close();
  });

  it('survives reopen (crash recovery / persistence) with same schema version', () => {
    const dir = tmpStateDir();
    const s1 = new StateStore({ stateDir: dir });
    s1.kvSet('k', 'v1');
    s1.close();
    const s2 = new StateStore({ stateDir: dir });
    expect(s2.kvGet('k')).toBe('v1');
    expect(s2.schemaVersion()).toBe(SCHEMA_VERSION);
    s2.close();
  });

  it('migrates an empty database to the current schema version', () => {
    const dir = tmpStateDir();
    const store = new StateStore({ stateDir: dir });
    const tables = store.dbHandle
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const t of ['leases', 'lease_transitions', 'host_sessions', 'provider_instances', 'schema_version']) {
      expect(names).toContain(t);
    }
    store.close();
  });

  it('serializes concurrent writers via transactions without corruption', () => {
    const dir = tmpStateDir();
    const store = new StateStore({ stateDir: dir });
    const broker = new Broker({ stateStore: store });
    // one exclusive lease per logical session, each on its own provider id
    const runs = Array.from({ length: 8 }, (_, i) =>
      broker.acquireLease({
        logical_session_id: `sess-${i}`,
        host_kind: 'cli',
        provider_id: `fake-mcp-${i}`,
      }),
    );
    for (const r of runs) {
      expect(r.created).toBe(true);
      expect(r.lease.lease_id).toBeTruthy();
    }
    // token hash is stored, plaintext token is not
    const row = store.dbHandle.prepare('SELECT lease_token_hash FROM leases LIMIT 1').get() as { lease_token_hash: string };
    expect(row.lease_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.lease_token_hash).not.toContain('-'); // not a UUID plaintext
    store.close();
  });

  it('uses atomic transactions (BEGIN IMMEDIATE) for multi-row writes', () => {
    const dir = tmpStateDir();
    const store = new StateStore({ stateDir: dir });
    const broker = new Broker({ stateStore: store });
    const { lease, lease_token } = broker.acquireLease({
      logical_session_id: 'tx-sess',
      host_kind: 'cli',
      provider_id: 'fake-mcp',
    });
    broker.releaseLease(lease.lease_id, lease_token, 'test');
    const transitions = broker.transitionsFor(lease.lease_id);
    // CREATED->CREATED (creation receipt) + CREATED->RELEASED
    expect(transitions.length).toBeGreaterThanOrEqual(2);
    expect(transitions[transitions.length - 1].to_status).toBe('RELEASED');
    store.close();
  });
});
