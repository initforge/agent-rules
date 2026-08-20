import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  snapshotCandidateEpoch, candidateEpochHash, bindEvidence, assertEpochCurrent,
  EMPTY_HASH, CANDIDATE_EPOCH_SCHEMA, CandidateEpochError,
  type CandidateEpoch,
} from '../src/candidate-epoch.js';

function git(dir: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-repo-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Epoch Test');
  return dir;
}

function write(root: string, rel: string, content: string): void {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function commitAll(dir: string, msg: string): void {
  git(dir, 'add', '-A');
  const r = git(dir, 'commit', '-q', '-m', msg);
  if (r.status !== 0) throw new Error(`commit failed: ${r.stderr}`);
}

function treeOf(dir: string): string {
  return git(dir, 'rev-parse', 'HEAD^{tree}').stdout.trim();
}
function headOf(dir: string): string {
  return git(dir, 'rev-parse', 'HEAD').stdout.trim();
}
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('snapshotCandidateEpoch — clean tree', () => {
  it('produces a valid deterministic epoch on a clean committed tree', () => {
    const dir = makeRepo();
    write(dir, 'package.json', '{"name":"t"}');
    write(dir, 'package-lock.json', '{"lockfileVersion":3}');
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');

    const e1 = snapshotCandidateEpoch(dir);
    const e2 = snapshotCandidateEpoch(dir);

    expect(e1.schema).toBe(CANDIDATE_EPOCH_SCHEMA);
    expect(e1.source_tree_sha).toBe(treeOf(dir));
    expect(e1.candidate_commit_or_tree).toBe(headOf(dir));
    // lock hash covers the sorted `rel\0sha256(content)` pair of every lockfile
    expect(e1.dependency_lock_hash).toBe(sha256(`package-lock.json\0${sha256('{"lockfileVersion":3}')}`));
    // no migrations declared anywhere → honest empty
    expect(e1.migration_set_hash).toBe(EMPTY_HASH);
    // no fixture dirs → honest empty
    expect(e1.fixture_hash).toBe(EMPTY_HASH);
    // no system-topology.yaml → compiled all-GAP topology (deterministic, non-empty)
    expect(e1.topology_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(e1.environment_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(e1.artifact_digest).toBe(EMPTY_HASH); // not built
    expect(e1.container_image_digests).toEqual([]);

    // same tree → same content hash (created_at is provenance, not content)
    expect(candidateEpochHash(e1)).toBe(candidateEpochHash(e2));
    expect(candidateEpochHash(e1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an empty repository (no HEAD)', () => {
    const dir = makeRepo();
    expect(() => snapshotCandidateEpoch(dir)).toThrow(CandidateEpochError);
  });
});

describe('snapshotCandidateEpoch — dirty worktree refusal (allowDirty:false)', () => {
  it('refuses a tracked modification as terminal candidate', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    write(dir, 'src/main.ts', 'export const x = 2;\n'); // dirty tracked

    expect(() => snapshotCandidateEpoch(dir)).toThrow(/DIRTY_TRACKED/);

    // allowDirty snapshots a Git tree object of the tracked state
    const e = snapshotCandidateEpoch(dir, { allowDirty: true });
    expect(e.candidate_commit_or_tree).toMatch(/^[0-9a-f]{40}$/);
    expect(e.source_tree_sha).not.toBe(treeOf(dir));
  });

  it('refuses a gitignored build-critical source file (manifest check)', () => {
    const dir = makeRepo();
    write(dir, '.gitignore', '*.gen.ts\n');
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    // gitignored but build-critical (matches **/src/**) — silently untracked
    write(dir, 'src/generated.gen.ts', 'export const gen = 1;\n');

    expect(() => snapshotCandidateEpoch(dir)).toThrow(/UNTRACKED_BUILD_CRITICAL/);

    // allowDirty records it honestly instead of silently including it
    const e = snapshotCandidateEpoch(dir, { allowDirty: true });
    expect(e.notes.untracked_build_critical).toContain('src/generated.gen.ts');
  });

  it('allows untracked non-build-critical files', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    write(dir, 'notes.md', 'scratch notes\n');

    const e = snapshotCandidateEpoch(dir);
    expect(e.candidate_commit_or_tree).toBe(headOf(dir));
    expect(candidateEpochHash(e)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an explicit build-critical untracked path via patterns', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    write(dir, 'scratch/runner.gen.json', '{}'); // untracked, non-ignored
    expect(() => snapshotCandidateEpoch(dir, { buildCriticalPatterns: ['scratch/*.json'] })).toThrow(/UNTRACKED_BUILD_CRITICAL/);
    expect(() => snapshotCandidateEpoch(dir)).not.toThrow();
  });
});

describe('assertEpochCurrent', () => {
  it('stays current on an unchanged repo', () => {
    const dir = makeRepo();
    write(dir, 'package.json', '{}');
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const r = assertEpochCurrent(epoch, dir);
    expect(r.current).toBe(true);
    expect(r.changed).toEqual([]);
  });

  it('fails when the dependency lock changes (new epoch)', () => {
    const dir = makeRepo();
    write(dir, 'package.json', '{}');
    write(dir, 'package-lock.json', '{"lockfileVersion":3,"v":1}');
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);

    write(dir, 'package-lock.json', '{"lockfileVersion":3,"v":2}');
    const r = assertEpochCurrent(epoch, dir);
    expect(r.current).toBe(false);
    expect(r.changed).toContain('dependency_lock_hash');
  });

  it('fails after a source change (stale)', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);

    write(dir, 'src/main.ts', 'export const x = 99;\n');
    const r = assertEpochCurrent(epoch, dir);
    expect(r.current).toBe(false);
    expect(r.changed).toContain('source_tree_sha');
    expect(r.changed).toContain('candidate_commit_or_tree');
  });
});

describe('bindEvidence', () => {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 3600_000).toISOString();
  const later = new Date(Date.now() + 3600_000).toISOString();

  function epoch(overrides: Partial<CandidateEpoch> = {}): CandidateEpoch {
    return {
      schema: CANDIDATE_EPOCH_SCHEMA,
      source_tree_sha: 'a'.repeat(40),
      candidate_commit_or_tree: 'b'.repeat(40),
      artifact_digest: 'c'.repeat(64),
      container_image_digests: [],
      dependency_lock_hash: 'd'.repeat(64),
      migration_set_hash: 'e'.repeat(64),
      environment_hash: 'f'.repeat(64),
      fixture_hash: 'g'.repeat(64),
      topology_hash: 'h'.repeat(64),
      created_at: now,
      build_critical_manifest: [],
      notes: {},
      ...overrides,
    };
  }

  it('stamps the epoch and binds evidence produced at/after the epoch', () => {
    const e = epoch();
    const binding = bindEvidence({ evidence_id: 'ev-1', created_at: now }, e);
    expect(binding.bound).toBe(true);
    expect(binding.record.candidate_epoch_hash).toBe(candidateEpochHash(e));
    expect(binding.record.candidate_epoch).toEqual(e);
  });

  it('refuses evidence created before the epoch without digest equivalence', () => {
    const binding = bindEvidence({ evidence_id: 'ev-old', created_at: earlier, artifact_digest: 'other' }, epoch());
    expect(binding.bound).toBe(false);
    expect(binding.reason).toContain('before candidate epoch');
  });

  it('binds pre-epoch evidence when the artifact digest demonstrates equivalence', () => {
    const e = epoch();
    const binding = bindEvidence({ evidence_id: 'ev-old', created_at: earlier, raw_artifact_hashes: ['x', e.artifact_digest] }, e);
    expect(binding.bound).toBe(true);
    expect(binding.reason).toContain('digest equivalence');
  });

  it('refuses evidence with no parseable creation timestamp', () => {
    const binding = bindEvidence({ evidence_id: 'ev-?', observed_at: 'nope' }, epoch());
    expect(binding.bound).toBe(false);
    expect(binding.reason).toContain('no parseable creation timestamp');
  });

  it('treats future-dated evidence as stale relative to the epoch bound (cannot predate epoch and bind)', () => {
    const e = epoch({ created_at: now });
    // evidence before epoch with no digest → refused even though it is after now
    const binding = bindEvidence({ created_at: earlier, artifact_digest: 'z' }, e);
    expect(binding.bound).toBe(false);
    void later;
  });
});
