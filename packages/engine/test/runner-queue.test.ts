import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskQueue, type QueuedTask } from '../src/runner/queue.js';
import { baselineGateFromManifest } from '../src/runner/baseline-gate.js';

const task = (over: Partial<QueuedTask> = {}) => ({
  prompt: 'do the thing',
  verification: ['npx vitest run foo.test.ts'],
  ownedPaths: ['src/foo.ts'],
  repairDepth: 0,
  ...over,
});

describe('TaskQueue', () => {
  let dir: string;
  let queue: TaskQueue;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-test-'));
    queue = new TaskQueue(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates all state directories', () => {
    for (const d of ['ready', 'active', 'done', 'failed', 'needs-user']) {
      expect(fs.existsSync(path.join(dir, d))).toBe(true);
    }
  });

  // R-001: an active requirement with no command could never be closed, so a task
  // with no verification is refused at the door rather than becoming a zombie.
  it('refuses a task with no verification command', () => {
    expect(() => queue.add(task({ verification: [] }))).toThrow(/no verification command/);
  });

  it('add() then claim() returns the task', () => {
    const added = queue.add(task());
    const claimed = queue.claim();

    expect(claimed?.id).toBe(added.id);
    expect(claimed?.claimedAt).toBeDefined();
    expect(queue.counts()).toMatchObject({ ready: 0, active: 1 });
  });

  it('claim() returns null on an empty queue', () => {
    expect(queue.claim()).toBeNull();
  });

  // R-001: rename() is the concurrency control. Two claims must never yield the same
  // task, or a task would be executed twice.
  it('claims each task exactly once', () => {
    queue.add(task({ prompt: 'a' }));
    queue.add(task({ prompt: 'b' }));

    const first = queue.claim();
    const second = queue.claim();
    const third = queue.claim();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).not.toBe(second!.id);
    expect(third).toBeNull();
  });

  it('claims in creation order', () => {
    const a = queue.add(task({ id: 'task-001', prompt: 'first' }));
    const b = queue.add(task({ id: 'task-002', prompt: 'second' }));

    expect(queue.claim()?.id).toBe(a.id);
    expect(queue.claim()?.id).toBe(b.id);
  });

  it('settle() moves a task to its terminal directory', () => {
    queue.add(task());
    const claimed = queue.claim()!;
    queue.settle(claimed, 'done');

    expect(queue.counts()).toMatchObject({ active: 0, done: 1 });
    expect(queue.list('done')[0].id).toBe(claimed.id);
  });

  it('settle() records the reason for a non-success outcome', () => {
    queue.add(task());
    const claimed = queue.claim()!;
    queue.settle(claimed, 'needs-user', 'repair depth exhausted');

    expect(queue.list('needs-user')[0].reason).toBe('repair depth exhausted');
  });

  // R-003: the runner must be killable at any moment. Anything left in active/ means
  // the previous process died mid-task.
  it('recoverAbandoned() returns in-flight tasks to ready', () => {
    queue.add(task({ prompt: 'interrupted' }));
    const claimed = queue.claim()!;
    expect(queue.counts()).toMatchObject({ active: 1, ready: 0 });

    // Backdate claimedAt so the stale threshold triggers recovery
    const taskPath = path.join(dir, 'active', `${claimed.id}.json`);
    const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    taskData.claimedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2));

    const recovered = new TaskQueue(dir).recoverAbandoned();

    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(claimed.id);
    expect(queue.counts()).toMatchObject({ active: 0, ready: 1 });
    expect(queue.claim()?.claimedAt).toBeDefined();
  });

  it('recoverAbandoned() is a no-op when nothing was in flight', () => {
    queue.add(task());
    expect(queue.recoverAbandoned()).toEqual([]);
    expect(queue.counts()).toMatchObject({ ready: 1 });
  });

  it('survives being reopened by a new process', () => {
    const added = queue.add(task());
    const reopened = new TaskQueue(dir);

    expect(reopened.counts().ready).toBe(1);
    expect(reopened.claim()?.id).toBe(added.id);
  });

  it('round-trips repair metadata', () => {
    queue.add(task({ repairDepth: 2, parentId: 'task-parent', requirementId: 'R-004' }));
    const claimed = queue.claim()!;

    expect(claimed.repairDepth).toBe(2);
    expect(claimed.parentId).toBe('task-parent');
    expect(claimed.requirementId).toBe('R-004');
  });

  it('writes tasks atomically so a reader never sees a partial file', () => {
    queue.add(task());
    const files = fs.readdirSync(path.join(dir, 'ready'));

    // No leftover temp files: the rename either happened or it did not.
    expect(files.every((f) => f.endsWith('.json') && !f.startsWith('.'))).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(path.join(dir, 'ready', files[0]), 'utf8'))).not.toThrow();
  });
});

