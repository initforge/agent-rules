import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  adoptPlan, finalizePlan, reconcilePlan, detectStaleReviews, sha256Bytes,
  type PlanIdentity, type Reconciliation,
} from '../src/plan-lifecycle.js';
import type { WorkLedger } from '../src/contracts.js';
import { planAnchorId } from '../src/contracts.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lifecycle-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(relativePath: string, content: string): string {
  const abs = path.resolve(relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

const hash = 'a'.repeat(64);

function stubLedger(overrides: Partial<WorkLedger> = {}): WorkLedger {
  const base: WorkLedger = {
    status: 'REVIEWING',
    plan: {
      schema: 'harness/portable-plan',
      version: 3 as const,
      planId: 'test-plan-001',
      original: {
        artifactId: 'PLAN-001', planId: 'test-plan-001', sourceKind: 'chat_plan_artifact', sourceRef: 'msg-1',
        rawPath: '.agent/plans/test-plan-001/original.md', sha256: hash, bytes: 100,
        capturedAt: '2026-07-27T00:00:00.000Z', status: 'ADOPTED',
        repositoryBaseline: { commit: 'a', branch: 'main', dirtyFingerprint: hash },
        repositoryIdentity: 'agent-rules', hostTask: { host: 'codex', taskRef: 't1', sessionRef: 's1' },
        authorIdentity: 'planner', ownerIdentity: 'owner', approvalEvent: 'approved',
        supersedes: [], supplements: [], derivedFrom: [],
      },
      projectionSha256: hash, objective: 'test', scope: { in: ['packages/engine'], out: [] },
      decisions: [], assumptions: [], knownUnknowns: [], taskDag: [],
      ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: [],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS', reconciliationSha256: hash,
      },
      requirements: [], anchors: [],
    },
    planAnchors: [],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: [] }],
    amendments: [],
    assignments: [],
    receipts: [],
    verificationClaims: [],
    attestations: [],
    reconciliations: [],
    repairSlices: [],
    sourceAcquisitionReceipts: [],
    orphanFindings: [],
    shadowRevision: 1,
    shadowHashes: { 'tasks.md': hash },
    latestReview: {
      reviewId: 'R1', stale: false, originalSha256: hash, amendmentsSha256: hash,
      diffFingerprint: hash, receiptEvidenceFingerprint: hash, evidenceHashes: [hash],
      shadowRevision: 1, reviewerIdentity: 'final-reviewer',
    },
  };
  return { ...base, ...overrides };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('adoptPlan', () => {
  it('copies raw source and computes SHA', () => {
    const dir = tmpDir();
    const sourcePath = writeFile(path.join(dir, 'plan.md'), '# Test Plan\n\n## Section A\nDo the work.\n');
    const result = adoptPlan(sourcePath, 'test-plan-adopt-1');

    expect(result.planId).toBe('test-plan-adopt-1');
    expect(result.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.amendmentIds).toEqual([]);

    const expectedTarget = path.resolve('.agent/plans/test-plan-adopt-1/original.md');
    expect(fs.existsSync(expectedTarget)).toBe(true);
    expect(fs.readFileSync(expectedTarget, 'utf-8')).toBe('# Test Plan\n\n## Section A\nDo the work.\n');

    const reRead = fs.readFileSync(expectedTarget);
    expect(result.originalSha256).toBe(sha256Bytes(new Uint8Array(reRead)));
  });

  it('rejects non-existent source path', () => {
    expect(() => adoptPlan('/nonexistent/path/plan.md', 'test-fail')).toThrow('does not exist');
  });
});

describe('finalizePlan', () => {
  it('fails when latest reconciliation is not PASS', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      reconciliations: [{ requirementId: 'REQ-001', status: 'PARTIAL', anchorIds: [], verificationClaimIds: [] }],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = finalizePlan(ledgerPath);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('PARTIAL');
  });

  it('fails when open findings exist', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      reconciliations: [{ requirementId: 'REQ-001', status: 'MATCH', anchorIds: [], verificationClaimIds: [] }],
      orphanFindings: [{ findingId: 'F1', status: 'OPEN', path: 'packages/engine/src/bad.ts', reason: 'Scope violation' }],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = finalizePlan(ledgerPath);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('open finding');
  });

  it('passes when reconciliation is PASS and no open findings', () => {
    const dir = tmpDir();
    const ledger = stubLedger({
      reconciliations: [{ requirementId: 'REQ-001', status: 'MATCH', anchorIds: [], verificationClaimIds: [] }],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = finalizePlan(ledgerPath);
    expect(result.passed).toBe(true);
  });
});

