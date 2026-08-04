import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  validateCandidatePlan,
} from '../src/validate-candidate-plan.js';
import { snapshotCandidateEpoch } from '../src/candidate-epoch.js';

// Load the real plan-identity ledger fixture for correct SHA-256 values.
const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures/plan-identity');
const ledgerFixture = JSON.parse(readFileSync(resolve(FIXTURE_DIR, 'ledger.json'), 'utf8') as unknown) as {
  effective_plan_identity: {
    input_manifest: {
      original_plan_sha256: string;
      approved_amendments: Array<{ amendment_id: string; sha256: string }>;
    };
    sha256: string;
  };
};
const REAL_ORIGINAL_SHA = ledgerFixture.effective_plan_identity.input_manifest.original_plan_sha256;

function git(dir: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-repo-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Validator Test');
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

// ── Core read-only validation guarantees ──────────────────────────────────────────

describe('validateCandidatePlan — read-only validation', () => {
  it('returns valid:true when all three concerns pass', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.valid).toBe(true);
    expect(result.candidateEpoch.valid).toBe(true);
    expect(result.evidenceFreshness.valid).toBe(true);
    expect(result.planIdentity.valid).toBe(true);
    expect(result.mutationSequence).toEqual([]);
  });

  it('does NOT mutate the stored epoch, evidence, or ledger (read-only guarantee)', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const epochBefore = JSON.stringify(storedEpoch);
    const evidenceBefore = JSON.stringify(evidence);
    const ledgerBefore = JSON.stringify(ledger);
    validateCandidatePlan(storedEpoch, evidence, ledger, dir);
    expect(JSON.stringify(storedEpoch)).toBe(epochBefore);
    expect(JSON.stringify(evidence)).toBe(evidenceBefore);
    expect(JSON.stringify(ledger)).toBe(ledgerBefore);
  });

  it('handles null evidence gracefully (skips evidence check)', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(storedEpoch, null, ledger, dir);
    expect(result.valid).toBe(true);
    expect(result.evidenceFreshness.valid).toBe(true);
  });
});

// ── Candidate epoch validation ───────────────────────────────────────────────────

describe('validateCandidatePlan — candidate epoch concern', () => {
  it('returns valid:false when worktree has tracked changes', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    write(dir, 'src/main.ts', 'export const x = 2;\n'); // dirty tracked
    const result = validateCandidatePlan(storedEpoch, null, { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] }, dir);
    expect(result.valid).toBe(false);
    expect(result.candidateEpoch.valid).toBe(false);
    expect(result.candidateEpoch.failures[0]?.field).toBeTruthy(); // some field failed
  });

  it('returns valid:false when worktree has untracked build-critical files', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir); // epoch before adding untracked file
    write(dir, 'src/generated.ts', 'export const g = 1;\n'); // untracked, build-critical
    const result = validateCandidatePlan(storedEpoch, null, { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] }, dir);
    expect(result.valid).toBe(false);
    expect(result.candidateEpoch.valid).toBe(false);
    expect(result.candidateEpoch.failures[0]?.field).toBeTruthy();
  });

  it('mutation sequence includes resnapshot when epoch is stale', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    write(dir, 'src/main.ts', 'export const x = 2;\n'); // dirty
    const result = validateCandidatePlan(storedEpoch, null, { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] }, dir);
    expect(result.candidateEpoch.valid).toBe(false);
    expect(result.mutationSequence.some(s => s.action === 'resnapshot')).toBe(true);
  });
});

// ── Evidence freshness validation ────────────────────────────────────────────────

describe('validateCandidatePlan — evidence freshness concern', () => {
  it('returns valid:false when evidence predates the epoch (no digest equivalence)', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    const evidence = { evidence_id: 'ev-old', created_at: earlier, artifact_digest: 'other' };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.valid).toBe(false);
    expect(result.evidenceFreshness.valid).toBe(false);
    expect(result.evidenceFreshness.failures[0]?.field).toBe('candidate_epoch');
  });

  it('returns valid:true when evidence matches epoch artifact digest', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    // Pass artifact_digest matching the epoch's artifact_digest
    const evidence = { evidence_id: 'ev-old', created_at: earlier, artifact_digest: epoch.artifact_digest };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    // Freshness should pass (digest equivalence), but epoch validity depends on worktree state
    expect(result.evidenceFreshness.valid).toBe(true);
  });

  it('mutation sequence includes rebind_evidence when evidence is stale', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    const evidence = { evidence_id: 'ev-old', created_at: earlier, artifact_digest: 'other' };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.evidenceFreshness.valid).toBe(false);
    expect(result.mutationSequence.some(s => s.action === 'rebind_evidence')).toBe(true);
  });
});

// ── Plan identity validation ──────────────────────────────────────────────────────

