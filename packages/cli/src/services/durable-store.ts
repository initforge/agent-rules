import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RunState =
  | 'CREATED' | 'DISCOVERING' | 'CLARIFYING' | 'PLANNED' | 'PLAN_VALIDATED'
  | 'EXECUTING' | 'VERIFYING' | 'REVIEWING' | 'REMEDIATING' | 'READY_FOR_APPROVAL'
  | 'COMPLETED' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

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

function checkpointDir(basePath: string, runId: string): string {
  return path.join(runDir(basePath, runId), 'checkpoints');
}

function checkpointFilePath(basePath: string, runId: string, checkpointId: string): string {
  return path.join(checkpointDir(basePath, runId), `${checkpointId}.json`);
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

export class DurableStore {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async createRun(runId: string, plan: unknown): Promise<DurableRun> {
    const dir = runDir(this.basePath, runId);
    ensureDir(dir);
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
    fs.writeFileSync(
      checkpointFilePath(this.basePath, runId, cpId),
      JSON.stringify(cp, null, 2),
    );
    run.checkpoints.push(cp);
    run.updatedAt = now();
    fs.writeFileSync(runFilePath(this.basePath, runId), JSON.stringify(run, null, 2));
    return cp;
  }

  async resume(runId: string): Promise<DurableRun | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const cpDir = checkpointDir(this.basePath, runId);
    if (fs.existsSync(cpDir)) {
      const files = fs.readdirSync(cpDir)
        .filter(f => f.endsWith('.json'))
        .sort();
      if (files.length > 0) {
        const latest = files[files.length - 1];
        const cp = JSON.parse(
          fs.readFileSync(path.join(cpDir, latest), 'utf-8'),
        ) as Checkpoint;
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
    const cp = JSON.parse(
      fs.readFileSync(path.join(cpDir, latest), 'utf-8'),
    ) as Checkpoint;
    return cp.completedTaskIds;
  }
}
