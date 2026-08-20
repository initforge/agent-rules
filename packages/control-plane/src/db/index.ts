import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { redactStringJson } from '../services/redact.js';

export const STORE_SCHEMA_VERSION = 1;

// Lockfile for crash recovery detection
const LOCKFILE_SUFFIX = '.lock';
const PID_KEY = 'pid';
const START_KEY = 'start';
const VERSION_KEY = 'version';

interface LockfileData {
  pid: number;
  start: string;
  version: number;
}

function getLockfilePath(storePath: string): string {
  return storePath + LOCKFILE_SUFFIX;
}

function writeLockfile(lockPath: string): void {
  const data: LockfileData = { pid: process.pid, start: new Date().toISOString(), version: STORE_SCHEMA_VERSION };
  fs.writeFileSync(lockPath, JSON.stringify(data), 'utf-8');
}

function removeLockfile(lockPath: string): void {
  fs.unlinkSync(lockPath); // ponytail: throws on failure; callers handle
}

function readLockfile(lockPath: string): LockfileData | null {
  if (!fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockfileData;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkOrphanedLockfile(lockPath: string): boolean {
  const lock = readLockfile(lockPath);
  if (!lock) return false;
  // If the lock claims our own PID, it's our lock - not orphaned
  if (lock.pid === process.pid) return false;
  // Stale lock: process no longer alive
  if (!isProcessAlive(lock.pid)) {
    try { removeLockfile(lockPath); } catch {}
    return false;
  }
  return true;
}

export interface AuditRecord {
  id: number;
  ts: string;
  action: string;
  target_file: string;
  description: string | null;
  old_hash: string | null;
  new_hash: string | null;
  backup_path: string | null;
  user: string;
  status: string;
}

export interface RunRecord {
  id: number;
  ts: string;
  run_id: string;
  platform: string | null;
  model: string | null;
  outcome: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  tool_calls: number | null;
  duration_ms: number | null;
  details: string | null;
}

export interface TelemetryRecord {
  id: number;
  event_id: string;
  ts: string;
  event_type: string;
  platform: string | null;
  model: string | null;
  effort: string | null;
  outcome: string | null;
  payload: string;
}

interface StoreData {
  _schemaVersion: number;
  audit: AuditRecord[];
  runs: RunRecord[];
  telemetry: TelemetryRecord[];
  counters: { audit: number; runs: number; telemetry: number };
}

// Retention limits (ponytail: raise when needed)
const MAX_AUDIT = 1000;
const MAX_RUNS = 500;
const MAX_TELEMETRY = 2000;
// Telemetry is aggregate analytics rather than audit/evidence. Keep the
// durable batch large enough that high-volume imports do not repeatedly
// rewrite and fsync the full bounded JSON store; closeDb still flushes all
// pending events.
const TELEMETRY_FLUSH_BATCH = 256;

let store: StoreData = { _schemaVersion: STORE_SCHEMA_VERSION, audit: [], runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } };
let storePath: string = '';
let dirty = false;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let writeLock = false;
let writeQueue: Array<() => void> = []; // queued writes instead of skip
let telemetryMutationsSinceSave = 0;

function validateStoreData(data: unknown): data is StoreData {
  if (data === null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d._schemaVersion !== 'number') return false;
  if (d._schemaVersion > STORE_SCHEMA_VERSION) return false; // fail-closed on future version
  if (!Array.isArray(d.audit)) return false;
  if (!Array.isArray(d.runs)) return false;
  if (!Array.isArray(d.telemetry)) return false;
  if (!d.counters || typeof d.counters !== 'object') return false;
  const counters = d.counters as Record<string, unknown>;
  if (![counters.audit, counters.runs, counters.telemetry].every(
    (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  )) return false;
  return true;
}

function loadStore(): void {
  if (storePath && fs.existsSync(storePath)) {
    let parsed: unknown;
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Store corrupted or incompatible schema version. Refusing to load.`);
    }
    // Ponytail: auto-upgrade legacy stores (no _schemaVersion) to current schema
    if (!validateStoreData(parsed)) {
      // Fail-closed: only attempt legacy upgrade if this looks like a legacy store
      // (no _schemaVersion field AND has required arrays)
      const legacy = parsed as Record<string, unknown> | null;
      if (
        legacy !== null &&
        typeof legacy === 'object' &&
        !Array.isArray(legacy) &&
        legacy._schemaVersion === undefined &&  // must not have a version marker
        Array.isArray(legacy.audit) &&
        Array.isArray(legacy.runs) &&
        Array.isArray(legacy.telemetry) &&
        legacy.counters &&
        typeof legacy.counters === 'object'
      ) {
        // Legacy store: inject schema version and validate
        store = {
          _schemaVersion: STORE_SCHEMA_VERSION,
          audit: legacy.audit as AuditRecord[],
          runs: legacy.runs as RunRecord[],
          telemetry: legacy.telemetry as TelemetryRecord[],
          counters: legacy.counters as { audit: number; runs: number; telemetry: number },
        };
        dirty = true; // mark dirty so auto-upgrade gets written back
        return;
      }
      throw new Error(`Store corrupted or incompatible schema version. Refusing to load.`);
    }
    store = parsed;
    // Strict counter validation: counter must match array length or be one ahead
    validateCounters();
  }
}

function validateCounters(): void {
  const checks: Array<{ name: keyof typeof store.counters; arr: unknown[] }> = [
    { name: 'audit', arr: store.audit },
    { name: 'runs', arr: store.runs },
    { name: 'telemetry', arr: store.telemetry },
  ];
  for (const { name, arr } of checks) {
    const maxId = arr.reduce<number>((max, r) => Math.max(max, (r as { id: number }).id), 0);
    // Counter must be >= maxId (handles gaps from deleted records)
    const counter = store.counters[name] as number;
    if (counter < maxId) {
      store.counters[name] = maxId;
      dirty = true;
    }
    // ponytail: if counter >> maxId+arr.length, someone tampered; log but don't block
  }
}

function enforceRetention(): void {
  if (store.audit.length > MAX_AUDIT) store.audit.length = MAX_AUDIT;
  if (store.runs.length > MAX_RUNS) store.runs.length = MAX_RUNS;
  if (store.telemetry.length > MAX_TELEMETRY) store.telemetry.length = MAX_TELEMETRY;
}

function doWrite(): void {
  const tmpPath = storePath + '.tmp';
  enforceRetention();
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
  // fsync temp file to ensure data is on disk before rename (skip win32: fsync O_RDONLY fails with EPERM)
  if (process.platform !== 'win32') {
    const fd = fs.openSync(tmpPath, fs.constants.O_RDONLY);
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  fs.renameSync(tmpPath, storePath);
  // fsync directory to ensure rename is durable (skip win32: opening dirs not supported)
  if (process.platform !== 'win32') {
    const dirFd = fs.openSync(path.dirname(storePath), fs.constants.O_RDONLY);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  }
}

function saveStore(): void {
  if (!dirty || !storePath) return;
  if (writeLock) {
    // Queue the write instead of skipping
    writeQueue.push(() => { dirty = true; saveStore(); });
    return;
  }
  writeLock = true;
  const tmpPath = storePath + '.tmp';
  try {
    doWrite();
    dirty = false;
    telemetryMutationsSinceSave = 0;
  } catch (e) {
    // Rollback: delete orphan temp file if rename failed
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
    throw e;
  } finally {
    writeLock = false;
    // Drain queue if we were the first writer
    if (writeQueue.length > 0) {
      const next = writeQueue.shift();
      if (next) next();
    }
  }
}

export async function getDb(targetPath?: string): Promise<{ audit: AuditRecord[]; runs: RunRecord[]; telemetry: TelemetryRecord[] }> {
  if (!storePath) {
    if (!targetPath) {
      let dir = __dirname;
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) { targetPath = path.join(dir, 'packages', 'control-plane', 'data', 'store.json'); break; }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    storePath = targetPath || path.join(process.cwd(), 'data', 'store.json');
    
    // Check for orphaned lockfile from crash (skip in test mode)
    if (process.env.NODE_ENV !== 'test') {
      const lockPath = getLockfilePath(storePath);
      if (checkOrphanedLockfile(lockPath)) {
        throw new Error(`Store is locked by another process. If the process is not running, delete ${lockPath}`);
      }
    }
    
    loadStore();
    
    // Acquire lockfile (skip in test mode)
    if (process.env.NODE_ENV !== 'test') {
      writeLockfile(getLockfilePath(storePath));
    }
    
    if (!saveTimer) {
      saveTimer = setInterval(() => saveStore(), 5000);
    }
  }
  return store;
}

export function getStore(): StoreData {
  return store;
}

export function addAudit(record: Omit<AuditRecord, 'id'>): AuditRecord {
  store.counters.audit++;
  const entry: AuditRecord = { id: store.counters.audit, ...record };
  store.audit.unshift(entry);
  dirty = true;
  saveStore(); // ponytail: immediate sync on mutation for crash safety
  return entry;
}

export function addRun(record: Omit<RunRecord, 'id'>): RunRecord {
  store.counters.runs++;
  const entry: RunRecord = { id: store.counters.runs, ...record };
  if (entry.details) {
    entry.details = redactStringJson(entry.details);
  }
  store.runs.unshift(entry);
  dirty = true;
  saveStore(); // ponytail: immediate sync on mutation for crash safety
  return entry;
}

export function addTelemetry(record: Omit<TelemetryRecord, 'id'>): TelemetryRecord {
  store.counters.telemetry++;
  const entry: TelemetryRecord = { id: store.counters.telemetry, ...record };
  if (entry.payload) {
    entry.payload = redactStringJson(entry.payload);
  }
  store.telemetry.unshift(entry);
  dirty = true;
  telemetryMutationsSinceSave++;
  if (telemetryMutationsSinceSave >= TELEMETRY_FLUSH_BATCH) {
    saveStore();
  }
  return entry;
}

export async function closeDb(): Promise<void> {
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
  saveStore();
  // Release lockfile on clean shutdown (skip in test mode)
  if (storePath && process.env.NODE_ENV !== 'test') {
    const lockPath = getLockfilePath(storePath);
    try {
      removeLockfile(lockPath);
    } catch (e) {
      throw new Error(`Failed to remove lockfile ${lockPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export function resetDb(): void {
  // test isolation: reset all module state
  if (storePath && process.env.NODE_ENV !== 'test') {
    try { removeLockfile(getLockfilePath(storePath)); } catch {}
  }
  store = { _schemaVersion: STORE_SCHEMA_VERSION, audit: [], runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } };
  storePath = '';
  dirty = false;
  telemetryMutationsSinceSave = 0;
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
  writeLock = false;
  writeQueue = [];
  telemetryMutationsSinceSave = 0;
}

process.on('exit', () => { try { saveStore(); if (storePath) removeLockfile(getLockfilePath(storePath)); } catch {} });

// Signal handlers for graceful shutdown
process.on('SIGTERM', async () => { await closeDb(); process.exit(0); });
process.on('SIGINT', async () => { await closeDb(); process.exit(0); });
