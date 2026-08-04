/**
 * host-kit — Native runner selection, disposable process management, and host diagnostics.
 *
 * Provides:
 *   - Runner detection (vitest | jest)
 *   - Runner selection with mismatch prevention
 *   - Native execution with proper concurrency ceilings
 *   - Disposable process handles for clean child process tree cleanup
 *   - Host-kit doctor: live process/runtime diagnostics (config, roles,
 *     handles, cursors, deadlines, queue, PIDs, ports, leases, orphans)
 *
 * @module host-kit
 */

// Core types
export type {
  RunnerName,
  RunnerCapabilities,
  RunnerDetection,
  RunnerSelection,
  RunnerMatch,
  RunnerMismatchError,
  TestJobSpec,
  NativeTestResult,
} from './types.js';

export {
  VITEST_CAPABILITIES,
  JEST_CAPABILITIES,
} from './types.js';

// Runner selection
export {
  selectRunner,
  detectRunner,
  detectRunnerFromLock,
  getRunnerCapabilities,
  runTestJob,
} from './runner-selector.js';

// Native Vitest runner
export {
  runVitestNative,
  hasVitestBinary,
  resolveVitestBinary,
  computeDiffHash,
  vitestCapabilities,
} from './vitest-native-runner.js';

// Native Jest runner
export {
  runJestNative,
  hasJestBinary,
  hasOnlyVitest,
  resolveJestBinary,
  jestCapabilities,
} from './jest-native-runner.js';

// Process cleanup
export {
  spawnDisposable,
  isProcessAlive,
  getProcessGroupId,
} from './process-cleanup.js';
export type { DisposeProcessHandle, ProcessResult } from './process-cleanup.js';

// Host-kit doctor
export {
  collectHostKitDoctorReport,
  detectLoadedConfig,
  detectRolesAndPermissions,
  enumerateChildHandles,
  enumerateOpenPorts,
  enumerateLeases,
  detectOrphans,
  generateFreshProcessProof,
  detectCursorsAndDeadlines,
  detectProcessIds,
} from './doctor.js';
export type {
  HostKitDoctorReport,
  LoadedConfigInfo,
  ProcessHandle,
  PortLease,
  LeaseEntry,
  OrphanedResource,
  FreshProcessProof,
} from './doctor.js';
