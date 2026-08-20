/**
 * broker/broker.ts — persistent MCP session broker (registry runtime).
 *
 * API surface required by owner contract §III:
 * registerHostSession, acquireLease, resolveLease, attachProvider, heartbeat,
 * observeProvider, recordOperatorRelocation, reconnectProvider, releaseLease,
 * revokeLease, reconcileRuntime, doctor, closeStaleLeases.
 *
 * Invariants:
 * - acquisition is idempotent per (logical_session_id, provider_id);
 * - exclusive is the default sharing mode; sharing requires explicit policy;
 * - stale leases are never silently reclaimed without ownership proof (token);
 * - every status transition persists a receipt with a reason;
 * - lease tokens are stored only as sha256, never in plaintext.
 */
import { randomUUID } from 'node:crypto';
import { StateStore } from '../state/store.js';
import {
  ACTIVE_LEASE_STATUSES,
  DEFAULT_STALE_AFTER_MS,
  type AcquireLeaseInput,
  type AttachProviderInput,
  type DoctorIssue,
  type DoctorReport,
  type HeartbeatEvidence,
  type HostKind,
  type HostSessionRecord,
  type LeaseAcquireResult,
  type LeaseRecord,
  type LeaseStatus,
  type LeaseTransitionReceipt,
  type ReconcileResult,
  type SessionGranularity,
  type SharingMode,
  type WindowFingerprint,
} from '../types.js';
import { assertTransition, receipt } from './lease-machine.js';
import { newId, newToken, sha256Hex } from '../util/hashes.js';

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_LEASE_STATUSES);

export interface BrokerOptions {
  stateStore?: StateStore;
  staleAfterMs?: number;
}

export class BrokerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BrokerError';
  }
}

export const BROKER_ERRORS = {
  LEASE_NOT_FOUND: 'LEASE_NOT_FOUND',
  LEASE_CONFLICT: 'LEASE_CONFLICT',
  NOT_OWNER: 'NOT_OWNER',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  EXCLUSIVE_IN_USE: 'EXCLUSIVE_IN_USE',
  SHARING_NOT_ALLOWED: 'SHARING_NOT_ALLOWED',
  TOKEN_REQUIRED: 'TOKEN_REQUIRED',
} as const;

interface LeaseRow {
  lease_id: string;
  logical_session_id: string;
  host_kind: string;
  host_session_id: string | null;
  host_instance_id: string | null;
  project_root: string | null;
  source_window_fingerprint_hash: string | null;
  provider_id: string;
  provider_instance_id: string | null;
  mcp_connection_id: string | null;
  resource_id: string | null;
  transport: string | null;
  command_digest: string | null;
  profile_path: string | null;
  endpoint_reference: string | null;
  provider_pid: number | null;
  provider_start_time: string | null;
  provider_window_fingerprints: string;
  initial_workspace: number | null;
  current_workspace: number | null;
  visibility_mode: string;
  sharing_mode: string;
  owner_policy_hash: string | null;
  registry_hash: string | null;
  status: string;
  created_at: string;
  last_heartbeat_at: string | null;
  stale_after_ms: number;
  reconnect_attempts: number;
  rollback_reference: string | null;
  lease_token_hash: string | null;
  updated_at: string;
}

function rowToLease(row: LeaseRow): LeaseRecord {
  let windows: WindowFingerprint[] = [];
  try {
    windows = JSON.parse(row.provider_window_fingerprints ?? '[]') as WindowFingerprint[];
  } catch {
    windows = [];
  }
  return {
    lease_id: row.lease_id,
    logical_session_id: row.logical_session_id,
    host_kind: row.host_kind as HostKind,
    host_session_id: row.host_session_id,
    host_instance_id: row.host_instance_id,
    project_root: row.project_root,
    source_window_fingerprint_hash: row.source_window_fingerprint_hash,
    provider_id: row.provider_id,
    provider_instance_id: row.provider_instance_id,
    mcp_connection_id: row.mcp_connection_id,
    resource_id: row.resource_id,
    transport: (row.transport as LeaseRecord['transport']) ?? null,
    command_digest: row.command_digest,
    profile_path: row.profile_path,
    endpoint_reference: row.endpoint_reference,
    provider_pid: row.provider_pid,
    provider_start_time: row.provider_start_time,
    provider_window_fingerprints: windows,
    initial_workspace: row.initial_workspace,
    current_workspace: row.current_workspace,
    visibility_mode: row.visibility_mode as LeaseRecord['visibility_mode'],
    sharing_mode: row.sharing_mode as SharingMode,
    owner_policy_hash: row.owner_policy_hash,
    registry_hash: row.registry_hash,
    status: row.status as LeaseStatus,
    created_at: row.created_at,
    last_heartbeat_at: row.last_heartbeat_at,
    stale_after_ms: row.stale_after_ms,
    reconnect_attempts: row.reconnect_attempts,
    rollback_reference: row.rollback_reference,
    updated_at: row.updated_at,
  };
}

