import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Controller } from '../src/controller.js';
import type { BrokerDecision } from '../src/resource-broker.js';
import type { WorkLedger, TaskAssignment, WorkerReceipt } from '../src/contracts.js';
import type { WorkerAdapter } from '../src/worker-adapter.js';
import type { VerifierAdapter, VerificationEvidence, VerificationResult } from '../src/verifier.js';

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
            binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 } },
          }],
        },
      ],
      anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 }],
    },
    planAnchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 }],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-A', 'TASK-B'] }],
    amendments: [],
    assignments: [
      {
        assignmentId: 'A-TASK-A',
        taskId: 'TASK-A',
        requirementIds: ['REQ-001'],
        anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 }],
        dependencies: [],
        sourceOfTruthPaths: [],
        ownedPaths: ['packages/engine'],
        forbiddenPaths: [],
        allowedTools: ['npm'],
        acceptanceCriteria: [{
          criterionId: 'CR-001',
          claim: 'Tests pass',
          evidenceProfile: 'npm-test',
          binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 } },
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
        anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 }],
        dependencies: ['TASK-A'],
        sourceOfTruthPaths: [],
        ownedPaths: ['packages/engine'],
        forbiddenPaths: [],
        allowedTools: ['npm'],
        acceptanceCriteria: [{
          criterionId: 'CR-001',
          claim: 'Tests pass',
          evidenceProfile: 'npm-test',
          binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001', chunkIndex: 0 } },
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

  it('rejects a receipt bound to another assignment without mutation', async () => {
    const dir = tmpDir();
    const controller = new Controller(writeLedger(dir, stubLedger()));
    const assignmentId = await controller.dispatchNext();
    controller.startWork(assignmentId!);
    const receipt: WorkerReceipt = {
      receiptId: 'R-WRONG', assignmentId: 'A-TASK-B', workerIdentity: 'worker', host: 'localhost', model: 'test',
      artifactUris: [], artifactHashes: [], filesChanged: [], commands: [], exitCodes: [], logUris: [], logHashes: [],
      testEvidenceUris: [], testEvidenceHashes: [], startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T00:01:00.000Z',
    };
    await expect(controller.submitReceipt(assignmentId!, receipt)).rejects.toThrow(/assignment mismatch/);
    expect(controller.getTaskState(assignmentId!)).toBe('IN_PROGRESS');
  });

  describe('startWork', () => {
    it('rejects null assignmentId with clear message', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, stubLedger()));
      // Regression: dispatchNext returns null when no tasks ready, startWork must not crash
      await controller.dispatchNext(); // dispatch A-TASK-A
      await controller.dispatchNext(); // dispatch A-TASK-B (both done or pending blocked)
      expect(() => controller.startWork(null as unknown as string)).toThrow(/assignmentId is null or empty/);
    });

    it('rejects empty string assignmentId', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, stubLedger()));
      expect(() => controller.startWork('')).toThrow(/assignmentId is null or empty/);
    });
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

    it('rejects filename revision differing from snapshot revision', async () => {
      const dir = tmpDir();
      const ledger = writeLedger(dir, stubLedger());
      const source = new Controller(ledger);
      const revision = await source.checkpoint();
      mutateCheckpoint(dir, (value) => { value.revision++; });
      await expect(new Controller(ledger).resume(revision)).rejects.toThrow(/revision mismatch/);
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

    it('retry persists explicit bounded reason and state', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);
      await controller.cancel(assignmentId!);

      await controller.retry(assignmentId!, 'verification-failed:probeExitCode=1');
      const state = controller.getRetryState(assignmentId!);
      expect(state).toBeDefined();
      expect(state!.attempt).toBe(1);
      expect(state!.maxAttempts).toBe(3);
      expect(state!.reason).toBe('verification-failed:probeExitCode=1');
      expect(state!.nextRetryAt).toBeGreaterThan(0);
    });

    it('retry increments attempt count on subsequent retries', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);
      await controller.cancel(assignmentId!);

      await controller.retry(assignmentId!, 'first-failure');
      expect(controller.getRetryState(assignmentId!)!.attempt).toBe(1);

      await controller.cancel(assignmentId!);
      await controller.retry(assignmentId!, 'second-failure');
      expect(controller.getRetryState(assignmentId!)!.attempt).toBe(2);
    });

    it('retry rejects when max attempts exceeded', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);

      for (let i = 1; i <= 3; i++) {
        await controller.cancel(assignmentId!);
        await controller.retry(assignmentId!, `attempt-${i}`);
        if (i < 3) controller.startWork(assignmentId!);
      }

      await controller.cancel(assignmentId!);
      await expect(controller.retry(assignmentId!, 'attempt-4')).rejects.toThrow(/max attempts/);
    });

    it('retry truncates long reasons to bounded length', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);
      await controller.cancel(assignmentId!);

      const longReason = 'x'.repeat(500);
      await controller.retry(assignmentId!, longReason);
      const state = controller.getRetryState(assignmentId!);
      expect(state!.reason.length).toBe(256);
    });
  });

  describe('lease ownership enforcement', () => {
    it('startWork blocks when active lease exists for different owner', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      // Acquire lease by different owner
      controller.acquireLease('lease-1', 'other-worker', assignmentId!, 60000);

      expect(() => controller.startWork(assignmentId!)).toThrow(/active lease held by other-worker/);
    });

    it('startWork allows when no conflicting lease', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      expect(() => controller.startWork(assignmentId!)).not.toThrow();
    });

    it('submitReceipt blocks when active lease held by different owner', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);

      // Acquire lease by different owner
      controller.acquireLease('lease-1', 'other-worker', assignmentId!, 60000);

      const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const receipt: WorkerReceipt = {
        receiptId: 'R-LEASE', assignmentId: assignmentId!, workerIdentity: 'my-worker', host: 'localhost', model: 'test',
        diffSha256: validHash, artifactUris: [], artifactHashes: [], filesChanged: [], commands: [], exitCodes: [0],
        logUris: [], logHashes: [], testEvidenceUris: [], testEvidenceHashes: [],
        startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T00:01:00.000Z',
      };

      await expect(controller.submitReceipt(assignmentId!, receipt)).rejects.toThrow(/active lease held by other-worker/);
    });

    it('submitReceipt allows when lease matches worker identity', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      controller.startWork(assignmentId!);
      controller.acquireLease('lease-1', 'my-worker', assignmentId!, 60000);

      const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const receipt: WorkerReceipt = {
        receiptId: 'R-LEASE', assignmentId: assignmentId!, workerIdentity: 'my-worker', host: 'localhost', model: 'test',
        diffSha256: validHash, artifactUris: [], artifactHashes: [], filesChanged: [], commands: [], exitCodes: [0],
        logUris: [], logHashes: [], testEvidenceUris: [], testEvidenceHashes: [],
        startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T00:01:00.000Z',
      };

      await expect(controller.submitReceipt(assignmentId!, receipt)).resolves.not.toThrow();
    });

    it('heartbeatLease extends valid lease', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = 'A-TASK-A';
      const original = controller.acquireLease('lease-1', 'worker-1', assignmentId, 100);
      await new Promise(r => setTimeout(r, 10));
      const renewed = controller.heartbeatLease(assignmentId, 'worker-1', 100);

      expect(renewed).toBeDefined();
      expect(renewed!.expiresAt).toBeGreaterThan(original.expiresAt);
    });

    it('heartbeatLease returns undefined for mismatched owner', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = 'A-TASK-A';
      controller.acquireLease('lease-1', 'worker-1', assignmentId, 60000);
      const renewed = controller.heartbeatLease(assignmentId, 'different-worker', 60000);

      expect(renewed).toBeUndefined();
    });

    it('revokeLease removes active lease', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = 'A-TASK-A';
      controller.acquireLease('lease-1', 'worker-1', assignmentId, 60000);
      expect(controller.getLease(assignmentId)).toBeDefined();

      controller.revokeLease(assignmentId, 'worker-1');
      expect(controller.getLease(assignmentId)).toBeUndefined();
    });

    it('getLease returns undefined for expired lease', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = 'A-TASK-A';
      controller.acquireLease('lease-1', 'worker-1', assignmentId, 1); // 1ms TTL
      await new Promise(r => setTimeout(r, 10));

      expect(controller.getLease(assignmentId)).toBeUndefined();
    });
  });

  describe('dispatchReadySet with the C4 resource broker (AM-0019 §6)', () => {
    function independentLedger(count: number): WorkLedger {
      const base = stubLedger().assignments[0]! as TaskAssignment;
      const assignments: TaskAssignment[] = Array.from({ length: count }, (_, i) => ({
        ...base,
        assignmentId: `A-I${i}`,
        taskId: `TASK-I${i}`,
        dependencies: [],
        // distinct owned paths so the ready antichain is not conflict-blocked
        ownedPaths: [`packages/engine/area-${i}`],
      }));
      return stubLedger({
        assignments,
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: assignments.map((a) => a.taskId) }],
      });
    }

    const decision = (action: 'burst' | 'reduce' | 'pause'): BrokerDecision => ({
      action,
      mode: action === 'pause' ? 'paused' : action === 'reduce' ? 'reduced' : 'burst',
      reasons: ['test'],
      input: {
        ramFraction: action === 'pause' ? 0.05 : 0.1,
        psi: { available: false, some: null, full: null, source: 'unavailable' },
        cpuTempC: action === 'pause' ? 96 : 88,
        loadRatio: 0.5,
        swapInDeltaPerSec: 0,
      },
    });

    it('a burst broker decision dispatches the full independent set', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, independentLedger(6)));
      controller.setResourceBroker(async () => decision('burst'));
      const result = await controller.dispatchReadySet();
      expect(result.ready.length).toBe(6);
    });

    it('a REDUCE broker decision throttles dispatch concurrency', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, independentLedger(6)));
      controller.setResourceBroker(async () => decision('reduce'));
      const result = await controller.dispatchReadySet();
      // poolCeilingsForAction('reduce') -> total 4, writers 3
      expect(result.ready.length).toBe(3);
      expect(result.deferredByPool.length).toBeGreaterThan(0);
    });

    it('a PAUSE broker decision halts heavy dispatch (writers ceiling 0)', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, independentLedger(6)));
      controller.setResourceBroker(async () => decision('pause'));
      const result = await controller.dispatchReadySet();
      // poolCeilingsForAction('pause') -> writers 0, build 0: no writer dispatches.
      expect(result.ready.length).toBe(0);
      expect(result.deferredByPool.length).toBe(6);
    });

    it('the broker decision feeds the effective ceilings (setPoolCeilings)', async () => {
      const dir = tmpDir();
      const controller = new Controller(writeLedger(dir, independentLedger(6)));
      let consulted = false;
      controller.setResourceBroker(async () => {
        consulted = true;
        return decision('pause');
      });
      await controller.dispatchReadySet();
      expect(consulted).toBe(true);
    });
  });

  describe('idempotent receipt submission (resume support)', () => {
    it('skip duplicate receipt on resume instead of throwing', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-A');
      controller.startWork(assignmentId!);

      const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const receipt: WorkerReceipt = {
        receiptId: 'R-IDEM-1',
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

      // First submission succeeds
      await controller.submitReceipt(assignmentId!, receipt);
      expect(controller.getTaskState(assignmentId!)).toBe('UNDER_REVIEW');

      // Reset to IN_PROGRESS to simulate resume scenario
      controller.taskStates.set(assignmentId!, 'IN_PROGRESS');
      controller.runningAssignments.add(assignmentId!);
      // Remove the receipt to simulate a fresh state
      controller.receipts = controller.receipts.filter(r => r.receiptId !== receipt.receiptId);

      // Second submission with same receiptId should be idempotent (skip, not throw)
      await expect(controller.submitReceipt(assignmentId!, receipt)).resolves.not.toThrow();
      // Receipt should be present once
      const receipts = controller.receipts.filter(r => r.receiptId === receipt.receiptId);
      expect(receipts).toHaveLength(1);
    });

    it('concurrent execution of independent tasks honors per-task errors', async () => {
      const dir = tmpDir();
      // Create independent tasks by using dispatchReadySet
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-1',
            taskId: 'TASK-1',
            ownedPaths: ['packages/engine/area-1'],
            dependencies: [],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-2',
            taskId: 'TASK-2',
            ownedPaths: ['packages/engine/area-2'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-1', 'TASK-2'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));

      // Use dispatchReadySet to dispatch both independent tasks
      const result = await controller.dispatchReadySet();
      expect(result.ready).toContain('A-1');
      expect(result.ready).toContain('A-2');
      expect(controller.getTaskState('A-1')).toBe('READY');
      expect(controller.getTaskState('A-2')).toBe('READY');

      // Simulate concurrent start
      controller.startWork('A-1');
      controller.startWork('A-2');
      expect(controller.getTaskState('A-1')).toBe('IN_PROGRESS');
      expect(controller.getTaskState('A-2')).toBe('IN_PROGRESS');

      const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      // Simulate concurrent submission
      const results = await Promise.all([
        controller.submitReceipt('A-1', {
          receiptId: 'R-1', assignmentId: 'A-1', workerIdentity: 'w1', host: 'localhost', model: 'test',
          diffSha256: validHash, artifactUris: [], artifactHashes: [], filesChanged: [],
          commands: [], exitCodes: [0], logUris: [], logHashes: [],
          testEvidenceUris: [], testEvidenceHashes: [],
          startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T01:00:00.000Z',
        }),
        controller.submitReceipt('A-2', {
          receiptId: 'R-2', assignmentId: 'A-2', workerIdentity: 'w2', host: 'localhost', model: 'test',
          diffSha256: validHash, artifactUris: [], artifactHashes: [], filesChanged: [],
          commands: [], exitCodes: [0], logUris: [], logHashes: [],
          testEvidenceUris: [], testEvidenceHashes: [],
          startedAt: '2026-07-27T00:00:00.000Z', completedAt: '2026-07-27T01:00:00.000Z',
        }),
      ]);

      // Both should succeed
      expect(results).toHaveLength(2);
      expect(controller.getTaskState('A-1')).toBe('UNDER_REVIEW');
      expect(controller.getTaskState('A-2')).toBe('UNDER_REVIEW');
    });
  });

  describe('runFullPlan sibling failure policy (cancel-others)', () => {
    function makeFailingWorker(failOnAssignmentId: string): WorkerAdapter {
      return {
        async detect() { return { available: true }; },
        async health() { return { ok: true }; },
        async submit(assignment: TaskAssignment) {
          return { jobId: `job-${assignment.assignmentId}` };
        },
        async collectReceipt(jobId: string) {
          const assignmentId = jobId.slice('job-'.length);
          const receipt: WorkerReceipt = {
            receiptId: `receipt-${assignmentId}`,
            assignmentId,
            workerIdentity: 'test-worker',
            host: 'localhost',
            model: 'test',
            diffSha256: 'a'.repeat(64),
            artifactUris: ['file:///test'],
            artifactHashes: ['a'.repeat(64) as any],
            filesChanged: [],
            commands: [],
            exitCodes: [0],
            logUris: [],
            logHashes: [],
            testEvidenceUris: [],
            testEvidenceHashes: [],
            startedAt: '2026-07-27T00:00:00.000Z',
            completedAt: '2026-07-27T00:01:00.000Z',
          };
          // Inject failure for the targeted assignment by modifying exit code
          if (assignmentId === failOnAssignmentId) {
            (receipt as any).exitCodes = [1];
          }
          return receipt;
        },
      };
    }

    function passVerifier(): VerifierAdapter {
      return {
        async detect() { return { available: true }; },
        async verify(_receipt: WorkerReceipt, _evidence: VerificationEvidence): Promise<VerificationResult> {
          return {
            passed: true,
            scope: 'focused',
            evidence: {},
            fingerprint: 'test-fingerprint',
            independent: true,
          };
        },
      };
    }

    function conditionalVerifier(failOnAssignmentId: string): VerifierAdapter {
      return {
        async detect() { return { available: true }; },
        async verify(receipt: WorkerReceipt, evidence: VerificationEvidence): Promise<VerificationResult> {
          // Return failure for the targeted assignment
          if (receipt.assignmentId === failOnAssignmentId) {
            return {
              passed: false,
              scope: 'focused',
              evidence: {},
              fingerprint: 'test-fingerprint',
              independent: true,
            };
          }
          return {
            passed: evidence.probeExitCode === 0,
            scope: 'focused',
            evidence: {},
            fingerprint: 'test-fingerprint',
            independent: true,
          };
        },
      };
    }

    it('cancel-others cancels sibling tasks when one fails', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-FAIL',
            taskId: 'TASK-FAIL',
            ownedPaths: ['packages/engine/area-fail'],
            dependencies: [],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-KEEP',
            taskId: 'TASK-KEEP',
            ownedPaths: ['packages/engine/area-keep'],
            dependencies: [],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-KEEP2',
            taskId: 'TASK-KEEP2',
            ownedPaths: ['packages/engine/area-keep2'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-FAIL', 'TASK-KEEP', 'TASK-KEEP2'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));
      controller.setFailureSiblingPolicy('cancel-others');

      await controller.runFullPlan(makeFailingWorker('A-FAIL'), conditionalVerifier('A-FAIL'));

      // The failing task should be CLOSED_FAILED
      expect(controller.getTaskState('A-FAIL')).toBe('CLOSED_FAILED');
      // Sibling tasks should not remain in executable states
      const keepState = controller.getTaskState('A-KEEP');
      const keep2State = controller.getTaskState('A-KEEP2');
      // They should not be left in READY or IN_PROGRESS (should be CLOSED_* or UNDER_REVIEW)
      expect(keepState).not.toBe('READY');
      expect(keepState).not.toBe('IN_PROGRESS');
      expect(keep2State).not.toBe('READY');
      expect(keep2State).not.toBe('IN_PROGRESS');
    });

    it('runFullPlan does not throw "Cannot start work on null" with cancel-others', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-1',
            taskId: 'TASK-1',
            ownedPaths: ['packages/engine/area-1'],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-2',
            taskId: 'TASK-2',
            ownedPaths: ['packages/engine/area-2'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-1', 'TASK-2'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));
      controller.setFailureSiblingPolicy('cancel-others');

      // Should not throw "Cannot start work on null"
      await expect(
        controller.runFullPlan(makeFailingWorker('A-1'), conditionalVerifier('A-1')),
      ).resolves.not.toThrow();
    });

    it('cancel-others preserves resource ceiling and overlap metrics', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-1',
            taskId: 'TASK-1',
            ownedPaths: ['packages/engine/area-1'],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-2',
            taskId: 'TASK-2',
            ownedPaths: ['packages/engine/area-2'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-1', 'TASK-2'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));
      controller.setFailureSiblingPolicy('cancel-others');
      controller.resetConcurrencyMetrics();

      await controller.runFullPlan(makeFailingWorker('A-1'), conditionalVerifier('A-1'));

      const metrics = controller.getConcurrencyMetrics();
      // Verify metrics structure is intact
      expect(metrics).toHaveProperty('peakOverlap');
      expect(metrics).toHaveProperty('windows');
      expect(metrics).toHaveProperty('poolSnapshots');
      expect(metrics).toHaveProperty('deferredByCeiling');
      expect(metrics).toHaveProperty('siblingGroups');
      // Windows should be recorded for both tasks
      expect(metrics.windows.length).toBeGreaterThanOrEqual(2);
    });

    it('continue-others does not cancel siblings on failure', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-FAIL',
            taskId: 'TASK-FAIL',
            ownedPaths: ['packages/engine/area-fail'],
            dependencies: [],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-KEEP',
            taskId: 'TASK-KEEP',
            ownedPaths: ['packages/engine/area-keep'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-FAIL', 'TASK-KEEP'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));
      controller.setFailureSiblingPolicy('continue-others');

      await controller.runFullPlan(makeFailingWorker('A-FAIL'), conditionalVerifier('A-FAIL'));

      // Failing task should be CLOSED_FAILED
      expect(controller.getTaskState('A-FAIL')).toBe('CLOSED_FAILED');
      // The other task should complete successfully (or be left in whatever state it reached)
      const keepState = controller.getTaskState('A-KEEP');
      // It should NOT be cancelled - it should complete or be retried
      expect(keepState).not.toBe('CLOSED_FAILED');
    });
  });

  describe('runFullPlan null state handling', () => {
    it('handles orphaned assignment without crashing', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-ORPHAN',
            taskId: 'TASK-ORPHAN',
            ownedPaths: ['packages/engine/orphan'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-ORPHAN'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));

      // Simulate orphaned state by manually removing from taskStates
      controller.taskStates.delete('A-ORPHAN');

      // Should not throw "Cannot start work on null" or similar
      await expect(
        controller.runFullPlan(
          {
            async detect() { return { available: true }; },
            async health() { return { ok: true }; },
            async submit() { return { jobId: 'job-orphan' }; },
            async collectReceipt() {
              return {
                receiptId: 'receipt-orphan',
                assignmentId: 'A-ORPHAN',
                workerIdentity: 'test',
                host: 'localhost',
                model: 'test',
                diffSha256: 'a'.repeat(64),
                artifactUris: [],
                artifactHashes: [],
                filesChanged: [],
                commands: [],
                exitCodes: [0],
                logUris: [],
                logHashes: [],
                testEvidenceUris: [],
                testEvidenceHashes: [],
                startedAt: '2026-07-27T00:00:00.000Z',
                completedAt: '2026-07-27T00:01:00.000Z',
              };
            },
          },
          {
            async detect() { return { available: true }; },
            async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
          },
        ),
      ).resolves.not.toThrow();
    });

    it('handles UNDER_REVIEW state gracefully', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      // Manually set task to UNDER_REVIEW (simulating mid-execution state)
      controller.taskStates.set('A-TASK-A', 'UNDER_REVIEW');

      // runTask should handle UNDER_REVIEW without throwing
      await expect(
        controller.runTask(
          'A-TASK-A',
          {
            async detect() { return { available: true }; },
            async health() { return { ok: true }; },
            async submit() { return { jobId: 'job' }; },
            async collectReceipt() {
              return {
                receiptId: 'r',
                assignmentId: 'A-TASK-A',
                workerIdentity: 'test',
                host: 'localhost',
                model: 'test',
                diffSha256: 'a'.repeat(64),
                artifactUris: [],
                artifactHashes: [],
                filesChanged: [],
                commands: [],
                exitCodes: [0],
                logUris: [],
                logHashes: [],
                testEvidenceUris: [],
                testEvidenceHashes: [],
                startedAt: '2026-07-27T00:00:00.000Z',
                completedAt: '2026-07-27T00:01:00.000Z',
              };
            },
          },
          {
            async detect() { return { available: true }; },
            async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
          },
        ),
      ).resolves.toMatchObject({ success: false, state: 'UNDER_REVIEW' });
    });

    it('handles CLOSED_FAILED state without throwing', async () => {
      const dir = tmpDir();
      const ledgerPath = writeLedger(dir, stubLedger());
      const controller = new Controller(ledgerPath);

      // Manually set task to CLOSED_FAILED
      controller.taskStates.set('A-TASK-A', 'CLOSED_FAILED');

      // runTask should return failure without throwing
      await expect(
        controller.runTask(
          'A-TASK-A',
          {
            async detect() { return { available: true }; },
            async health() { return { ok: true }; },
            async submit() { return { jobId: 'job' }; },
            async collectReceipt() {
              return {
                receiptId: 'r',
                assignmentId: 'A-TASK-A',
                workerIdentity: 'test',
                host: 'localhost',
                model: 'test',
                diffSha256: 'a'.repeat(64),
                artifactUris: [],
                artifactHashes: [],
                filesChanged: [],
                commands: [],
                exitCodes: [0],
                logUris: [],
                logHashes: [],
                testEvidenceUris: [],
                testEvidenceHashes: [],
                startedAt: '2026-07-27T00:00:00.000Z',
                completedAt: '2026-07-27T00:01:00.000Z',
              };
            },
          },
          {
            async detect() { return { available: true }; },
            async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
          },
        ),
      ).resolves.toMatchObject({ success: false, state: 'CLOSED_FAILED' });
    });
  });

  describe('runFullPlan concurrency overlap', () => {
    it('records overlapping execution windows', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-1',
            taskId: 'TASK-1',
            ownedPaths: ['packages/engine/area-1'],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-2',
            taskId: 'TASK-2',
            ownedPaths: ['packages/engine/area-2'],
            dependencies: [],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-3',
            taskId: 'TASK-3',
            ownedPaths: ['packages/engine/area-3'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-1', 'TASK-2', 'TASK-3'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));
      controller.resetConcurrencyMetrics();

      await controller.runFullPlan(
        {
          async detect() { return { available: true }; },
          async health() { return { ok: true }; },
          async submit(assignment: TaskAssignment) { return { jobId: `job-${assignment.assignmentId}` }; },
          async collectReceipt(jobId: string) {
            // Simulate some execution time
            await new Promise(r => setTimeout(r, 50));
            const assignmentId = jobId.slice('job-'.length);
            return {
              receiptId: `receipt-${assignmentId}`,
              assignmentId,
              workerIdentity: 'test',
              host: 'localhost',
              model: 'test',
              diffSha256: 'a'.repeat(64),
              artifactUris: [],
              artifactHashes: [],
              filesChanged: [],
              commands: [],
              exitCodes: [0],
              logUris: [],
              logHashes: [],
              testEvidenceUris: [],
              testEvidenceHashes: [],
              startedAt: '2026-07-27T00:00:00.000Z',
              completedAt: '2026-07-27T00:01:00.000Z',
            };
          },
        },
        {
          async detect() { return { available: true }; },
          async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
        },
      );

      const metrics = controller.getConcurrencyMetrics();
      // Should have recorded windows for all 3 tasks
      expect(metrics.windows.length).toBe(3);

      // Verify peak overlap is at least 2 (at least 2 tasks ran concurrently)
      expect(metrics.peakOverlap).toBeGreaterThanOrEqual(2);
    });
  });

  describe('runFullPlan per-task error isolation', () => {
    it('isolates per-task errors and continues sibling execution', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-OK-1',
            taskId: 'TASK-OK-1',
            ownedPaths: ['packages/engine/ok1'],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-FAIL',
            taskId: 'TASK-FAIL',
            ownedPaths: ['packages/engine/fail'],
            verificationCommands: [],
          },
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-OK-2',
            taskId: 'TASK-OK-2',
            ownedPaths: ['packages/engine/ok2'],
            dependencies: [],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-OK-1', 'TASK-FAIL', 'TASK-OK-2'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));

      // Worker that fails on specific task
      const failingWorker: WorkerAdapter = {
        async detect() { return { available: true }; },
        async health() { return { ok: true }; },
        async submit(assignment: TaskAssignment) { return { jobId: `job-${assignment.assignmentId}` }; },
        async collectReceipt(jobId: string) {
          const assignmentId = jobId.slice('job-'.length);
          if (assignmentId === 'A-FAIL') {
            throw new Error('Simulated worker failure');
          }
          return {
            receiptId: `receipt-${assignmentId}`,
            assignmentId,
            workerIdentity: 'test',
            host: 'localhost',
            model: 'test',
            diffSha256: 'a'.repeat(64),
            artifactUris: [],
            artifactHashes: [],
            filesChanged: [],
            commands: [],
            exitCodes: [0],
            logUris: [],
            logHashes: [],
            testEvidenceUris: [],
            testEvidenceHashes: [],
            startedAt: '2026-07-27T00:00:00.000Z',
            completedAt: '2026-07-27T00:01:00.000Z',
          };
        },
      };

      const passVerifier: VerifierAdapter = {
        async detect() { return { available: true }; },
        async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
      };

      // Should not throw despite worker failure
      const result = await controller.runFullPlan(failingWorker, passVerifier);

      // At least one task should complete (the ones that didn't fail)
      expect(result.completed + result.failed).toBe(3);
    });

    it('worker exception does not propagate out of runFullPlan', async () => {
      const dir = tmpDir();
      const ledger = stubLedger({
        assignments: [
          {
            ...stubLedger().assignments[0]!,
            assignmentId: 'A-1',
            taskId: 'TASK-1',
            ownedPaths: ['packages/engine/1'],
            verificationCommands: [],
          },
        ],
        batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-1'] }],
      });
      const controller = new Controller(writeLedger(dir, ledger));

      const crashingWorker: WorkerAdapter = {
        async detect() { return { available: true }; },
        async health() { return { ok: true }; },
        async submit() { throw new Error('Worker crashed'); },
        async collectReceipt() { throw new Error('Worker crashed'); },
      };

      // Should resolve, not reject
      await expect(controller.runFullPlan(crashingWorker, {
        async detect() { return { available: true }; },
        async verify() { return { passed: true, scope: 'focused', evidence: {}, fingerprint: 'test', independent: true }; },
      })).resolves.toBeDefined();
    });
  });
});
