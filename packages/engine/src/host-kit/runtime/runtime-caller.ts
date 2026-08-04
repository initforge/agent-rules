/**
 * host-kit/runtime/runtime-caller.ts — Production runtime caller for
 * host-native semantic watchdog.
 *
 * Provides the production entry point that dispatches a child via a
 * NativeExecutionAdapter, monitors it out-of-band via HostSemanticWatchdog,
 * and performs exact process-group cleanup on cancel/reassign/escalate.
 *
 * Reuses: SemanticWatchdog (watchdog.ts), NativeExecutionAdapter (execution-runtime.ts),
 *          HostSemanticWatchdog + ProcessGuardian (watchdog-runtime.ts, process-manager.ts)
 *
 * ponytail: skip — concurrent multi-assignment monitoring (one watchdog per
 * assignment), persistent watchdog registry across runs, nested watchdog
 * (child watchdog subprocess). Add when AM-0021 cluster 4 ships.
 */

import {
  SemanticWatchdog,
  type SemanticWatchdogConfig,
  type SemanticProgressObservation,
  DEFAULT_SEMANTIC_WATCHDOG_CONFIG,
} from '../../watchdog.js';
import type {
  NativeExecutionAdapter,
  NativeChildHandle,
  ExecutionControllerPort,
} from '../../execution-runtime.js';
import type { TaskAssignment, WorkerReceipt } from '../../contracts.js';
import {
  HostSemanticWatchdog,
  detectRepeatedStrategyChange,
  createProcessWatch,
  type HostWatchdogDecision,
} from './watchdog-runtime.js';
import type {
  HostChildHandle,
  HostChildResult,
  WatchdogEvent,
} from './types.js';
import {
  createProcessGroupFromPid,
  cleanupOrphanedProcessGroups,
  cleanupProcessGroup,
  type ProcessGuardian,
} from './process-manager.js';
import type { ProcessGroupHandle } from './types.js';

/** Default poll interval: 30 seconds */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Run a single assignment with host-native out-of-band semantic watchdog.
 *
 * This is the production caller. It:
 * 1. Dispatches the child via the adapter
 * 2. Creates a process group for exact cancellation
 * 3. Starts the out-of-band watchdog timer (30s poll)
 * 4. Waits for either completion or a watchdog decision
 * 5. On hard stall (8m): checkpoint, exact-cancel, reassign (loop for maxReassignments)
 * 6. On escalation (repeated strategy change): checkpoint, exact-cancel, reject
 * 7. Cleans up the process group on all exit paths
 *
 * @param assignment The task assignment to execute
 * @param adapter Native execution adapter with watchdog capabilities
 * @param controller Execution controller for checkpoint coordination
 * @param opts Optional configuration
 */