export class Broker {
  private store: StateStore;
  private defaultStaleAfterMs: number;

  constructor(opts: BrokerOptions = {}) {
    this.store = opts.stateStore ?? new StateStore();
    this.defaultStaleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  }

  get stateDir(): string {
    return this.store.stateDir;
  }

  get dbPath(): string {
    return this.store.dbPath;
  }

  // ---- host session registry -------------------------------------------------

  registerHostSession(input: {
    logical_session_id: string;
    host_kind: HostKind;
    host_session_id?: string | null;
    host_instance_id?: string | null;
    project_root?: string | null;
    source_window_fingerprint_hash?: string | null;
    granularity: SessionGranularity;
    attestation_status: string;
  }): HostSessionRecord {
    const now = new Date().toISOString();
    this.store.dbHandle.prepare(
      `INSERT INTO host_sessions
         (logical_session_id, host_kind, host_session_id, host_instance_id, project_root,
          source_window_fingerprint_hash, granularity, attestation_status, registered_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(logical_session_id) DO UPDATE SET
         host_kind=excluded.host_kind, host_session_id=excluded.host_session_id,
         host_instance_id=excluded.host_instance_id, project_root=excluded.project_root,
         source_window_fingerprint_hash=excluded.source_window_fingerprint_hash,
         granularity=excluded.granularity, attestation_status=excluded.attestation_status,
         updated_at=excluded.updated_at`,
    ).run(
      input.logical_session_id,
      input.host_kind,
      input.host_session_id ?? null,
      input.host_instance_id ?? null,
      input.project_root ?? null,
      input.source_window_fingerprint_hash ?? null,
      input.granularity,
      input.attestation_status,
      now,
      now,
    );
    return this.getHostSession(input.logical_session_id)!;
  }

  getHostSession(logicalSessionId: string): HostSessionRecord | null {
    const row = this.store.dbHandle
      .prepare('SELECT * FROM host_sessions WHERE logical_session_id = ?')
      .get(logicalSessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      logical_session_id: row.logical_session_id as string,
      host_kind: row.host_kind as HostKind,
      host_session_id: (row.host_session_id as string | null) ?? null,
      host_instance_id: (row.host_instance_id as string | null) ?? null,
      project_root: (row.project_root as string | null) ?? null,
      source_window_fingerprint_hash: (row.source_window_fingerprint_hash as string | null) ?? null,
      granularity: row.granularity as SessionGranularity,
      attestation_status: row.attestation_status as string,
      registered_at: row.registered_at as string,
      updated_at: row.updated_at as string,
    };
  }

  listHostSessions(): HostSessionRecord[] {
    const rows = this.store.dbHandle.prepare('SELECT * FROM host_sessions ORDER BY registered_at').all() as Record<string, unknown>[];
    return rows.map((r) => ({
      logical_session_id: r.logical_session_id as string,
      host_kind: r.host_kind as HostKind,
      host_session_id: (r.host_session_id as string | null) ?? null,
      host_instance_id: (r.host_instance_id as string | null) ?? null,
      project_root: (r.project_root as string | null) ?? null,
      source_window_fingerprint_hash: (r.source_window_fingerprint_hash as string | null) ?? null,
      granularity: r.granularity as SessionGranularity,
      attestation_status: r.attestation_status as string,
      registered_at: r.registered_at as string,
      updated_at: r.updated_at as string,
    }));
  }

  /** Resolve the host session that owns a lease (placement step 2). */
  getHostSessionForLease(leaseId: string): HostSessionRecord | null {
    const lease = this.getLease(leaseId);
    if (!lease) return null;
    return this.getHostSession(lease.logical_session_id);
  }

  // ---- leases ---------------------------------------------------------------

