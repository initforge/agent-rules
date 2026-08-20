/**
 * host-kit/types — Native runner selection types.
 *
 * Defines the contract for selecting and executing a test runner (Vitest or Jest)
 * natively — without delegating to the preserved governed launcher. Each runner
 * enforces its own concurrency ceiling:
 *   - Vitest: 2 parents/project, 1 worker, no file parallelism
 *   - Jest:   --runInBand (serial, single worker)
 *
 * Runner mismatch is prevented at selection time by detecting the project's
 * installed runner and rejecting requests that target a different one.
 */

export type RunnerName = 'vitest' | 'jest';

export interface RunnerCapabilities {
  readonly name: RunnerName;
  readonly binaryName: string;
  /** Maximum concurrent test parents per project (process-level ceiling). */
  readonly maxParentsPerProject: number;
  /** Maximum worker processes spawned by a single run. */
  readonly maxWorkers: number;
  /** Whether file-level parallelism is permitted by the governed ceiling. */
  readonly fileParallelism: boolean;
  /** Extra CLI flags enforced by this runner's governance rules. */
  readonly enforcedFlags: string[];
}

export interface RunnerDetection {
  /** Detected runner name, or null if neither is installed at the project root. */
  readonly runner: RunnerName | null;
  /** Absolute path to the resolved runner binary, or null. */
  readonly binaryPath: string | null;
  /** Root at which the runner was detected (canonicalized). */
  readonly projectRoot: string;
}

export type RunnerMismatchError = {
  readonly ok: false;
  readonly error: 'runner_mismatch';
  readonly requested: RunnerName;
  readonly detected: RunnerName;
  readonly detail: string;
};

export type RunnerMatch = {
  readonly ok: true;
  readonly runner: RunnerName;
  readonly binaryPath: string;
  readonly projectRoot: string;
  readonly capabilities: RunnerCapabilities;
};

export type RunnerSelection = RunnerMismatchError | RunnerMatch;

export interface TestJobSpec {
  /** Glob patterns or file paths for the test files to execute. */
  readonly testFiles: string[];
  /** Optional runner override. If omitted, the detected runner is used. */
  readonly runner?: RunnerName;
  /** Project root for path resolution and runner detection. */
  readonly projectRoot: string;
  /** Per-test timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Pass through environment overrides (e.g. CI=true). */
  readonly env?: Record<string, string>;
}

export interface NativeTestResult {
  readonly exitCode: number;
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly runner: RunnerName;
  /** Captured at process exit; null if the process was not killed by the cleanup layer. */
  readonly signal: NodeJS.Signals | null;
  readonly testsRun: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
}

// ── Capabilities constants ──────────────────────────────────────────────────

export const VITEST_CAPABILITIES: RunnerCapabilities = Object.freeze({
  name: 'vitest',
  binaryName: 'vitest',
  maxParentsPerProject: 2,
  maxWorkers: 1,
  fileParallelism: false,
  enforcedFlags: ['--maxWorkers=1', '--minWorkers=1', '--no-file-parallelism'],
});

export const JEST_CAPABILITIES: RunnerCapabilities = Object.freeze({
  name: 'jest',
  binaryName: 'jest',
  maxParentsPerProject: 2,
  maxWorkers: 1,
  fileParallelism: false,
  enforcedFlags: ['--runInBand', '--maxWorkers=1', '--forceExit'],
});
