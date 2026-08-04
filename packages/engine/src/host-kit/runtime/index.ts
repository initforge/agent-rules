/**
 * host-kit/runtime/index.ts — Barrel export for host-native runtime primitives.
 *
 * Exports the host-native out-of-band semantic watchdog, process group management,
 * and production runtime caller.
 *
 * Reuses: watchdog.ts (SemanticWatchdog), execution-runtime.ts (NativeExecutionAdapter)
 *
 * ponytail: skip — cross-platform job object abstraction, cgroup-based scheduling.
 * Add when AM-0021 cluster 5 ships.
 */

// ── Types ────────────────────────────────────────────────────────────────────────

export type {
  ProcessGroupHandle,
  HostChildHandle,
  HostChildResult,
  WatchdogEvent,
  WatchdogEventDecision,
  WatchdogEventType,
  HostRuntimeInput,
  HostWatchdogOptions,
} from './types.js';

// ── Process Group Management ─────────────────────────────────────────────────────

export {
  ProcessGuard,
  createProcessGroupForChild,
  createProcessGroupFromPid,
  spawnDetached,
  findProcessGroup,
  cleanupProcessGroup,
  cleanupOrphanedProcessGroups,
  listProcessGroups,
  createDefaultGuardian,
} from './process-manager.js';

export type { ProcessGuardian } from './process-manager.js';

// ── Watchdog Runtime ────────────────────────────────────────────────────────────

export {
  HostSemanticWatchdog,
  createProcessWatch,
  detectRepeatedStrategyChange,
  resolveHostWatchdogConfig,
} from './watchdog-runtime.js';

export {
  DEFAULT_HOST_WATCHDOG_CONFIG,
  type HostWatchdogRuntimeConfig,
  type HostWatchdogDecision,
} from './watchdog-runtime.js';

export { SemanticWatchdog } from '../../watchdog.js';
export type { SemanticWatchdogConfig, SemanticProgressObservation } from '../../watchdog.js';

// ── Runtime Caller ──────────────────────────────────────────────────────────────

export {
  runWithHostWatchdog,
  runWithInlineWatchdog,
  registerHostProcessGroup,
  emergencyCleanup,
  hasWatchdogCapabilities,
  checkRepeatedStrategy,
} from './runtime-caller.js';

// Re-export NativeExecutionAdapter types for convenience
export type {
  NativeChildHandle,
  NativeChildResult,
  ExecutionControllerPort,
} from '../../execution-runtime.js';
