import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Task queue on disk.
 *
 * Claiming uses `rename()`, which is atomic within a filesystem: exactly one caller
 * can move a task out of `ready/`, so two runners cannot pick up the same task and a
 * runner killed mid-claim leaves no half-claimed state. This replaces the lease +
 * heartbeat + resource-broker machinery, which existed to coordinate workers that
 * were never real.
 *
 * State lives entirely in directory membership. There is no in-memory index to lose,
 * which is what lets the runner be killed at any moment and resume by reading the
 * filesystem.
 */

export type TaskStatus = 'ready' | 'active' | 'done' | 'failed' | 'needs-user';

/** Directory per state. A task is in exactly one at any time. */
const DIRS: Record<TaskStatus, string> = {
  ready: 'ready',
  active: 'active',
  done: 'done',
  failed: 'failed',
  'needs-user': 'needs-user',
};

export interface QueuedTask {
  id: string;
  /** What the agent should do. Passed to the headless CLI as the prompt. */
  prompt: string;
  /**
   * Commands that decide PASS. A task passes iff every command exits 0.
   * Prose acceptance criteria are what made review unable to close; a command
   * either exits 0 or it does not.
   */
  verification: string[];
  /** Paths this task may write. Used to compute a real diff. */
  ownedPaths: string[];
  /**
   * How many repair attempts produced this task. Bounded by the runner
   * (`maxRepairDepth`) so a failing task cannot spawn an unbounded chain.
   */
  repairDepth: number;
  /** Requirement id in `.agent/plans/<plan>/requirements.yaml`, when there is one. */
  requirementId?: string;
  /** Task this one was created to repair. */
  parentId?: string;
  createdAt: string;
  /** Set when the task leaves `ready/`. */
  claimedAt?: string;
  /** Terminal reason, for `failed` and `needs-user`. */
  reason?: string;
}

export class TaskQueue {
  constructor(readonly root: string) {
    for (const dir of Object.values(DIRS)) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
  }

  private pathFor(status: TaskStatus, id: string): string {
    return path.join(this.root, DIRS[status], `${id}.json`);
  }

  private writeAtomic(target: string, task: QueuedTask): void {
    // Write to a temp name in the same directory, then rename: a reader never sees a
    // partially written task.
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify(task, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  /** Enqueue a task as ready. Returns the task with its generated id when absent. */
  add(task: Omit<QueuedTask, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): QueuedTask {
    const full: QueuedTask = {
      ...task,
      id: task.id ?? `task-${randomUUID().slice(0, 8)}`,
      createdAt: task.createdAt ?? new Date().toISOString(),
    };
    if (full.verification.length === 0) {
      throw new Error(`task ${full.id} has no verification command — it could never be closed`);
    }
    this.writeAtomic(this.pathFor('ready', full.id), full);
    return full;
  }

  /**
   * Atomically claim the oldest ready task, or null when none is available.
   *
   * `rename()` is the whole concurrency control: if two runners race, one rename
   * succeeds and the other fails with ENOENT, which is treated as "someone else got
   * it" and the loop retries with the next candidate.
   */
  claim(): QueuedTask | null {
    const readyDir = path.join(this.root, DIRS.ready);
    const names = fs
      .readdirSync(readyDir)
      .filter((n) => n.endsWith('.json'))
      .sort();

    for (const name of names) {
      const from = path.join(readyDir, name);
      const to = path.join(this.root, DIRS.active, name);
      try {
        fs.renameSync(from, to);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // lost the race
        throw err;
      }
      const task: QueuedTask = { ...JSON.parse(fs.readFileSync(to, 'utf8')), claimedAt: new Date().toISOString() };
      this.writeAtomic(to, task);
      return task;
    }
    return null;
  }

  /** Move a claimed task to a terminal state. */
  settle(task: QueuedTask, status: Extract<TaskStatus, 'done' | 'failed' | 'needs-user'>, reason?: string): void {
    const from = this.pathFor('active', task.id);
    const to = this.pathFor(status, task.id);
    this.writeAtomic(to, { ...task, reason });
    fs.rmSync(from, { force: true });
  }

  /**
   * Return an interrupted task to `ready` so a restarted runner picks it up.
   * Called on startup: anything left in `active/` means the previous runner died.
   */
  recoverAbandoned(): QueuedTask[] {
    const activeDir = path.join(this.root, DIRS.active);
    const recovered: QueuedTask[] = [];
    for (const name of fs.readdirSync(activeDir).filter((n) => n.endsWith('.json'))) {
      const task: QueuedTask = JSON.parse(fs.readFileSync(path.join(activeDir, name), 'utf8'));
      this.writeAtomic(this.pathFor('ready', task.id), { ...task, claimedAt: undefined });
      fs.rmSync(path.join(activeDir, name), { force: true });
      recovered.push(task);
    }
    return recovered;
  }

  list(status: TaskStatus): QueuedTask[] {
    const dir = path.join(this.root, DIRS[status]);
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort()
      .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) as QueuedTask);
  }

  counts(): Record<TaskStatus, number> {
    const out = {} as Record<TaskStatus, number>;
    for (const status of Object.keys(DIRS) as TaskStatus[]) {
      out[status] = fs.readdirSync(path.join(this.root, DIRS[status])).filter((n) => n.endsWith('.json')).length;
    }
    return out;
  }
}
