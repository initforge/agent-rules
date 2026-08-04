import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ContextCapsuleKey } from './context-cache.js';

export type ChildKind = 'writer' | 'reviewer' | 'verifier';
export type AuditType = 'ASSIGNED' | 'DISPATCHED' | 'ACKED' | 'HEARTBEAT' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'ABORT_RECONCILE';

export interface AuditEvent {
  revision: number;
  timestamp: string;
  type: AuditType;
  assignmentId: string;
  detail?: string;
}

export interface SupervisorConfig {
  // AM-0022: Adaptive ceiling (replaces stale maxWriters)
  adaptiveCeilingNormal: number;  // 8 normal writers
  adaptiveCeilingBurst: number;   // 10 burst writers
  minReadyEvidence: number;       // 6 READY evidence threshold
  // Legacy: non-authoritative compatibility only
  maxWriters: number;
  maxReviewers: number;
  childDepth: number;
  backpressureRssMb: number;
  backpressureCpuPct: number;
  assignmentTimeoutMs: number;
  defaultProvider: string;
  defaultModel: string;
  defaultEffort: string;
  statePath?: string;
  initialSessionId?: string;
}

interface SupervisorState {
  supervisorId: string;
  revision: number;
  children: PersistedChildAssignment[];
  auditEvents: AuditEvent[];
}

interface PersistedChildAssignment {
  assignmentId: string; parentSessionId: string; childSessionId: string | null;
  depth: number; kind: ChildKind; agentProfile: string; provider: string; model: string; effort: string;
  ownedPaths: readonly string[]; forbiddenPaths: readonly string[];
  contextCapsuleKey: ContextCapsuleKey;
  status: 'PENDING' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  receipt?: Record<string, unknown>; leaseExpiresAt?: string; createdAt: string; updatedAt: string;
}

export interface ChildAssignment {
  assignmentId: string; parentSessionId: string; childSessionId: string | null;
  depth: number; kind: ChildKind; agentProfile: string; provider: string; model: string; effort: string;
  ownedPaths: readonly string[]; forbiddenPaths: readonly string[]; contextCapsuleKey: ContextCapsuleKey;
  /** @internal */
  dispatchFingerprint: string;
  /** @internal */
  completionProofHash?: string;
  status: 'PENDING' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  receipt?: Record<string, unknown>; leaseExpiresAt?: string; createdAt: string; updatedAt: string;
}

export interface ChildAssignmentView {
  assignmentId: string; parentSessionId: string; childSessionId: string | null;
  depth: number; kind: ChildKind; agentProfile: string; provider: string; model: string; effort: string;
  ownedPaths: readonly string[]; forbiddenPaths: readonly string[];
  contextCapsuleKey: ContextCapsuleKey;
  status: 'PENDING' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  receipt?: Record<string, unknown>; leaseExpiresAt?: string; createdAt: string; updatedAt: string;
}

export interface SupervisorPublicView {
  readonly revision: number;
  readonly sessionId: string;
  readonly children: readonly ChildAssignmentView[];
  // AM-0022: adaptive ceiling (8 normal / 10 burst based on min 6 READY evidence)
  readonly effectiveCeiling: number;
  readonly readyEvidenceCount: number;
  readonly availableWriterSlots: number;
  readonly availableReviewerSlots: number;
  assignChild(p: { assignmentId: string; kind: ChildKind; ownedPaths: readonly string[]; forbiddenPaths: readonly string[]; contextKey?: ContextCapsuleKey; provider?: string; model?: string; effort?: string; }): { ok: true; assignment: ChildAssignmentView } | { ok: false; reason: string; };
  bindChildSession(assignmentId: string, childSessionId: string): { ok: true } | { ok: false; reason: string; };
  dispatchAssignment(assignmentId: string): { ok: true } | { ok: false; reason: string; };
  ackAssignment(assignmentId: string): { ok: true } | { ok: false; reason: string; };
  heartbeatAssignment(assignmentId: string): { ok: true } | { ok: false; reason: string; };
  failAssignment(assignmentId: string, error: string): { ok: true } | { ok: false; reason: string; };
  abortAssignment(assignmentId: string): { ok: true } | { ok: false; reason: string; };
  getAuditEvents(): AuditEvent[];
  resolveNativeMode(reason: NativeModeReason): { allowed: true } | { allowed: false; reason: string; };
  checkResources(): { rssMb: number; cpuPct: number; underPressure: boolean; };
}