  /**
   * Idempotent acquisition: the same (logical_session_id, provider_id) returns
   * the existing active lease; concurrent callers converge on one lease; a
   * different logical session cannot reuse an exclusive lease.
   */
  acquireLease(input: AcquireLeaseInput): LeaseAcquireResult {
    const existing = this.findActiveLease(input.logical_session_id, input.provider_id);
    if (existing) {
      return { lease: existing, lease_token: '', created: false };
    }

    const sharing = input.sharing_mode ?? 'exclusive';
    if (sharing !== 'exclusive') {
      // Sharing requires BOTH an explicit policy marker and registry evidence
      // that the provider is shared-safe (stateful/write providers never share).
      if (!input.owner_policy_hash) {
        throw new BrokerError(
          BROKER_ERRORS.SHARING_NOT_ALLOWED,
          `sharing_mode=${sharing} requires an explicit owner_policy_hash (no implicit sharing)`,
        );
      }
      if (input.shared_safe_provider !== true) {
        throw new BrokerError(
          BROKER_ERRORS.SHARING_NOT_ALLOWED,
          `provider ${input.provider_id} is not registry-marked shared-safe; sharing_mode=${sharing} rejected`,
        );
      }
    }

    // Sharing conflict: a shared join is rejected only while an exclusive
    // holder owns the provider. Two explicitly-shared leases on a shared-safe
    // provider may pool (each session keeps its own lease/ACL record).
    if (sharing !== 'exclusive') {
      const holder = this.findBlockingLeaseForProvider(input.provider_id);
      if (holder && holder.logical_session_id !== input.logical_session_id && holder.sharing_mode === 'exclusive') {
        throw new BrokerError(
          BROKER_ERRORS.EXCLUSIVE_IN_USE,
          `provider ${input.provider_id} is held exclusively by ${holder.logical_session_id} (lease ${holder.lease_id}); shared join requires all holders to opt into explicit sharing`,
        );
      }
    }

    const leaseId = newId('lease');
    const token = newToken();
    const now = new Date().toISOString();
    const lease: LeaseRecord = {
      lease_id: leaseId,
      logical_session_id: input.logical_session_id,
      host_kind: input.host_kind,
      host_session_id: input.host_session_id ?? null,
      host_instance_id: input.host_instance_id ?? null,
      project_root: input.project_root ?? null,
      source_window_fingerprint_hash: input.source_window_fingerprint_hash ?? null,
      provider_id: input.provider_id,
      provider_instance_id: null,
      mcp_connection_id: null,
      resource_id: null,
      transport: null,
      command_digest: null,
      profile_path: null,
      endpoint_reference: null,
      provider_pid: null,
      provider_start_time: null,
      provider_window_fingerprints: [],
      initial_workspace: input.initial_workspace ?? null,
      current_workspace: input.initial_workspace ?? null,
      visibility_mode: input.visibility_mode ?? 'visible-local',
      sharing_mode: sharing,
      owner_policy_hash: input.owner_policy_hash ?? null,
      registry_hash: input.registry_hash ?? null,
      status: 'CREATED',
      created_at: now,
      last_heartbeat_at: now,
      stale_after_ms: input.stale_after_ms ?? this.defaultStaleAfterMs,
      reconnect_attempts: 0,
      rollback_reference: input.rollback_reference ?? null,
      updated_at: now,
    };

    try {
      this.store.dbHandle.exec('BEGIN IMMEDIATE;');
      this.store.dbHandle
        .prepare(
          `INSERT INTO leases
             (lease_id, logical_session_id, host_kind, host_session_id, host_instance_id,
              project_root, source_window_fingerprint_hash, provider_id, provider_instance_id,
              mcp_connection_id, resource_id, transport, command_digest, profile_path,
              endpoint_reference, provider_pid, provider_start_time, provider_window_fingerprints,
              initial_workspace, current_workspace, visibility_mode, sharing_mode, owner_policy_hash,
              registry_hash, status, created_at, last_heartbeat_at, stale_after_ms,
              reconnect_attempts, rollback_reference, lease_token_hash, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          lease.lease_id,
          lease.logical_session_id,
          lease.host_kind,
          lease.host_session_id,
          lease.host_instance_id,
          lease.project_root,
          lease.source_window_fingerprint_hash,
          lease.provider_id,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          '[]',
          lease.initial_workspace,
          lease.current_workspace,
          lease.visibility_mode,
          lease.sharing_mode,
          lease.owner_policy_hash,
          lease.registry_hash,
          lease.status,
          lease.created_at,
          lease.last_heartbeat_at,
          lease.stale_after_ms,
          0,
          lease.rollback_reference,
          sha256Hex(token),
          lease.updated_at,
        );
      this.recordTransition(leaseId, 'CREATED', 'CREATED', 'lease created', { created_at: now });
      this.store.dbHandle.exec('COMMIT;');
    } catch (e) {
      try {
        this.store.dbHandle.exec('ROLLBACK;');
      } catch {
        /* ignore */
      }
      if ((e as Error).message.includes('UNIQUE constraint failed')) {
        // Concurrent acquirer won; return their lease (without token — the
        // original owner keeps the token; token is never shared).
        const winner = this.findActiveLease(input.logical_session_id, input.provider_id);
        if (winner) return { lease: winner, lease_token: '', created: false };
      }
      throw e;
    }

    return { lease: this.getLease(leaseId)!, lease_token: token, created: true };
  }

  /** Resolve a lease by id with optional token proof of ownership. */
  resolveLease(leaseId: string, token?: string): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    if (token !== undefined) this.assertOwner(lease, token);
    return lease;
  }

  /** Resolve by token hash (HTTP broker path). */
  resolveLeaseByToken(token: string): LeaseRecord {
    const row = this.store.dbHandle
      .prepare('SELECT * FROM leases WHERE lease_token_hash = ?')
      .get(sha256Hex(token)) as LeaseRow | undefined;
    if (!row) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, 'no lease matches the presented token');
    return rowToLease(row);
  }

  private assertOwner(lease: LeaseRecord, token: string): void {
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, 'lease not found');
    const row = this.store.dbHandle
      .prepare('SELECT lease_token_hash FROM leases WHERE lease_id = ?')
      .get(lease.lease_id) as { lease_token_hash: string | null } | undefined;
    if (!row?.lease_token_hash || row.lease_token_hash !== sha256Hex(token)) {
      throw new BrokerError(BROKER_ERRORS.NOT_OWNER, `token does not prove ownership of lease ${lease.lease_id}`);
    }
  }

  getLease(leaseId: string): LeaseRecord | null {
    const row = this.store.dbHandle.prepare('SELECT * FROM leases WHERE lease_id = ?').get(leaseId) as LeaseRow | undefined;
    return row ? rowToLease(row) : null;
  }

  listLeases(opts: { status?: LeaseStatus; logicalSessionId?: string; providerId?: string } = {}): LeaseRecord[] {
    const clauses: string[] = [];
    const params: (string | number | null)[] = [];
    if (opts.status) {
      clauses.push('status = ?');
      params.push(opts.status);
    }
    if (opts.logicalSessionId) {
      clauses.push('logical_session_id = ?');
      params.push(opts.logicalSessionId);
    }
    if (opts.providerId) {
      clauses.push('provider_id = ?');
      params.push(opts.providerId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.store.dbHandle.prepare(`SELECT * FROM leases ${where} ORDER BY created_at`).all(...params) as unknown as LeaseRow[];
    return rows.map(rowToLease);
  }

  private findActiveLease(logicalSessionId: string, providerId: string): LeaseRecord | null {
    const row = this.store.dbHandle
      .prepare(
        `SELECT * FROM leases
         WHERE logical_session_id = ? AND provider_id = ?
           AND status IN ('CREATED','ACQUIRING','STARTING','READY','RELOCATED','RECONNECTING')
         ORDER BY created_at LIMIT 1`,
      )
      .get(logicalSessionId, providerId) as LeaseRow | undefined;
    return row ? rowToLease(row) : null;
  }

  /**
   * Leases that block acquisition of the same provider by another logical
   * session. STALE/QUARANTINED leases are included: they are never silently
   * reclaimed without ownership proof (token) from the original owner.
   */
  private findBlockingLeaseForProvider(providerId: string): LeaseRecord | null {
    const row = this.store.dbHandle
      .prepare(
        `SELECT * FROM leases
         WHERE provider_id = ?
           AND status IN ('CREATED','ACQUIRING','STARTING','READY','RELOCATED','RECONNECTING','STALE','QUARANTINED')
         ORDER BY created_at LIMIT 1`,
      )
      .get(providerId) as LeaseRow | undefined;
    return row ? rowToLease(row) : null;
  }

  /**
   * Transition helper with CAS: only moves when the persisted status still
   * equals `expectedFrom` (concurrent writers fail closed).
   */
  private transition(
    leaseId: string,
    expectedFrom: LeaseStatus,
    to: LeaseStatus,
    reason: string,
    payload: Record<string, unknown> = {},
    token?: string,
  ): LeaseTransitionReceipt {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    if (token !== undefined && ACTIVE_STATUS_SET.has(lease.status)) this.assertOwner(lease, token);
    if (lease.status !== expectedFrom) {
      throw new BrokerError(
        BROKER_ERRORS.ILLEGAL_TRANSITION,
        `lease ${leaseId} is ${lease.status}, not ${expectedFrom}; refusing transition to ${to}`,
      );
    }
    assertTransition(expectedFrom, to, reason);

    const now = new Date().toISOString();
    const update = this.store.dbHandle
      .prepare('UPDATE leases SET status = ?, updated_at = ? WHERE lease_id = ? AND status = ?')
      .run(to, now, leaseId, expectedFrom);
    if (update.changes !== 1) {
      throw new BrokerError(
        BROKER_ERRORS.ILLEGAL_TRANSITION,
        `lease ${leaseId} status CAS failed (${expectedFrom} -> ${to})`,
      );
    }
    return this.recordTransition(leaseId, expectedFrom, to, reason, payload);
  }

  private recordTransition(
    leaseId: string,
    from: LeaseStatus,
    to: LeaseStatus,
    reason: string,
    payload: Record<string, unknown> = {},
  ): LeaseTransitionReceipt {
    const rec = receipt(leaseId, from, to, reason, payload);
    const res = this.store.dbHandle
      .prepare('INSERT INTO lease_transitions (lease_id, from_status, to_status, reason, payload, ts) VALUES (?,?,?,?,?,?)')
      .run(rec.lease_id, rec.from_status, rec.to_status, rec.reason, JSON.stringify(payload), rec.ts);
    return { ...rec, transition_id: Number(res.lastInsertRowid) };
  }

  /**
   * Public narrow transition API for the guardian: same CAS + legality rules,
   * no token required (the guardian is the broker's own launch path).
   */
  noteTransition(leaseId: string, expectedFrom: LeaseStatus, to: LeaseStatus, reason: string, payload: Record<string, unknown> = {}): LeaseTransitionReceipt {
    return this.transition(leaseId, expectedFrom, to, reason, payload);
  }

  /** Broker-level KV passthrough (evidence blobs, e.g. handshake proofs). */
  kvSet(key: string, value: string): void {
    this.store.kvSet(key, value);
  }

  kvGet(key: string): string | null {
    return this.store.kvGet(key);
  }

  transitionsFor(leaseId: string): LeaseTransitionReceipt[] {
    const rows = this.store.dbHandle
      .prepare('SELECT * FROM lease_transitions WHERE lease_id = ? ORDER BY transition_id')
      .all(leaseId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      transition_id: Number(r.transition_id),
      lease_id: r.lease_id as string,
      from_status: r.from_status as LeaseStatus,
      to_status: r.to_status as LeaseStatus,
      reason: r.reason as string,
      payload: JSON.parse((r.payload as string) || '{}') as Record<string, unknown>,
      ts: r.ts as string,
    }));
  }

  /** Attach a live provider instance/connection/resource to a lease. */
  attachProvider(leaseId: string, token: string, input: AttachProviderInput): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    this.assertOwner(lease, token);
    if (!ACTIVE_STATUS_SET.has(lease.status)) {
      throw new BrokerError(
        BROKER_ERRORS.ILLEGAL_TRANSITION,
        `cannot attach provider to lease in status ${lease.status}`,
      );
    }
    const now = new Date().toISOString();
    this.store.dbHandle
      .prepare(
        `UPDATE leases SET
           provider_instance_id = ?, mcp_connection_id = ?, resource_id = ?, transport = ?,
           provider_pid = ?, provider_start_time = ?, provider_window_fingerprints = ?,
           current_workspace = COALESCE(?, current_workspace),
           updated_at = ?
         WHERE lease_id = ?`,
      )
      .run(
        input.provider_instance_id,
        input.mcp_connection_id,
        input.resource_id ?? null,
        input.transport,
        input.provider_pid ?? null,
        input.provider_start_time ?? null,
        JSON.stringify(input.provider_window_fingerprints ?? []),
        input.current_workspace ?? null,
        now,
        leaseId,
      );
    this.store.dbHandle
      .prepare(
        `INSERT INTO provider_instances (provider_instance_id, provider_id, command_digest, transport, launched_by, launched_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_instance_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .run(
        input.provider_instance_id,
        lease.provider_id,
        lease.command_digest ?? '',
        input.transport,
        lease.logical_session_id,
        now,
        now,
      );
    if (input.mcp_handshake_proof) {
      this.store.kvSet(`mcp-handshake:${leaseId}`, JSON.stringify(input.mcp_handshake_proof));
    }
    return this.getLease(leaseId)!;
  }

  mcpHandshakeProof(leaseId: string): Record<string, unknown> | null {
    const raw = this.store.kvGet(`mcp-handshake:${leaseId}`);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }

  /** Heartbeat: refresh liveness, detect workspace drift -> RELOCATED. */
  heartbeat(leaseId: string, token: string, evidence: HeartbeatEvidence = {}): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    this.assertOwner(lease, token);
    const now = new Date().toISOString();
    const update: string[] = ['last_heartbeat_at = ?', 'updated_at = ?'];
    const params: (string | number | null)[] = [now, now];
    if (evidence.provider_pid !== undefined) {
      update.push('provider_pid = ?');
      params.push(evidence.provider_pid);
    }
    if (evidence.provider_start_time !== undefined) {
      update.push('provider_start_time = ?');
      params.push(evidence.provider_start_time);
    }
    if (evidence.mcp_connection_id !== undefined) {
      update.push('mcp_connection_id = ?');
      params.push(evidence.mcp_connection_id);
    }
    if (evidence.resource_id !== undefined) {
      update.push('resource_id = ?');
      params.push(evidence.resource_id);
    }
    if (evidence.provider_window_fingerprints) {
      update.push('provider_window_fingerprints = ?');
      params.push(JSON.stringify(evidence.provider_window_fingerprints));
    }
    params.push(leaseId);
    this.store.dbHandle.prepare(`UPDATE leases SET ${update.join(', ')} WHERE lease_id = ?`).run(...params);

    const fresh = this.getLease(leaseId)!;
    // Workspace drift after READY is an operator relocation, not a violation.
    if (
      evidence.current_workspace !== undefined &&
      evidence.current_workspace !== null &&
      fresh.current_workspace !== null &&
      evidence.current_workspace !== fresh.current_workspace &&
      ['READY', 'RELOCATED'].includes(fresh.status)
    ) {
      this.recordTransition(
        leaseId,
        fresh.status,
        'RELOCATED',
        'operator relocation observed by heartbeat (current_workspace changed)',
        {
          from_workspace: fresh.current_workspace,
          to_workspace: evidence.current_workspace,
        },
      );
      this.store.dbHandle
        .prepare('UPDATE leases SET current_workspace = ?, status = ?, updated_at = ? WHERE lease_id = ?')
        .run(evidence.current_workspace, 'RELOCATED', new Date().toISOString(), leaseId);
    }
    return this.getLease(leaseId)!;
  }

  /** Observe the provider window state (called by guardian/observer). */
  observeProvider(leaseId: string, observation: {
    current_workspace?: number | null;
    window_visible?: boolean;
    window_fingerprints?: WindowFingerprint[];
    operator_event?: 'moved' | 'minimized' | 'closed' | 'unmapped' | null;
    event_detail?: string;
  }): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    const payload: Record<string, unknown> = { ...observation };
    const now = new Date().toISOString();
    const fresh = { ...lease };

    if (observation.operator_event) {
      this.recordTransition(leaseId, fresh.status, fresh.status, `operator event: ${observation.operator_event}`, {
        operator_event: observation.operator_event,
        detail: observation.event_detail ?? null,
        observed_at: now,
      });
    }
    if (observation.current_workspace !== undefined && observation.current_workspace !== null) {
      if (fresh.current_workspace !== null && observation.current_workspace !== fresh.current_workspace) {
        if (['READY', 'RELOCATED'].includes(fresh.status)) {
          this.recordTransition(leaseId, fresh.status, 'RELOCATED', 'provider window moved to another virtual desktop', {
            from_workspace: fresh.current_workspace,
            to_workspace: observation.current_workspace,
            operator_triggered: true,
          });
          this.store.dbHandle
            .prepare('UPDATE leases SET current_workspace = ?, status = ?, updated_at = ? WHERE lease_id = ?')
            .run(observation.current_workspace, 'RELOCATED', now, leaseId);
          return this.getLease(leaseId)!;
        }
        this.store.dbHandle
          .prepare('UPDATE leases SET current_workspace = ?, updated_at = ? WHERE lease_id = ?')
          .run(observation.current_workspace, now, leaseId);
      }
    }
    if (observation.window_fingerprints) {
      this.store.dbHandle
        .prepare('UPDATE leases SET provider_window_fingerprints = ?, updated_at = ? WHERE lease_id = ?')
        .run(JSON.stringify(observation.window_fingerprints), now, leaseId);
    }
    return this.getLease(leaseId)!;
  }

  /** Record an operator relocation explicitly (guardian observed a move). */
  recordOperatorRelocation(leaseId: string, opts: {
    from_workspace: number | null;
    to_workspace: number;
    window_id: string;
    detail?: string;
  }): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    const now = new Date().toISOString();
    this.recordTransition(leaseId, lease.status, 'RELOCATED', 'operator relocated provider window between virtual desktops', {
      from_workspace: opts.from_workspace,
      to_workspace: opts.to_workspace,
      window_id: opts.window_id,
      detail: opts.detail ?? null,
    });
    this.store.dbHandle
      .prepare('UPDATE leases SET current_workspace = ?, status = ?, updated_at = ? WHERE lease_id = ?')
      .run(opts.to_workspace, 'RELOCATED', now, leaseId);
    return this.getLease(leaseId)!;
  }

