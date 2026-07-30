import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Controller } from '../src/controller.js';
import type { WorkLedger, TaskAssignment, WorkerReceipt } from '../src/contracts.js';

const hash = 'a'.repeat(64);
const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'controller-test-'));
  tmpDirs.push(dir);
  return dir;
}

function stubLedger(overrides: Partial<WorkLedger> = {}): WorkLedger {
  const base: WorkLedger = {
    status: 'EXECUTING',
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
      decisions: [], assumptions: [], knownUnknowns: [],
      taskDag: [
        { taskId: 'TASK-B', requirementIds: ['REQ-001'], criterionIds: ['CR-001'], dependencies: ['TASK-A'] },
        { taskId: 'TASK-A', requirementIds: ['REQ-001'], criterionIds: ['CR-001'], dependencies: [] },
      ],
      ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: [],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS', reconciliationSha256: hash,
      },
      requirements: [
        {
          requirementId: 'REQ-001',
          statement: 'Do the work',
          acceptanceCriteria: [{
            criterionId: 'CR-001',
            claim: 'Tests pass',
            evidenceProfile: 'npm-test',
            binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
          }],
        },
      ],
      anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    },
    planAnchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-A', 'TASK-B'] }],
    amendments: [],
    assignments: [
      {
        assignmentId: 'A-TASK-A',
        taskId: 'TASK-A',
        requirementIds: ['REQ-001'],
        anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
        dependencies: [],
        sourceOfTruthPaths: [],
        ownedPaths: ['packages/engine'],
        forbiddenPaths: [],
        allowedTools: ['npm'],
        acceptanceCriteria: [{
          criterionId: 'CR-001',
          claim: 'Tests pass',
          evidenceProfile: 'npm-test',
          binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
        }],
        modelTier: 'standard',
        riskTier: 'high',
        tokenBudget: 100000,
        timeBudgetMs: 600000,
        costBudgetUsd: 0.5,
        verificationCommands: [{ executable: 'npm', args: ['test'], cwd: 'packages/engine' }],
        escalationConditions: [],
        receiptContractSha256: hash,
      },
      {
        assignmentId: 'A-TASK-B',
        taskId: 'TASK-B',
        requirementIds: ['REQ-001'],
        anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
        dependencies: ['TASK-A'],
        sourceOfTruthPaths: [],
        ownedPaths: ['packages/engine'],
        forbiddenPaths: [],
        allowedTools: ['npm'],
        acceptanceCriteria: [{
          criterionId: 'CR-001',
          claim: 'Tests pass',
          evidenceProfile: 'npm-test',
          binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
        }],
        modelTier: 'standard',
        riskTier: 'high',
        tokenBudget: 100000,
        timeBudgetMs: 600000,
        costBudgetUsd: 0.5,
        verificationCommands: [{ executable: 'npm', args: ['test'], cwd: 'packages/engine' }],
        escalationConditions: [],
        receiptContractSha256: hash,
      },
    ],
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

function writeLedger(dir: string, ledger: WorkLedger): string {
  const ledgerPath = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return ledgerPath;
}

