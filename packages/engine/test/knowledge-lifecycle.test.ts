import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discoverKnowledge,
  validateKnowledge,
  activateKnowledge,
  retireKnowledge,
  supersedeKnowledge,
  queryActiveKnowledge,
  listKnowledgeEntries,
} from '../src/knowledge-lifecycle.js';

const tmpDirs: string[] = [];

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-lifecycle-'));
  tmpDirs.push(dir);
  return path.join(dir, name);
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// ─── discoverKnowledge ─────────────────────────────────────────────────────────

describe('discoverKnowledge', () => {
  it('creates entry in DISCOVERED state', () => {
    const rp = tmpFile('registry.json');
    const entry = discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    expect(entry.status).toBe('DISCOVERED');
    expect(entry.id).toBe('k1');
    expect(entry.domain).toBe('routing');
    expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.discoveredAt).toBeTruthy();
    expect(entry.tags).toEqual([]);
  });

  it('persists entry to registry file', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    const raw = JSON.parse(fs.readFileSync(rp, 'utf-8')) as { entries: unknown[] };
    expect(raw.entries).toHaveLength(1);
  });

  it('idempotent for duplicate id', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    const entry = discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Bar', body: 'Different body' });
    expect(entry.title).toBe('Foo');
    expect(entry.body).toBe('Do the thing');
  });

  it('accepts tags and validUntil', () => {
    const rp = tmpFile('registry.json');
    const entry = discoverKnowledge(rp, {
      id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing',
      tags: ['important', 'security'],
      validUntil: '2030-01-01T00:00:00.000Z',
    });
    expect(entry.tags).toEqual(['important', 'security']);
    expect(entry.validUntil).toBe('2030-01-01T00:00:00.000Z');
  });

  it('rejects empty id', () => {
    const rp = tmpFile('registry.json');
    expect(() => discoverKnowledge(rp, { id: '', domain: 'routing', title: 'Foo', body: 'Do the thing' })).toThrow('id must be a non-empty string');
  });
});

// ─── validateKnowledge ─────────────────────────────────────────────────────────

describe('validateKnowledge', () => {
  it('advances DISCOVERED → VALIDATED', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    const entry = validateKnowledge(rp, 'k1');
    expect(entry.status).toBe('VALIDATED');
    expect(entry.validatedAt).toBeTruthy();
  });

  it('rejects non-existent entry', () => {
    const rp = tmpFile('registry.json');
    expect(() => validateKnowledge(rp, 'k-nonexistent')).toThrow("not found");
  });

  it('rejects VALIDATED entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    validateKnowledge(rp, 'k1');
    expect(() => validateKnowledge(rp, 'k1')).toThrow('status is VALIDATED');
  });
});

// ─── activateKnowledge ─────────────────────────────────────────────────────────

describe('activateKnowledge', () => {
  it('advances VALIDATED → ACTIVE', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    validateKnowledge(rp, 'k1');
    const entry = activateKnowledge(rp, 'k1');
    expect(entry.status).toBe('ACTIVE');
    expect(entry.activatedAt).toBeTruthy();
  });

  it('rejects DISCOVERED entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    expect(() => activateKnowledge(rp, 'k1')).toThrow('status is DISCOVERED');
  });

  it('rejects ACTIVE entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    validateKnowledge(rp, 'k1');
    activateKnowledge(rp, 'k1');
    expect(() => activateKnowledge(rp, 'k1')).toThrow('status is ACTIVE');
  });
});

// ─── retireKnowledge ───────────────────────────────────────────────────────────

describe('retireKnowledge', () => {
  it('advances ACTIVE → RETRACTED', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    validateKnowledge(rp, 'k1');
    activateKnowledge(rp, 'k1');
    const entry = retireKnowledge(rp, 'k1');
    expect(entry.status).toBe('RETRACTED');
    expect(entry.retiredAt).toBeTruthy();
  });

  it('rejects non-ACTIVE entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    expect(() => retireKnowledge(rp, 'k1')).toThrow('status is DISCOVERED');
  });
});

// ─── supersedeKnowledge ────────────────────────────────────────────────────────

describe('supersedeKnowledge', () => {
  it('supersedes ACTIVE entry and activates superseding VALIDATED entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'old', domain: 'routing', title: 'Old', body: 'Old knowledge' });
    discoverKnowledge(rp, { id: 'new', domain: 'routing', title: 'New', body: 'New knowledge' });
    validateKnowledge(rp, 'old');
    activateKnowledge(rp, 'old');
    validateKnowledge(rp, 'new');

    const superseded = supersedeKnowledge(rp, 'old', 'new');

    expect(superseded.status).toBe('SUPERSEDED');
    expect(superseded.supersededBy).toBe('new');
    expect(superseded.supersededAt).toBeTruthy();

    const activeEntries = listKnowledgeEntries(rp, { status: 'ACTIVE' });
    const newEntry = activeEntries.find((e) => e.id === 'new');
    expect(newEntry).toBeDefined();
    expect(newEntry!.supersedesId).toBe('old');
  });

  it('rejects cyclic supersession', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'a', domain: 'routing', title: 'A', body: 'A body' });
    discoverKnowledge(rp, { id: 'b', domain: 'routing', title: 'B', body: 'B body' });
    discoverKnowledge(rp, { id: 'c', domain: 'routing', title: 'C', body: 'C body' });
    validateKnowledge(rp, 'a'); activateKnowledge(rp, 'a');
    validateKnowledge(rp, 'b'); validateKnowledge(rp, 'c');

    supersedeKnowledge(rp, 'a', 'b'); // a → b
    // b now supersedes a; b cannot supersede a (would create cycle)
    expect(() => supersedeKnowledge(rp, 'b', 'a')).toThrow('Cyclic supersession');
  });

  it('rejects non-ACTIVE current entry', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'old', domain: 'routing', title: 'Old', body: 'Old' });
    discoverKnowledge(rp, { id: 'new', domain: 'routing', title: 'New', body: 'New' });
    validateKnowledge(rp, 'new');
    expect(() => supersedeKnowledge(rp, 'old', 'new')).toThrow('status is DISCOVERED');
  });
});

// ─── queryActiveKnowledge ──────────────────────────────────────────────────────

describe('queryActiveKnowledge', () => {
  it('returns only ACTIVE non-expired entries', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    discoverKnowledge(rp, { id: 'k2', domain: 'security', title: 'Bar', body: 'Do secure thing' });
    validateKnowledge(rp, 'k1'); activateKnowledge(rp, 'k1');
    validateKnowledge(rp, 'k2');

    const active = queryActiveKnowledge(rp);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('k1');
  });

  it('filters by domain', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, { id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing' });
    discoverKnowledge(rp, { id: 'k2', domain: 'security', title: 'Bar', body: 'Do secure thing' });
    validateKnowledge(rp, 'k1'); activateKnowledge(rp, 'k1');
    validateKnowledge(rp, 'k2'); activateKnowledge(rp, 'k2');

    const routing = queryActiveKnowledge(rp, { domain: 'routing' });
    expect(routing).toHaveLength(1);
    expect(routing[0].id).toBe('k1');
  });

  it('excludes expired entries', () => {
    const rp = tmpFile('registry.json');
    discoverKnowledge(rp, {
      id: 'k1', domain: 'routing', title: 'Foo', body: 'Do the thing',
      validUntil: '2020-01-01T00:00:00.000Z',  // expired
    });
    validateKnowledge(rp, 'k1'); activateKnowledge(rp, 'k1');
    const active = queryActiveKnowledge(rp);
    expect(active).toHaveLength(0);
  });
});