export async function runWithHostWatchdog(
  assignment: TaskAssignment,
  adapter: NativeExecutionAdapter,
  controller: ExecutionControllerPort,
  opts?: {
    config?: Partial<SemanticWatchdogConfig>;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    onEvent?: (event: WatchdogEvent) => void;
  },
): Promise<HostChildResult> {
  const now = opts?.now ?? defaultNow;
  const sleep = opts?.sleep ?? defaultSleep;
  const config = { ...DEFAULT_SEMANTIC_WATCHDOG_CONFIG, ...opts?.config };
  const maxAttempts = (config.maxReassignments ?? DEFAULT_SEMANTIC_WATCHDOG_CONFIG.maxReassignments) + 1;

  let lastError: Error | undefined;
  let latestResult: { receipt: WorkerReceipt; finalProgress?: SemanticProgressObservation } | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. Dispatch child
    const handle = await adapter.dispatch(assignment, attempt);

    // 2. Create process group for exact cancellation
    // Some adapters embed pid directly; use processGroupId as fallback
    const pgid = (handle as unknown as { pid?: number }).pid
      ?? parseInt(handle.processGroupId ?? '0', 10)
      ?? 0;
    const processGroup = createProcessGroupFromPid(pgid, assignment.assignmentId);

    // 3. Build host-native handle
    const hostHandle: HostChildHandle = {
      ...handle,
      pid: pgid,
      processGroup,
    };

    // 4. Start out-of-band watchdog
    const startedAt = now();
    const watchdog = new HostSemanticWatchdog(
      assignment.assignmentId,
      adapter,
      startedAt,
      handle.initialProgress,
      {
        config: opts?.config,
        now,
        onEvent: opts?.onEvent,
      },
    );
    watchdog.bindHandle(hostHandle);
    watchdog.start();

    let processGroupCleaned = false;

    try {
      // 5. Race: child completion vs watchdog poll cycle
      const collected = adapter.collect(hostHandle as NativeChildHandle);

      let finished = false;
      let reassign = false;

      while (!finished) {
        // Wait for either child completion or next poll cycle
        const event = await Promise.race([
          collected.then((result) => ({ kind: 'result' as const, result })),
          sleep(config.pollIntervalMs).then(() => ({ kind: 'poll' as const })),
        ]);

        if (event.kind === 'result') {
          // Child completed successfully
          watchdog.complete();
          latestResult = {
            receipt: event.result.receipt,
            finalProgress: event.result.finalProgress,
          };
          return {
            receipt: event.result.receipt,
            finalProgress: event.result.finalProgress,
            processGroupCleaned: true,
          };
        }

        // Poll cycle: observe and evaluate
        const decision = await watchdog.pollOnce();

        if (decision.shouldEscalate) {
          // Exact cancel via process group, then escalate
          await watchdog.cleanupProcessGroup();
          processGroupCleaned = true;
          watchdog.stop();
          throw new Error(
            `assignment ${assignment.assignmentId} escalated: ${decision.cause}`,
          );
        }

        if (decision.shouldReassign) {
          // Exact cancel via process group, then loop to reassign
          await watchdog.cleanupProcessGroup();
          processGroupCleaned = true;
          watchdog.stop();
          reassign = true;
          lastError = new Error(
            `assignment ${assignment.assignmentId} reassigned (attempt ${attempt + 1})`,
          );
          break;
        }
      }

      // If we get here without reassign, drain the collected result
      if (!reassign && !finished) {
        const result = await collected;
        watchdog.complete();
        return {
          receipt: result.receipt,
          finalProgress: result.finalProgress,
          processGroupCleaned: true,
        };
      }

      void collected.catch(() => undefined);
    } finally {
      // Always stop the watchdog timer
      watchdog.stop();
      // Always clean up process group
      if (!processGroupCleaned) {
        await cleanupProcessGroup(processGroup);
      }
    }
  }

  // Exhausted all reassignments
  if (lastError) throw lastError;
  throw new Error(`assignment ${assignment.assignmentId} exhausted watchdog reassignments`);
}

/**
 * Inline variant using the existing in-process SemanticWatchdog with
 * process-group cleanup on all exit paths.
 *
 * Reuses the existing collectWithWatchdog pattern from execution-runtime.ts
 * but adds process-group cleanup via the process manager.
 */