/** F9 (R9): Internal operations — NOT on public facade, closure-based, only accessible to code that destructures from factory */
export type _InternalOps = {
  /** Get raw ChildAssignment list (includes dispatchFingerprint, completionProofHash) */
  getChildren(): readonly ChildAssignment[];
  /** Get dispatch fingerprint for assignmentId */
  getFingerprint(assignmentId: string): string | undefined;
  /** Record abort reconciliation audit event */
  recordAbortReconciliation(assignmentId: string, detail: string): boolean;
  /** Persist current state to disk (noop if no statePath) */
  persistState(): void;
};

export type NativeModeReason = 'initial_architecture_boundary' | 'final_certification_boundary';

function sha256(data: string): string { return createHash('sha256').update(data).digest('hex'); }
function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) as T; }

/** Canonical repository-relative form. Deliberately case-sensitive: repository path identity is not host-dependent. */
function normalizeRepoPath(value: string): string | null {
  if (!value || value.includes('\0') || /^(?:[a-zA-Z]:|[\\/]{1,2})/.test(value)) return null;
  const parts = value.replace(/\\/g, '/').split('/').filter(part => part !== '' && part !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  return parts.join('/');
}

function normalizeRepoPaths(values: readonly string[]): readonly string[] | null {
  const normalized = values.map(normalizeRepoPath);
  return normalized.includes(null) ? null : normalized as string[];
}

/** State contents must be durable before their atomic rename. */
function fsyncStateFile(filePath: string): void {
  // Windows can reject FlushFileBuffers on a descriptor reopened read-only.
  const fd = fs.openSync(filePath, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/**
 * POSIX directory fsync makes a rename durable. Windows does not support
 * opening/flushing directories this way, so keep the strict file fsync and
 * tolerate only the documented "directory flush unavailable" error codes.
 */
function fsyncRenameDirectory(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!['EPERM', 'EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(code ?? '')) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ── Internal state — held in WeakMap, not accessible from outside module ──
interface InternalState {
  // AM-0022: Adaptive ceiling config
  adaptiveCeilingNormal: number;
  adaptiveCeilingBurst: number;
  minReadyEvidence: number;
  // Legacy: non-authoritative compatibility only
  config: Required<Pick<SupervisorConfig, 'maxWriters'|'maxReviewers'|'childDepth'|'backpressureRssMb'|'backpressureCpuPct'|'assignmentTimeoutMs'|'defaultProvider'|'defaultModel'|'defaultEffort'>> & { statePath?: string };
  childrenList: ChildAssignment[];
  auditEvents: AuditEvent[];
  _revision: number;
  supervisorId: string;
  nativeModeRejectedReason: string | null;
  completionVerifier: ((assignmentId: string, receipt: Record<string, unknown>) => boolean) | null;
  statePath: string | undefined;
}

const STORE = new WeakMap<SupervisorFacade, InternalState>();

// ── Public facade — no completion methods, no internal methods ──
export class SupervisorFacade implements SupervisorPublicView {
  get revision(): number { return STORE.get(this)!._revision; }
  get sessionId(): string { return STORE.get(this)!.supervisorId; }
  get children(): readonly ChildAssignmentView[] { return STORE.get(this)!.childrenList.map(toPublicView); }
  // AM-0022: adaptive ceiling properties
  get effectiveCeiling(): number { return calcEffectiveCeiling(STORE.get(this)!); }
  get readyEvidenceCount(): number { return STORE.get(this)!.childrenList.filter(c => c.kind === 'writer' && c.status === 'COMPLETED').length; }
  get availableWriterSlots(): number { return calcWriterSlots(STORE.get(this)!); }
  get availableReviewerSlots(): number { return calcReviewerSlots(STORE.get(this)!); }
  assignChild(p: Parameters<SupervisorPublicView['assignChild']>[0]): ReturnType<SupervisorPublicView['assignChild']> { return assignChildImpl(STORE.get(this)!, p); }
  bindChildSession(id: string, sid: string): ReturnType<SupervisorPublicView['bindChildSession']> { return bindChildSessionImpl(STORE.get(this)!, id, sid); }
  dispatchAssignment(id: string): ReturnType<SupervisorPublicView['dispatchAssignment']> { return dispatchAssignmentImpl(STORE.get(this)!, id); }
  ackAssignment(id: string): ReturnType<SupervisorPublicView['ackAssignment']> { return ackAssignmentImpl(STORE.get(this)!, id); }
  heartbeatAssignment(id: string): ReturnType<SupervisorPublicView['heartbeatAssignment']> { return heartbeatAssignmentImpl(STORE.get(this)!, id); }
  failAssignment(id: string, error: string): ReturnType<SupervisorPublicView['failAssignment']> { return failAssignmentImpl(STORE.get(this)!, id, error); }
  abortAssignment(id: string): ReturnType<SupervisorPublicView['abortAssignment']> { return abortAssignmentImpl(STORE.get(this)!, id); }
  getAuditEvents(): AuditEvent[] { return STORE.get(this)!.auditEvents.map(e => ({ ...e })); }
  resolveNativeMode(reason: NativeModeReason): { allowed: true } | { allowed: false; reason: string } { return resolveNativeModeImpl(STORE.get(this)!, reason); }
  checkResources(): { rssMb: number; cpuPct: number; underPressure: boolean; } { return checkResourcesImpl(); }
}

// ── Module-private symbol — NOT exported, external code cannot create it ──
const _INTERNAL_KEY = Symbol('supervisor-internal');

/** F10 (R10): public factory — returns ONLY the facade. No completion, no internal methods. */
export function createSupervisor(config?: Partial<SupervisorConfig> & { completionVerifier?: ((id: string, r: Record<string, unknown>) => boolean) | null }): SupervisorFacade {
  const s = initializeState(config);
  const facade = new SupervisorFacade();
  STORE.set(facade, s);

  // F10 (R10): store internals under module-private symbol — not accessible without _resolveSupervisorInternals
  const complete = (assignmentId: string, receipt: Record<string, unknown>) => completeAssignmentImpl(s, assignmentId, receipt);
  const _internal: _InternalOps = {
    getChildren: () => s.childrenList,
    getFingerprint: (id: string) => s.childrenList.find(c => c.assignmentId === id)?.dispatchFingerprint,
    recordAbortReconciliation: (id: string, detail: string) => recordAbortReconciliationImpl(s, id, detail),
    persistState: () => writeState(s),
  };
  Object.defineProperty(facade, _INTERNAL_KEY, { value: { complete, _internal }, enumerable: false, configurable: false });

  return facade;
}

/** F10 (R10): resolve internals — only runner/tests should import this. Returns { complete, _internal }. */
export function _resolveSupervisorInternals(supervisor: SupervisorFacade): { complete: (assignmentId: string, receipt: Record<string, unknown>) => { ok: true } | { ok: false; reason: string }; _internal: _InternalOps } {
  return (supervisor as any)[_INTERNAL_KEY];
}

// ── Internal implementation (module-scoped, not exportable) ──

function initializeState(config?: Partial<SupervisorConfig> & { completionVerifier?: ((id: string, r: Record<string, unknown>) => boolean) | null }): InternalState {
  const statePath = config?.statePath ? path.resolve(config.statePath) : undefined;
  const defaultConfig = {
    maxWriters: 2, maxReviewers: 1, childDepth: 1,
    backpressureRssMb: 2048, backpressureCpuPct: 200,
    assignmentTimeoutMs: 600000, defaultProvider: 'openai', defaultModel: 'gpt-4', defaultEffort: 'high',
  };

  // Try loading from state file
  if (statePath) {
    const state = loadStateFile(statePath);
    if (state) {
      const children = state.children.map(fromPersisted);
      const auditEvents = state.auditEvents;
      const inst: InternalState = {
        // AM-0022: adaptive ceiling defaults
        adaptiveCeilingNormal: config?.adaptiveCeilingNormal ?? 8,
        adaptiveCeilingBurst: config?.adaptiveCeilingBurst ?? 10,
        minReadyEvidence: config?.minReadyEvidence ?? 6,
        config: { ...defaultConfig, ...config, statePath },
        childrenList: children,
        auditEvents,
        _revision: state.revision,
        supervisorId: state.supervisorId,
        nativeModeRejectedReason: null,
        completionVerifier: config?.completionVerifier ?? null,
        statePath,
      };
      remediateStaleAssignments(inst);
      return inst;
    }
  }

  // Fresh state
  const supervisorId = config?.initialSessionId ?? randomUUID();
  return {
    adaptiveCeilingNormal: config?.adaptiveCeilingNormal ?? 8,
    adaptiveCeilingBurst: config?.adaptiveCeilingBurst ?? 10,
    minReadyEvidence: config?.minReadyEvidence ?? 6,
    config: { ...defaultConfig, ...config, statePath },
    childrenList: [],
    auditEvents: [],
    _revision: 0,
    supervisorId,
    nativeModeRejectedReason: null,
    completionVerifier: config?.completionVerifier ?? null,
    statePath,
  };
}

function loadStateFile(statePath: string): SupervisorState | null {
  const resolvedPath = path.resolve(statePath);
  const tmpPath = resolvedPath + '.tmp';
  const dir = path.dirname(resolvedPath);

  interface Candidate { state: SupervisorState; rev: number; source: string; }
  const candidates: Candidate[] = [];
  let stateFileExists = false;

  for (const [candidate, label] of [[resolvedPath, 'canonical'], [tmpPath, 'temp']] as const) {
    if (!fs.existsSync(candidate)) continue;
    if (candidate === resolvedPath) stateFileExists = true;
    try {
      const raw = fs.readFileSync(candidate, 'utf-8');
      const parsed = JSON.parse(raw);
      const state = validateStateShape(parsed);
      candidates.push({ state, rev: state.revision, source: label });
    } catch { /* skip */ }
  }

  const validCandidates: Candidate[] = [];
  for (const cand of candidates) {
    try {
      validateStateIntegrity(cand.state);
      validCandidates.push(cand);
    } catch { /* skip */ }
  }

  validCandidates.sort((a, b) => {
    if (b.rev !== a.rev) return b.rev - a.rev;
    if (a.source === 'canonical') return -1;
    if (b.source === 'canonical') return 1;
    return 0;
  });

  const chosen = validCandidates[0] ?? null;
  if (!chosen) return null;

  const state = chosen.state;

  if (chosen.source === 'temp') {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fsyncStateFile(tmpPath);
    fs.renameSync(tmpPath, resolvedPath);
    fsyncRenameDirectory(dir);
  }

  // F8 (R8): load reconciliation journal — reprocess unresolved markers
  processReconciliationJournal(state, statePath);

  return state;
}

// ── Helper functions ──

function toPersisted(a: ChildAssignment): PersistedChildAssignment {
  const r = a.receipt ? { ...a.receipt } : undefined;
  if (r) { delete r.completionToken; delete r.completionProof; }
  return { assignmentId: a.assignmentId, parentSessionId: a.parentSessionId, childSessionId: a.childSessionId, depth: a.depth, kind: a.kind, agentProfile: a.agentProfile, provider: a.provider, model: a.model, effort: a.effort, ownedPaths: a.ownedPaths, forbiddenPaths: a.forbiddenPaths, contextCapsuleKey: a.contextCapsuleKey, status: a.status, receipt: r, leaseExpiresAt: a.leaseExpiresAt, createdAt: a.createdAt, updatedAt: a.updatedAt };
}

function fromPersisted(p: PersistedChildAssignment): ChildAssignment {
  return { ...p, dispatchFingerprint: '', completionProofHash: undefined };
}

function toPublicView(a: ChildAssignment): ChildAssignmentView {
  const r = a.receipt ? { ...a.receipt } : undefined;
  if (r) { delete r.completionToken; delete r.completionProof; }
  return { assignmentId: a.assignmentId, parentSessionId: a.parentSessionId, childSessionId: a.childSessionId, depth: a.depth, kind: a.kind, agentProfile: a.agentProfile, provider: a.provider, model: a.model, effort: a.effort, ownedPaths: [...a.ownedPaths], forbiddenPaths: [...a.forbiddenPaths], contextCapsuleKey: { ...a.contextCapsuleKey, ownedPaths: [...a.contextCapsuleKey.ownedPaths], forbiddenPaths: [...a.contextCapsuleKey.forbiddenPaths], sourceFileHashes: { ...a.contextCapsuleKey.sourceFileHashes } }, status: a.status, receipt: r, leaseExpiresAt: a.leaseExpiresAt, createdAt: a.createdAt, updatedAt: a.updatedAt };
}

function validateStateShape(raw: unknown): SupervisorState {
  if (typeof raw !== 'object' || raw === null) throw new Error('State is not an object');
  const s = raw as Record<string, unknown>;
  if (typeof s.supervisorId !== 'string' || !s.supervisorId) throw new Error('Missing supervisorId');
  if (typeof s.revision !== 'number' || s.revision < 0) throw new Error('Invalid revision');
  if (!Array.isArray(s.children)) throw new Error('Missing children');
  if (!Array.isArray(s.auditEvents)) throw new Error('Missing auditEvents');
  return { supervisorId: s.supervisorId, revision: s.revision, children: s.children as PersistedChildAssignment[], auditEvents: s.auditEvents as AuditEvent[] };
}

function validateStateIntegrity(state: SupervisorState): void {
  if (state.auditEvents.length > 0) {
    let prevRev = 0;
    for (const e of state.auditEvents) {
      if (typeof e.revision !== 'number' || e.revision < 1) throw new Error(`Invalid revision`);
      if (state.auditEvents.length > 1 && e.revision <= prevRev) throw new Error(`Non-monotonic revision`);
      prevRev = e.revision;
    }
  }
  const ids = new Set<string>();
  for (const c of state.children) {
    if (!c.assignmentId || typeof c.assignmentId !== 'string') throw new Error(`Missing assignmentId`);
    if (ids.has(c.assignmentId)) throw new Error(`Duplicate: ${c.assignmentId}`);
    ids.add(c.assignmentId);
    if (!['PENDING','DISPATCHED','RUNNING','COMPLETED','FAILED','ABORTED'].includes(c.status)) throw new Error(`Invalid status: ${c.status}`);
    if (!state.auditEvents.some(e => e.assignmentId === c.assignmentId)) throw new Error(`No audit for ${c.assignmentId}`);
    if (!Array.isArray(c.ownedPaths) || !Array.isArray(c.forbiddenPaths)) throw new Error(`Invalid paths for ${c.assignmentId}`);
    const ownedPaths = normalizeRepoPaths(c.ownedPaths);
    const forbiddenPaths = normalizeRepoPaths(c.forbiddenPaths);
    if (!ownedPaths || !forbiddenPaths) throw new Error(`Unsafe paths for ${c.assignmentId}`);
    c.ownedPaths = ownedPaths;
    c.forbiddenPaths = forbiddenPaths;
  }
}

function remediateStaleAssignments(s: InternalState): void {
  const now = new Date().toISOString();
  let remediated = false;
  for (const child of s.childrenList) {
    if (child.status === 'RUNNING' || child.status === 'DISPATCHED') {
      child.status = 'FAILED';
      child.receipt = { error: 'Stale on restart — remediated' };
      child.updatedAt = now;
      child.leaseExpiresAt = undefined;
      child.completionProofHash = '';
      s._revision++;
      s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'FAILED', assignmentId: child.assignmentId, detail: 'Stale on restart; remediated to FAILED' });
      remediated = true;
    }
  }
  if (remediated && s.statePath) writeState(s);
}

/**
 * AM-0022: Calculate effective writer ceiling based on adaptive policy.
 * Normal ceiling = 8 writers, Burst ceiling = 10 writers.
 * Uses READY evidence count to determine burst eligibility.
 */
function calcEffectiveCeiling(s: InternalState): number {
  const readyEvidence = s.childrenList.filter(c => c.kind === 'writer' && c.status === 'COMPLETED').length;
  return readyEvidence >= s.minReadyEvidence ? s.adaptiveCeilingBurst : s.adaptiveCeilingNormal;
}

function calcWriterSlots(s: InternalState): number {
  const activeWriters = s.childrenList.filter(c => c.kind === 'writer' && (c.status === 'PENDING' || c.status === 'DISPATCHED' || c.status === 'RUNNING')).length;
  const effectiveCeiling = calcEffectiveCeiling(s);
  return Math.max(0, effectiveCeiling - activeWriters);
}

/** ponytail: legacy compatibility — returns maxWriters-based slots */
function calcLegacyWriterSlots(s: InternalState): number {
  return Math.max(0, s.config.maxWriters - s.childrenList.filter(c => c.kind === 'writer' && (c.status === 'PENDING' || c.status === 'DISPATCHED' || c.status === 'RUNNING')).length);
}

function calcReviewerSlots(s: InternalState): number {
  return Math.max(0, s.config.maxReviewers - s.childrenList.filter(c => c.kind === 'reviewer' && (c.status === 'PENDING' || c.status === 'DISPATCHED' || c.status === 'RUNNING')).length);
}

function snapshot(s: InternalState): { rev: number; auditLen: number; children: ChildAssignment[] } {
  return { rev: s._revision, auditLen: s.auditEvents.length, children: s.childrenList.map(a => deepClone(a)) };
}

function rollback(s: InternalState, snap: ReturnType<typeof snapshot>): void {
  s._revision = snap.rev;
  s.auditEvents.splice(snap.auditLen);
  s.childrenList = snap.children.map(a => deepClone(a));
}

function persistOrRollback(s: InternalState, rb: () => void): boolean {
  if (!s.statePath) return true;
  try { writeState(s); return true; } catch { rb(); return false; }
}

function writeState(s: InternalState): void {
  if (!s.statePath) return;
  const resolvedPath = path.resolve(s.statePath);
  const tmpPath = resolvedPath + '.tmp';
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const state: SupervisorState = { supervisorId: s.supervisorId, revision: s._revision, children: s.childrenList.map(toPersisted), auditEvents: s.auditEvents };
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fsyncStateFile(tmpPath);
  fs.renameSync(tmpPath, resolvedPath);
  fsyncRenameDirectory(dir);
}

// ── F10 (R10): reconciliation journal — read-only in supervisor (write in runner) ──
function journalPath(statePath: string): string { return statePath + '.reconcile'; }

// F10 (R10): idempotent, secure reconciliation — persist BEFORE unlink, validate records
function processReconciliationJournal(state: SupervisorState, statePath: string): void {
  const jPath = journalPath(statePath);
  if (!fs.existsSync(jPath)) return;
  try {
    // F10 (R10): O_NOFOLLOW via open flags
    let fd: number;
    try {
      fd = fs.openSync(jPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch {
      // Symlink or cannot open — skip
      try { fs.unlinkSync(jPath); } catch { /* ok */ }
      return;
    }
    const raw = fs.readFileSync(jPath, 'utf-8');
    fs.closeSync(fd);
    const lines = raw.split('\n').filter(l => l.trim());

    // Deduplicate: for each FAIL, check PRE exists and no OK
    const okIds = new Set<string>();
    const preIds = new Set<string>();
    const failEntries: { assignmentId: string; detail: string }[] = [];

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 3) continue;
      const status = parts[0];
      const assignmentId = parts[1];
      if (!['PRE', 'OK', 'FAIL'].includes(status)) continue;
      if (!assignmentId) continue;
      if (status === 'OK') okIds.add(assignmentId);
      if (status === 'PRE') preIds.add(assignmentId);
      if (status === 'FAIL') {
        const detail = parts.slice(2).join(':');
        failEntries.push({ assignmentId, detail });
      }
    }

    let changed = false;
    for (const fe of failEntries) {
      // Only process FAIL if PRE exists and no OK
      if (preIds.has(fe.assignmentId) && !okIds.has(fe.assignmentId)) {
        state.auditEvents.push({
          revision: state.revision + 1,
          timestamp: new Date().toISOString(),
          type: 'ABORT_RECONCILE',
          assignmentId: fe.assignmentId,
          detail: `Restart-reprocessed: ${fe.detail}`,
        });
        state.revision++;
        changed = true;
      }
    }

    if (changed) {
      const tmpPath = statePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      fsyncStateFile(tmpPath);
      fs.renameSync(tmpPath, statePath);
      fsyncRenameDirectory(path.dirname(statePath));
    }

    // Unlink journal after processing
    const unlinkFd = fs.openSync(jPath, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
    fs.closeSync(unlinkFd);
    try { fs.unlinkSync(jPath); } catch { /* ok */ }
    fsyncRenameDirectory(path.dirname(jPath));
  } catch { /* best-effort */ }
}

// ── Public operations ──

function assignChildImpl(s: InternalState, p: Parameters<SupervisorPublicView['assignChild']>[0]): ReturnType<SupervisorPublicView['assignChild']> {
  if (s.config.childDepth > 1) return { ok: false, reason: 'childDepth must be exactly 1' } as const;
  const ownedPaths = normalizeRepoPaths(p.ownedPaths);
  const forbiddenPaths = normalizeRepoPaths(p.forbiddenPaths);
  if (!ownedPaths || !forbiddenPaths) return { ok: false, reason: 'Paths must be repository-relative without traversal' } as const;
  const existing = s.childrenList.find(c => c.assignmentId === p.assignmentId);
  if (existing) {
    const same = p.kind === existing.kind && JSON.stringify([...ownedPaths].sort()) === JSON.stringify([...existing.ownedPaths].sort()) && JSON.stringify([...forbiddenPaths].sort()) === JSON.stringify([...existing.forbiddenPaths].sort());
    if (same) return { ok: true, assignment: toPublicView(existing) } as const;
    return { ok: false, reason: `Conflict: assignmentId ${p.assignmentId} already exists with different parameters` } as const;
  }
  if (p.kind === 'writer' && calcWriterSlots(s) <= 0) return { ok: false, reason: 'No available writer slots' } as const;
  if (p.kind === 'reviewer' && calcReviewerSlots(s) <= 0) return { ok: false, reason: 'No available reviewer slots' } as const;
    const resources = checkResourcesImpl(s.config.backpressureRssMb, s.config.backpressureCpuPct);
  if (resources.underPressure) return { ok: false, reason: `Resource pressure: RSS ${resources.rssMb}MB / CPU ${resources.cpuPct}%` } as const;
  if (p.kind === 'writer') {
    for (const ex of s.childrenList) {
      if (ex.kind !== 'writer' || (ex.status !== 'RUNNING' && ex.status !== 'DISPATCHED' && ex.status !== 'PENDING')) continue;
      for (const np of ownedPaths) {
        for (const ep of ex.ownedPaths) {
          if (np.startsWith(ep + '/') || ep.startsWith(np + '/') || np === ep) return { ok: false, reason: `Writer path overlap with ${ex.assignmentId}: ${np}` } as const;
        }
      }
    }
  }
  if (!p.contextKey) return { ok: false, reason: 'contextKey required' } as const;
  const now = new Date().toISOString();
  const a: ChildAssignment = { assignmentId: p.assignmentId, parentSessionId: s.supervisorId, childSessionId: null, depth: 1, kind: p.kind, agentProfile: p.kind === 'writer' ? 'writer-s' : p.kind === 'reviewer' ? 'reviewer-s' : 'verifier-s', provider: p.provider ?? s.config.defaultProvider, model: p.model ?? s.config.defaultModel, effort: p.effort ?? s.config.defaultEffort, ownedPaths, forbiddenPaths, contextCapsuleKey: p.contextKey, dispatchFingerprint: randomUUID(), status: 'PENDING', createdAt: now, updatedAt: now };
  const snap = snapshot(s);
  s.childrenList.push(a);
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'ASSIGNED', assignmentId: p.assignmentId });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' } as const;
  return { ok: true, assignment: toPublicView(a) } as const;
}

function bindChildSessionImpl(s: InternalState, id: string, sid: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status !== 'PENDING') return { ok: false, reason: `Cannot bind ${id} in ${a.status}` };
  const snap = snapshot(s);
  const now = new Date().toISOString();
  a.childSessionId = sid; a.updatedAt = now;
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'ASSIGNED', assignmentId: id, detail: `bound: ${sid}` });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' };
  return { ok: true };
}

