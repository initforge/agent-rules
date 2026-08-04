import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  registerCleanup,
  expireEntry,
  deregisterCleanup,
  executeCleanup,
  processExpiredEntries,
  getCleanupStatus,
  listCleanupEntries,
} from '../src/cleanup-lifecycle.js';

const tmpDirs: string[] = [];

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-lifecycle-'));
  tmpDirs.push(dir);
  return path.join(dir, name);
}

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-lifecycle-fixture-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// ─── registerCleanup ──────────────────────────────────────────────────────────

describe('registerCleanup', () => {
  it('creates entry in REGISTERED state', () => {
    const rp = tmpFile('cleanup.json');
    const entry = registerCleanup(rp, {
      id: 'c1',
      kind: 'temp-directory',
      targetPath: '/tmp/test',
      reason: 'Ephemeral temp dir',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(entry.status).toBe('REGISTERED');
    expect(entry.id).toBe('c1');
    expect(entry.kind).toBe('temp-directory');
    expect(entry.registeredAt).toBeTruthy();
  });

  it('persists entry to registry file', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, {
      id: 'c1', kind: 'evidence-snapshot', targetPath: '/tmp/snap', reason: 'Test',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const raw = JSON.parse(fs.readFileSync(rp, 'utf-8')) as { entries: unknown[] };
    expect(raw.entries).toHaveLength(1);
  });

  it('idempotent for duplicate id', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/a', reason: 'A', expiresAt: '2099-01-01T00:00:00.000Z' });
    registerCleanup(rp, { id: 'c1', kind: 'evidence-snapshot', targetPath: '/tmp/b', reason: 'B', expiresAt: '2099-01-01T00:00:00.000Z' });
    const status = getCleanupStatus(rp, 'c1');
    expect(status!.kind).toBe('temp-directory');
  });

  it('rejects empty id', () => {
    const rp = tmpFile('cleanup.json');
    expect(() => registerCleanup(rp, { id: '', kind: 'temp-directory', targetPath: '/tmp/x', reason: 'R', expiresAt: '2099-01-01T00:00:00.000Z' })).toThrow('id must be a non-empty string');
  });
});

// ─── expireEntry ───────────────────────────────────────────────────────────────

describe('expireEntry', () => {
  it('REGISTERED → EXPIRED', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    const entry = expireEntry(rp, 'c1');
    expect(entry.status).toBe('EXPIRED');
  });

  it('rejects non-existent entry', () => {
    const rp = tmpFile('cleanup.json');
    expect(() => expireEntry(rp, 'nonexistent')).toThrow("not found");
  });

  it('rejects already EXPIRED entry', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c1');
    expect(() => expireEntry(rp, 'c1')).toThrow('status is EXPIRED');
  });
});

// ─── executeCleanup ────────────────────────────────────────────────────────────

describe('executeCleanup', () => {
  it('EXPIRED → CLEANED when path exists', () => {
    const rp = tmpFile('cleanup.json');
    const fixtureDir = tmpDir();
    const subdir = path.join(fixtureDir, 'subdir');
    fs.mkdirSync(subdir);

    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: subdir, reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c1');
    const entry = executeCleanup(rp, 'c1');
    expect(entry.status).toBe('CLEANED');
    expect(entry.cleanedAt).toBeTruthy();
    expect(fs.existsSync(subdir)).toBe(false);
  });

  it('EXPIRED → FAILED when path does not exist', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'evidence-snapshot', targetPath: '/tmp/nonexistent-path-xyz-123', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c1');
    const entry = executeCleanup(rp, 'c1');
    expect(entry.status).toBe('FAILED');
    expect(entry.error).toBeTruthy();
  });

  it('dryRun: does not delete but reports existence', () => {
    const rp = tmpFile('cleanup.json');
    const fixtureDir = tmpDir();
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: fixtureDir, reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c1');
    const entry = executeCleanup(rp, 'c1', { dryRun: true });
    expect(entry.status).toBe('CLEANED');
    expect(fs.existsSync(fixtureDir)).toBe(true); // not actually deleted
  });

  it('rejects non-EXPIRED entry', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(() => executeCleanup(rp, 'c1')).toThrow('status is REGISTERED');
  });
});

// ─── deregisterCleanup ─────────────────────────────────────────────────────────

describe('deregisterCleanup', () => {
  it('removes REGISTERED entry', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    deregisterCleanup(rp, 'c1');
    expect(getCleanupStatus(rp, 'c1')).toBeUndefined();
  });

  it('rejects already CLEANED entry', () => {
    const rp = tmpFile('cleanup.json');
    const fixtureDir = tmpDir();
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: fixtureDir, reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c1');
    executeCleanup(rp, 'c1');
    expect(() => deregisterCleanup(rp, 'c1')).toThrow('already cleaned');
  });
});

// ─── processExpiredEntries ─────────────────────────────────────────────────────

describe('processExpiredEntries', () => {
  it('finds and expires past-due entries without executing', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test1', reason: 'Test', expiresAt: '2020-01-01T00:00:00.000Z' });
    registerCleanup(rp, { id: 'c2', kind: 'temp-directory', targetPath: '/tmp/test2', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });

    const expired = processExpiredEntries(rp);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe('c1');
    expect(getCleanupStatus(rp, 'c1')!.status).toBe('EXPIRED');
    expect(getCleanupStatus(rp, 'c2')!.status).toBe('REGISTERED');
  });

  it('processExpiredEntries with execute=true cleans up', () => {
    const rp = tmpFile('cleanup.json');
    const fixtureDir = tmpDir();
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: fixtureDir, reason: 'Test', expiresAt: '2020-01-01T00:00:00.000Z' });
    processExpiredEntries(rp, { execute: true });
    expect(fs.existsSync(fixtureDir)).toBe(false);
  });
});

// ─── getCleanupStatus + listCleanupEntries ─────────────────────────────────────

describe('getCleanupStatus / listCleanupEntries', () => {
  it('getCleanupStatus returns entry or undefined', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/test', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(getCleanupStatus(rp, 'c1')?.kind).toBe('temp-directory');
    expect(getCleanupStatus(rp, 'nonexistent')).toBeUndefined();
  });

  it('listCleanupEntries filters by status', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/a', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    const fixtureDir = tmpDir();
    registerCleanup(rp, { id: 'c2', kind: 'evidence-snapshot', targetPath: fixtureDir, reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    expireEntry(rp, 'c2');

    const registered = listCleanupEntries(rp, { status: 'REGISTERED' });
    expect(registered).toHaveLength(1);
    expect(registered[0].id).toBe('c1');
  });

  it('listCleanupEntries filters by kind', () => {
    const rp = tmpFile('cleanup.json');
    registerCleanup(rp, { id: 'c1', kind: 'temp-directory', targetPath: '/tmp/a', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    registerCleanup(rp, { id: 'c2', kind: 'evidence-snapshot', targetPath: '/tmp/b', reason: 'Test', expiresAt: '2099-01-01T00:00:00.000Z' });
    const byKind = listCleanupEntries(rp, { kind: 'evidence-snapshot' });
    expect(byKind).toHaveLength(1);
    expect(byKind[0].id).toBe('c2');
  });
});
