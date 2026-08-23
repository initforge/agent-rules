import type { VerificationProfile } from './profile.js';
import { baselineBlockReason, type BaselineGate } from './baseline-gate.js';
import { isCurrentExecution, staleExecutionReason, type ExecutionAuthority } from '../state/execution-authority.js';
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

export type TaskStatus = 'ready' | 'active' | 'done' | 'failed' | 'needs-user' | 'interrupted' | 'superseded';

/** Directory per state. A task is in exactly one at any time. */
const DIRS: Record<TaskStatus, string> = {
  ready: 'ready',
  active: 'active',
  done: 'done',
  failed: 'failed',
  'needs-user': 'needs-user',
  interrupted: 'interrupted',
  superseded: 'superseded',
};

export interface QueuedTask {
  id: string;
  /** Stable North-Star TaskPacket id carried through repair children. */
  contractTaskId?: string;
  /** Work identity carried by every executable task when bound to current work. */
  workId?: string;
  executionGeneration?: number;
  specRevision?: number;
  /** What the agent should do. Passed to the headless CLI as the prompt. */
  prompt: string;
  /**
   * Commands that decide PASS. A task passes iff every command exits 0.
   * Prose acceptance criteria are what made review unable to close; a command
   * either exits 0 or it does not.
   */
  verification: string[];
  /** Canonical structured verification. When present, the runner prefers it over legacy strings. */
  verificationProfile?: VerificationProfile;
  /** Paths this task may write. Used to compute a real diff. Empty means repo-wide except forbiddenPaths. */
  ownedPaths: string[];
  /** Paths this task must never modify, even when nested below an owned path. */
  forbiddenPaths?: string[];
  /**
   * How many repair attempts produced this task. Bounded by the runner
   * (`maxRepairDepth`) so a failing task cannot spawn an unbounded chain.
   */
  repairDepth: number;
  /** Allow a task whose only intended artifact is documentation. Default false. */
  allowDocOnly?: boolean;
  /** Requirement id in `.agent/plans/<plan>/requirements.yaml`, when there is one. */
  requirementId?: string;
  /** MCP integrations selected by the capability broker for this task only. */
  mcpIntegrationIds?: string[];
  /**
   * REQ-011: when the task policy explicitly allowed network for a routed
   * integration, remote (url-based) MCP servers may be materialised; default
   * (false/undefined) refuses remote MCPs fail-closed.
   */
  mcpAllowRemote?: boolean;
  /** Stable contract task ids that must reach DONE before this task may execute. */
  dependsOnContractTaskIds?: string[];
  /** Task this one was created to repair. */
  parentId?: string;
  /** Optional scope-aware baseline result supplied by preflight. */
  baselineGate?: BaselineGate;
  /** Bounded Decision Envelope (Phase 3 Decision Closure). */
  decisionEnvelope?: import('../northstar/decision-closure.js').DecisionEnvelope;
  createdAt: string;
  /** Set when the task leaves `ready/`. */
  claimedAt?: string;
  /** Terminal reason, for `failed` and `needs-user`. */
  reason?: string;
  /** Present when an amendment invalidates this task without treating it as a failure. */
  supersededByTaskId?: string;
  supersededByAmendmentId?: string;
  supersededAt?: string;
  supersededFromRevision?: string;
}

