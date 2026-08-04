import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  proposeImprovement,
  evaluateImprovement,
  approveImprovement,
  rejectImprovement,
  applyImprovement,
  supersedeImprovement,
  listImprovements,
  getImprovement,
} from '../src/improvement-lifecycle.js';

const tmpDirs: string[] = [];

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'improvement-lifecycle-'));
  tmpDirs.push(dir);
  return path.join(dir, name);
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// ─── proposeImprovement ────────────────────────────────────────────────────────

describe('proposeImprovement', () => {
  it('creates entry in PROPOSED state', () => {
    const rp = tmpFile('improvements.json');
    const entry = proposeImprovement(rp, {
      id: 'imp1', title: 'Add feature X', description: 'Detailed description',
      proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['src/foo.ts'],
    });
    expect(entry.status).toBe('PROPOSED');
    expect(entry.id).toBe('imp1');
    expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.proposedAt).toBeTruthy();
  });

  it('idempotent for duplicate id', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'A', description: 'A desc', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    const entry = proposeImprovement(rp, { id: 'imp1', title: 'B', description: 'B desc', proposer: 'agent', scope: 'single-file', priority: 'high', affectedPaths: ['y.ts'] });
    expect(entry.title).toBe('A');
  });

  it('rejects empty title', () => {
    const rp = tmpFile('improvements.json');
    expect(() => proposeImprovement(rp, { id: 'imp1', title: '', description: 'Desc', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: [] })).toThrow('title must be a non-empty string');
  });
});

// ─── evaluateImprovement ───────────────────────────────────────────────────────

describe('evaluateImprovement', () => {
  it('PROPOSED → EVALUATED → APPROVED for score >= 50', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good improvement', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    const entry = evaluateImprovement(rp, 'imp1', { score: 75, rationale: 'High impact', impactAreas: ['performance'], riskLevel: 'low' }, 'reviewer');
    expect(entry.status).toBe('APPROVED');
    expect(entry.evaluation?.score).toBe(75);
    expect(entry.approvedBy).toBe('reviewer');
  });

  it('PROPOSED → EVALUATED → REJECTED for score < 50', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Weak', description: 'Weak improvement', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    const entry = evaluateImprovement(rp, 'imp1', { score: 30, rationale: 'Low impact', impactAreas: [], riskLevel: 'high' }, 'reviewer');
    expect(entry.status).toBe('REJECTED');
    expect(entry.rejectedBy).toBe('reviewer');
  });

  it('rejects non-existent entry', () => {
    const rp = tmpFile('improvements.json');
    expect(() => evaluateImprovement(rp, 'nonexistent', { score: 60, rationale: 'r', impactAreas: [], riskLevel: 'low' }, 'agent')).toThrow("not found");
  });

  it('rejects already EVALUATED entry', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    evaluateImprovement(rp, 'imp1', { score: 75, rationale: 'Good', impactAreas: [], riskLevel: 'low' }, 'r1');
    expect(() => evaluateImprovement(rp, 'imp1', { score: 90, rationale: 'Better', impactAreas: [], riskLevel: 'low' }, 'r2')).toThrow('status is APPROVED');
  });
});

// ─── approveImprovement ────────────────────────────────────────────────────────

describe('approveImprovement', () => {
  it('EVALUATED → APPROVED', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    // Manually evaluate without auto-approve
    const registry = JSON.parse(fs.readFileSync(rp, 'utf-8'));
    registry.entries[0].status = 'EVALUATED';
    registry.entries[0].evaluation = { score: 80, rationale: 'Good', impactAreas: [], riskLevel: 'low' };
    registry.entries[0].evaluatedBy = 'agent';
    registry.entries[0].evaluatedAt = new Date().toISOString();
    fs.writeFileSync(rp, JSON.stringify(registry));
    const entry = approveImprovement(rp, 'imp1', 'owner');
    expect(entry.status).toBe('APPROVED');
  });

  it('rejects non-EVALUATED entry', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    expect(() => approveImprovement(rp, 'imp1', 'owner')).toThrow('status is PROPOSED');
  });
});

