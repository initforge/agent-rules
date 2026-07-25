import fs from 'fs';
import path from 'path';

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
  audit: AuditRecord[];
  runs: RunRecord[];
  telemetry: TelemetryRecord[];
  counters: { audit: number; runs: number; telemetry: number };
}

let store: StoreData = { audit: [], runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } };
let storePath: string = '';
let dirty = false;
let saveTimer: ReturnType<typeof setInterval> | null = null;

function loadStore(): void {
  if (storePath && fs.existsSync(storePath)) {
    try {
      store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    } catch { store = { audit: [], runs: [], telemetry: [], counters: { audit: 0, runs: 0, telemetry: 0 } }; }
  }
}

function saveStore(): void {
  if (!dirty || !storePath) return;
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath + '.tmp', JSON.stringify(store, null, 2));
  fs.renameSync(storePath + '.tmp', storePath);
  dirty = false;
}

export async function getDb(targetPath?: string): Promise<{ audit: AuditRecord[]; runs: RunRecord[]; telemetry: TelemetryRecord[] }> {
  if (!storePath) {
    if (!targetPath) {
      let dir = __dirname;
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'rules', 'manifest.yaml'))) { targetPath = path.join(dir, 'control-plane', 'data', 'store.json'); break; }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    storePath = targetPath || path.join(process.cwd(), 'data', 'store.json');
    loadStore();
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
  return entry;
}

export function addRun(record: Omit<RunRecord, 'id'>): RunRecord {
  store.counters.runs++;
  const entry: RunRecord = { id: store.counters.runs, ...record };
  store.runs.unshift(entry);
  dirty = true;
  return entry;
}

export function addTelemetry(record: Omit<TelemetryRecord, 'id'>): TelemetryRecord {
  store.counters.telemetry++;
  const entry: TelemetryRecord = { id: store.counters.telemetry, ...record };
  store.telemetry.unshift(entry);
  dirty = true;
  return entry;
}

export function closeDb(): void {
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
  saveStore();
}

process.on('exit', () => closeDb());