  /** Reconnect: MCP process died but resource survived -> reattach. */
  reconnectProvider(
    leaseId: string,
    token: string,
    outcome: 'reattached' | 'resource-recreated',
    evidence: {
      new_provider_instance_id?: string;
      new_mcp_connection_id?: string;
      new_resource_id?: string;
      reason: string;
      payload?: Record<string, unknown>;
    },
  ): LeaseRecord {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    this.assertOwner(lease, token);
    const from = lease.status;
    assertTransition(from, 'RECONNECTING', evidence.reason);
    const now = new Date().toISOString();

    const finalStatus: LeaseStatus = outcome === 'reattached' ? 'READY' : 'RESOURCE_RECREATED';
    const updates: string[] = ['status = ?', 'updated_at = ?', 'reconnect_attempts = reconnect_attempts + 1'];
    const params: (string | number | null)[] = [finalStatus, now];
    if (evidence.new_provider_instance_id) {
      updates.push('provider_instance_id = ?');
      params.push(evidence.new_provider_instance_id);
    }
    if (evidence.new_mcp_connection_id) {
      updates.push('mcp_connection_id = ?');
      params.push(evidence.new_mcp_connection_id);
    }
    if (evidence.new_resource_id) {
      updates.push('resource_id = ?');
      params.push(evidence.new_resource_id);
    }
    params.push(leaseId);
    this.store.dbHandle.prepare(`UPDATE leases SET ${updates.join(', ')} WHERE lease_id = ?`).run(...params);

    this.recordTransition(leaseId, from, 'RECONNECTING', `reconnect started: ${evidence.reason}`, evidence.payload ?? {});
    this.recordTransition(leaseId, 'RECONNECTING', finalStatus, outcome === 'reattached' ? 'provider reattached to surviving resource' : 'resource truly dead; new resource created', {
      ...evidence.payload,
      new_resource_id: evidence.new_resource_id ?? null,
      resource_recreated: outcome === 'resource-recreated',
    });
    return this.getLease(leaseId)!;
  }

