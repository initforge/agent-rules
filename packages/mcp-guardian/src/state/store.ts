/**
 * state/store.ts — broker runtime state store.
 *
 * SQLite (node:sqlite, WAL) in the user runtime directory — outside source
 * authority. Properties required by the owner contract §III:
 *   - atomic transactions            (SQLite transactions)
 *   - lock/CAS                       (partial unique index + guarded UPDATEs)
 *   - concurrent reader/writer safety(WAL + busy_timeout)
 *   - crash recovery                 (WAL journal)
 *   - file permission 0600           (db + WAL/SHM chmod after open)
 *   - no plaintext secret persistence(lease tokens stored as sha256 only)
 *   - owner/session ACL              (host_sessions table + token ownership)
 *   - schema versioning + migration  (schema_version + migrate())
 *   - stale lease cleanup            (broker.closeStaleLeases)
 *
 * Never JSON-append for concurrent multi-agent state.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StateStoreOptions {
  /** Defaults to XDG state dir: $XDG_STATE_HOME/agent-rules/mcp-broker or ~/.local/state/... */
  stateDir?: string;
  dbName?: string;
}

export const SCHEMA_VERSION = 1;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS leases (
  lease_id TEXT PRIMARY KEY,
  logical_session_id TEXT NOT NULL,
  host_kind TEXT NOT NULL,
  host_session_id TEXT,
  host_instance_id TEXT,
  project_root TEXT,
  source_window_fingerprint_hash TEXT,
  provider_id TEXT NOT NULL,
  provider_instance_id TEXT,
  mcp_connection_id TEXT,
  resource_id TEXT,
  transport TEXT,
  command_digest TEXT,
  profile_path TEXT,
  endpoint_reference TEXT,
  provider_pid INTEGER,
  provider_start_time TEXT,
  provider_window_fingerprints TEXT NOT NULL DEFAULT '[]',
  initial_workspace INTEGER,
  current_workspace INTEGER,
  visibility_mode TEXT NOT NULL DEFAULT 'visible-local',
  sharing_mode TEXT NOT NULL DEFAULT 'exclusive',
  owner_policy_hash TEXT,
  registry_hash TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_heartbeat_at TEXT,
  stale_after_ms INTEGER NOT NULL DEFAULT 300000,
  reconnect_attempts INTEGER NOT NULL DEFAULT 0,
  rollback_reference TEXT,
  lease_token_hash TEXT,
  updated_at TEXT NOT NULL
);
-- Idempotent acquisition: one active lease per (logical session, provider).
CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_active_exclusive
  ON leases(logical_session_id, provider_id)
  WHERE status IN ('CREATED','ACQUIRING','STARTING','READY','RELOCATED','RECONNECTING');
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
CREATE INDEX IF NOT EXISTS idx_leases_provider ON leases(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_logical ON leases(logical_session_id, status);

CREATE TABLE IF NOT EXISTS lease_transitions (
  transition_id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transitions_lease ON lease_transitions(lease_id, transition_id);

CREATE TABLE IF NOT EXISTS host_sessions (
  logical_session_id TEXT PRIMARY KEY,
  host_kind TEXT NOT NULL,
  host_session_id TEXT,
  host_instance_id TEXT,
  project_root TEXT,
  source_window_fingerprint_hash TEXT,
  granularity TEXT NOT NULL,
  attestation_status TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_host_sessions_host ON host_sessions(host_kind, host_session_id);

CREATE TABLE IF NOT EXISTS provider_instances (
  provider_instance_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  command_digest TEXT NOT NULL,
  transport TEXT NOT NULL,
  launched_by TEXT NOT NULL,
  launched_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_instances_provider ON provider_instances(provider_id);

CREATE TABLE IF NOT EXISTS runtime_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
];

export function defaultStateDir(): string {
  const base = process.env.XDG_STATE_HOME
    ? path.resolve(process.env.XDG_STATE_HOME)
    : path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'agent-rules', 'mcp-broker');
}

function chmod0600(p: string): void {
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* best effort */
  }
}

export class StateStore {
  readonly dbPath: string;
  readonly stateDir: string;
  private db: DatabaseSync;

  constructor(opts: StateStoreOptions = {}) {
    this.stateDir = opts.stateDir ?? process.env.AGENT_RULES_MCP_STATE_DIR ?? defaultStateDir();
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(this.stateDir, 0o700);
    } catch {
      /* best effort */
    }
    this.dbPath = path.join(this.stateDir, opts.dbName ?? 'broker.sqlite3');
    this.db = new DatabaseSync(this.dbPath);
    chmod0600(this.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec('PRAGMA synchronous=NORMAL;');
    chmod0600(`${this.dbPath}-wal`);
    chmod0600(`${this.dbPath}-shm`);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);');
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    const current = row?.version ?? 0;
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(m.sql);
        this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(m.version);
        this.db.exec('COMMIT;');
      } catch (e) {
        this.db.exec('ROLLBACK;');
        throw e;
      }
    }
  }

  schemaVersion(): number {
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  journalMode(): string {
    const row = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    return row.journal_mode;
  }

  dbMode(): string {
    try {
      const st = fs.statSync(this.dbPath);
      return (st.mode & 0o777).toString(8);
    } catch {
      return 'unknown';
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }

  // ---- low-level accessors used by the broker ------------------------------

  get dbHandle(): DatabaseSync {
    return this.db;
  }

  kvGet(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM runtime_kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  kvSet(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO runtime_kv (key, value) VALUES (?, ?)').run(key, value);
  }
}
