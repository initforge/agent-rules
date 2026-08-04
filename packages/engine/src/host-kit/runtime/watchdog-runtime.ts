/**
 * host-kit/runtime/watchdog-runtime.ts — Host-native out-of-band semantic watchdog.
 *
 * Wraps the pure SemanticWatchdog with host-native process management:
 * - Out-of-band timer-based polling (independent of caller loop)
 * - Soft diagnose at 5m (via adapter.diagnose)
 * - Hard checkpoint + exact child cancel + reassign at 8m (via process group kill)
 * - Repeated strategy change detection → escalate (same stall pattern repeats)
 *
 * Reuses: SemanticWatchdog (watchdog.ts), NativeExecutionAdapter (execution-runtime.ts)
 *
 * ponytail: skip — persistent watchdog state across process restarts,
 * cross-process timer (child watchdog in subprocess). Add when AM-0021
 * cluster 4 ships.
 */

import {
  SemanticWatchdog,
  type SemanticWatchdogConfig,
  type SemanticProgressObservation,
  DEFAULT_SEMANTIC_WATCHDOG_CONFIG,
} from '../../watchdog.js';
import type { NativeExecutionAdapter } from '../../execution-runtime.js';
import type {
  HostChildHandle,
  HostChildResult,
  WatchdogEvent,
  WatchdogEventDecision,
} from './types.js';
import type { ProcessGroupHandle } from './types.js';
import { cleanupProcessGroup, type ProcessGuardian, createDefaultGuardian } from './process-manager.js';

/** Configuration for the host-native watchdog. */
export interface HostWatchdogRuntimeConfig {
  readonly pollIntervalMs: number;
  readonly softStallMs: number;
  readonly hardStallMs: number;
  readonly maxReassignments: number;
}

export const DEFAULT_HOST_WATCHDOG_CONFIG: HostWatchdogRuntimeConfig = {
  pollIntervalMs: DEFAULT_SEMANTIC_WATCHDOG_CONFIG.pollIntervalMs,
  softStallMs: DEFAULT_SEMANTIC_WATCHDOG_CONFIG.softStallMs,
  hardStallMs: DEFAULT_SEMANTIC_WATCHDOG_CONFIG.hardStallMs,
  maxReassignments: DEFAULT_SEMANTIC_WATCHDOG_CONFIG.maxReassignments,
};

/**
 * Result of a host-watchdog evaluation.
 */
export interface HostWatchdogDecision {
  readonly shouldCancel: boolean;
  readonly shouldDiagnose: boolean;
  readonly shouldEscalate: boolean;
  readonly shouldReassign: boolean;
  readonly state: string;
  readonly attempt?: number;
  readonly cause?: string;
  readonly elapsedMs: number;
}

/**
 * Out-of-band monitor that tracks process-group lifecycle alongside the
 * SemanticWatchdog. Used for cleanup bookkeeping and exact cancel.
 */
export class ProcessWatch {
  readonly assignmentId: string;
  #group: ProcessGroupHandle | null = null;
  #guarded = false;

  constructor(assignmentId: string) {
    this.assignmentId = assignmentId;
  }

  setGroup(group: ProcessGroupHandle): void {
    this.#group = group;
  }

  get group(): ProcessGroupHandle | null {
    return this.#group;
  }

  markGuarded(): void {
    this.#guarded = true;
  }

  get isGuarded(): boolean {
    return this.#guarded;
  }
}

/**
 * Host-native out-of-band semantic watchdog.
 *
 * Runs an independent timer that polls every pollIntervalMs (default 30s).
 * When the child stops advancing semantically:
 * - At 5m (softStallMs): issue a soft diagnose via adapter.diagnose
 * - At 8m (hardStallMs): checkpoint, exact-cancel the process group, reassign
 * - If the same stall pattern repeats (repeated strategy change): escalate
 *
 * The "out-of-band" aspect: the timer runs independently of the caller's
 * collect loop. The caller can continue working while the watchdog monitors
 * in a separate async context.
 */
export class HostSemanticWatchdog {
  readonly assignmentId: string;
  readonly config: HostWatchdogRuntimeConfig;
  readonly #watchdog: SemanticWatchdog;
  #processWatch: ProcessWatch;
  #handle: HostChildHandle | null = null;
  #adapter: NativeExecutionAdapter;
  #timer: NodeJS.Timeout | null = null;
  #started = false;
  #stopped = false;
  #lastObservation: SemanticProgressObservation;
  #onEvent?: (event: WatchdogEvent) => void;
  #now: () => number;
  #reassignmentCount = 0;
  #guardian: ProcessGuardian;