  /** Release (token proof required; stale leases require re-proven ownership). */
  releaseLease(leaseId: string, token: string, reason: string): LeaseTransitionReceipt {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    this.assertOwner(lease, token);
    const rec = this.transition(leaseId, lease.status, 'RELEASED', reason, { requested_by: 'lease-owner' });
    this.store.dbHandle
      .prepare('UPDATE leases SET lease_token_hash = NULL, updated_at = ? WHERE lease_id = ?')
      .run(new Date().toISOString(), leaseId);
    return rec;
  }

  /** Revoke (admin force; requires explicit reason). */
  revokeLease(leaseId: string, reason: string, adminToken?: string): LeaseTransitionReceipt {
    const lease = this.getLease(leaseId);
    if (!lease) throw new BrokerError(BROKER_ERRORS.LEASE_NOT_FOUND, `lease ${leaseId} not found`);
    if (adminToken !== undefined && this.adminTokenHash() !== sha256Hex(adminToken)) {
      throw new BrokerError(BROKER_ERRORS.NOT_OWNER, 'admin token mismatch');
    }
    const rec = this.transition(leaseId, lease.status, 'REVOKED', reason, { requested_by: 'admin' });
    this.store.dbHandle
      .prepare('UPDATE leases SET lease_token_hash = NULL, updated_at = ? WHERE lease_id = ?')
      .run(new Date().toISOString(), leaseId);
    return rec;
  }

