import type { TaskAssignment, WorkerReceipt } from './contracts.js';
import { Controller } from './controller.js';
import type { ExecutionGraph, PoolCeilings, ReadySetResult, SchedulerProfile } from './dispatch-ready-set.js';
import { poolCeilingsForSchedulerProfile } from './dispatch-ready-set.js';
import { getResourceBroker, schedulerProfileForAction, type BrokerAction } from './resource-broker.js';
import {
  COORDINATOR_ONLY_CONTRACT,
  assertCoordinatorOnlyContract,
  type CoordinatorOnlyContract,
} from './coordinator-contract.js';
import {
  ensureProjectionFidelity,
  type ActiveProjectionProvider,
} from './projection-fidelity.js';
import {
  DEFAULT_SEMANTIC_WATCHDOG_CONFIG,
  type SemanticProgressObservation,
  type SemanticWatchdogConfig,
} from './watchdog.js';
import {
  createReviewBundle,
  type ReviewBundle,
  type ReviewBundleProof,
  type ReviewBundleRisk,
} from './review-bundle.js';
import {
  runWithHostWatchdog,
  runWithInlineWatchdog,
  hasWatchdogCapabilities,
} from './host-kit/runtime/runtime-caller.js';
import type { HostChildResult } from './host-kit/runtime/types.js';

export type RuntimeOutcome = 'PASS' | 'PARTIAL' | 'BLOCKED';

export interface NativeChildHandle {
  readonly assignmentId: string;
  readonly childIdentity: string;
  readonly processGroupId?: string;
  /** Native process ID (set by adapter on dispatch for process-group management). */
  readonly pid?: number;
  readonly initialProgress: SemanticProgressObservation;
}

export interface NativeChildResult {
  readonly receipt: WorkerReceipt;
  readonly finalProgress?: SemanticProgressObservation;
}

/** Provider-neutral depth-one native-child boundary. */
export interface NativeExecutionAdapter {
  readonly id: string;
  readonly enforcement: 'ENGINE_ENFORCED' | 'HOST_CONFIG_ENFORCED' | 'PROMPT_ENFORCED_PREVIEW' | 'UNVERIFIED';
  readonly capabilities: {
    readonly nativeChildren: boolean;
    readonly semanticProgress: boolean;
    readonly exactProcessGroupCancel: boolean;
    readonly partialCheckpoint: boolean;
  };
  dispatch(assignment: TaskAssignment, attempt: number): Promise<NativeChildHandle>;
  collect(handle: NativeChildHandle): Promise<NativeChildResult>;
  observeSemanticProgress?(handle: NativeChildHandle): Promise<SemanticProgressObservation | null>;
  diagnose?(handle: NativeChildHandle): Promise<void>;
  checkpointPartial?(handle: NativeChildHandle, reason: string): Promise<void>;
  cancel?(handle: NativeChildHandle, reason: string): Promise<void>;
}

export interface IndependentVerifier {
  readonly identity: string;
  verify(assignment: TaskAssignment, receipt: WorkerReceipt): Promise<{
    readonly passed: boolean;
    readonly proofs: readonly ReviewBundleProof[];
    readonly risks?: readonly ReviewBundleRisk[];
  }>;
}

export interface IntegrationTrainPort {
  integrate(input: {
    readonly planId: string;
    readonly runId: string;
    readonly assignments: readonly TaskAssignment[];
    readonly receipts: readonly WorkerReceipt[];
  }): Promise<{ readonly receiptSha256: string }>;
}

export interface ExecutionControllerPort {
  getLedger(): { readonly assignments: readonly TaskAssignment[] } | null;
  getTaskState(assignmentId: string): string | undefined;
  setExecutionGraph(graph: ExecutionGraph): void;
  setPoolCeilings(ceilings: PoolCeilings): void;
  dispatchReadySet(): Promise<ReadySetResult>;
  startWork(assignmentId: string): void;
  submitReceipt(assignmentId: string, receipt: WorkerReceipt): Promise<void>;
  verifyReceipt(assignmentId: string, passed: boolean): Promise<void>;
  cancel(assignmentId: string): Promise<void>;
  checkpoint(): Promise<string>;
}