describe('TaskQueue dependency-aware claiming', () => {
  let dir: string;
  let queue: TaskQueue;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-deps-')); queue = new TaskQueue(dir); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('skips pending dependents and claims their prerequisite even when it sorts later', () => {
    queue.add(task({ id:'task-001', contractTaskId:'T-002', dependsOnContractTaskIds:['T-001'], prompt:'dependent' }));
    queue.add(task({ id:'task-999', contractTaskId:'T-001', prompt:'prerequisite' }));
    expect(queue.claim()?.contractTaskId).toBe('T-001');
  });

  it('unblocks a dependent when any successful repair closes the prerequisite contract task', () => {
    queue.add(task({ id:'base-attempt', contractTaskId:'T-001' }));
    const base = queue.claim()!;
    queue.settle(base, 'failed', 'first attempt failed');
    queue.add(task({ id:'repair', contractTaskId:'T-001', parentId:base.id, repairDepth:1 }));
    queue.add(task({ id:'dependent', contractTaskId:'T-002', dependsOnContractTaskIds:['T-001'] }));
    const repair = queue.claim()!;
    expect(repair.id).toBe('repair');
    queue.settle(repair, 'done');
    expect(queue.claim()?.id).toBe('dependent');
  });

  it('makes terminal dependency blockers claimable so the runner can settle downstream work needs-user', () => {
    queue.add(task({ id:'base', contractTaskId:'T-001' }));
    const base = queue.claim()!;
    queue.settle(base, 'needs-user', 'repair exhausted');
    queue.add(task({ id:'dependent', contractTaskId:'T-002', dependsOnContractTaskIds:['T-001'] }));
    const dependent = queue.claim()!;
    expect(queue.dependencyState(dependent).blocked).toEqual(['T-001']);
  });

  it('exposes a baseline-blocked task for durable settlement while leaving an independent scope claimable', () => {
    const gate = {
      status: 'NEEDS_RECONCILIATION' as const,
      affectedPaths: ['src/affected'],
      reason: 'unknown baseline path',
    };
    const affected = queue.add(task({ id: 'task-001', ownedPaths: ['src/affected'], baselineGate: gate }));
    queue.add(task({ id: 'task-002', ownedPaths: ['src/independent'], baselineGate: gate }));

    const first = queue.claim()!;
    expect(first.id).toBe(affected.id);
    expect(queue.dependencyState(first).baselineBlocked).toMatch(/NEEDS_RECONCILIATION/);
    queue.settle(first, 'needs-user', 'baseline blocked');

    const independent = queue.claim()!;
    expect(independent.id).toBe('task-002');
    expect(queue.dependencyState(independent).baselineBlocked).toBeNull();
  });
});

describe('baseline manifest adapter', () => {
  it('keeps clean manifests non-blocking and extracts only unresolved paths', () => {
    expect(baselineGateFromManifest({ status: 'BASELINE_CLEAN', findings: [] })).toMatchObject({
      status: 'BASELINE_CLEAN', affectedPaths: [],
    });
    expect(baselineGateFromManifest({
      status: 'NEEDS_RECONCILIATION',
      findings: [
        { path: 'src/unknown.ts', classification: 'unknown' },
        { path: 'docs/owned.md', classification: 'accepted-dirty' },
      ],
      sha256: 'a'.repeat(64),
    })).toMatchObject({
      status: 'NEEDS_RECONCILIATION',
      affectedPaths: ['src/unknown.ts'],
      manifestSha256: 'a'.repeat(64),
    });
  });
});