// ─── rejectImprovement ─────────────────────────────────────────────────────────

describe('rejectImprovement', () => {
  it('EVALUATED → REJECTED', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Weak', description: 'Weak', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    // Manually set to EVALUATED to test direct rejection
    const registry = JSON.parse(fs.readFileSync(rp, 'utf-8'));
    registry.entries[0].status = 'EVALUATED';
    registry.entries[0].evaluation = { score: 30, rationale: 'Low', impactAreas: [], riskLevel: 'low' };
    registry.entries[0].evaluatedBy = 'agent';
    registry.entries[0].evaluatedAt = new Date().toISOString();
    fs.writeFileSync(rp, JSON.stringify(registry));
    const entry = rejectImprovement(rp, 'imp1', 'owner');
    expect(entry.status).toBe('REJECTED');
    expect(entry.rejectedBy).toBe('owner');
  });
});

// ─── applyImprovement ──────────────────────────────────────────────────────────

describe('applyImprovement', () => {
  it('APPROVED → APPLIED', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    evaluateImprovement(rp, 'imp1', { score: 80, rationale: 'Good', impactAreas: [], riskLevel: 'low' }, 'agent');
    const entry = applyImprovement(rp, 'imp1');
    expect(entry.status).toBe('APPLIED');
    expect(entry.appliedAt).toBeTruthy();
  });

  it('rejects non-APPROVED entry', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'Good', description: 'Good', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    expect(() => applyImprovement(rp, 'imp1')).toThrow('status is PROPOSED');
  });
});

// ─── supersedeImprovement ──────────────────────────────────────────────────────

describe('supersedeImprovement', () => {
  it('APPROVED → SUPERSEDED', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'old', title: 'Old', description: 'Old desc', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    proposeImprovement(rp, { id: 'new', title: 'New', description: 'New desc', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['x.ts'] });
    evaluateImprovement(rp, 'old', { score: 60, rationale: 'Old ok', impactAreas: [], riskLevel: 'low' }, 'r1');
    evaluateImprovement(rp, 'new', { score: 85, rationale: 'New better', impactAreas: [], riskLevel: 'low' }, 'r1');

    const entry = supersedeImprovement(rp, 'old', 'new');
    expect(entry.status).toBe('SUPERSEDED');
    expect(entry.supersededBy).toBe('new');
  });
});

// ─── listImprovements + getImprovement ────────────────────────────────────────

describe('listImprovements', () => {
  it('returns all entries by default', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'A', description: 'A', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    proposeImprovement(rp, { id: 'imp2', title: 'B', description: 'B', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['y.ts'] });
    evaluateImprovement(rp, 'imp1', { score: 80, rationale: 'ok', impactAreas: [], riskLevel: 'low' }, 'agent');
    const all = listImprovements(rp);
    expect(all).toHaveLength(2);
  });

  it('filters by status', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'A', description: 'A', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    proposeImprovement(rp, { id: 'imp2', title: 'B', description: 'B', proposer: 'agent', scope: 'single-file', priority: 'medium', affectedPaths: ['y.ts'] });
    evaluateImprovement(rp, 'imp1', { score: 80, rationale: 'ok', impactAreas: [], riskLevel: 'low' }, 'agent');
    const approved = listImprovements(rp, { status: 'APPROVED' });
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe('imp1');
  });

  it('getImprovement returns entry or undefined', () => {
    const rp = tmpFile('improvements.json');
    proposeImprovement(rp, { id: 'imp1', title: 'A', description: 'A', proposer: 'agent', scope: 'single-file', priority: 'low', affectedPaths: ['x.ts'] });
    expect(getImprovement(rp, 'imp1')?.title).toBe('A');
    expect(getImprovement(rp, 'nonexistent')).toBeUndefined();
  });
});
