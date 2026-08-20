import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Journal } from '../src/runner/journal.js';

describe('Journal', () => {
  let dir: string;
  let file: string;
  const identity = { repository: 'agent-rules', plan: 'test-plan', revision: 'r1' };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
    file = path.join(dir, 'journal.jsonl');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('starts empty and appends sequentially', () => {
    const j = new Journal(file, identity);
    expect(j.read()).toEqual([]);

    const a = j.append('TASK_START', { taskId: 't1' });
    const b = j.append('TASK_END', { taskId: 't1' });

    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(j.read()).toHaveLength(2);
    expect(j.lastSeq()).toBe(2);
  });

  it('chains each record to its predecessor', () => {
    const j = new Journal(file, identity);
    const a = j.append('A');
    const b = j.append('B');

    expect(a.prevHash).toBe('0'.repeat(64));
    expect(b.prevHash).toBe(a.hash);
  });

  // R-005: the reason the journal is trustworthy after the writing process is gone.
  it('throws when a record is tampered with', () => {
    const j = new Journal(file, identity);
    j.append('A', { value: 'original' });
    j.append('B');

    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const first = JSON.parse(lines[0]);
    first.data = { value: 'tampered' };
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(file, lines.join('\n') + '\n');

    expect(() => new Journal(file, identity).read()).toThrow(/hash does not match/);
  });

  it('throws when a record is removed from the middle', () => {
    const j = new Journal(file, identity);
    j.append('A');
    j.append('B');
    j.append('C');

    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(file, [lines[0], lines[2]].join('\n') + '\n');

    expect(() => new Journal(file, identity).read()).toThrow(/chain broken/);
  });

  it('throws when records are reordered', () => {
    const j = new Journal(file, identity);
    j.append('A');
    j.append('B');

    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(file, [lines[1], lines[0]].join('\n') + '\n');

    expect(() => new Journal(file, identity).read()).toThrow(/chain broken/);
  });

  it('verify() reports failure without throwing', () => {
    const j = new Journal(file, identity);
    j.append('A');
    expect(j.verify()).toEqual({ ok: true, records: 1 });

    fs.appendFileSync(file, 'not json\n');
    const result = new Journal(file, identity).verify();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not valid JSON/);
  });

  it('is idempotent on eventId so a retried write does not double-record', () => {
    const j = new Journal(file, identity);
    const first = j.append('TASK_START', { taskId: 't1' }, 'fixed-event-id');
    const retry = j.append('TASK_START', { taskId: 't1' }, 'fixed-event-id');

    expect(retry).toEqual(first);
    expect(j.read()).toHaveLength(1);
  });

  it('refuses to append to a journal belonging to another plan', () => {
    new Journal(file, identity).append('A');
    expect(() => new Journal(file, { ...identity, plan: 'other-plan' })).toThrow(/identity mismatch/);
  });

  it('claim() succeeds once and then refuses', () => {
    const j = new Journal(file, identity);
    expect(j.claim('task-1')).toBe(true);
    expect(j.claim('task-1')).toBe(false);
    expect(j.claim('task-2')).toBe(true);
  });

  it('survives a reopen and keeps chaining', () => {
    new Journal(file, identity).append('A');
    const reopened = new Journal(file, identity);
    const b = reopened.append('B');

    expect(b.seq).toBe(2);
    expect(reopened.read()).toHaveLength(2);
  });

  it('ofType filters by record type', () => {
    const j = new Journal(file, identity);
    j.append('TASK_START', { taskId: 't1' });
    j.append('TASK_END', { taskId: 't1' });
    j.append('TASK_START', { taskId: 't2' });

    expect(j.ofType('TASK_START')).toHaveLength(2);
    expect(j.ofType('TASK_END')).toHaveLength(1);
  });
});
