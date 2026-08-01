/**
 * autopilot-m11.ts — C5 durable nonterminal autopilot (AM-0019 §7, §13)
 *
 * Host-neutral supervisor machinery layered on the append-only AutopilotJournal:
 * journal-backed waiting registry, leases with heartbeat renewal, stale-lease
 * detection, file/ledger-based CI watcher, root-cause repair escalation and a
 * Stop hook that may checkpoint but can never declare completion while the
 * engine terminal gate is false.
 *
 * Idempotency: every mutation is keyed by an operation key; the journal event id
 * is derived from that key, so a crashed-and-replayed operation produces the
 * exact prior record and no duplicate mutation (replay guard by journal event id).
 *
 * Recoverable waiting states are NONTERMINAL: the run snapshot stays RUNNING and
 * independent successors are never held back. Only the engine (M11StopHook, after
 * an accepting evaluateM11Terminal) may emit the terminal token.
 */
import { createHash } from 'node:crypto';
import { AutopilotJournal, type AutopilotIdentity } from './autopilot.js';

export const M11_TERMINAL_TOKEN = 'HV3_M11_LOCAL_COMPLETE';

export const WAITING_STATES = [
  'WAITING_EXTERNAL', 'WAITING_AUTHORITY', 'WAITING_RESOURCE', 'RETRY_SCHEDULED', 'NEEDS_REMEDIATION',
] as const;
export type WaitingState = (typeof WAITING_STATES)[number];

export type WakeKind = 'ci' | 'provider' | 'authority' | 'resource' | 'retry' | 'lease';

export interface WakeCondition {
  kind: WakeKind;
  /** Stable wake key, e.g. `ci:quality:quality-macos`. */
  key: string;
  /** Value that satisfies the wake condition, e.g. `success`. */
  expect: string;
}

export interface RetryPolicy {
  attempt: number;
  maxAttempts: number;
  backoffMs: number;
  /** epoch ms — RETRY_SCHEDULED is due at/after this instant. */
  nextRetryAt: number;
}

export interface WaitingEntry {
  waitingId: string;
  taskId: string;
  state: WaitingState;
  wake: WakeCondition;
  retry: RetryPolicy;
  /** epoch ms; on expiry the entry moves to fallback.to (default WAITING_AUTHORITY). */
  deadline?: number;
  fallback?: { action: string; to: WaitingState };
  /** Affected successor closure — only these tasks are held back. */
  successorClosure: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeaseEntry {
  leaseId: string;
  owner: string;
  subject: string;
  expiresAt: number;
  renewedAt: number;
  revoked: boolean;
}

export interface RepairRecord {
  repairId: string;
  taskId: string;
  rootCauseSignature: string;
  attempt: number;
  escalated: boolean;
  modelTier: string;
  reviewTier: string;
  openedAt: string;
}

export interface CiCheck {
  workflow?: string;
  check?: string;
  conclusion?: string;
  commitSha?: string;
  passed?: boolean;
}

const MODEL_TIERS = ['default', 'high', 'ultra'] as const;
const REVIEW_TIERS = ['standard', 'independent', 'independent-high-risk'] as const;

function bumpTier(current: string, ladder: readonly string[]): string {
  const i = ladder.indexOf(current as (typeof ladder)[number]);
  return ladder[Math.min(ladder.length - 1, (i === -1 ? 0 : i) + 1)];
}

function sha256(v: string): string { return createHash('sha256').update(v).digest('hex'); }

const nowIso = () => new Date().toISOString();

export class M11Autopilot {
  constructor(readonly journal: AutopilotJournal) {}

  /** Deterministic event id for an operation key — replay yields the same record. */
  private opEventId(opKey: string): string {
    const id: AutopilotIdentity = this.journal.identity;
    return sha256(`${id.revision}:${id.plan}:${opKey}`);
  }

  private waits(): WaitingEntry[] {
    const resolved = new Set(
      this.journal.records()
        .filter((r) => r.type === 'M11_WAIT_RESOLVE' && typeof r.data?.waitingId === 'string')
        .map((r) => r.data!.waitingId as string),
    );
    const map = new Map<string, WaitingEntry>();
    for (const r of this.journal.records()) {
      if (r.type === 'M11_WAIT' && r.data?.entry) map.set((r.data.entry as WaitingEntry).waitingId, r.data.entry as WaitingEntry);
    }
    return [...map.values()].filter((w) => !resolved.has(w.waitingId));
  }

  waitingEntries(): WaitingEntry[] { return this.waits(); }