function dispatchAssignmentImpl(s: InternalState, id: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status !== 'PENDING') return { ok: false, reason: `Cannot dispatch ${id} in ${a.status}` };
  if (a.childSessionId === null) return { ok: false, reason: 'Session not bound' };
  const snap = snapshot(s);
  const now = new Date();
  const proof = randomUUID();
  a.status = 'DISPATCHED'; a.dispatchFingerprint = proof; a.completionProofHash = sha256(proof);
  a.leaseExpiresAt = new Date(now.getTime() + s.config.assignmentTimeoutMs).toISOString();
  a.updatedAt = now.toISOString();
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now.toISOString(), type: 'DISPATCHED', assignmentId: id });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' };
  return { ok: true };
}

function ackAssignmentImpl(s: InternalState, id: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status !== 'DISPATCHED') return { ok: false, reason: `Cannot ack ${id} in ${a.status}` };
  if (a.leaseExpiresAt && Date.now() > new Date(a.leaseExpiresAt).getTime()) return { ok: false, reason: `Lease expired: ${a.leaseExpiresAt}` };
  const snap = snapshot(s);
  const now = new Date().toISOString();
  a.status = 'RUNNING'; a.updatedAt = now;
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'ACKED', assignmentId: id });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' };
  return { ok: true };
}