export interface ExecutionRuntimeInput {
  readonly planId: string;
  readonly runId: string;
  readonly objective: string;
  readonly ledgerPath: string;
  readonly effectivePlanSha256: string;
  readonly candidateEpochSha256: string;
  readonly ledgerRevision: number;
  readonly graph: ExecutionGraph;
  readonly projectionProvider: ActiveProjectionProvider;
  readonly adapter: NativeExecutionAdapter;
  readonly verifier: IndependentVerifier;
  readonly integrationTrain: IntegrationTrainPort;
  readonly requestedProfile?: 'normal' | 'burst';
  readonly coordinatorContract?: CoordinatorOnlyContract;
  readonly broker?: { decide(): Promise<{ readonly action: BrokerAction }> };
  readonly controllerFactory?: (ledgerPath: string) => ExecutionControllerPort;
  readonly watchdog?: Partial<SemanticWatchdogConfig>;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface ExecutionRuntimeResult {
  readonly outcome: RuntimeOutcome;
  readonly profile: SchedulerProfile;
  readonly readySetReceipts: readonly ReadySetResult[];
  readonly workerReceipts: readonly WorkerReceipt[];
  readonly reviewBundle: ReviewBundle;
  readonly integrationReceiptSha256?: string;
  readonly watchdogEnforcement: 'ENFORCED' | 'UNAVAILABLE';
}

function sleepDefault(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runtimeProfile(requested: 'normal' | 'burst', brokerProfile: SchedulerProfile): SchedulerProfile {
  if (brokerProfile === 'paused' || brokerProfile === 'reduced') return brokerProfile;
  return requested === 'burst' && brokerProfile === 'burst' ? 'burst' : 'normal';
}

/**
 * Single AM-0022 vertical transaction. Existing Controller, resource broker,
 * projection fidelity, review bundle and integration train remain the owners of
 * their respective behavior; this runtime only composes them.
 */
export async function runExecutionRuntime(input: ExecutionRuntimeInput): Promise<ExecutionRuntimeResult> {
  assertCoordinatorOnlyContract(input.coordinatorContract ?? COORDINATOR_ONLY_CONTRACT);
  if (!input.adapter.capabilities.nativeChildren) throw new Error(`adapter ${input.adapter.id} has no native-child capability`);

  const projection = await ensureProjectionFidelity(input.projectionProvider);
  const broker = input.broker ?? getResourceBroker();
  const decision = await broker.decide();
  const profile = runtimeProfile(input.requestedProfile ?? 'normal', schedulerProfileForAction(decision.action));
  const controller = input.controllerFactory?.(input.ledgerPath) ?? new Controller(input.ledgerPath);
  const ledger = controller.getLedger();
  if (!ledger) throw new Error(`execution ledger is unavailable: ${input.ledgerPath}`);
  controller.setExecutionGraph(input.graph);
  controller.setPoolCeilings(poolCeilingsForSchedulerProfile(profile));

  const watchdogAvailable = hasWatchdogCapabilities(input.adapter);
  const now = input.now ?? (() => Date.now());
  const sleep = input.sleep ?? sleepDefault;
  const readySetReceipts: ReadySetResult[] = [];
  const workerReceipts: WorkerReceipt[] = [];
  const proofs: ReviewBundleProof[] = [];
  const risks: ReviewBundleRisk[] = [];

  while (true) {
    const ready = await controller.dispatchReadySet();
    readySetReceipts.push(ready);
    if (ready.ready.length === 0) break;

    await Promise.all(ready.ready.map(async (assignmentId) => {
      const assignment = ledger.assignments.find((item) => item.assignmentId === assignmentId);
      if (!assignment) throw new Error(`ready assignment missing from ledger: ${assignmentId}`);
      controller.startWork(assignmentId);
      try {
        // Host watchdog (out-of-band timer + exact process-group cancel)
        // Inline watchdog (in-process semantic progress + process-group cleanup)
        // Basic dispatch only when adapter truly lacks native child capability
        let result: HostChildResult;
        if (watchdogAvailable) {
          result = await runWithHostWatchdog(assignment, input.adapter, controller, {
            config: input.watchdog,
            now,
            sleep,
          });
        } else if (input.adapter.capabilities.nativeChildren) {
          result = await runWithInlineWatchdog(assignment, input.adapter, controller, {
            config: input.watchdog,
            now,
            sleep,
          });
        } else {
          // UNVERIFIED: adapter has no native child capability
          const handle = await input.adapter.dispatch(assignment, 0);
          result = { receipt: (await input.adapter.collect(handle)).receipt };
        }
        await controller.submitReceipt(assignmentId, result.receipt);
        const verification = await input.verifier.verify(assignment, result.receipt);
        proofs.push(...verification.proofs);
        risks.push(...(verification.risks ?? []));
        await controller.verifyReceipt(assignmentId, verification.passed);
        workerReceipts.push(result.receipt);
      } catch (error) {
        await controller.cancel(assignmentId);
        risks.push({
          code: `assignment:${assignmentId}`,
          severity: 'high',
          summary: error instanceof Error ? error.message : String(error),
        });
      }
    }));
    await controller.checkpoint();
  }

  const failed = ledger.assignments.filter((assignment) => controller.getTaskState(assignment.assignmentId) === 'CLOSED_FAILED');
  const unfinished = ledger.assignments.filter((assignment) => {
    const state = controller.getTaskState(assignment.assignmentId);
    return state !== 'CLOSED_MATCH' && state !== 'CLOSED_FAILED';
  });
  let outcome: RuntimeOutcome = failed.length > 0 ? 'PARTIAL' : unfinished.length > 0 ? 'BLOCKED' : 'PASS';
  if (!watchdogAvailable && outcome === 'PASS') outcome = 'PARTIAL';

  let integrationReceiptSha256: string | undefined;
  if (outcome === 'PASS') {
    integrationReceiptSha256 = (await input.integrationTrain.integrate({
      planId: input.planId,
      runId: input.runId,
      assignments: ledger.assignments,
      receipts: workerReceipts,
    })).receiptSha256;
  }

  const reviewBundle = createReviewBundle({
    runId: input.runId,
    planId: input.planId,
    effectivePlanSha256: input.effectivePlanSha256,
    candidateEpochSha256: input.candidateEpochSha256,
    ledgerRevision: input.ledgerRevision,
    objective: input.objective,
    outcome,
    assignments: ledger.assignments.map((assignment) => ({
      assignmentId: assignment.assignmentId,
      taskId: assignment.taskId,
      state: controller.getTaskState(assignment.assignmentId) ?? 'UNKNOWN',
      diffSha256: workerReceipts.find((receipt) => receipt.assignmentId === assignment.assignmentId)?.diffSha256,
      reviewStatus: controller.getTaskState(assignment.assignmentId) === 'CLOSED_MATCH' ? 'APPROVED' : 'REJECTED',
    })),
    proofs,
    risks,
    integrationReceiptSha256,
    watchdogEnforcement: watchdogAvailable ? 'ENFORCED' : 'UNAVAILABLE',
    projectionRebuilt: projection.rebuilt,
    generatedAt: new Date(now()).toISOString(),
  });

  return {
    outcome,
    profile,
    readySetReceipts,
    workerReceipts,
    reviewBundle,
    integrationReceiptSha256,
    watchdogEnforcement: watchdogAvailable ? 'ENFORCED' : 'UNAVAILABLE',
  };
}
