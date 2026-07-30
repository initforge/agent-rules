import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  adoptPlan, finalizePlan, reconcilePlan, detectStaleReviews, detectStaleReceipts,
  lockFile, lockDirectory, sha256Bytes,
  type PlanIdentity, type Reconciliation,
} from '../src/plan-lifecycle.js';
import { exportPlanBundle, importPlanBundle } from '../src/export-bundle.js';
import type { WorkLedger, ReviewReceipt } from '../src/contracts.js';
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

describe('lockFile', () => {
  it('acquires and releases cross-process lock', () => {
    const dir = tmpDir();
    const lockTarget = path.join(dir, 'data.json');

    const lock1 = lockFile(lockTarget);
    expect(lock1.fd).toBeGreaterThanOrEqual(0);

    expect(() => lockFile(lockTarget)).toThrow();

    lock1.unlock();

    const lock2 = lockFile(lockTarget);
    expect(lock2.fd).toBeGreaterThanOrEqual(0);
    lock2.unlock();
  });
});

describe('lockDirectory', () => {
  it('prevents concurrent writes', () => {
    const dir = tmpDir();

    const lock1 = lockDirectory(dir);
    expect(lock1.fd).toBeGreaterThanOrEqual(0);

    expect(() => lockDirectory(dir)).toThrow();

    lock1.unlock();

    const lock2 = lockDirectory(dir);
    expect(lock2.fd).toBeGreaterThanOrEqual(0);
    lock2.unlock();
  });
});

describe('detectStaleReceipts', () => {
  const baseReceipt: ReviewReceipt = {
    reviewId: 'R1',
    stale: false,
    originalSha256: 'a'.repeat(64),
    amendmentsSha256: 'b'.repeat(64),
    diffFingerprint: 'fp-original',
    receiptEvidenceFingerprint: 'c'.repeat(64),
    evidenceHashes: ['e1'.repeat(32), 'e2'.repeat(32)],
    shadowRevision: 1,
    reviewerIdentity: 'reviewer-1',
  };

  it('finds stale reviews after code change (diff fingerprint mismatch)', () => {
    const receipts: ReviewReceipt[] = [{ ...baseReceipt }];
    const currentEvidenceHashes = { 'file1.md': 'e1'.repeat(32), 'file2.md': 'e2'.repeat(32) };

    const stale = detectStaleReceipts('fp-changed', currentEvidenceHashes, receipts);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toBe('R1');
  });

  it('preserves fresh reviews when everything matches', () => {
    const receipts: ReviewReceipt[] = [{ ...baseReceipt }];
    const currentEvidenceHashes = { 'file1.md': 'e1'.repeat(32), 'file2.md': 'e2'.repeat(32) };

    const stale = detectStaleReceipts('fp-original', currentEvidenceHashes, receipts);
    expect(stale).toHaveLength(0);
  });

  it('finds stale reviews when evidence hash is missing', () => {
    const receipts: ReviewReceipt[] = [{ ...baseReceipt }];
    const currentEvidenceHashes = { 'file1.md': 'different-hash' };

    const stale = detectStaleReceipts('fp-original', currentEvidenceHashes, receipts);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toBe('R1');
  });

  it('handles empty receipts array', () => {
    const stale = detectStaleReceipts('fp', {}, []);
    expect(stale).toHaveLength(0);
  });
});

describe('exportPlanBundle', () => {
  it('creates bundle with all receipts and hashes', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'amendments'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'lineage'), { recursive: true });

    writeFile(path.join(dir, 'original.md'), '# Original Plan\nContent');
    writeFile(path.join(dir, 'amendments', 'am1.md'), '# Amendment 1');
    writeFile(path.join(dir, 'lineage', 'v1.json'), JSON.stringify({ version: 1 }));

    const ledger: WorkLedger = stubLedger({
      receipts: [{ receiptId: 'R1', assignmentId: 'A1', workerIdentity: 'w1', host: 'host', model: 'model', artifactUris: [], artifactHashes: [], filesChanged: [], commands: [{ executable: 'test', args: [] }], exitCodes: [0], logUris: [], logHashes: [], testEvidenceUris: [], testEvidenceHashes: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }],
    });
    writeFile(path.join(dir, 'ledger.json'), JSON.stringify(ledger));

    const bundle = await exportPlanBundle(dir);
    expect(bundle.formatVersion).toBe('1.0');
    expect(bundle.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.effectivePlanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.amendments).toHaveLength(1);
    expect(bundle.amendments[0].id).toBe('am1');
    expect(bundle.receipts).toHaveLength(1);
    expect(bundle.receipts[0].assignmentId).toBe('A1');
    expect(bundle.lineage).toHaveLength(1);
    expect(bundle.exportedAt).toBeTruthy();
  });

  it('throws for non-existent directory', async () => {
    await expect(exportPlanBundle('/nonexistent/plan-dir')).rejects.toThrow('does not exist');
  });
});

describe('importPlanBundle', () => {
  it('restores plan from bundle', async () => {
    const srcDir = tmpDir();
    const dstDir = tmpDir();

    fs.mkdirSync(path.join(srcDir, 'amendments'), { recursive: true });
    writeFile(path.join(srcDir, 'original.md'), '# Plan for export\nContent');
    writeFile(path.join(srcDir, 'amendments', 'am1.md'), '# Amendment text');

    const bundle = await exportPlanBundle(srcDir);

    fs.mkdirSync(path.join(dstDir, 'amendments'), { recursive: true });
    writeFile(path.join(dstDir, 'original.md'), '# Plan for export\nContent');
    writeFile(path.join(dstDir, 'amendments', 'am1.md'), '# Amendment text');

    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(true);

    const bundleFile = path.join(dstDir, 'bundle.json');
    expect(fs.existsSync(bundleFile)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(bundleFile, 'utf-8'));
    expect(saved.planId).toBe(bundle.planId);
    expect(saved.originalSha256).toBe(bundle.originalSha256);
  });

  it('fails on invalid bundle', async () => {
    const dir = tmpDir();
    writeFile(path.join(dir, 'original.md'), '# content');
    const result = await importPlanBundle({} as any, dir);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('fails on original SHA mismatch', async () => {
    const srcDir = tmpDir();
    const dstDir = tmpDir();
    writeFile(path.join(srcDir, 'original.md'), '# Original content');

    const bundle = await exportPlanBundle(srcDir);

    writeFile(path.join(dstDir, 'original.md'), '# Different content');

    bundle.originalSha256 = 'f'.repeat(64);

    const result = await importPlanBundle(bundle, dstDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA-256 mismatch');
  });
});