function mutateCheckpoint(dir: string, mutate: (value: Record<string, any>) => void): string {
  const state = path.join(dir, '.controller');
  const old = fs.readdirSync(state)[0]!;
  const value = JSON.parse(fs.readFileSync(path.join(state, old), 'utf8'));
  const revision = old.slice('checkpoint-'.length, 'checkpoint-'.length + 10);
  mutate(value);
  const raw = JSON.stringify(value, null, 2);
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  fs.unlinkSync(path.join(state, old));
  fs.writeFileSync(path.join(state, `checkpoint-${revision}-${digest}.json`), raw);
  return revision;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Controller', () => {
  describe('dispatchNext', () => {
    it('does not dispatch when dependency not reconciled', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const result = await controller.dispatchNext();

      expect(result).toBe('A-TASK-A');
    });

    it('dispatches when dependency is reconciled', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const first = await controller.dispatchNext();
      expect(first).toBe('A-TASK-A');
      controller.startWork(first!);

      const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const receipt: WorkerReceipt = {
        receiptId: 'R-A',
        assignmentId: first!,
        workerIdentity: 'worker-1',
        host: 'localhost',
        model: 'test-model',
        diffSha256: validHash,
        artifactUris: [],
        artifactHashes: [],
        filesChanged: ['packages/engine/src/foo.ts'],
        commands: [{ executable: 'npm', args: ['test'], cwd: 'packages/engine' }],
        exitCodes: [0],
        logUris: [],
        logHashes: [],
        testEvidenceUris: [],
        testEvidenceHashes: [],
        startedAt: '2026-07-27T00:00:00.000Z',
        completedAt: '2026-07-27T01:00:00.000Z',
      };
      await controller.submitReceipt(first!, receipt);
      await controller.verifyReceipt(first!, true);

      const second = await controller.dispatchNext();
      expect(second).toBe('A-TASK-B');
    });
  });

  it('worker PASS alone does not set COMPLETED', async () => {
    const dir = tmpDir();
    const ledgerPath = writeLedger(dir, stubLedger());
    const controller = new Controller(ledgerPath);

    const assignmentId = await controller.dispatchNext();
    expect(assignmentId).toBe('A-TASK-A');

    controller.startWork(assignmentId!);

    const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const receipt: WorkerReceipt = {
      receiptId: 'R-PASS',
      assignmentId: assignmentId!,
      workerIdentity: 'worker-1',
      host: 'localhost',
      model: 'test-model',
      diffSha256: validHash,
      artifactUris: [],
      artifactHashes: [],
      filesChanged: ['packages/engine/src/foo.ts'],
      commands: [{ executable: 'npm', args: ['test'], cwd: 'packages/engine' }],
      exitCodes: [0],
      logUris: [],
      logHashes: [],
      testEvidenceUris: [],
      testEvidenceHashes: [],
      startedAt: '2026-07-27T00:00:00.000Z',
      completedAt: '2026-07-27T01:00:00.000Z',
    };
    await controller.submitReceipt(assignmentId!, receipt);

    expect(controller.getTaskState(assignmentId!)).toBe('UNDER_REVIEW');

    await controller.verifyReceipt(assignmentId!, true);
    expect(controller.getTaskState(assignmentId!)).toBe('CLOSED_MATCH');
  });

  describe('checkpoint/resume', () => {
    it('checkpoint/resume roundtrip preserves state', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-A');
      controller.startWork(assignmentId!);

      const revision = await controller.checkpoint();
      expect(revision).toBeTruthy();

      const controller2 = new Controller(ledgerPath);
      await controller2.resume(revision!);

      expect(controller2.getTaskState(assignmentId!)).toBe('IN_PROGRESS');
    });

    it('accepts a trusted macOS-style ancestor alias', async () => {
      const dir = tmpDir();
      const real = path.join(dir, 'real');
      const alias = path.join(dir, 'alias');
      fs.mkdirSync(real);
      fs.symlinkSync(real, alias, 'dir');
      const controller = new Controller(writeLedger(alias, stubLedger()));
      expect(await controller.checkpoint()).toBe('0000000001');
    });

    it('fails closed when an ancestor alias is retargeted', async () => {
      const dir = tmpDir();
      const first = path.join(dir, 'first');
      const second = path.join(dir, 'second');
      const alias = path.join(dir, 'alias');
      fs.mkdirSync(first); fs.mkdirSync(second); fs.symlinkSync(first, alias, 'dir');
      const controller = new Controller(writeLedger(alias, stubLedger()));
      fs.unlinkSync(alias); fs.symlinkSync(second, alias, 'dir');
      await expect(controller.checkpoint()).rejects.toThrow(/identity changed/);
    });

    it('does not clobber an existing checkpoint', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, stubLedger()));
      await controller.checkpoint();
      await expect(controller.checkpoint()).rejects.toMatchObject({ code: 'EEXIST' });
    });

    it('rejects stateDir replacement and checkpoint links', async () => {
      const dir = tmpDir();
      const ledger = writeLedger(dir, stubLedger());
      const controller = new Controller(ledger);
      fs.symlinkSync(tmpDir(), path.join(dir, '.controller'), 'dir');
      await expect(controller.checkpoint()).rejects.toThrow(/unsafe state directory/);
      fs.unlinkSync(path.join(dir, '.controller')); fs.mkdirSync(path.join(dir, '.controller'));
      const revision = await controller.checkpoint();
      const checkpoint = fs.readdirSync(path.join(dir, '.controller'))[0]!;
      const linked = path.join(dir, 'linked');
      fs.linkSync(path.join(dir, '.controller', checkpoint), linked);
      await expect(new Controller(ledger).resume(revision)).rejects.toThrow(/private regular file/);
    });

    it('rejects oversized and malformed checkpoints', async () => {
      const dir = tmpDir();
      const ledger = writeLedger(dir, stubLedger());
      const controller = new Controller(ledger);
      const revision = await controller.checkpoint();
      const state = path.join(dir, '.controller');
      const checkpoint = path.join(state, fs.readdirSync(state)[0]!);
      fs.truncateSync(checkpoint, 16 * 1024 * 1024 + 1);
      await expect(new Controller(ledger).resume(revision)).rejects.toThrow(/exceeds/);
      fs.rmSync(state, { recursive: true }); fs.mkdirSync(state);
      fs.writeFileSync(path.join(state, `checkpoint-${revision}-${hash.slice(0, 16)}.json`), '{');
      await expect(new Controller(ledger).resume(revision)).rejects.toThrow();
    });

    it.each([
      ['enum', (v: any) => { v.checkpointState = 'EVIL'; }],
      ['revision', (v: any) => { v.revision = -1; }],
      ['record', (v: any) => { v.taskStates = []; }],
      ['string', (v: any) => { v.runningAssignments = [3]; }],
      ['receipt', (v: any) => { v.receipts = [{}]; }],
      ['ledgerPath', (v: any) => { v.ledgerPath += '.other'; }],
      ['state', (v: any) => { v.taskStates['A-TASK-A'] = 'EVIL'; }],
      ['running identity', (v: any) => { v.runningAssignments = ['UNKNOWN']; }],
    ])('rejects invalid checkpoint %s atomically', async (_kind, mutate) => {
      const dir = tmpDir();
      const ledger = writeLedger(dir, stubLedger());
      const source = new Controller(ledger);
      const assignment = await source.dispatchNext(); source.startWork(assignment!); await source.checkpoint();
      const target = new Controller(ledger);
      expect(target.getTaskState('A-TASK-A')).toBe('PENDING');
      const revision = mutateCheckpoint(dir, mutate);
      await expect(target.resume(revision)).rejects.toThrow();
      expect(target.getTaskState('A-TASK-A')).toBe('PENDING');
    });

    it('rejects bounded checkpoint collections', async () => {
      const dir = tmpDir(); const ledger = writeLedger(dir, stubLedger()); const source = new Controller(ledger);
      await source.checkpoint();
      const revision = mutateCheckpoint(dir, (v) => { v.runningAssignments = Array(100_001).fill('A'); });
      await expect(new Controller(ledger).resume(revision)).rejects.toThrow(/runningAssignments/);
    });
  });

  it('distinguishes missing ledgers from malformed, linked, and oversized ledgers', () => {
    const dir = tmpDir();
    expect(new Controller(path.join(dir, 'missing.json')).getLedger()).toBeNull();
    const malformed = path.join(dir, 'malformed.json'); fs.writeFileSync(malformed, '{');
    expect(() => new Controller(malformed)).toThrow();
    const oversized = path.join(dir, 'oversized.json'); fs.writeFileSync(oversized, '');
    fs.truncateSync(oversized, 16 * 1024 * 1024 + 1);
    expect(() => new Controller(oversized)).toThrow(/exceeds/);
    const source = path.join(dir, 'source.json'); fs.writeFileSync(source, JSON.stringify(stubLedger()));
    const linked = path.join(dir, 'linked.json'); fs.linkSync(source, linked);
    expect(() => new Controller(linked)).toThrow(/private regular file/);
    const symlink = path.join(dir, 'symlink.json'); fs.symlinkSync(source, symlink);
    expect(() => new Controller(symlink)).toThrow();
  });

  it.each([
    ['enum', (v: any) => { v.status = 'EVIL'; }],
    ['revision', (v: any) => { v.shadowRevision = -1; }],
    ['collection', (v: any) => { v.assignments = Array(100_001).fill({}); }],
    ['record', (v: any) => { v.plan = []; }],
    ['string', (v: any) => { v.assignments[0].assignmentId = 4; }],
    ['assignment', (v: any) => { delete v.assignments[0].verificationCommands; }],
    ['receipt', (v: any) => { v.receipts = [{}]; }],
  ])('rejects invalid ledger %s', (_kind, mutate) => {
    const dir = tmpDir(); const value: any = stubLedger(); mutate(value);
    expect(() => new Controller(writeLedger(dir, value))).toThrow();
  });

  describe('cancel', () => {
    it('cancel stops running assignment', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-A');
      controller.startWork(assignmentId!);
      expect(controller.getTaskState(assignmentId!)).toBe('IN_PROGRESS');

      await controller.cancel(assignmentId!);
      expect(controller.getTaskState(assignmentId!)).toBe('CLOSED_FAILED');
    });
  });

  describe('retry', () => {
    it('retry resets failed assignment to PENDING', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-A');
      controller.startWork(assignmentId!);
      await controller.cancel(assignmentId!);
      expect(controller.getTaskState(assignmentId!)).toBe('CLOSED_FAILED');

      await controller.retry(assignmentId!);
      expect(controller.getTaskState(assignmentId!)).toBe('PENDING');
    });
  });
});
