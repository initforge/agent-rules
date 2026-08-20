/**
 * REQ-008 — test-refactor policy: coverage mapping before changes; protected
 * tests preserved; every removed/merged/rewritten test recorded; forbidden
 * operations rejected.
 */
import { describe, it, expect } from 'vitest';
import {
  isProtectedTest,
  validateRefactorMatrix,
  type TestInventoryEntry,
  type TestRefactorMatrix,
} from '../../src/northstar/proof-testing.js';

function entry(over: Partial<TestInventoryEntry> = {}): TestInventoryEntry {
  return {
    test_id: 't1',
    file: 'src/t1.test.ts',
    category: 'unit',
    covers_claims: ['C-1'],
    action: 'keep',
    action_reason: 'distinct coverage',
    ...over,
  };
}

function matrix(entries: TestInventoryEntry[]): Omit<TestRefactorMatrix, 'forbidden_violations'> {
  return {
    schema: 'agent-rules/test-refactor-matrix/v1',
    version: 1,
    repository: '/repo',
    audited_at: new Date().toISOString(),
    baseline: { files: 10, tests: 100 },
    after: { files: 8, tests: 80 },
    entries,
    protected_count: entries.filter((e) => e.protected).length,
    coverage_preserved: true,
    coverage_evidence: 'behavior-to-evidence map attached',
    post_refactor_proof_run: 'npm test -- --run',
  };
}

describe('test-refactor policy — coverage mapping, protected tests, forbidden ops', () => {
  it('marks security/data/live tests as protected', () => {
    expect(isProtectedTest({ category: 'security', covers_claims: [] })).toBe(true);
    expect(isProtectedTest({ category: 'data', covers_claims: [] })).toBe(true);
    expect(isProtectedTest({ category: 'live', covers_claims: [] })).toBe(true);
    expect(isProtectedTest({ category: 'unit', covers_claims: ['authorization boundary'] })).toBe(true);
    expect(isProtectedTest({ category: 'unit', covers_claims: ['user-visible behavior'] })).toBe(true);
    expect(isProtectedTest({ category: 'unit', covers_claims: ['plain math'] })).toBe(false);
  });

  it('rejects removing a protected test', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 'sec1', category: 'security', action: 'remove', obsolete_reason: 'old', protected: true }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.includes('protected test'))).toBe(true);
  });

  it('rejects removing a test without an obsolete reason', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 't2', action: 'remove' }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.includes('without obsolete_reason'))).toBe(true);
  });

  it('rejects rewriting a live test without an explicit reason (no live->fake silently)', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 'live1', category: 'live', live: true, action: 'rewrite' }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.includes('live test rewrite requires an explicit reason'))).toBe(true);
  });

  it('rejects a dangling duplicate_of reference', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 'dup1', action: 'remove', duplicate_of: 'missing-target', obsolete_reason: 'dup' }),
    ]));
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.includes('duplicate_of'))).toBe(true);
  });

  it('allows merging duplicates with a mapping and preserves coverage', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 'a', action: 'keep' }),
      entry({ test_id: 'b', action: 'merge', duplicate_of: 'a', action_reason: 'identical invariant' }),
    ]));
    expect(res.ok).toBe(true);
  });

  it('allows removing an obsolete non-protected test with reason', () => {
    const res = validateRefactorMatrix(matrix([
      entry({ test_id: 'old1', category: 'unit', action: 'remove', obsolete_reason: 'assertion no longer meaningful; behavior covered by stronger contract test' }),
    ]));
    expect(res.ok).toBe(true);
  });
});
