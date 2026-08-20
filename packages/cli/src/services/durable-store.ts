import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RunState =
  | 'CREATED' | 'DISCOVERING' | 'CLARIFYING' | 'PLANNED' | 'PLAN_VALIDATED'
  | 'EXECUTING' | 'VERIFYING' | 'REVIEWING' | 'REMEDIATING' | 'READY_FOR_APPROVAL'
  | 'COMPLETED' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export const RUN_LOCKED_ERROR = 'run locked by live process';
export const RUN_ACTIVE_ERROR = 'run already executing';
export const CORRUPTED_RUN_ERROR = 'run data corrupted';
export const CORRUPTED_CHECKPOINT_ERROR = 'checkpoint data corrupted';

// ponytail: Schema versions for future migrations
const RUN_SCHEMA_VERSION = 1;
const CHECKPOINT_SCHEMA_VERSION = 1;

const VALID_STATES: Set<RunState> = new Set([
  'CREATED', 'DISCOVERING', 'CLARIFYING', 'PLANNED', 'PLAN_VALIDATED',
  'EXECUTING', 'VERIFYING', 'REVIEWING', 'REMEDIATING', 'READY_FOR_APPROVAL',
  'COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED',
]);

export interface Receipt {
  id: string;
  taskId?: string;
  status?: string;
  result?: unknown;
  evidencePaths?: string[];
  timestamp?: string;
  [key: string]: unknown;
}

export interface DurableRun {
  runId: string;
  state: RunState;
  plan: unknown;
  tasks: unknown[];
  receipts: Receipt[];
  checkpoints: Checkpoint[];
  createdAt: string;
  updatedAt: string;
  attempt: number;
  error?: string;
  staleProcess?: boolean;
  orphanPid?: number;
  schemaVersion?: number;
}

export interface Checkpoint {
  id: string;
  state: RunState;
  completedTaskIds: string[];
  createdAt: string;
  data: Record<string, unknown>;
  schemaVersion?: number;
}

function validateRunState(state: unknown): state is RunState {
  return typeof state === 'string' && VALID_STATES.has(state as RunState);
}

function runDir(basePath: string, runId: string): string {
  return path.join(basePath, '.agent', 'runs', runId);
}

function runFilePath(basePath: string, runId: string): string {
  return path.join(runDir(basePath, runId), 'run.json');
}

function lockFilePath(basePath: string, runId: string): string {
  return path.join(runDir(basePath, runId), 'run.json.lock');
}

function processFilePath(basePath: string, runId: string): string {
  return path.join(runDir(basePath, runId), 'process.json');
}

function checkpointDir(basePath: string, runId: string): string {
  return path.join(runDir(basePath, runId), 'checkpoints');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function now(): string {
  return new Date().toISOString();
}

function generateCheckpointId(): string {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === 'EPERM';
  }
}

// ── Atomic write helpers ──────────────────────────────────────────────────────

/**
 * Atomic write: write to temp file (exclusive creation), then rename.
 * - crypto.randomUUID() gives 128 bits of entropy — collision-resistant.
 * - flag 'wx' fails fast if temp file already exists (covers concurrent collisions).
 * - rename is atomic on POSIX; on Windows it is close enough (no partial writes).
 */
function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(tmp, content, { flag: 'wx', encoding: 'utf-8' });
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
}

// ── Schema validation ─────────────────────────────────────────────────────────

function validateRun(raw: unknown): asserts raw is DurableRun {
  if (!raw || typeof raw !== 'object') throw new Error(CORRUPTED_RUN_ERROR);
  const r = raw as Record<string, unknown>;
  if (typeof r.runId !== 'string') throw new Error(`${CORRUPTED_RUN_ERROR}: missing runId`);
  if (!validateRunState(r.state)) throw new Error(`${CORRUPTED_RUN_ERROR}: invalid state`);
  if (!Array.isArray(r.tasks)) throw new Error(`${CORRUPTED_RUN_ERROR}: tasks must be array`);
  if (!Array.isArray(r.receipts)) throw new Error(`${CORRUPTED_RUN_ERROR}: receipts must be array`);
  if (!Array.isArray(r.checkpoints)) throw new Error(`${CORRUPTED_RUN_ERROR}: checkpoints must be array`);
  if (typeof r.createdAt !== 'string') throw new Error(`${CORRUPTED_RUN_ERROR}: missing createdAt`);
  if (typeof r.updatedAt !== 'string') throw new Error(`${CORRUPTED_RUN_ERROR}: missing updatedAt`);
  if (typeof r.attempt !== 'number') throw new Error(`${CORRUPTED_RUN_ERROR}: missing attempt`);
  // Validate receipts (id is optional — allow id-less receipts for forward compat)
  for (const receipt of r.receipts) {
    if (!receipt || typeof receipt !== 'object') throw new Error(`${CORRUPTED_RUN_ERROR}: invalid receipt`);
  }
}

