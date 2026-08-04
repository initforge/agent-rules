/**
 * host-kit/runtime/types.ts — Core types for host-native semantic watchdog.
 *
 * Extends the semantic watchdog interface with process-group-aware primitives
 * for out-of-band monitoring and exact child cancellation.
 */
import type { SemanticWatchdogConfig, SemanticProgressObservation } from '../../watchdog.js';
import type { NativeChildHandle } from '../../execution-runtime.js';
import type { WorkerReceipt } from '../../contracts.js';
import type { TaskAssignment } from '../../contracts.js';
import type { ExecutionControllerPort, NativeExecutionAdapter } from '../../execution-runtime.js';
import type { ChildProcess } from 'node:child_process';

/** Process group/job handle for host-native process management. */
export interface ProcessGroupHandle {
  /** POSIX process group ID (PGID) */
  readonly pgid: number;
  /** Windows job object name (if applicable) */
  readonly jobName?: string;
  /** Leader process PID */
  readonly pid: number;
  /** Creation timestamp (ms since epoch) */
  readonly createdAt: number;
  /** Associated assignment ID */
  readonly assignmentId: string;
}

/** Host-native child handle with real process information. */
export interface HostChildHandle extends Omit<NativeChildHandle, 'processGroupId'> {
  /** Actual process PID */
  readonly pid: number;
  /** Associated process group for tree management */
  readonly processGroup: ProcessGroupHandle;
  /** Underlying child process reference */
  readonly child?: ChildProcess;
}

/** Result from host-native child execution. */
export interface HostChildResult {
  /** Receipt from the worker child */
  readonly receipt: WorkerReceipt;
  /** Final progress observation, if any */
  readonly finalProgress?: SemanticProgressObservation;
  /** Process group terminated cleanly */
  readonly processGroupCleaned?: boolean;
}

/** Event types emitted by the out-of-band watchdog. */
export type WatchdogEventType =
  | 'POLL'
  | 'DIAGNOSE'
  | 'HARD_STALL'
  | 'REASSIGNED'
  | 'ESCALATED'
  | 'COMPLETED';

/** Decision object in watchdog events. */
export interface WatchdogEventDecision {
  readonly action: 'continue' | 'diagnose' | 'abort-reassign' | 'escalate';
  readonly state: string;
  readonly elapsedMs: number;
  readonly progressed: boolean;
  readonly attempt?: number;
  readonly cause?: string;
}

/** Watchdog event emitted during out-of-band monitoring. */
export interface WatchdogEvent {
  readonly type: WatchdogEventType;
  readonly timestamp: number;
  readonly assignmentId: string;
  readonly detail?: string;
  readonly decision: WatchdogEventDecision;
}

/** Host-runtime input for out-of-band execution. */
export interface HostRuntimeInput {
  /** Task assignment to execute */
  readonly assignment: TaskAssignment;
  /** Native execution adapter */
  readonly adapter: NativeExecutionAdapter;
  /** Execution controller for checkpoint coordination */
  readonly controller: ExecutionControllerPort;
  /** Watchdog configuration */
  readonly watchdogConfig?: Partial<SemanticWatchdogConfig>;
  /** Time provider (for testing) */
  readonly now?: () => number;
  /** Event callback for watchdog events */
  readonly onEvent?: (event: WatchdogEvent) => void;
  /** Cleanup function for process group */
  readonly cleanupProcessGroup?: (handle: ProcessGroupHandle) => Promise<void>;
}

/** Options for host-native watchdog configuration. */
export interface HostWatchdogOptions {
  /** Poll interval in milliseconds (default: 30000) */
  readonly pollIntervalMs?: number;
  /** Soft stall threshold in milliseconds (default: 300000) */
  readonly softStallMs?: number;
  /** Hard stall threshold in milliseconds (default: 480000) */
  readonly hardStallMs?: number;
  /** Maximum reassignments before escalation (default: 1) */
  readonly maxReassignments?: number;
}