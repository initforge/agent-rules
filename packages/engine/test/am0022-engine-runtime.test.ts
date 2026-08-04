import { describe, expect, it } from 'vitest';
import type { TaskAssignment, WorkerReceipt } from '../src/contracts.js';
import {
  AM22_SCHEDULER_PROFILES,
  poolCeilingsForSchedulerProfile,
  type ReadySetResult,
} from '../src/dispatch-ready-set.js';
import { assertCoordinatorOnlyContract, COORDINATOR_ONLY_CONTRACT } from '../src/coordinator-contract.js';
import { validateProjectionFidelity } from '../src/projection-fidelity.js';
import { SemanticWatchdog } from '../src/watchdog.js';
import { runExecutionRuntime, type ExecutionControllerPort } from '../src/execution-runtime.js';

const sha = 'a'.repeat(64);
const receiptSha = 'b'.repeat(64);

const assignment: TaskAssignment = {
  assignmentId: 'A1',
  taskId: 'T1',
  requirementIds: ['M11-R54'],
  anchors: [],
  dependencies: [],
  sourceOfTruthPaths: ['.agent/current.json'],
  ownedPaths: ['src/feature.ts'],
  forbiddenPaths: ['generated/**'],
  allowedTools: ['edit'],
  acceptanceCriteria: [],
  modelTier: 'standard',
  riskTier: 'medium',
  tokenBudget: 1,
  timeBudgetMs: 1_000,
  costBudgetUsd: 0,
  verificationCommands: [],
  escalationConditions: [],
  receiptContractSha256: sha,
};

const workerReceipt: WorkerReceipt = {
  receiptId: 'receipt-A1',
  assignmentId: 'A1',
  workerIdentity: 'worker-A1',
  host: 'fixture',
  model: 'host-policy',
  diffSha256: receiptSha,
  artifactUris: ['artifact://diff'],
  artifactHashes: [receiptSha],
  filesChanged: ['src/feature.ts'],
  commands: [],
  exitCodes: [],
  logUris: [],
  logHashes: [],
  testEvidenceUris: ['artifact://test'],
  testEvidenceHashes: [receiptSha],
  startedAt: '2026-08-03T00:00:00.000Z',
  completedAt: '2026-08-03T00:00:01.000Z',
};

function ready(ids: string[]): ReadySetResult {
  return {
    ready: ids,
    waitingClosure: [],
    usage: { total: ids.length, writers: ids.length, verifiers: 0, reviewers: 0, integration: 0, browser: 0, build: 0, compose: 0 },
    rejectedConflicts: [],
    deferredByPool: [],
    belowTargetReasons: ids.length === 0 ? [{ code: 'GRAPH_EXHAUSTED', detail: 'done', taskIds: [] }] : [],
  };
}

class FixtureController implements ExecutionControllerPort {
  state = 'PENDING';
  checkpoints = 0;
  getLedger() { return { assignments: [assignment] }; }
  getTaskState() { return this.state; }
  setExecutionGraph() {}
  setPoolCeilings() {}
  async dispatchReadySet() { return this.state === 'PENDING' ? ready(['A1']) : ready([]); }
  startWork() { this.state = 'IN_PROGRESS'; }
  async submitReceipt() { this.state = 'UNDER_REVIEW'; }
  async verifyReceipt(_id: string, passed: boolean) { this.state = passed ? 'CLOSED_MATCH' : 'CLOSED_FAILED'; }
  async cancel() { this.state = 'CLOSED_FAILED'; }
  async checkpoint() { this.checkpoints++; return String(this.checkpoints); }
}