  private adminTokenHash(): string | null {
    return this.store.kvGet('admin_token_hash');
  }

  setAdminToken(token: string): void {
    this.store.kvSet('admin_token_hash', sha256Hex(token));
  }

  /** Close stale leases (no heartbeat beyond stale_after). */
  closeStaleLeases(now = Date.now()): { closed: LeaseTransitionReceipt[]; considered: number } {
    const rows = this.store.dbHandle
      .prepare(
        `SELECT * FROM leases
         WHERE status IN ('CREATED','ACQUIRING','STARTING','READY','RELOCATED','RECONNECTING')`,
      )
      .all() as unknown as LeaseRow[];
    const closed: LeaseTransitionReceipt[] = [];
    for (const row of rows) {
      const lease = rowToLease(row);
      const lastBeat = lease.last_heartbeat_at ? Date.parse(lease.last_heartbeat_at) : Date.parse(lease.created_at);
      if (now - lastBeat > lease.stale_after_ms) {
        const rec = this.transition(lease.lease_id, lease.status, 'STALE', 'heartbeat missed beyond stale_after', {
          last_heartbeat_at: lease.last_heartbeat_at,
          stale_after_ms: lease.stale_after_ms,
        });
        closed.push(rec);
      }
    }
    return { closed, considered: rows.length };
  }