export class TaskQueue {
  constructor(readonly root: string, private readonly defaultBaselineGate?: BaselineGate) {
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
      baselineGate: task.baselineGate ?? this.defaultBaselineGate,
      id: task.id ?? `task-${randomUUID().slice(0, 8)}`,
      createdAt: task.createdAt ?? new Date().toISOString(),
    };
    if (full.verification.length === 0 && (!full.verificationProfile || full.verificationProfile.steps.length === 0)) {
      throw new Error(`task ${full.id} has no verification command — it could never be closed`);
    }
    this.writeAtomic(this.pathFor('ready', full.id), full);
    return full;
  }

  private doneContractIds(): Set<string> {
    return new Set(this.list('done').map((task) => task.contractTaskId ?? task.id));
  }

  private needsUserContractIds(): Set<string> {
    return new Set(this.list('needs-user').map((task) => task.contractTaskId ?? task.id));
  }

  dependencyState(task: Pick<QueuedTask, 'dependsOnContractTaskIds'> & Partial<Pick<QueuedTask, 'ownedPaths' | 'baselineGate'>>): { ready: boolean; blocked: string[]; pending: string[]; baselineBlocked: string | null } {
    const deps = [...new Set(task.dependsOnContractTaskIds ?? [])];
    const baselineBlocked = baselineBlockReason(task.baselineGate ?? this.defaultBaselineGate, task.ownedPaths ?? []);
    if (deps.length === 0) return { ready: baselineBlocked === null, blocked: [], pending: [], baselineBlocked };
    const done = this.doneContractIds();
    const needsUser = this.needsUserContractIds();
    const blocked = deps.filter((id) => !done.has(id) && needsUser.has(id));
    const pending = deps.filter((id) => !done.has(id) && !needsUser.has(id));
    return { ready: blocked.length === 0 && pending.length === 0 && baselineBlocked === null, blocked, pending, baselineBlocked };
  }

  /**
   * Atomically claim the oldest ready task, or null when none is available.
   *
   * `rename()` is the whole concurrency control: if two runners race, one rename
   * succeeds and the other fails with ENOENT, which is treated as "someone else got
   * it" and the loop retries with the next candidate.
   */
  claim(authority?: ExecutionAuthority): QueuedTask | null {
    const readyDir = path.join(this.root, DIRS.ready);
    const names = fs
      .readdirSync(readyDir)
      .filter((n) => n.endsWith('.json'))
      .sort();

    for (const name of names) {
      const from = path.join(readyDir, name);
      let preview: QueuedTask;
      try { preview = JSON.parse(fs.readFileSync(from, 'utf8')) as QueuedTask; }
      catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
      if (authority && preview.workId && !isCurrentExecution({
        work_id: preview.workId,
        execution_generation: preview.executionGeneration ?? 0,
        spec_revision: preview.specRevision,
      }, authority)) {
        this.writeAtomic(this.pathFor('superseded', preview.id), {
          ...preview,
          reason: staleExecutionReason({
            work_id: preview.workId,
            execution_generation: preview.executionGeneration ?? 0,
            spec_revision: preview.specRevision,
          }, authority),
          supersededAt: new Date().toISOString(),
        });
        fs.rmSync(from, { force: true });
        continue;
      }
      const dependency = this.dependencyState(preview);
      // Pending dependency: leave the task ready and look for its prerequisite/repair.
      // Terminal dependency: claim it so the runner can settle it needs-user with evidence.
      // A baseline-blocked task is claimable so the runner can settle it with a
      // durable NEEDS_USER receipt. It must not remain an invisible ready zombie.
      if (!dependency.ready && dependency.blocked.length === 0 && dependency.baselineBlocked === null) continue;
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

  /**
   * Atomically move a claimed task to a terminal state.
   *
   * Uses rename() from active/ to terminal dir — if crash happens between
   * write and delete, the task appears in both active/ and terminal/.
   * With rename, it's in exactly one directory at all times.
   */
  settle(task: QueuedTask, status: Extract<TaskStatus, 'done' | 'failed' | 'needs-user' | 'superseded'>, reason?: string): void {
    const from = this.pathFor('active', task.id);
    const to = this.pathFor(status, task.id);
    const settled = { ...task, reason, claimedAt: task.claimedAt };
    // Write to temp in terminal dir, then rename over both source and target.
    // This is atomic: either the rename succeeds (task moves) or it doesn't.
    const tmp = path.join(path.dirname(to), `.settle-${task.id}-${randomUUID()}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify(settled, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.renameSync(tmp, to);
      fs.rmSync(from, { force: true });
    } catch (e) {
      // If rename to target fails, clean up temp
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw e;
    }
  }

  /**
   * Return an interrupted task to `ready` so a restarted runner picks it up.
   * Called on startup: anything left in `active/` whose PID is dead or whose
   * claimedAt is stale (>30 minutes) is recovered.
   */
  recoverAbandoned(convertToInterrupted = false, authority?: ExecutionAuthority): QueuedTask[] {
    const activeDir = path.join(this.root, DIRS.active);
    const recovered: QueuedTask[] = [];
    // Runner acquires an exclusive run lock before calling this method. Therefore any
    // task left in active/ belongs to a process that is no longer the active runner;
    // waiting an arbitrary 30 minutes would turn a crash into needless downtime.
    for (const name of fs.readdirSync(activeDir).filter((n) => n.endsWith('.json'))) {
      const task: QueuedTask = JSON.parse(fs.readFileSync(path.join(activeDir, name), 'utf8'));
      const stale = authority && task.workId && !isCurrentExecution({
        work_id: task.workId,
        execution_generation: task.executionGeneration ?? 0,
        spec_revision: task.specRevision,
      }, authority);
      if (stale) {
        this.writeAtomic(this.pathFor('superseded', task.id), {
          ...task,
          claimedAt: undefined,
          supersededAt: new Date().toISOString(),
          reason: staleExecutionReason({
            work_id: task.workId!,
            execution_generation: task.executionGeneration ?? 0,
            spec_revision: task.specRevision,
          }, authority!),
        });
      } else if (convertToInterrupted) {
        this.writeAtomic(this.pathFor('interrupted', task.id), { ...task, claimedAt: undefined, reason: 'INTERRUPTED' });
      } else {
        this.writeAtomic(this.pathFor('ready', task.id), { ...task, claimedAt: undefined });
      }
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