describe('AM-0022 engine convergence', () => {
  it('locks the exact normal and burst meaningful-role profiles', () => {
    expect(AM22_SCHEDULER_PROFILES.normal).toEqual({ total: 8, writers: 4, verifiers: 2, reviewers: 1, integration: 1 });
    expect(AM22_SCHEDULER_PROFILES.burst).toEqual({ total: 10, writers: 5, verifiers: 2, reviewers: 2, integration: 1 });
    expect(poolCeilingsForSchedulerProfile('normal').total).toBe(8);
    expect(poolCeilingsForSchedulerProfile('burst').total).toBe(10);
  });

  it('fails coordinator and projection policy closed', () => {
    expect(() => assertCoordinatorOnlyContract(COORDINATOR_ONLY_CONTRACT)).not.toThrow();
    const projection = validateProjectionFidelity({
      active: { planId: 'p', effectivePlanSha256: sha, ledgerRevision: 61, headSha256: sha },
      requiredProjectionNames: ['contract'],
      projections: [{ name: 'contract', planId: 'p', effectivePlanSha256: receiptSha, ledgerRevision: 61, headSha256: sha, complete: true }],
    });
    expect(projection.valid).toBe(false);
  });

  it('diagnoses once, then aborts one exact stalled assignment', () => {
    const watchdog = new SemanticWatchdog('A1', 0, { softStallMs: 10, hardStallMs: 20, pollIntervalMs: 1, maxReassignments: 1 });
    expect(watchdog.observe({ cursor: 'c1', phase: 'code', observedAt: 0 }, 0).action).toBe('continue');
    expect(watchdog.observe({ cursor: 'c1', phase: 'code', observedAt: 10 }, 10).action).toBe('diagnose');
    expect(watchdog.observe({ cursor: 'c1', phase: 'code', observedAt: 20 }, 20).action).toBe('abort-reassign');
  });

  it('composes native dispatch, independent verification, checkpoint and integration', async () => {
    const controller = new FixtureController();
    const result = await runExecutionRuntime({
      planId: 'plan-1',
      runId: 'run-1',
      objective: 'prove the vertical runtime',
      ledgerPath: '.agent/ledger.json',
      effectivePlanSha256: sha,
      candidateEpochSha256: receiptSha,
      ledgerRevision: 61,
      graph: { nodes: [{ id: 'A1', kind: 'writer', ownedPaths: ['src/feature.ts'] }] },
      projectionProvider: {
        async load() {
          return {
            active: { planId: 'plan-1', effectivePlanSha256: sha, ledgerRevision: 61, headSha256: sha },
            requiredProjectionNames: ['contract'],
            projections: [{ name: 'contract', planId: 'plan-1', effectivePlanSha256: sha, ledgerRevision: 61, headSha256: sha, complete: true }],
          };
        },
      },
      adapter: {
        id: 'fixture-native',
        enforcement: 'ENGINE_ENFORCED',
        capabilities: { nativeChildren: true, semanticProgress: true, exactProcessGroupCancel: true, partialCheckpoint: true },
        async dispatch() { return { assignmentId: 'A1', childIdentity: 'child-1', initialProgress: { cursor: 'start', phase: 'dispatch', observedAt: 0 } }; },
        async collect() { return { receipt: workerReceipt }; },
        async observeSemanticProgress() { return { cursor: 'done', phase: 'complete', observedAt: 1 }; },
        async diagnose() {},
        async checkpointPartial() {},
        async cancel() {},
      },
      verifier: {
        identity: 'verifier-1',
        async verify() {
          return { passed: true, proofs: [{ claimId: 'M11-R54', command: 'fixture', exitCode: 0, sha256: receiptSha, uri: 'artifact://test' }] };
        },
      },
      integrationTrain: { async integrate() { return { receiptSha256: receiptSha }; } },
      broker: { async decide() { return { action: 'normal' }; } },
      controllerFactory: () => controller,
      now: () => 1,
      sleep: async () => {},
    });

    expect(result.outcome).toBe('PASS');
    expect(result.profile).toBe('normal');
    expect(result.watchdogEnforcement).toBe('ENFORCED');
    expect(result.integrationReceiptSha256).toBe(receiptSha);
    expect(result.reviewBundle.outcome).toBe('PASS');
    expect(controller.checkpoints).toBeGreaterThan(0);
  });
});
