import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TaskQueue, type QueuedTask } from '../src/runner/queue.js';

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
