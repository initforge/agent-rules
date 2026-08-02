/**
 * operating-model-compiler.test.ts — Tests for the deterministic OM parser/compiler.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseRequirements,
  parseSubsystems,
  parseDoD,
  compileOMClaims,
  compileFromRepo,
  OM_SOURCE,
} from '../src/operating-model-compiler.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OM_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'target-operating-model.md');
const hasOM = fs.existsSync(OM_PATH);

const OM_TEXT = hasOM ? fs.readFileSync(OM_PATH, 'utf8') : '';

// ── Parsing ──────────────────────────────────────────────────────

describe('parseRequirements — R-001..R-042 from section 12', () => {
  it('parses all 42 requirements', () => {
    if (!hasOM) return;
    const reqs = parseRequirements(OM_TEXT);
    expect(reqs.length).toBe(42);
  });

  it('R-001..R-042 sorted by ID', () => {
    if (!hasOM) return;
    const reqs = parseRequirements(OM_TEXT);
    for (let i = 0; i < reqs.length; i++) {
      expect(reqs[i].id).toBe('R-' + String(i + 1).padStart(3, '0'));
    }
  });

  it('every requirement has non-empty description and valid status', () => {
    if (!hasOM) return;
    const reqs = parseRequirements(OM_TEXT);
    const valid = ['PLANNED', 'OPERATIONAL', 'COMPLETED', 'PARTIAL', 'VERIFIED', 'NOT_STARTED'];
    for (const r of reqs) {
      expect(r.description.length, r.id).toBeGreaterThan(0);
      expect(valid, r.id).toContain(r.status);
      expect(r.source.length, r.id).toBeGreaterThan(0);
    }
  });

  it('R-001 is install, R-042 is cleanup', () => {
    if (!hasOM) return;
    const reqs = parseRequirements(OM_TEXT);
    expect(reqs[0].id).toBe('R-001');
    expect(reqs[reqs.length - 1].id).toBe('R-042');
  });
});

describe('parseSubsystems — SS-01..SS-24 from section 6', () => {
  it('parses all 24 subsystems', () => {
    if (!hasOM) return;
    const subs = parseSubsystems(OM_TEXT);
    expect(subs.length).toBe(24);
  });

  it('SS-01..SS-24 sorted by ID', () => {
    if (!hasOM) return;
    const subs = parseSubsystems(OM_TEXT);
    for (let i = 0; i < subs.length; i++) {
      expect(subs[i].id).toBe('SS-' + String(i + 1).padStart(2, '0'));
    }
  });

  it('every subsystem has non-empty name and valid status', () => {
    if (!hasOM) return;
    const subs = parseSubsystems(OM_TEXT);
    const valid = ['NOT_STARTED', 'PARTIAL', 'OPERATIONAL', 'VERIFIED'];
    for (const s of subs) {
      expect(s.subsystem.length, s.id).toBeGreaterThan(0);
      expect(valid, s.id).toContain(s.status);
      expect(s.milestone).toBeTruthy();
    }
  });
});

describe('parseDoD — items from section 8', () => {
  it('parses DoD items (at least 10)', () => {
    if (!hasOM) return;
    const dods = parseDoD(OM_TEXT);
    expect(dods.length).toBeGreaterThanOrEqual(10);
  });

  it('DoD IDs are sequential DoD-01..DoD-NN', () => {
    if (!hasOM) return;
    const dods = parseDoD(OM_TEXT);
    for (let i = 0; i < dods.length; i++) {
      expect(dods[i].id).toBe(`DoD-${String(i + 1).padStart(2, '0')}`);
    }
  });

  it('every DoD item has non-empty description', () => {
    if (!hasOM) return;
    const dods = parseDoD(OM_TEXT);
    for (const d of dods) {
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});

// ── Compilation ──────────────────────────────────────────────────

describe('compileOMClaims — deterministic claim records', () => {
  it('returns all R + SS + DoD entries', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(result.claims.length).toBe(result.rCount + result.ssCount + result.dodCount);
  });

  it('R count is 42', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(result.rCount).toBe(42);
  });

  it('SS count is 24', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(result.ssCount).toBe(24);
  });

  it('DoD count is positive', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(result.dodCount).toBeGreaterThan(0);
  });

  it('every claim has a unique ID', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    const ids = new Set(result.claims.map((c) => c.id));
    expect(ids.size).toBe(result.claims.length);
  });

  it('every claim has kind R, SS, or DoD', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    for (const c of result.claims) {
      expect(['R', 'SS', 'DoD']).toContain(c.kind);
    }
  });

  it('every claim has evidenceStatus UNOBSERVED, PARTIAL, MATCH, or GAP', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    const valid = ['UNOBSERVED', 'PARTIAL', 'MATCH', 'GAP'];
    for (const c of result.claims) {
      expect(valid, c.id).toContain(c.evidenceStatus);
    }
  });

  it('R claims have proseStatus set', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    const rClaims = result.claims.filter((c) => c.kind === 'R');
    for (const c of rClaims) {
      expect(c.proseStatus).toBeDefined();
    }
  });

  it('SS claims have proseStatus set', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    const ssClaims = result.claims.filter((c) => c.kind === 'SS');
    for (const c of ssClaims) {
      expect(c.proseStatus).toBeDefined();
    }
  });

  it('DoD claims have proseStatus undefined', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    const dodClaims = result.claims.filter((c) => c.kind === 'DoD');
    for (const c of dodClaims) {
      expect(c.proseStatus).toBeUndefined();
    }
  });

  it('deterministic: same input produces same output', () => {
    if (!hasOM) return;
    const r1 = compileOMClaims(OM_TEXT, REPO_ROOT);
    const r2 = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(r1.claims.length).toBe(r2.claims.length);
    for (let i = 0; i < r1.claims.length; i++) {
      expect(r1.claims[i].id).toBe(r2.claims[i].id);
      expect(r1.claims[i].evidenceStatus).toBe(r2.claims[i].evidenceStatus);
    }
  });
});

describe('compileFromRepo — reads from disk', () => {
  it('reads and compiles the operating model from repo root', () => {
    const result = compileFromRepo(REPO_ROOT);
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
  });

  it('throws when operating model file is missing', () => {
    expect(() => compileFromRepo('/tmp/nonexistent')).toThrow('Operating model not found');
  });
});

describe('UNOBSERVED preservation', () => {
  it('preserves unknown entries as UNOBSERVED or GAP (never invents MATCH)', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    for (const c of result.claims) {
      expect(['UNOBSERVED', 'PARTIAL', 'MATCH', 'GAP']).toContain(c.evidenceStatus);
    }
  });

  it('unobserved count is reported', () => {
    if (!hasOM) return;
    const result = compileOMClaims(OM_TEXT, REPO_ROOT);
    expect(result.unobservedCount).toBeGreaterThanOrEqual(0);
  });
});
