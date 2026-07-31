import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RunState =
  | 'CREATED' | 'DISCOVERING' | 'CLARIFYING' | 'PLANNED' | 'PLAN_VALIDATED'
  | 'EXECUTING' | 'VERIFYING' | 'REVIEWING' | 'REMEDIATING' | 'READY_FOR_APPROVAL'
  | 'COMPLETED' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export const RUN_LOCKED_ERROR = 'run locked by live process';
export const RUN_ACTIVE_ERROR = 'run already executing';

export interface DurableRun {
  runId: string;
  state: RunState;
  plan: unknown;
  tasks: unknown[];
  receipts: unknown[];
  checkpoints: Checkpoint[];
  createdAt: string;
  updatedAt: string;
  attempt: number;
  error?: string;
  staleProcess?: boolean;
  orphanPid?: number;
}

export interface Checkpoint {
  id: string;
  state: RunState;
  completedTaskIds: string[];
  createdAt: string;
  data: Record<string, unknown>;
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

export class DurableStore {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async createRun(runId: string, plan: unknown): Promise<DurableRun> {
    const dir = runDir(this.basePath, runId);
    ensureDir(dir);
    // GAP-4: exclusive lock on run start; break stale (dead PID) locks.
    this.acquireLock(runId);
    const run: DurableRun = {
      runId,
      state: 'CREATED',
      plan,
      tasks: [],
      receipts: [],
      checkpoints: [],
      createdAt: now(),
      updatedAt: now(),
      attempt: 1,
    };
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return run;
  }

  async getRun(runId: string): Promise<DurableRun | null> {
    const fp = runFilePath(this.basePath, runId);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as DurableRun;
  }

  async updateState(runId: string, state: RunState): Promise<void> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.state = state;
    run.updatedAt = now();
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
  }

  async updateError(runId: string, error: string): Promise<void> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.error = error;
    run.updatedAt = now();
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
  }

  async addReceipt(runId: string, receipt: unknown): Promise<void> {
    const run = await this.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    run.receipts.push(receipt);
    run.updatedAt = now();
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
  }

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
    };
    ensureDir(checkpointDir(this.basePath, runId));
    // GAP-3: store sha256 of the canonical JSON in the filename
    // (engine Controller pattern: checkpoint-<id>-<hash16>.json).
    const content = JSON.stringify(cp, null, 2);
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    fs.writeFileSync(
      path.join(checkpointDir(this.basePath, runId), `checkpoint-${cpId}-${hash}.json`),
      content,
    );
    run.checkpoints.push(cp);
    run.updatedAt = now();
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return cp;
  }

  private readVerifiedCheckpoint(cpDir: string, fileName: string): Checkpoint {
    const m = fileName.match(/^checkpoint-(.+)-([0-9a-f]{16})\.json$/);
    if (!m) throw new Error(`checkpoint tamper detected: ${fileName}`);
    const content = fs.readFileSync(path.join(cpDir, fileName), 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    if (hash !== m[2]) throw new Error('checkpoint tamper detected');
    return JSON.parse(content) as Checkpoint;
  }

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
      fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
      return run;
    }
    if (lock) this.releaseLock(runId);

    // GAP-2: refuse double-execution when a live foreign process owns the run.
    const proc = this.checkProcess(runId);
    if (proc && proc.alive && proc.pid !== process.pid) {
      run.error = RUN_ACTIVE_ERROR;
      run.updatedAt = now();
      fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
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
          fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
          return run;
        }
        run.state = cp.state;
        if (cp.data.plan) run.plan = cp.data.plan;
        if (cp.data.tasks) run.tasks = cp.data.tasks as unknown[];
        if (cp.data.receipts) run.receipts = cp.data.receipts as unknown[];
        run.updatedAt = now();
        fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
      }
    }
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
    try {
      const cp = this.readVerifiedCheckpoint(cpDir, latest);
      return cp.completedTaskIds;
    } catch {
      return [];
    }
  }

  // ── GAP-4: exclusive run lock ────────────────────────────────────────────

  acquireLock(runId: string): void {
    const fp = lockFilePath(this.basePath, runId);
    ensureDir(runDir(this.basePath, runId));
    const write = (): void => {
      fs.writeFileSync(fp, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
    };
    try {
      write();
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
      const lock = this.checkLock(runId);
      if (lock && lock.alive && lock.pid !== process.pid) {
        throw new Error(`Run is locked by live process ${lock.pid}: ${runId}`);
      }
      try { fs.rmSync(fp, { force: true }); } catch {}
      write();
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
    fs.writeFileSync(
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
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    this.unregisterProcess(runId);
  }
}