describe('detectStaleReviews', () => {
  it('marks reviews stale when bound source hash changed', () => {
    const reviews = [
      { id: 'R1', boundSourceHashes: [hash], reviewedAt: '2026-07-27T00:00:00.000Z' },
    ];
    const currentHashes = { 'original.md': 'b'.repeat(64) };
    const result = detectStaleReviews(reviews, currentHashes);
    expect(result).toHaveLength(1);
    expect(result[0].reviewId).toBe('R1');
    expect(result[0].staleCauses).toHaveLength(1);
  });

  it('does not mark reviews stale when hashes unchanged', () => {
    const reviews = [
      { id: 'R1', boundSourceHashes: [hash], reviewedAt: '2026-07-27T00:00:00.000Z' },
    ];
    const currentHashes = { 'original.md': hash };
    const result = detectStaleReviews(reviews, currentHashes);
    expect(result).toHaveLength(0);
  });

  it('does not mark reviews stale when bound hash is found among current values', () => {
    const reviews = [
      { id: 'R2', boundSourceHashes: [hash], reviewedAt: '2026-07-27T00:00:00.000Z' },
    ];
    const currentHashes = { 'file-a.md': 'x'.repeat(64), 'file-b.md': hash };
    const result = detectStaleReviews(reviews, currentHashes);
    expect(result).toHaveLength(0);
  });
});

describe('reconcilePlan', () => {
  it('returns PARTIAL when some requirements are reconciled and some are not', () => {
    const dir = tmpDir();
    const originalPath = writeFile(path.join(dir, 'original.md'), '# Test Plan\n\nContent\n');
    const ledger = stubLedger({
      reconciliations: [
        { requirementId: 'REQ-001', status: 'MATCH', anchorIds: [], verificationClaimIds: [] },
        { requirementId: 'REQ-002', status: 'MISSING', anchorIds: [], verificationClaimIds: [] },
      ],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = reconcilePlan(ledgerPath, originalPath, 'some-fingerprint');
    expect(result.status).toBe('PARTIAL');
    expect(result.detail).toContain('1/2');
  });

  it('returns MATCH when all requirements reconciled', () => {
    const dir = tmpDir();
    const originalPath = writeFile(path.join(dir, 'original.md'), '# Test Plan\n\nContent\n');
    const ledger = stubLedger({
      reconciliations: [
        { requirementId: 'REQ-001', status: 'MATCH', anchorIds: [], verificationClaimIds: [] },
        { requirementId: 'REQ-002', status: 'SUPERSEDED', anchorIds: [], verificationClaimIds: [] },
      ],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = reconcilePlan(ledgerPath, originalPath, 'test-fingerprint');
    expect(result.status).toBe('MATCH');
    expect(result.detail).toContain('2');
  });

  it('returns MISSING when no reconciler entries', () => {
    const dir = tmpDir();
    const originalPath = writeFile(path.join(dir, 'original.md'), '# Test Plan\n\nContent\n');
    const ledger = stubLedger();
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = reconcilePlan(ledgerPath, originalPath, 'test-fingerprint');
    expect(result.status).toBe('MISSING');
  });

  it('returns DEVIATED when all entries fail', () => {
    const dir = tmpDir();
    const originalPath = writeFile(path.join(dir, 'original.md'), '# Test Plan\n\nContent\n');
    const ledger = stubLedger({
      reconciliations: [
        { requirementId: 'REQ-001', status: 'PARTIAL', anchorIds: [], verificationClaimIds: [] },
        { requirementId: 'REQ-002', status: 'MISSING', anchorIds: [], verificationClaimIds: [] },
      ],
    });
    const ledgerPath = writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const result = reconcilePlan(ledgerPath, originalPath, 'test-fingerprint');
    expect(result.status).toBe('DEVIATED');
  });
});