function heartbeatAssignmentImpl(s: InternalState, id: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status !== 'RUNNING') return { ok: false, reason: `Cannot heartbeat ${id} in ${a.status}` };
  if (a.leaseExpiresAt && Date.now() > new Date(a.leaseExpiresAt).getTime()) return { ok: false, reason: `Stale lease: ${a.leaseExpiresAt}` };
  const snap = snapshot(s);
  const now = new Date();
  a.updatedAt = now.toISOString();
  a.leaseExpiresAt = new Date(now.getTime() + s.config.assignmentTimeoutMs).toISOString();
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now.toISOString(), type: 'HEARTBEAT', assignmentId: id });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' };
  return { ok: true };
}

// F9 (R9): completeAssignmentImpl — validates receipt fields; terminal event type validation is runner responsibility
function completeAssignmentImpl(s: InternalState, assignmentId: string, receipt: Record<string, unknown>): { ok: true } | { ok: false; reason: string } {
  if (!s.completionVerifier) return { ok: false, reason: 'Completion not configured (no verifier)' };
  const a = s.childrenList.find(c => c.assignmentId === assignmentId);
  if (!a) return { ok: false, reason: `Not found: ${assignmentId}` };
  if (a.status !== 'RUNNING') return { ok: false, reason: `Cannot complete ${assignmentId} in ${a.status}` };
  if (!a.leaseExpiresAt || Date.now() > new Date(a.leaseExpiresAt).getTime()) return { ok: false, reason: `Stale lease: ${a.leaseExpiresAt ?? '(none)'}` };
  if (typeof receipt.eventCursor !== 'string' || !receipt.eventCursor) return { ok: false, reason: 'Receipt must include non-empty eventCursor' };
  if (typeof receipt.childSessionId !== 'string' || !receipt.childSessionId) return { ok: false, reason: 'Receipt must include non-empty childSessionId' };
  if (receipt.childSessionId !== a.childSessionId) return { ok: false, reason: `childSessionId mismatch: ${receipt.childSessionId} !== ${a.childSessionId}` };
  if (!s.completionVerifier(assignmentId, receipt)) return { ok: false, reason: 'Completion rejected by verifier' };

  const snap = snapshot(s);
  const now = new Date().toISOString();
  a.status = 'COMPLETED';
  a.receipt = { ...receipt };
  delete a.receipt.completionToken;
  delete a.receipt.completionProof;
  a.updatedAt = now;
  a.leaseExpiresAt = undefined;
  a.completionProofHash = '';
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'COMPLETED', assignmentId });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed during complete' };
  return { ok: true };
}