export async function runWithInlineWatchdog(
  assignment: TaskAssignment,
  adapter: NativeExecutionAdapter,
  controller: ExecutionControllerPort,
  opts?: {
    config?: Partial<SemanticWatchdogConfig>;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<HostChildResult> {
  const now = opts?.now ?? defaultNow;
  const sleep = opts?.sleep ?? defaultSleep;
  const config = { ...DEFAULT_SEMANTIC_WATCHDOG_CONFIG, ...opts?.config };
  const maxAttempts = (config.maxReassignments ?? DEFAULT_SEMANTIC_WATCHDOG_CONFIG.maxReassignments) + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const handle = await adapter.dispatch(assignment, attempt);
    const watchdog = new SemanticWatchdog(assignment.assignmentId, now(), config);
    let lastObservation = handle.initialProgress;

    const pgid = typeof (handle as NativeChildHandle).pid === 'number'
      ? (handle as NativeChildHandle).pid as number
      : 0;
    const processGroup = createProcessGroupFromPid(pgid, assignment.assignmentId);

    let processGroupCleaned = false;

    try {
      let finished = false;
      let reassign = false;
      const collected = adapter.collect(handle);

      while (!finished) {
        const event = await Promise.race([
          collected.then((result) => ({ kind: 'result' as const, result })),
          sleep(watchdog.config.pollIntervalMs).then(() => ({ kind: 'poll' as const })),
        ]);

        if (event.kind === 'result') {
          watchdog.complete();
          if (!processGroupCleaned) {
            await cleanupProcessGroup(processGroup);
            processGroupCleaned = true;
          }
          return {
            receipt: event.result.receipt,
            finalProgress: event.result.finalProgress,
            processGroupCleaned: true,
          };
        }

        const observed = await adapter.observeSemanticProgress?.(handle);
        if (observed) lastObservation = observed;

        const decision = watchdog.observe(
          { ...lastObservation, observedAt: now() },
          now(),
        );

        if (decision.action === 'diagnose') {
          await adapter.diagnose?.(handle);
        } else if (decision.action === 'abort-reassign') {
          await adapter.checkpointPartial?.(handle, `semantic stall after ${decision.elapsedMs}ms`);
          await controller.checkpoint();
          await cleanupProcessGroup(processGroup);
          processGroupCleaned = true;
          await adapter.cancel?.(handle, 'semantic-stall-reassign');
          reassign = true;
          break;
        } else if (decision.action === 'escalate') {
          await adapter.checkpointPartial?.(handle, decision.cause);
          await controller.checkpoint();
          await cleanupProcessGroup(processGroup);
          processGroupCleaned = true;
          await adapter.cancel?.(handle, decision.cause);
          throw new Error(`assignment ${assignment.assignmentId} escalated: ${decision.cause}`);
        }
      }

      if (!reassign) {
        const result = await collected;
        if (!processGroupCleaned) {
          await cleanupProcessGroup(processGroup);
          processGroupCleaned = true;
        }
        return {
          receipt: result.receipt,
          finalProgress: result.finalProgress,
          processGroupCleaned: true,
        };
      }
      void collected.catch(() => undefined);
    } finally {
      if (!processGroupCleaned) {
        await cleanupProcessGroup(processGroup);
      }
    }
  }

  throw new Error(`assignment ${assignment.assignmentId} exhausted watchdog reassignments`);
}

/**
 * Register a pre-created process group for cleanup tracking.
 */
export function registerHostProcessGroup(handle: ProcessGroupHandle): void {
  // Process group is already created and registered in process-manager
  // This is a no-op safety wrapper for external callers
}

/**
 * Emergency cleanup of all orphaned process groups.
 * Should be called on shutdown or fatal error.
 */
export function emergencyCleanup(): void {
  cleanupOrphanedProcessGroups();
}

/** Validate that a child handle has the watchdog capabilities. */
export function hasWatchdogCapabilities(adapter: NativeExecutionAdapter): boolean {
  return adapter.capabilities.semanticProgress
    && adapter.capabilities.exactProcessGroupCancel
    && adapter.capabilities.partialCheckpoint
    && typeof adapter.observeSemanticProgress === 'function'
    && typeof adapter.diagnose === 'function'
    && typeof adapter.checkpointPartial === 'function'
    && typeof adapter.cancel === 'function';
}

/** Check for repeated strategy change from watchdog snapshot. */
export function checkRepeatedStrategy(
  snapshot: { readonly repeatedCauses: Readonly<Record<string, number>> },
  threshold = 1,
): { repeated: boolean; cause?: string } {
  return detectRepeatedStrategyChange(snapshot, threshold);
}

function defaultNow(): number {
  return Date.now();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export for external use — only items defined in this module
export type {
  HostChildHandle,
  HostChildResult,
  WatchdogEvent,
  HostWatchdogDecision,
};
