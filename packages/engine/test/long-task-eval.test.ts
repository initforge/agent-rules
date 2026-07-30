import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Controller } from '../src/controller.js';
import { FixtureRepoWorker, validateReceipt } from '../src/worker-adapter.js';
import { IndependentVerifier } from '../src/verifier.js';
import type { WorkLedger, TaskAssignment, WorkerReceipt, Sha256 } from '../src/contracts.js';

const hash = 'a'.repeat(64);
const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'long-task-eval-'));
  tmpDirs.push(dir);
  return dir;
}

function setupFixture(): string {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'long-task-fixture', version: '1.0.0', private: true, main: 'src/index.js', type: 'module',
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), `export function add(a, b) {
  return a * b;
}
`);
  return dir;
}

function fixtureContent(dir: string): string {
  return fs.readFileSync(path.join(dir, 'src', 'index.js'), 'utf-8');
}

function stubLedger(fixtureDir: string): WorkLedger {
  const assign: TaskAssignment = {
    assignmentId: 'A-TASK-FIXTURE',
    taskId: 'TASK-FIXTURE',
    requirementIds: ['REQ-001'],
    anchors: [{
      planSha256: hash, sectionHeading: 'Fix',
      lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001',
    }],
    dependencies: [],
    sourceOfTruthPaths: [],
    ownedPaths: [fixtureDir],
    forbiddenPaths: [],
    allowedTools: [],
    acceptanceCriteria: [{
      criterionId: 'CR-001', claim: 'Add works', evidenceProfile: 'focused',
      binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Fix', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
    }],
    modelTier: 'standard' as const,
    riskTier: 'high' as const,
    tokenBudget: 100000,
    timeBudgetMs: 600000,
    costBudgetUsd: 0.5,
    verificationCommands: [{
      executable: 'node',
      args: ['--input-type=module', '-e',
        `import('./src/index.js').then(m => process.exit(m.add(2,3) === 5 ? 0 : 1))`,
      ],
      cwd: fixtureDir,
    }],
    escalationConditions: [],
    receiptContractSha256: hash,
  };

  return {
    status: 'EXECUTING',
    plan: {
      schema: 'harness/portable-plan',
      version: 3 as const,
      planId: 'fixture-plan',
      original: {
        artifactId: 'PLAN-FIXTURE', planId: 'fixture-plan', sourceKind: 'chat_plan_artifact' as const, sourceRef: 'msg-1',
        rawPath: '.agent/plans/fixture/original.md', sha256: hash, bytes: 100,
        capturedAt: '2026-07-27T00:00:00.000Z', status: 'ADOPTED' as const,
        repositoryBaseline: { commit: 'a', branch: 'main', dirtyFingerprint: hash },
        repositoryIdentity: 'agent-rules', hostTask: { host: 'codex', taskRef: 't1', sessionRef: 's1' },
        authorIdentity: 'planner', ownerIdentity: 'owner', approvalEvent: 'approved',
        supersedes: [], supplements: [], derivedFrom: [],
      },
      projectionSha256: hash, objective: 'fix add', scope: { in: [fixtureDir], out: [] },
      decisions: [], assumptions: [], knownUnknowns: [],
      taskDag: [
        { taskId: 'TASK-FIXTURE', requirementIds: ['REQ-001'], criterionIds: ['CR-001'], dependencies: [] },
      ],
      ownedPaths: [fixtureDir], forbiddenPaths: [], evidenceProfiles: ['focused'],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS' as const, reconciliationSha256: hash,
      },
      requirements: [{
        requirementId: 'REQ-001', statement: 'Fix the add function',
        acceptanceCriteria: [{
          criterionId: 'CR-001', claim: 'Add works', evidenceProfile: 'focused',
          binding: { kind: 'plan-anchor' as const, anchor: { planSha256: hash, sectionHeading: 'Fix', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
        }],
      }],
      anchors: [{ planSha256: hash, sectionHeading: 'Fix', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    },
    planAnchors: [{ planSha256: hash, sectionHeading: 'Fix', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-FIXTURE'] }],
    amendments: [],
    assignments: [assign],
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
}

function multiTaskLedger(fixtureADir: string, fixtureBDir: string): WorkLedger {
  const assignA: TaskAssignment = {
    assignmentId: 'A-TASK-A', taskId: 'TASK-A',
    requirementIds: ['REQ-001'], dependencies: [],
    anchors: [{ planSha256: hash, sectionHeading: 'A', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    sourceOfTruthPaths: [], ownedPaths: [fixtureADir], forbiddenPaths: [], allowedTools: [],
    acceptanceCriteria: [{
      criterionId: 'CR-001', claim: 'Do A', evidenceProfile: 'focused',
      binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'A', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
    }],
    modelTier: 'standard' as const, riskTier: 'high' as const,
    tokenBudget: 100000, timeBudgetMs: 600000, costBudgetUsd: 0.5,
    verificationCommands: [{
      executable: 'node',
      args: ['--input-type=module', '-e',
        `import('./src/index.js').then(m => process.exit(m.add(2,3) === 5 ? 0 : 1))`,
      ],
      cwd: fixtureADir,
    }],
    escalationConditions: [], receiptContractSha256: hash,
  };
  const assignB: TaskAssignment = {
    assignmentId: 'A-TASK-B', taskId: 'TASK-B',
    requirementIds: ['REQ-001'], dependencies: ['TASK-A'],
    anchors: [{ planSha256: hash, sectionHeading: 'B', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
    sourceOfTruthPaths: [], ownedPaths: [fixtureBDir], forbiddenPaths: [], allowedTools: [],
    acceptanceCriteria: [{
      criterionId: 'CR-002', claim: 'Do B', evidenceProfile: 'focused',
      binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'B', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
    }],
    modelTier: 'standard' as const, riskTier: 'high' as const,
    tokenBudget: 100000, timeBudgetMs: 600000, costBudgetUsd: 0.5,
    verificationCommands: [{
      executable: 'node',
      args: ['--input-type=module', '-e',
        `import('./src/index.js').then(m => process.exit(m.add(2,3) === 5 ? 0 : 1))`,
      ],
      cwd: fixtureBDir,
    }],
    escalationConditions: [], receiptContractSha256: hash,
  };

  return {
    status: 'EXECUTING',
    plan: {
      schema: 'harness/portable-plan', version: 3 as const, planId: 'multi-plan',
      original: {
        artifactId: 'PLAN-MULTI', planId: 'multi-plan', sourceKind: 'chat_plan_artifact' as const, sourceRef: 'msg-1',
        rawPath: '.agent/plans/multi/original.md', sha256: hash, bytes: 100,
        capturedAt: '2026-07-27T00:00:00.000Z', status: 'ADOPTED' as const,
        repositoryBaseline: { commit: 'a', branch: 'main', dirtyFingerprint: hash },
        repositoryIdentity: 'agent-rules', hostTask: { host: 'codex', taskRef: 't1', sessionRef: 's1' },
        authorIdentity: 'planner', ownerIdentity: 'owner', approvalEvent: 'approved',
        supersedes: [], supplements: [], derivedFrom: [],
      },
      projectionSha256: hash, objective: 'multi', scope: { in: [fixtureADir, fixtureBDir], out: [] },
      decisions: [], assumptions: [], knownUnknowns: [],
      taskDag: [
        { taskId: 'TASK-A', requirementIds: ['REQ-001'], criterionIds: ['CR-001'], dependencies: [] },
        { taskId: 'TASK-B', requirementIds: ['REQ-001'], criterionIds: ['CR-002'], dependencies: ['TASK-A'] },
      ],
      ownedPaths: [fixtureADir, fixtureBDir], forbiddenPaths: [], evidenceProfiles: ['focused'],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS' as const, reconciliationSha256: hash,
      },
      requirements: [
        { requirementId: 'REQ-001', statement: 'Do task', acceptanceCriteria: [{ criterionId: 'CR-001', claim: 'Do A', evidenceProfile: 'focused', binding: { kind: 'plan-anchor' as const, anchor: { planSha256: hash, sectionHeading: 'A', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } } }, { criterionId: 'CR-002', claim: 'Do B', evidenceProfile: 'focused', binding: { kind: 'plan-anchor' as const, anchor: { planSha256: hash, sectionHeading: 'B', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } } }] },
      ],
      anchors: [
        { planSha256: hash, sectionHeading: 'A', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' },
        { planSha256: hash, sectionHeading: 'B', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' },
      ],
    },
    planAnchors: [
      { planSha256: hash, sectionHeading: 'A', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' },
      { planSha256: hash, sectionHeading: 'B', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' },
    ],
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: ['TASK-A', 'TASK-B'] }],
    amendments: [],
    assignments: [assignA, assignB],
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
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Long-task eval', () => {
  describe('Fixture repo worker', () => {
    it('detects and reports diff', async () => {
      const fixtureDir = setupFixture();
      const worker = new FixtureRepoWorker(fixtureDir);

      const detection = await worker.detect();
      expect(detection.available).toBe(true);
      expect(detection.version).toBe('fixture-v1');

      const health = await worker.health();
      expect(health.ok).toBe(true);

      const assign: TaskAssignment = {
        assignmentId: 'A-TEST', taskId: 'TASK-TEST',
        requirementIds: ['REQ-001'], dependencies: [],
        anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' }],
        sourceOfTruthPaths: [], ownedPaths: [fixtureDir], forbiddenPaths: [], allowedTools: [],
        acceptanceCriteria: [{
          criterionId: 'CR-001', claim: 'test', evidenceProfile: 'focused',
          binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: 'REQ-001' } },
        }],
        modelTier: 'standard' as const, riskTier: 'high' as const,
        tokenBudget: 100000, timeBudgetMs: 600000, costBudgetUsd: 0.5,
        verificationCommands: [], escalationConditions: [], receiptContractSha256: hash,
      };

      const { jobId } = await worker.submit(assign);
      expect(jobId).toBeTruthy();

      const receipt = await worker.collectReceipt(jobId);
      expect(receipt.receiptId).toBeTruthy();
      expect(receipt.assignmentId).toBe('A-TEST');
      expect(receipt.workerIdentity).toBe('fixture-repo-worker');
      expect(receipt.diffSha256).toBeTruthy();
      expect(receipt.filesChanged.length).toBeGreaterThan(0);
      expect(receipt.filesChanged.some((f) => f.includes('index.js'))).toBe(true);

      const validation = validateReceipt(receipt);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Controller runTask', () => {
    it('dispatches worker that modifies fixture repo', async () => {
      const fixtureDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(stubLedger(fixtureDir), null, 2));

      const controller = new Controller(ledgerPath);
      const worker = new FixtureRepoWorker(fixtureDir);
      const verifier = new IndependentVerifier();

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-FIXTURE');
      controller.startWork(assignmentId!);

      const { jobId } = await worker.submit(controller['getAssignment'](assignmentId!)!);
      const receipt = await worker.collectReceipt(jobId);
      await controller.submitReceipt(assignmentId!, receipt);

      const content = fixtureContent(fixtureDir);
      expect(content).toContain('a + b');
      expect(content).not.toContain('a * b');
    });

    it('independent verifier confirms the diff, behavior, and evidence', async () => {
      const fixtureDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(stubLedger(fixtureDir), null, 2));

      const controller = new Controller(ledgerPath);
      const worker = new FixtureRepoWorker(fixtureDir);
      const verifier = new IndependentVerifier();

      const assignmentId = await controller.dispatchNext();
      expect(assignmentId).toBe('A-TASK-FIXTURE');
      controller.startWork(assignmentId!);

      const assignment = controller['getAssignment'](assignmentId!)!;
      const { jobId } = await worker.submit(assignment);
      const receipt = await worker.collectReceipt(jobId);
      await controller.submitReceipt(assignmentId!, receipt);

      const evidence = {
        source: 'verifier' as const,
        probeCommand: 'check-add',
        probeExitCode: 0,
        evidenceUris: ['file:///tmp/evidence'],
        evidenceHashes: [receipt.diffSha256 ?? hash as Sha256],
        rawOutput: JSON.stringify({ result: 'add function fixed' }),
      };

      const result = await verifier.verify(receipt, evidence);
      expect(result.passed).toBe(true);
      expect(result.independent).toBe(true);
      expect(result.fingerprint).toBeTruthy();
      expect(result.evidence).toBeDefined();
      expect(result.scope).toBe('focused');
    });

    it('seeded implementation defect causes controller to detect failure', async () => {
      const fixtureDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(stubLedger(fixtureDir), null, 2));

      const controller = new Controller(ledgerPath);
      const worker = new FixtureRepoWorker(fixtureDir, true);
      const verifier = new IndependentVerifier();

      const result = await controller.runTask('A-TASK-FIXTURE', worker, verifier);
      expect(result.success).toBe(false);
      expect(result.state).toBe('CLOSED_FAILED');
    });

    it('remediation loop reopens repair, re-dispatches, re-verifies', async () => {
      const fixtureDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(stubLedger(fixtureDir), null, 2));

      const controller = new Controller(ledgerPath);
      const badWorker = new FixtureRepoWorker(fixtureDir, true);
      const goodWorker = new FixtureRepoWorker(fixtureDir);
      const verifier = new IndependentVerifier();

      const firstResult = await controller.runTask('A-TASK-FIXTURE', badWorker, verifier);
      expect(firstResult.success).toBe(false);

      const failedState = controller.getTaskState('A-TASK-FIXTURE');
      expect(failedState).toBe('CLOSED_FAILED');

      const contentAfterDefect = fixtureContent(fixtureDir);
      expect(contentAfterDefect).toContain('a - b');

      await controller.retry('A-TASK-FIXTURE');
      expect(controller.getTaskState('A-TASK-FIXTURE')).toBe('PENDING');

      const secondResult = await controller.runTask('A-TASK-FIXTURE', goodWorker, verifier);
      expect(secondResult.success).toBe(true);

      const contentAfterFix = fixtureContent(fixtureDir);
      expect(contentAfterFix).toContain('a + b');
    });
  });

  describe('runFullPlan', () => {
    it('completes entire DAG automatically', async () => {
      const fixtureADir = setupFixture();
      const fixtureBDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(multiTaskLedger(fixtureADir, fixtureBDir), null, 2));

      const controller = new Controller(ledgerPath);
      const workerA = new FixtureRepoWorker(fixtureADir);
      const workerB = new FixtureRepoWorker(fixtureBDir);
      const verifier = new IndependentVerifier();

      let callCount = 0;
      const proxiedWorker: typeof workerA = {
        async detect() { return { available: true }; },
        async health() { return { ok: true }; },
        async submit(assignment: TaskAssignment) {
          const w = callCount === 0 ? workerA : workerB;
          callCount++;
          return w.submit(assignment);
        },
        async cancel(jobId: string) { return workerA.cancel(jobId); },
        async collectReceipt(jobId: string) {
          const w = callCount === 1 ? workerA : workerB;
          return w.collectReceipt(jobId);
        },
      };

      const result = await controller.runFullPlan(proxiedWorker, verifier);
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);

      expect(controller.getTaskState('A-TASK-A')).toBe('CLOSED_MATCH');
      expect(controller.getTaskState('A-TASK-B')).toBe('CLOSED_MATCH');
    });
  });

  describe('checkpoint/resume', () => {
    it('saves state to JSON, loads from JSON, continues', async () => {
      const fixtureDir = setupFixture();
      const ledgerPath = path.join(tmpDir(), 'ledger.json');
      fs.writeFileSync(ledgerPath, JSON.stringify(stubLedger(fixtureDir), null, 2));

      const controller1 = new Controller(ledgerPath);
      const worker = new FixtureRepoWorker(fixtureDir);
      const verifier = new IndependentVerifier();

      const assignmentId = await controller1.dispatchNext();
      expect(assignmentId).toBe('A-TASK-FIXTURE');
      controller1.startWork(assignmentId!);

      const revision = await controller1.checkpoint();
      expect(revision).toBeTruthy();

      const controller2 = new Controller(ledgerPath);
      await controller2.resume(revision!);

      expect(controller2.getTaskState(assignmentId!)).toBe('IN_PROGRESS');

      const assignment = controller2['getAssignment'](assignmentId!)!;
      const { jobId } = await worker.submit(assignment);
      const receipt = await worker.collectReceipt(jobId);
      await controller2.submitReceipt(assignmentId!, receipt);

      const evidence = {
        source: 'verifier' as const,
        probeCommand: 'check-add',
        probeExitCode: 0,
        evidenceUris: ['file:///tmp/evidence'],
        evidenceHashes: [receipt.diffSha256 ?? hash as Sha256],
      };
      const result = await verifier.verify(receipt, evidence);
      expect(result.passed).toBe(true);

      await controller2.verifyReceipt(assignmentId!, true);
      expect(controller2.getTaskState(assignmentId!)).toBe('CLOSED_MATCH');
    });
  });
});