function validateCheckpoint(raw: unknown): asserts raw is Checkpoint {
  if (!raw || typeof raw !== 'object') throw new Error(CORRUPTED_CHECKPOINT_ERROR);
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string') throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: missing id`);
  if (!validateRunState(c.state)) throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: invalid state`);
  if (!Array.isArray(c.completedTaskIds)) throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: invalid completedTaskIds`);
  if (typeof c.createdAt !== 'string') throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: missing createdAt`);
  if (!c.data || typeof c.data !== 'object') throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: missing data`);
}

export class DurableStore {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async createRun(runId: string, plan: unknown): Promise<DurableRun> {
    const fp = runFilePath(this.basePath, runId);
    const dir = runDir(this.basePath, runId);
    ensureDir(dir);
    // GAP-4: exclusive lock; break stale (dead PID) locks; allow self-lock for overwrite.
    try {
      this.acquireLock(runId);
    } catch {
      // Lock held by live foreign process — fail fast rather than corrupt.
      throw new Error(`Run ${runId} is locked by another process`);
    }
    // Increment attempt on overwrite; start at 1 for fresh runs.
    let attempt = 1;
    if (fs.existsSync(fp)) {
      try {
        const prev = JSON.parse(fs.readFileSync(fp, 'utf-8')) as Record<string, unknown>;
        attempt = (typeof prev.attempt === 'number' ? prev.attempt : 0) + 1;
      } catch { /* corrupt or unreadable — start fresh at attempt 1 */ }
    }
    const run: DurableRun = {
      runId,
      state: 'CREATED',
      plan,
      tasks: [],
      receipts: [],
      checkpoints: [],
      createdAt: now(),
      updatedAt: now(),
      attempt,
      schemaVersion: RUN_SCHEMA_VERSION,
    };
    atomicWrite(fp, JSON.stringify(run, null, 2));
    return run;
  }