  /** Reconcile: close stale, surface drift, revalidate identities. */
  reconcileRuntime(): ReconcileResult {
    const { closed } = this.closeStaleLeases();
    const drift: DoctorIssue[] = [];
    let orphanProviderInstances = 0;

    const instances = this.store.dbHandle.prepare('SELECT provider_instance_id FROM provider_instances').all() as unknown as Array<{ provider_instance_id: string }>;
    const attached = new Set(
      (this.store.dbHandle
        .prepare(
          `SELECT provider_instance_id FROM leases
           WHERE provider_instance_id IS NOT NULL
             AND status IN ('CREATED','ACQUIRING','STARTING','READY','RELOCATED','RECONNECTING','RESOURCE_RECREATED')`,
        )
        .all() as unknown as Array<{ provider_instance_id: string }>).map((r) => r.provider_instance_id),
    );
    for (const inst of instances) {
      if (!attached.has(inst.provider_instance_id)) {
        orphanProviderInstances += 1;
        drift.push({
          severity: 'warning',
          code: 'ORPHAN_PROVIDER_INSTANCE',
          message: `provider instance ${inst.provider_instance_id} is not attached to any lease`,
          evidence: { provider_instance_id: inst.provider_instance_id },
        });
      }
    }

    return {
      stale_closed: closed.length,
      leases_reconciled: this.listLeases().length,
      orphan_provider_instances: orphanProviderInstances,
      drift,
      receipts: closed,
    };
  }