  constructor(
    assignmentId: string,
    adapter: NativeExecutionAdapter,
    startedAt: number,
    initialProgress: SemanticProgressObservation,
    options?: {
      config?: Partial<SemanticWatchdogConfig>;
      now?: () => number;
      onEvent?: (event: WatchdogEvent) => void;
      guardian?: ProcessGuardian;
    },
  ) {
    if (!assignmentId) throw new Error('watchdog assignmentId is required');
    this.assignmentId = assignmentId;
    this.#adapter = adapter;
    this.#lastObservation = initialProgress;
    this.#now = options?.now ?? (() => Date.now());
    this.#onEvent = options?.onEvent;
    this.#guardian = options?.guardian ?? createDefaultGuardian();

    // Reuse SemanticWatchdog for core stall logic
    const wdConfig = { ...DEFAULT_SEMANTIC_WATCHDOG_CONFIG, ...options?.config };
    this.config = {
      pollIntervalMs: wdConfig.pollIntervalMs,
      softStallMs: wdConfig.softStallMs,
      hardStallMs: wdConfig.hardStallMs,
      maxReassignments: wdConfig.maxReassignments,
    };
    this.#watchdog = new SemanticWatchdog(assignmentId, startedAt, wdConfig);
    this.#processWatch = new ProcessWatch(assignmentId);
  }

  /**
   * Bind a host-native child handle (with real process info) to this watchdog.
   */
  bindHandle(handle: HostChildHandle): void {
    this.#handle = handle;
    if (handle.processGroup) {
      this.#processWatch.setGroup(handle.processGroup);
    }
  }

  /**
   * Start the out-of-band timer. Polls every pollIntervalMs.
   */
  start(): void {
    if (this.#started) throw new Error('watchdog already started');
    if (this.#stopped) throw new Error('watchdog already stopped');
    this.#started = true;

    this.#timer = setInterval(() => this.#poll(), this.config.pollIntervalMs);
    // Prevent timer from keeping the event loop alive
    if (this.#timer.unref) this.#timer.unref();
  }

  /**
   * Stop the out-of-band timer and clean up.
   */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#stopped = true;
    this.#started = false;
  }

  /**
   * Feed a semantic progress observation (out-of-band from the timer).
   */
  updateProgress(observation: SemanticProgressObservation): void {
    this.#lastObservation = observation;
  }

  /**
   * Manually trigger a poll cycle (for testing without timers).
   */
  async pollOnce(): Promise<HostWatchdogDecision> {
    return this.#evaluatePoll();
  }

  /**
   * Get snapshot of current watchdog state.
   */
  snapshot() {
    return this.#watchdog.snapshot();
  }

  /** The ProcessWatch tracking this watchdog's process group. */
  get processWatch(): ProcessWatch {
    return this.#processWatch;
  }

  /** Number of reassignments performed. */
  get reassignments(): number {
    return this.#reassignmentCount;
  }

  /** Current watchdog state. */
  get state() {
    return this.#watchdog.snapshot().state;
  }

  /** The guardian for process group cleanup. */
  get guardian(): ProcessGuardian {
    return this.#guardian;
  }

  /**
   * Process a poll cycle: observe, decide, and execute side effects.
   */
  async #evaluatePoll(): Promise<HostWatchdogDecision> {
    const now = this.#now();
    const observation = { ...this.#lastObservation, observedAt: now };
    const decision = this.#watchdog.observe(observation, now);

    // Check for repeated strategy change (same stall pattern repeating)
    const repeatedCheck = detectRepeatedStrategyChange(this.#watchdog.snapshot());

    let action: 'continue' | 'diagnose' | 'abort-reassign' | 'escalate' = decision.action;
    const decisionCause = decision.action === 'escalate'
      ? decision.cause : undefined;
    let cause: string | undefined = decisionCause;

    // If repeated strategy change detected, override to escalate
    if (repeatedCheck.repeated && decision.action === 'abort-reassign') {
      action = 'escalate';
      cause = `repeated-strategy-change:${repeatedCheck.cause}`;
      // Mark the watchdog as escalated
      // The SemanticWatchdog will escalate on next repeated observation
    }

    const result: HostWatchdogDecision = {
      shouldCancel: action === 'abort-reassign' || action === 'escalate',
      shouldDiagnose: action === 'diagnose',
      shouldEscalate: action === 'escalate',
      shouldReassign: action === 'abort-reassign' && !repeatedCheck.repeated,
      state: decision.state,
      elapsedMs: decision.elapsedMs,
      ...(action === 'abort-reassign' && !repeatedCheck.repeated && decision.action === 'abort-reassign'
        ? { attempt: decision.attempt }
        : {}),
      ...(action === 'escalate' ? { cause } : {}),
    };

    if (action === 'abort-reassign' && !repeatedCheck.repeated) {
      await this.#executeHardStall(decision.elapsedMs);
      this.#emitEvent('HARD_STALL', now, `semantic stall after ${decision.elapsedMs}ms`);
    } else if (action === 'escalate') {
      await this.#executeEscalation(cause ?? decisionCause ?? 'escalated');
      this.#emitEvent('ESCALATED', now, `escalation: ${cause ?? decisionCause}`);
    } else if (action === 'diagnose') {
      await this.#executeDiagnose();
      this.#emitEvent('DIAGNOSE', now, `soft stall at ${decision.elapsedMs}ms`);
    } else {
      this.#emitEvent('POLL', now, `running, elapsed ${decision.elapsedMs}ms`);
    }

    return result;
  }

  /** Internal timer callback */
  async #poll(): Promise<void> {
    if (this.#stopped) return;
    await this.#evaluatePoll();
  }

  /** Soft diagnose: call adapter.diagnose */
  async #executeDiagnose(): Promise<void> {
    if (!this.#handle) return;
    try {
      await this.#adapter.diagnose?.(this.#handle);
    } catch {
      // Diagnose is best-effort
    }
  }

  /** Hard stall: checkpoint, exact-cancel, reassign */
  async #executeHardStall(elapsedMs: number): Promise<void> {
    if (!this.#handle || !this.#processWatch.group) return;

    // 1. Partial checkpoint via adapter
    try {
      await this.#adapter.checkpointPartial?.(this.#handle, `semantic stall after ${elapsedMs}ms`);
    } catch {
      // Best effort
    }

    // 2. Exact child cancel via process group kill (host-native)
    await this.#guardian.terminate(this.#processWatch.group);
    this.#processWatch.markGuarded();

    // 3. Also call adapter.cancel for non-process-based children (sessions, etc.)
    try {
      await this.#adapter.cancel?.(this.#handle, 'semantic-stall-reassign');
    } catch {
      // Best effort
    }

    this.#reassignmentCount++;
    this.#emitEvent('REASSIGNED', this.#now(),
      `child cancelled and ready for reassignment (attempt ${this.#reassignmentCount})`);
  }

  /** Escalation: repeated strategy change or max reassignments exceeded */
  async #executeEscalation(cause: string): Promise<void> {
    if (this.#handle && this.#processWatch.group) {
      // Ensure process group is cleaned up
      await this.#guardian.kill(this.#processWatch.group);
      this.#processWatch.markGuarded();
      try {
        await this.#adapter.cancel?.(this.#handle, cause);
      } catch {
        // Best effort
      }
    }
  }

  /** Reset for a new child after reassignment */
  beginReassignment(
    newHandle: HostChildHandle,
    initialProgress: SemanticProgressObservation,
    now: number,
  ): void {
    this.#handle = newHandle;
    if (newHandle.processGroup) {
      this.#processWatch.setGroup(newHandle.processGroup);
    }
    this.#lastObservation = initialProgress;

    // Reuse SemanticWatchdog's reassignment logic (resets timer, retains cause history)
    this.#watchdog.beginReassignment(now);

    this.#emitEvent('REASSIGNED', now,
      `watchdog reset for new child (attempt ${this.#reassignmentCount + 1})`);
  }