function failAssignmentImpl(s: InternalState, id: string, error: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status === 'COMPLETED' || a.status === 'FAILED' || a.status === 'ABORTED') return { ok: false, reason: `Cannot fail ${id} in ${a.status}` };
  const snap = snapshot(s);
  const now = new Date().toISOString();
  a.status = 'FAILED'; a.receipt = { error }; a.updatedAt = now; a.leaseExpiresAt = undefined;
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'FAILED', assignmentId: id });
  if (!persistOrRollback(s, () => rollback(s, snap))) return { ok: false, reason: 'Persist failed' };
  return { ok: true };
}

function abortAssignmentImpl(s: InternalState, id: string): { ok: true } | { ok: false; reason: string } {
  const a = s.childrenList.find(c => c.assignmentId === id);
  if (!a) return { ok: false, reason: `Not found: ${id}` };
  if (a.status === 'COMPLETED' || a.status === 'FAILED' || a.status === 'ABORTED') return { ok: false, reason: `Cannot abort ${id} in ${a.status}` };
  const snap = snapshot(s);
  const now = new Date().toISOString();
  a.status = 'ABORTED'; a.updatedAt = now; a.leaseExpiresAt = undefined; a.completionProofHash = '';
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: now, type: 'ABORTED', assignmentId: id });
  if (!persistOrRollback(s, () => rollback(s, snap))) {
    recordAbortReconciliationImpl(s, id, 'abort persist failed');
    return { ok: false, reason: 'Persist failed during abort' };
  }
  return { ok: true };
}

function recordAbortReconciliationImpl(s: InternalState, id: string, detail: string): boolean {
  const snap = snapshot(s);
  s._revision++;
  s.auditEvents.push({ revision: s._revision, timestamp: new Date().toISOString(), type: 'ABORT_RECONCILE', assignmentId: id, detail });
  try { writeState(s); return true; } catch { rollback(s, snap); return false; }
}

function resolveNativeModeImpl(s: InternalState, reason: NativeModeReason): { allowed: true } | { allowed: false; reason: string } {
  if (!['initial_architecture_boundary', 'final_certification_boundary'].includes(reason)) {
    s.nativeModeRejectedReason = `Native mode disallowed for '${reason}'`;
    return { allowed: false, reason: s.nativeModeRejectedReason };
  }
  return { allowed: true };
}

function checkResourcesImpl(rssThreshold?: number, cpuThreshold?: number): { rssMb: number; cpuPct: number; underPressure: boolean } {
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const cpuPct = Math.min(100, Math.max(0, Math.round((os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100)));
  const rssLimit = rssThreshold ?? 2048;
  const cpuLimit = cpuThreshold ?? 200;
  return { rssMb, cpuPct, underPressure: rssMb >= rssLimit || cpuPct >= cpuLimit };
}