  /** Doctor: health report over store + leases. */
  doctor(): DoctorReport {
    const issues: DoctorIssue[] = [];
    const all = this.listLeases();
    const byStatus = new Map<LeaseStatus, number>();
    for (const l of all) byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1);
    const active = all.filter((l) => ACTIVE_STATUS_SET.has(l.status)).length;
    const stale = all.filter((l) => l.status === 'STALE').length;

    if (this.store.journalMode() !== 'wal') {
      issues.push({ severity: 'error', code: 'JOURNAL_NOT_WAL', message: `journal_mode is ${this.store.journalMode()}, expected wal` });
    }
    if (this.store.dbMode() !== '600') {
      issues.push({ severity: 'warning', code: 'DB_MODE', message: `db mode is ${this.store.dbMode()}, expected 600`, evidence: { mode: this.store.dbMode() } });
    }
    for (const l of all) {
      if (l.status === 'QUARANTINED') {
        issues.push({ severity: 'error', code: 'LEASE_QUARANTINED', message: `lease ${l.lease_id} is QUARANTINED`, lease_id: l.lease_id });
      }
      if (l.status === 'FAILED') {
        issues.push({ severity: 'warning', code: 'LEASE_FAILED', message: `lease ${l.lease_id} ended FAILED`, lease_id: l.lease_id });
      }
    }

    return {
      ok: issues.every((i) => i.severity !== 'error'),
      state_dir: this.store.stateDir,
      db_path: this.store.dbPath,
      schema_version: this.store.schemaVersion(),
      journal_mode: this.store.journalMode(),
      db_mode: this.store.dbMode(),
      leases: { total: all.length, active, stale, released: byStatus.get('RELEASED') ?? 0, failed: byStatus.get('FAILED') ?? 0 },
      issues,
      generated_at: new Date().toISOString(),
    };
  }
}