  /** Mark as completed */
  complete(): void {
    this.#watchdog.complete();
    this.stop();
    this.#emitEvent('COMPLETED', this.#now(), 'child completed successfully');
  }

  /** Cleanup process group associated with this watchdog */
  async cleanupProcessGroup(): Promise<void> {
    if (this.#processWatch.group) {
      await this.#guardian.kill(this.#processWatch.group);
      this.#processWatch.markGuarded();
    }
  }

  #emitEvent(type: WatchdogEvent['type'], timestamp: number, detail?: string): void {
    if (!this.#onEvent) return;
    const snap = this.#watchdog.snapshot();
    const decision: WatchdogEventDecision = {
      action: 'continue',
      state: snap.state,
      elapsedMs: 0,
      progressed: false,
    };
    this.#onEvent({ type, timestamp, assignmentId: this.assignmentId, detail, decision });
  }
}

/**
 * Repeated strategy change detection.
 *
 * Detects when the same stall pattern (phase + cursor) repeats across
 * reassignments — indicating the watchdog's cancel/reassign strategy
 * is not helping. This is the "repeated strategy change" condition.
 */
export function detectRepeatedStrategyChange(
  snapshot: { readonly repeatedCauses: Readonly<Record<string, number>> },
  threshold = 1,
): { repeated: boolean; cause?: string } {
  for (const [cause, count] of Object.entries(snapshot.repeatedCauses)) {
    if (count > threshold) {
      return { repeated: true, cause };
    }
  }
  return { repeated: false };
}

/**
 * Create a ProcessWatch for tracking process group lifecycle.
 */
export function createProcessWatch(assignmentId: string): ProcessWatch {
  return new ProcessWatch(assignmentId);
}

/**
 * Resolve watchdog config from partial override.
 * Reuses DEFAULT_SEMANTIC_WATCHDOG_CONFIG as the base.
 */
export function resolveHostWatchdogConfig(
  override?: Partial<SemanticWatchdogConfig>,
): SemanticWatchdogConfig {
  return { ...DEFAULT_SEMANTIC_WATCHDOG_CONFIG, ...override };
}

/**
 * Re-export SemanticWatchdog for type compatibility.
 */
export { SemanticWatchdog };
export type { SemanticWatchdogConfig, SemanticProgressObservation };