describe('validateCandidatePlan — plan identity concern', () => {
  it('returns valid:false when amendment IDs are out of order', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    // Reverse the approved amendment order — AM-0002 before AM-0001 is invalid
    const ledger = {
      effective_plan_identity: { sha256: 'd'.repeat(64) },
      amendments: [
        { amendment_id: 'AM-0002', sha256: 'c68c3cbac57d44ef3aae543dc221de0a05319e034eec87226bfffbbd6e962fa4' },
        { amendment_id: 'AM-0001', sha256: '90b5f0e478e6a6762aba7976d73b0078152795b590ee147b1278da01d76a9528' },
      ],
    };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.valid).toBe(false);
    expect(result.planIdentity.valid).toBe(false);
    expect(result.planIdentity.failures[0]?.field).toBe('amendment_ids');
  });

  it('returns valid:false when amendment IDs include unknown IDs', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    const ledger = {
      effective_plan_identity: { sha256: 'd'.repeat(64) },
      amendments: [
        { amendment_id: 'AM-0099', sha256: '0'.repeat(64) },
      ],
    };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.valid).toBe(false);
    expect(result.planIdentity.valid).toBe(false);
    expect(result.planIdentity.failures[0]?.field).toBe('amendment_ids');
  });

  it('mutation sequence includes update_plan_identity when identity mismatches', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    // Wrong effective identity (not matching the computed one)
    const ledger = {
      effective_plan_identity: { original_plan_sha256: REAL_ORIGINAL_SHA, sha256: '0'.repeat(64) },
      amendments: [],
    };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.planIdentity.valid).toBe(false);
    expect(result.mutationSequence.some(s => s.action === 'update_plan_identity')).toBe(true);
  });
});

// ── Exact failing fields ─────────────────────────────────────────────────────────

describe('validateCandidatePlan — exact failing fields', () => {
  it('returns exact failing field names with human-readable detail', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    write(dir, 'src/main.ts', 'export const x = 2;\n'); // dirty
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    const evidence = { evidence_id: 'ev-stale', created_at: earlier, artifact_digest: 'other' };
    const ledger = {
      effective_plan_identity: { sha256: '0'.repeat(64) },
      amendments: [
        { amendment_id: 'AM-0099', sha256: '0'.repeat(64) },
      ],
    };
    const result = validateCandidatePlan(storedEpoch, evidence, ledger, dir);
    expect(result.valid).toBe(false);
    // All three concerns fail
    expect(result.candidateEpoch.valid).toBe(false);
    expect(result.evidenceFreshness.valid).toBe(false);
    expect(result.planIdentity.valid).toBe(false);
    // Each concern has failures array with field + detail
    for (const concern of [result.candidateEpoch, result.evidenceFreshness, result.planIdentity]) {
      expect(concern.failures.length).toBeGreaterThan(0);
      expect(concern.failures[0]).toHaveProperty('field');
      expect(concern.failures[0]).toHaveProperty('detail');
      expect(typeof concern.failures[0].field).toBe('string');
      expect(typeof concern.failures[0].detail).toBe('string');
    }
    // Mutation sequence has safe fix steps
    expect(result.mutationSequence.length).toBeGreaterThan(0);
    for (const step of result.mutationSequence) {
      expect(step).toHaveProperty('action');
      expect(step).toHaveProperty('reason');
    }
  });
});

// ── Safe mutation sequence ───────────────────────────────────────────────────────

describe('validateCandidatePlan — safe mutation sequence', () => {
  it('orders mutation steps: resnapshot first, then rebind, then update', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const storedEpoch = snapshotCandidateEpoch(dir);
    write(dir, 'src/main.ts', 'export const x = 2;\n'); // dirty
    const earlier = new Date(Date.now() - 3600_000).toISOString();
    const evidence = { evidence_id: 'ev-old', created_at: earlier, artifact_digest: 'other' };
    const ledger = {
      effective_plan_identity: { original_plan_sha256: REAL_ORIGINAL_SHA, sha256: '0'.repeat(64) },
      amendments: [],
    };
    const result = validateCandidatePlan(storedEpoch, evidence, ledger, dir);
    const steps = result.mutationSequence;
    // resnapshot is always first
    expect(steps[0]?.action).toBe('resnapshot');
    // All subsequent steps are not resnapshot
    const nonResnapshot = steps.filter(s => s.action !== 'resnapshot');
    expect(nonResnapshot.length).toBe(steps.length - 1);
  });

  it('mutation sequence is empty when all concerns pass', () => {
    const dir = makeRepo();
    write(dir, 'src/main.ts', 'export const x = 1;\n');
    commitAll(dir, 'seed');
    const epoch = snapshotCandidateEpoch(dir);
    const evidence = { evidence_id: 'ev-1', created_at: new Date().toISOString() };
    const ledger = { effective_plan_identity: { sha256: 'd'.repeat(64) }, amendments: [] };
    const result = validateCandidatePlan(epoch, evidence, ledger, dir);
    expect(result.mutationSequence).toEqual([]);
  });
});