  registerWait(entry: WaitingEntry, opKey?: string): WaitingEntry {
    const key = opKey ?? `wait:register:${entry.waitingId}`;
    const prior = this.waits().find((w) => w.waitingId === entry.waitingId);
    const merged: WaitingEntry = {
      ...entry,
      createdAt: entry.createdAt ?? prior?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.journal.append('M11_WAIT', 'RUNNING', { entry: merged }, this.opEventId(key));
    return merged;
  }

  updateWait(waitingId: string, patch: Partial<WaitingEntry>, opKey?: string): WaitingEntry | undefined {
    const prior = this.waits().find((w) => w.waitingId === waitingId);
    if (!prior) return undefined;
    const key = opKey ?? `wait:update:${waitingId}:${Date.now()}`;
    const merged: WaitingEntry = { ...prior, ...patch, waitingId, updatedAt: nowIso() };
    this.journal.append('M11_WAIT', 'RUNNING', { entry: merged }, this.opEventId(key));
    return merged;
  }

  resolveWait(waitingId: string, opKey?: string): void {
    this.journal.append('M11_WAIT_RESOLVE', 'RUNNING', { waitingId }, this.opEventId(opKey ?? `wait:resolve:${waitingId}`));
  }

  /**
   * Advance the waiting machine at `now`.
   *  - RETRY_SCHEDULED due entries: attempt++ and backoff doubles (capped), surfaced as `due`.
   *  - Waiting entries past deadline: move to fallback.to (default WAITING_AUTHORITY;
   *    already-authority entries degrade to WAITING_RESOURCE). Never terminal.
   */
  pumpWaits(now = Date.now()): { due: WaitingEntry[]; advanced: WaitingEntry[] } {
    const due: WaitingEntry[] = [];
    const advanced: WaitingEntry[] = [];
    for (const w of this.waits()) {
      if (w.state === 'RETRY_SCHEDULED' && w.retry.nextRetryAt <= now) {
        const attempt = w.retry.attempt + 1;
        const backoffMs = Math.min(Math.max(w.retry.backoffMs * 2, 1), 600_000);
        const next = this.registerWait(
          { ...w, retry: { ...w.retry, attempt, backoffMs, nextRetryAt: now + backoffMs } },
          `wait:pump:${w.waitingId}:${attempt}`,
        );
        due.push(next);
        advanced.push(next);
      } else if (w.deadline !== undefined && w.deadline <= now) {
        const to: WaitingState = w.fallback?.to
          ?? (w.state === 'WAITING_AUTHORITY' ? 'WAITING_RESOURCE' : 'WAITING_AUTHORITY');
        const next = this.registerWait(
          { ...w, state: to, deadline: undefined, fallback: undefined },
          `wait:deadline:${w.waitingId}:${to}`,
        );
        advanced.push(next);
      }
    }
    return { due, advanced };
  }

  // ── Leases ────────────────────────────────────────────────────────────────

  private leases(): LeaseEntry[] {
    const map = new Map<string, LeaseEntry>();
    for (const r of this.journal.records()) {
      if (r.type === 'M11_LEASE' && r.data?.entry) map.set((r.data.entry as LeaseEntry).leaseId, r.data.entry as LeaseEntry);
    }
    return [...map.values()];
  }

  leaseEntries(): LeaseEntry[] { return this.leases(); }

  acquireLease(leaseId: string, owner: string, subject: string, ttlMs: number, opKey?: string): LeaseEntry {
    const now = Date.now();
    const entry: LeaseEntry = { leaseId, owner, subject, expiresAt: now + ttlMs, renewedAt: now, revoked: false };
    this.journal.append('M11_LEASE', 'RUNNING', { entry }, this.opEventId(opKey ?? `lease:acquire:${leaseId}`));
    return entry;
  }

  heartbeat(leaseId: string, ttlMs: number, opKey?: string): LeaseEntry | undefined {
    const cur = this.leases().find((l) => l.leaseId === leaseId);
    if (!cur || cur.revoked || Date.now() > cur.expiresAt) return cur;
    const now = Date.now();
    const renewed: LeaseEntry = { ...cur, expiresAt: now + ttlMs, renewedAt: now };
    this.journal.append('M11_LEASE', 'RUNNING', { entry: renewed }, this.opEventId(opKey ?? `lease:heartbeat:${leaseId}`));
    return renewed;
  }

  staleLeases(now = Date.now()): LeaseEntry[] {
    return this.leases().filter((l) => !l.revoked && l.expiresAt < now);
  }

  revokeLease(leaseId: string, opKey?: string): LeaseEntry | undefined {
    const cur = this.leases().find((l) => l.leaseId === leaseId);
    if (!cur || cur.revoked) return cur;
    const revoked: LeaseEntry = { ...cur, revoked: true };
    this.journal.append('M11_LEASE', 'RUNNING', { entry: revoked }, this.opEventId(opKey ?? `lease:revoke:${leaseId}`));
    return revoked;
  }

  // ── CI watcher (file/ledger based — no network) ───────────────────────────

  /**
   * Read ledger `ci_checks` / a GitHub run-state file's conclusion list and
   * register WAITING_EXTERNAL entries with a `ci:<workflow>:<check>` wake key for
   * every pending/failed check; green checks resolve their waiting entry.
   */
  scanCi(checks: CiCheck[], successorsByWakeKey: (key: string) => string[] = () => []): WaitingEntry[] {
    const created: WaitingEntry[] = [];
    for (const c of checks) {
      const key = `ci:${c.workflow ?? 'unknown'}:${c.check ?? 'unknown'}`;
      const green = c.passed === true || c.conclusion === 'success';
      const existing = this.waits().find((w) => w.wake.kind === 'ci' && w.wake.key === key);
      if (green) {
        if (existing) this.resolveWait(existing.waitingId, `ci:resolve:${key}`);
        continue;
      }
      const entry = existing
        ? { ...existing, updatedAt: nowIso() }
        : {
            waitingId: `W-CI-${sha256(key).slice(0, 12)}`,
            taskId: key,
            state: 'WAITING_EXTERNAL' as WaitingState,
            wake: { kind: 'ci' as const, key, expect: 'success' },
            retry: { attempt: 0, maxAttempts: 0, backoffMs: 0, nextRetryAt: 0 },
            successorClosure: successorsByWakeKey(key),
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
      const merged = this.registerWait(entry, `ci:wait:${key}`);
      created.push(merged);
    }
    return created;
  }

  // ── Root-cause escalation ──────────────────────────────────────────────────

  private repairs(): RepairRecord[] {
    const map = new Map<string, RepairRecord>();
    for (const r of this.journal.records()) {
      if (r.type === 'M11_REPAIR' && r.data?.record) map.set((r.data.record as RepairRecord).repairId, r.data.record as RepairRecord);
    }
    return [...map.values()];
  }

  repairRecords(): RepairRecord[] { return this.repairs(); }

  /**
   * Record a repair attempt keyed by root-cause signature. The second repair with
   * the same root cause escalates model tier + review tier (rule: 2 same-root-cause
   * repairs escalate). The engine opens the root-cause finding via openRootCauseFinding.
   */
  recordRepair(taskId: string, rootCauseSignature: string, modelTier = 'default', reviewTier = 'standard', opKey?: string): RepairRecord {
    const sig = sha256(rootCauseSignature);
    const prior = this.repairs().find((r) => r.rootCauseSignature === sig);
    const attempt = (prior?.attempt ?? 0) + 1;
    const escalated = attempt >= 2;
    const record: RepairRecord = {
      repairId: prior?.repairId ?? `RPR-M11-${sig.slice(0, 12)}`,
      taskId,
      rootCauseSignature: sig,
      attempt,
      escalated,
      modelTier: escalated ? bumpTier(prior?.modelTier ?? modelTier, MODEL_TIERS) : (prior?.modelTier ?? modelTier),
      reviewTier: escalated ? bumpTier(prior?.reviewTier ?? reviewTier, REVIEW_TIERS) : (prior?.reviewTier ?? reviewTier),
      openedAt: nowIso(),
    };
    this.journal.append('M11_REPAIR', 'RUNNING', { record }, this.opEventId(opKey ?? `repair:${sig}:${attempt}`));
    return record;
  }
}

/** Engine-owned ledger mutation: open an OPEN root-cause finding (reuses ledger findings structure). */
export function openRootCauseFinding(
  ledger: Record<string, unknown>,
  repair: { taskId: string; rootCauseSignature: string; modelTier: string; reviewTier: string },
): Record<string, unknown> {
  const findings = Array.isArray(ledger.findings) ? (ledger.findings as Record<string, unknown>[]) : [];
  const finding = {
    finding_id: `FIND-RCA-${String(findings.length + 1).padStart(3, '0')}`,
    status: 'OPEN',
    severity: 'high',
    kind: 'root-cause',
    root_cause_signature: repair.rootCauseSignature,
    task_id: repair.taskId,
    model_tier: repair.modelTier,
    review_tier: repair.reviewTier,
    opened_at: nowIso(),
  };
  ledger.findings = [...findings, finding];
  return finding;
}

// ── Stop hook enforcement ────────────────────────────────────────────────────

export interface StopGate {
  evaluate(): { passed: boolean; failedGates: string[] };
}

/**
 * Host Stop hook: checkpoint is always allowed (durable, nonterminal); declaring
 * completion requires the engine terminal gate to pass, otherwise it is refused
 * and no terminal token is written. Token emission is engine-only (this hook).
 */
export class M11StopHook {
  constructor(private readonly journal: AutopilotJournal, private readonly gate: StopGate) {}

  checkpoint(value: string): ReturnType<AutopilotJournal['snapshot']> {
    if (!value) throw new Error('M11 stop hook: checkpoint value required');
    this.journal.append('M11_CHECKPOINT', 'CHECKPOINTED', { checkpoint: value });
    return this.journal.snapshot();
  }

  declareComplete(token: string): { ok: true } | { ok: false; reason: string } {
    if (token !== M11_TERMINAL_TOKEN) {
      return { ok: false, reason: `unexpected terminal token: ${token}` };
    }
    const g = this.gate.evaluate();
    if (!g.passed) {
      return { ok: false, reason: `terminal gate false: ${g.failedGates.join(', ')}` };
    }
    this.journal.append('M11_COMPLETE', 'COMPLETED', { terminal: token });
    return { ok: true };
  }
}
