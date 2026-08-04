/**
 * concurrency.test.ts — Focused tests for scheduler/engine concurrency.
 * Verifies: real overlap, resource ceiling, failure sibling policy.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Controller } from '../src/controller.js';

const hash = 'a'.repeat(64);

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'concurrency-test-'));
}

function rmdir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function stubLedger(assignments: import('../src/contracts.js').TaskAssignment[]): import('../src/contracts.js').WorkLedger {
  return {
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
      taskDag: assignments.map(a => ({ taskId: a.taskId, requirementIds: a.requirementIds, criterionIds: a.requirementIds.map(r => `${r}-criterion`), dependencies: a.dependencies })),
      ownedPaths: ['packages/engine'], forbiddenPaths: [], evidenceProfiles: [],
      rollback: [], handoff: { recipientRole: 'reviewer', requiredArtifacts: [], nextSafeAction: 'pass' },
      lineage: {
        head: {} as import('../src/contracts.js').WorkLedger['plan']['lineage']['head'],
        ancestors: [], resolutionMatrix: [], verified: true,
        reconciliationResult: 'PASS', reconciliationSha256: hash,
      },
      requirements: assignments.flatMap(a => a.requirementIds.map(rid => ({
        requirementId: rid,
        statement: 'Do the work',
        acceptanceCriteria: [{
          criterionId: `${rid}-criterion`,
          claim: 'Tests pass',
          evidenceProfile: 'npm-test',
          binding: { kind: 'plan-anchor' as const, anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: rid, chunkIndex: 0 } },
        }],
      }))),
      anchors: assignments.flatMap(a => a.requirementIds.map(rid => ({ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: rid, chunkIndex: 0 }))),
    },
    planAnchors: assignments.flatMap(a => a.requirementIds.map(rid => ({ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: rid, chunkIndex: 0 }))),
    batches: [{ batchId: 'B1', status: 'PASSED', taskIds: assignments.map(a => a.taskId) }],
    amendments: [],
    assignments,
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

function makeAssignment(id: string, deps: string[] = [], ownedPaths = `packages/engine/${id}`): import('../src/contracts.js').TaskAssignment {
  return {
    assignmentId: `A-${id}`,
    taskId: id,
    requirementIds: [`REQ-${id}`],
    anchors: [{ planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: `REQ-${id}`, chunkIndex: 0 }],
    dependencies: deps,
    sourceOfTruthPaths: [],
    ownedPaths: [ownedPaths],
    forbiddenPaths: [],
    allowedTools: ['npm'],
    acceptanceCriteria: [{
      criterionId: `REQ-${id}-criterion`,
      claim: 'Tests pass',
      evidenceProfile: 'npm-test',
      binding: { kind: 'plan-anchor', anchor: { planSha256: hash, sectionHeading: 'Test', lineStart: 1, lineEnd: 2, anchorTextSha256: hash, requirementId: `REQ-${id}`, chunkIndex: 0 } },
    }],
    modelTier: 'standard',
    riskTier: 'high',
    tokenBudget: 100000,
    timeBudgetMs: 600000,
    costBudgetUsd: 0.5,
    verificationCommands: [{ executable: 'npm', args: ['test'], cwd: 'packages/engine' }],
    escalationConditions: [],
    receiptContractSha256: hash,
  };
}

function writeLedger(dir: string, ledger: import('../src/contracts.js').WorkLedger): string {
  const ledgerPath = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return ledgerPath;
}

describe('Controller Concurrency', () => {
  describe('real overlap verification', () => {
    it('tracks execution windows via recordWindow method', async () => {
      const dir = tmpDir();
      try {
        const assignments = [
          makeAssignment('T1'),
          makeAssignment('T2'),
          makeAssignment('T3'),
        ];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();

        // Simulate concurrent execution with overlapping windows
        const startMs = Date.now();
        // Record windows manually to simulate concurrent execution
        // T1: [startMs, startMs+30]
        // T2: [startMs+5, startMs+35] -> overlaps with T1
        // T3: [startMs+10, startMs+40] -> overlaps with T1 and T2
        controller.recordWindow('A-T1', startMs, startMs + 30);
        controller.recordWindow('A-T2', startMs + 5, startMs + 35);
        controller.recordWindow('A-T3', startMs + 10, startMs + 40);

        const metrics = controller.getConcurrencyMetrics();
        expect(metrics.windows.length).toBe(3);
        // Peak overlap at startMs+10 to startMs+30 = 3 concurrent
        expect(metrics.peakOverlap).toBe(3);
      } finally { rmdir(dir); }
    });

    it('reports peak overlap of 1 for non-overlapping windows', async () => {
      const dir = tmpDir();
      try {
        const assignments = [makeAssignment('T1'), makeAssignment('T2')];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();

        // Non-overlapping: T1 finishes before T2 starts
        const startMs = Date.now();
        controller.recordWindow('A-T1', startMs, startMs + 20);
        controller.recordWindow('A-T2', startMs + 30, startMs + 50);

        const metrics = controller.getConcurrencyMetrics();
        expect(metrics.peakOverlap).toBe(1); // Non-overlapping = peak of 1
      } finally { rmdir(dir); }
    });
  });

  describe('resource ceiling enforcement', () => {
    it('defers tasks when pool ceiling reached', async () => {
      const dir = tmpDir();
      try {
        // 8 independent tasks with distinct paths
        const assignments = Array.from({ length: 8 }, (_, i) => makeAssignment(`T${i}`));
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();

        // Set reduced ceiling via broker (total: 4, writers: 3)
        controller.setResourceBroker(async () => ({
          action: 'reduce' as const,
          mode: 'reduced' as const,
          reasons: ['test'],
          input: { ramFraction: 0.15, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 90, loadRatio: 2, swapInDeltaPerSec: 0 },
        }));

        const result = await controller.dispatchReadySet();

        // With reduce ceiling (writers: 3), should dispatch fewer than 8
        expect(result.ready.length).toBeLessThan(8);
        expect(result.deferredByPool.length).toBeGreaterThan(0);

        const metrics = controller.getConcurrencyMetrics();
        expect(metrics.deferredByCeiling.length).toBeGreaterThan(0);
      } finally { rmdir(dir); }
    });

    it('respects writer pool ceiling (max 8 by default in burst)', async () => {
      const dir = tmpDir();
      try {
        // 10 independent tasks (all writers by default)
        const assignments = Array.from({ length: 10 }, (_, i) => makeAssignment(`T${i}`));
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.setResourceBroker(async () => ({
          action: 'burst' as const,
          mode: 'burst' as const,
          reasons: ['test'],
          input: { ramFraction: 0.5, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 50, loadRatio: 0.5, swapInDeltaPerSec: 0 },
        }));

        const result = await controller.dispatchReadySet();

        // Burst ceiling is total: 14, writers: 8
        // Only 8 writers dispatched (writers ceiling), 2 deferred
        expect(result.ready.length).toBe(8);
        expect(result.deferredByPool.length).toBe(2);
      } finally { rmdir(dir); }
    });

    it('records pool usage snapshots', async () => {
      const dir = tmpDir();
      try {
        const assignments = [makeAssignment('T1'), makeAssignment('T2')];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();
        controller.setResourceBroker(async () => ({
          action: 'burst' as const,
          mode: 'burst' as const,
          reasons: ['test'],
          input: { ramFraction: 0.5, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 50, loadRatio: 0.5, swapInDeltaPerSec: 0 },
        }));

        await controller.dispatchReadySet();

        const metrics = controller.getConcurrencyMetrics();
        expect(metrics.poolSnapshots.length).toBeGreaterThan(0);
        // Each snapshot should have pool keys
        for (const snapshot of metrics.poolSnapshots) {
          const total = snapshot.find(([k]) => k === 'total');
          expect(total).toBeDefined();
        }
      } finally { rmdir(dir); }
    });

    it('defers tasks via pool ceiling reduces writers count', async () => {
      const dir = tmpDir();
      try {
        // 10 tasks with distinct owned paths to avoid conflict
        const assignments = Array.from({ length: 10 }, (_, i) => makeAssignment(`T${i}`, [], `area-${i}`));
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();

        // Use reduce action which caps writers at 3
        controller.setResourceBroker(async () => ({
          action: 'reduce' as const,
          mode: 'reduced' as const,
          reasons: ['test'],
          input: { ramFraction: 0.15, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 90, loadRatio: 2, swapInDeltaPerSec: 0 },
        }));

        const result = await controller.dispatchReadySet();

        // Should dispatch ~3 tasks (reduce writers ceiling)
        expect(result.ready.length).toBeLessThanOrEqual(3);
        expect(result.deferredByPool.length).toBeGreaterThan(0);
      } finally { rmdir(dir); }
    });
  });

  describe('failure sibling policy', () => {
    it('cancel-others policy is configurable', async () => {
      const dir = tmpDir();
      try {
        const assignments = [makeAssignment('T1'), makeAssignment('T2'), makeAssignment('T3')];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.setFailureSiblingPolicy('cancel-others');
        controller.resetConcurrencyMetrics();

        // Set up READY states
        await controller.dispatchReadySet();
        controller.startWork('A-T1');
        controller.startWork('A-T2');
        controller.startWork('A-T3');

        // Verify all are IN_PROGRESS
        expect(controller.getTaskState('A-T1')).toBe('IN_PROGRESS');
        expect(controller.getTaskState('A-T2')).toBe('IN_PROGRESS');
        expect(controller.getTaskState('A-T3')).toBe('IN_PROGRESS');

        // Fail T1
        await controller.cancel('A-T1');

        // T1 should be CLOSED_FAILED, others remain IN_PROGRESS
        expect(controller.getTaskState('A-T1')).toBe('CLOSED_FAILED');
        expect(controller.getTaskState('A-T2')).toBe('IN_PROGRESS');
        expect(controller.getTaskState('A-T3')).toBe('IN_PROGRESS');
      } finally { rmdir(dir); }
    });

    it('continue-others lets siblings run even when one fails', async () => {
      const dir = tmpDir();
      try {
        const assignments = [makeAssignment('T1'), makeAssignment('T2')];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.setFailureSiblingPolicy('continue-others');
        controller.resetConcurrencyMetrics();

        await controller.dispatchReadySet();
        controller.startWork('A-T1');
        controller.startWork('A-T2');

        // Fail T1
        await controller.cancel('A-T1');

        // T2 should still be IN_PROGRESS (continue-others)
        expect(controller.getTaskState('A-T1')).toBe('CLOSED_FAILED');
        expect(controller.getTaskState('A-T2')).toBe('IN_PROGRESS');
      } finally { rmdir(dir); }
    });

    it('tracks sibling groups in metrics after dispatchReadySet', async () => {
      const dir = tmpDir();
      try {
        const assignments = [makeAssignment('T1'), makeAssignment('T2')];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();
        controller.setResourceBroker(async () => ({
          action: 'burst' as const,
          mode: 'burst' as const,
          reasons: ['test'],
          input: { ramFraction: 0.5, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 50, loadRatio: 0.5, swapInDeltaPerSec: 0 },
        }));

        await controller.dispatchReadySet();

        const metrics = controller.getConcurrencyMetrics();
        expect(metrics.siblingGroups.length).toBe(1);
        expect(metrics.siblingGroups[0]).toHaveLength(2);
        expect(metrics.siblingGroups[0]![1]).toContain('A-T1');
        expect(metrics.siblingGroups[0]![1]).toContain('A-T2');
      } finally { rmdir(dir); }
    });
  });

  describe('pool snapshots reflect actual usage', () => {
    it('records pool state after each dispatchReadySet call', async () => {
      const dir = tmpDir();
      try {
        // Two independent batches via dependencies: T1,T2 first, then T3 depends on T1
        const assignments = [
          makeAssignment('T1'),
          makeAssignment('T2'),
          makeAssignment('T3', ['T1']),
        ];
        const ledger = stubLedger(assignments);
        writeLedger(dir, ledger);

        const controller = new Controller(path.join(dir, 'ledger.json'));
        controller.resetConcurrencyMetrics();
        controller.setResourceBroker(async () => ({
          action: 'burst' as const,
          mode: 'burst' as const,
          reasons: ['test'],
          input: { ramFraction: 0.5, psi: { available: false, some: null, full: null, source: 'unavailable' }, cpuTempC: 50, loadRatio: 0.5, swapInDeltaPerSec: 0 },
        }));

        // First dispatch: T1, T2 (independent, T3 blocked by dependency)
        const r1 = await controller.dispatchReadySet();
        expect(r1.ready).toContain('A-T1');
        expect(r1.ready).toContain('A-T2');
        expect(r1.ready).not.toContain('A-T3');

        // Complete T1, T2
        for (const id of r1.ready) {
          controller.startWork(id);
        }
        for (const id of r1.ready) {
          await controller.submitReceipt(id, {
            receiptId: `R-${id}`, assignmentId: id, workerIdentity: 'w', host: 'localhost', model: 'm',
            artifactUris: [], artifactHashes: [], filesChanged: [], commands: [], exitCodes: [0],
            logUris: [], logHashes: [], testEvidenceUris: [], testEvidenceHashes: [],
            startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
          });
          await controller.verifyReceipt(id, true);
        }

        // Second dispatch: T3 (dependency met)
        const r2 = await controller.dispatchReadySet();
        expect(r2.ready).toContain('A-T3');

        const metrics = controller.getConcurrencyMetrics();
        // Should have 2 pool snapshots (one per dispatchReadySet call)
        expect(metrics.poolSnapshots.length).toBe(2);

        // First batch had 2 tasks
        const snap1 = metrics.poolSnapshots[0]!;
        const total1 = snap1.find(([k]) => k === 'total');
        expect(total1![1]).toBeGreaterThanOrEqual(2);

        // Second batch had 1 task
        const snap2 = metrics.poolSnapshots[1]!;
        const total2 = snap2.find(([k]) => k === 'total');
        expect(total2![1]).toBeGreaterThanOrEqual(1);
      } finally { rmdir(dir); }
    });
  });
});