  async getRun(runId: string): Promise<DurableRun | null> {
    const fp = runFilePath(this.basePath, runId);
    if (!fs.existsSync(fp)) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      // File exists but is corrupted (not valid JSON)
      throw new Error(`${CORRUPTED_RUN_ERROR}: ${runId} is not valid JSON`);
    }
    try {
      validateRun(raw);
    } catch (e: any) {
      throw new Error(`${e.message} in run ${runId}`);
    }
    return raw;
  }

  async updateState(runId: string, state: RunState): Promise<void> {
    if (!validateRunState(state)) throw new Error(`Invalid state: ${state}`);
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.state = state;
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
  }

  async updateError(runId: string, error: string): Promise<void> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.error = error;
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
  }

  /**
   * Deduplication: if receipt with same id already exists, skip push.
   * Expects receipt to have an `id` field (string). Unknown receipts without id
   * are still added (idempotent by nature of push, but no dedup).
   */
  async addReceipt(runId: string, receipt: unknown): Promise<boolean> {
    if (!receipt || typeof receipt !== 'object') throw new Error('Receipt must be an object');
    const rec = receipt as Receipt;
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    // Deduplication by id
    if (rec.id && run.receipts.some(r => r.id === rec.id)) {
      return false; // already exists, skip
    }
    run.receipts.push(rec);
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return true;
  }

  /**
   * Atomic checkpoint: writes both checkpoint file and run.json atomically.
   * Order: (1) write checkpoint to temp + rename, (2) update run.json.
   * If crash after step 1, checkpoint exists but run.json not updated → recoverable.
   * If crash after step 2, run references checkpoint that exists → consistent.
   */
  async checkpoint(runId: string): Promise<Checkpoint> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const cpId = generateCheckpointId();
    const completedTaskIds: string[] = [];
    for (const task of run.tasks) {
      const t = task as Record<string, unknown>;
      if (t.state === 'COMPLETED' || t.status === 'completed' || t.completed === true) {
        if (typeof t.id === 'string') completedTaskIds.push(t.id);
      }
    }
    const cp: Checkpoint = {
      id: cpId,
      state: run.state,
      completedTaskIds,
      createdAt: now(),
      data: { plan: run.plan, tasks: run.tasks, receipts: run.receipts },
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    };
    ensureDir(checkpointDir(this.basePath, runId));
    // GAP-3: store sha256 of the canonical JSON in the filename
    // (engine Controller pattern: checkpoint-<id>-<hash16>.json).
    // ponytail: compact serialization ensures canonical byte-for-byte form.
    const content = JSON.stringify(cp);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const cpFileName = `checkpoint-${cpId}-${hash}.json`;
    // Atomic write of checkpoint file
    atomicWrite(path.join(checkpointDir(this.basePath, runId), cpFileName), content);
    // Then update run.json (checkpoint metadata only, not full data)
    run.checkpoints.push(cp);
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return cp;
  }

  private readVerifiedCheckpoint(cpDir: string, fileName: string): Checkpoint {
    const m = fileName.match(/^checkpoint-(.+)-([0-9a-f]{16})\.json$/);
    if (!m) throw new Error(`checkpoint tamper detected: ${fileName}`);
    const filePath = path.join(cpDir, fileName);
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    // Hash exact file bytes — no re-serialization (avoids spacing/reorder drift).
    const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
    if (hash !== m[2]) throw new Error('checkpoint tamper detected');
    let raw: unknown;
    try {
      raw = JSON.parse(rawContent);
    } catch {
      throw new Error(`${CORRUPTED_CHECKPOINT_ERROR}: not valid JSON in ${fileName}`);
    }
    try {
      validateCheckpoint(raw);
    } catch (e: any) {
      throw new Error(`${e.message} in ${fileName}`);
    }
    return raw as Checkpoint;
  }

  /**
   * Resume with improved lock handling:
   * - Check lock first; refuse if live foreign lock
   * - Check process registry; refuse if live foreign process
   * - Single atomic write for the entire resume operation (state + data)
   * - Clean stale locks/processes atomically with state update
   * - Distinguish live contention (BLOCKED) from stale recoverable state (proceed)
   * - Stale RUNNING tasks → PENDING (worker crashed, must retry with preserved assignment)
   * - Completed tasks → stay COMPLETED (do not rerun)
   */
  async resume(runId: string): Promise<DurableRun | null> {
    const run = await this.getRun(runId);
    if (!run) return null;

    // GAP-4: honor the run lock — refuse while a live foreign process holds it,
    // clean stale (dead or self-held) locks and proceed.
    const lock = this.checkLock(runId);
    if (lock && lock.alive && lock.pid !== process.pid) {
      run.state = 'BLOCKED';
      run.error = RUN_LOCKED_ERROR;
      run.updatedAt = now();
      atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
      return run;
    }
    if (lock) this.releaseLock(runId);

    // GAP-2: refuse double-execution when a live foreign process owns the run.
    const proc = this.checkProcess(runId);
    if (proc && proc.alive && proc.pid !== process.pid) {
      run.error = RUN_ACTIVE_ERROR;
      run.updatedAt = now();
      atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
      return run;
    }
    if (proc) {
      if (!proc.alive) {
        run.staleProcess = true;
        run.orphanPid = proc.pid;
      }
      this.unregisterProcess(runId);
    }

    const cpDir = checkpointDir(this.basePath, runId);
    if (fs.existsSync(cpDir)) {
      const files = fs.readdirSync(cpDir)
        .filter(f => f.endsWith('.json'))
        .sort();
      if (files.length > 0) {
        const latest = files[files.length - 1];
        let cp: Checkpoint;
        try {
          cp = this.readVerifiedCheckpoint(cpDir, latest);
        } catch {
          // GAP-3: tampered checkpoint — fail the run, do NOT absorb it.
          run.state = 'FAILED';
          run.error = 'checkpoint tamper detected';
          run.updatedAt = now();
          atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
          return run;
        }
        run.state = cp.state;
        if (cp.data.plan) run.plan = cp.data.plan;
        if (cp.data.tasks) {
          run.tasks = cp.data.tasks as unknown[];
          // ponytail: filter stale RUNNING tasks → PENDING (worker crashed, preserve assignment/retryCount)
          // Completed tasks stay COMPLETED (do not rerun per AC).
          // IMP-003: this ensures stale recoverable state distinguishes from live contention.
          const completedSet = new Set(cp.completedTaskIds);
          for (const t of run.tasks) {
            const task = t as Record<string, unknown>;
            if (task.state === 'RUNNING' && !completedSet.has(task.id as string)) {
              task.state = 'PENDING'; // stale — will be retried with preserved assignment
            }
          }
        }
        if (cp.data.receipts) run.receipts = cp.data.receipts as Receipt[];
        run.updatedAt = now();
        // Atomic: single write for all resume state changes
        atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
        return run;
      }
    }
    // Update updatedAt even when no checkpoint restored
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return run;
  }

  async listRuns(): Promise<string[]> {
    const runsDir = path.join(this.basePath, '.agent', 'runs');
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  async deleteRun(runId: string): Promise<void> {
    const dir = runDir(this.basePath, runId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  async getCompletedTaskIds(runId: string): Promise<string[]> {
    const run = await this.getRun(runId);
    if (!run) return [];
    const cpDir = checkpointDir(this.basePath, runId);
    if (!fs.existsSync(cpDir)) return [];
    const files = fs.readdirSync(cpDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    if (files.length === 0) return [];
    const latest = files[files.length - 1];
    // F3: tamper must throw, not silently return [] (matches resume()).
    const cp = this.readVerifiedCheckpoint(cpDir, latest);
    return cp.completedTaskIds;
  }

  // ── GAP-4: exclusive run lock ────────────────────────────────────────────

  acquireLock(runId: string): void {
    const fp = lockFilePath(this.basePath, runId);
    ensureDir(runDir(this.basePath, runId));
    // Try exclusive creation first — fails fast on any existing lock.
    try {
      fs.writeFileSync(fp, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
      return;
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
    }
    // Lock exists — check if it is live foreign.
    const lock = this.checkLock(runId);
    if (lock && lock.alive && lock.pid !== process.pid) {
      throw new Error(`Run is locked by live process ${lock.pid}: ${runId}`);
    }
    // Stale or self-lock: remove and retry with exclusive creation.
    // If another process claims it between rm and write, 'wx' fails closed — correct.
    try { fs.rmSync(fp, { force: true }); } catch {}
    try {
      fs.writeFileSync(fp, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
    } catch (e2: any) {
      if (e2.code === 'EEXIST') {
        throw new Error(`Run is locked by another process: ${runId}`);
      }
      throw e2;
    }
  }

  checkLock(runId: string): { pid: number; alive: boolean } | null {
    const fp = lockFilePath(this.basePath, runId);
    if (!fs.existsSync(fp)) return null;
    try {
      const [pidStr] = fs.readFileSync(fp, 'utf-8').trim().split('\n');
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) return null;
      return { pid, alive: pidAlive(pid) };
    } catch {
      return null;
    }
  }

  releaseLock(runId: string): void {
    const lock = this.checkLock(runId);
    if (!lock) return;
    // Never break a live foreign lock.
    if (lock.alive && lock.pid !== process.pid) return;
    try { fs.rmSync(lockFilePath(this.basePath, runId), { force: true }); } catch {}
  }

  // ── GAP-2: process registry ──────────────────────────────────────────────

  registerProcess(runId: string): void {
    ensureDir(runDir(this.basePath, runId));
    atomicWrite(
      processFilePath(this.basePath, runId),
      JSON.stringify({ pid: process.pid, startedAt: now() }, null, 2),
    );
  }

  unregisterProcess(runId: string): void {
    const proc = this.checkProcess(runId);
    if (!proc) return;
    if (proc.alive && proc.pid !== process.pid) return; // never remove a live foreign entry
    try { fs.rmSync(processFilePath(this.basePath, runId), { force: true }); } catch {}
  }

  checkProcess(runId: string): { pid: number; alive: boolean } | null {
    const fp = processFilePath(this.basePath, runId);
    if (!fs.existsSync(fp)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf-8')) as { pid?: number };
      if (typeof raw.pid !== 'number') return null;
      return { pid: raw.pid, alive: pidAlive(raw.pid) };
    } catch {
      return null;
    }
  }

  async checkAndFlagStaleProcess(runId: string): Promise<void> {
    const proc = this.checkProcess(runId);
    if (!proc || proc.alive) return;
    const run = await this.getRun(runId);
    if (!run) return;
    run.staleProcess = true;
    run.orphanPid = proc.pid;
    run.updatedAt = now();
    atomicWrite(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    this.unregisterProcess(runId);
  }
}
