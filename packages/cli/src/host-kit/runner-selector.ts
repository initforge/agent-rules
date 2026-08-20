/**
 * host-kit/runner-selector — Native runner selection with mismatch prevention.
 *
 * Provides deterministic runner selection based on project detection.
 * Enforces the following policy:
 *   1. Jest-first detection. If Jest is found, use it.
 *   2. If only Vitest is found (no Jest), reject it — return null so callers
 *      surface a mismatch rather than silently invoking Vitest (repo policy: Jest only).
 *   3. If a runner is explicitly requested, verify it matches the detected one.
 *      Mismatch yields an error (never auto-switches silently).
 *   4. Emit the selected runner's capabilities for caller policy enforcement.
 */
import path from 'node:path';
import fs from 'node:fs';
import type {
  RunnerName,
  RunnerSelection,
  RunnerMismatchError,
  RunnerCapabilities,
  TestJobSpec,
  NativeTestResult,
} from './types.js';
import { VITEST_CAPABILITIES, JEST_CAPABILITIES } from './types.js';
import { resolveVitestBinary } from './vitest-native-runner.js';
import { resolveJestBinary } from './jest-native-runner.js';

/**
 * Detects which test runner is available in the project root.
 *
 * Policy (Jest-only repo):
 *   1. Check package.json deps: Jest first, then null if only Vitest.
 *   2. Fall back to binary resolution: Jest first, then null if only Vitest.
 *
 * Vitest-only projects are rejected (return null) so callers surface a mismatch
 * rather than silently invoking Vitest against repo policy.
 */
export function detectRunner(projectRoot: string): RunnerName | null {
  // Primary: package.json dep check (authoritative)
  const fromLock = detectRunnerFromLock(projectRoot);
  if (fromLock === 'jest') return 'jest';
  if (fromLock === 'vitest') return null; // jest-only policy: reject Vitest-only project

  // Secondary: binary resolution — Jest first
  const jestPath = resolveJestBinary(projectRoot);
  if (jestPath) return 'jest';

  const vitestPath = resolveVitestBinary(projectRoot);
  if (vitestPath) return null; // jest-only policy: reject Vitest-only project

  return null;
}

/**
 * Get the capabilities for a runner name.
 */
export function getRunnerCapabilities(runner: RunnerName): RunnerCapabilities {
  switch (runner) {
    case 'vitest': return VITEST_CAPABILITIES;
    case 'jest': return JEST_CAPABILITIES;
  }
}

/**
 * Select a runner with mismatch prevention.
 *
 * - If `requestedRunner` is provided and differs from the detected runner,
 *   returns a mismatch error (never auto-switches silently).
 * - If `requestedRunner` is omitted, auto-detects and returns the match.
 * - If no runner is detected, returns failure.
 */
export function selectRunner(spec: TestJobSpec & { requestedRunner?: RunnerName }): RunnerSelection {
  const requestedRunner = spec.requestedRunner;
  const detectedRunner = detectRunner(spec.projectRoot);
  const resolvedProjectRoot = path.resolve(spec.projectRoot);

  if (!detectedRunner) {
    return {
      ok: false as const,
      error: 'runner_mismatch',
      requested: requestedRunner ?? ('jest' as RunnerName),
      detected: ('vitest' as RunnerName),
      detail: `No Jest runner detected in ${spec.projectRoot}; Vitest-only project rejected by repo policy (Jest only)`,
    };
  }

  if (requestedRunner && requestedRunner !== detectedRunner) {
    return {
      ok: false as const,
      error: 'runner_mismatch',
      requested: requestedRunner,
      detected: detectedRunner,
      detail: `Project has ${detectedRunner} installed but requested ${requestedRunner}; install only one runner to avoid mismatch`,
    };
  }

  const runner = requestedRunner ?? detectedRunner;
  const binaryPath = runner === 'jest'
    ? resolveJestBinary(spec.projectRoot)
    : resolveVitestBinary(spec.projectRoot);

  return {
    ok: true as const,
    runner,
    binaryPath: binaryPath ?? runner,
    projectRoot: resolvedProjectRoot,
    capabilities: getRunnerCapabilities(runner),
  };
}

/**
 * Detect runner from package.json deps/devDeps.
 * Jest-first priority; Vitest is returned only if Jest is also present (mixed),
 * but in practice this returns 'vitest' only when Vitest is the sole runner
 * (the caller must then decide whether to reject per repo policy).
 */
export function detectRunnerFromLock(projectRoot: string): RunnerName | null {
  try {
    const pkgJsonPath = path.join(projectRoot, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    const hasJest = pkgJson.dependencies?.jest || pkgJson.devDependencies?.jest;
    const hasVitest = pkgJson.dependencies?.vitest || pkgJson.devDependencies?.vitest;

    // Jest-first: if Jest is present, use it regardless of Vitest presence
    if (hasJest) return 'jest';
    if (hasVitest) return 'vitest'; // vitest-only: caller rejects via detectRunner

    return null;
  } catch {
    return null;
  }
}

/**
 * Run a test job with native runner selection.
 * Automatically detects and selects the appropriate runner.
 */
export async function runTestJob(spec: TestJobSpec): Promise<NativeTestResult> {
  const selection = selectRunner(spec);

  if (!selection.ok) {
    const startTime = Date.now();
    return {
      exitCode: 1,
      success: false,
      stdout: '',
      stderr: `No Jest runner detected in ${spec.projectRoot}; Vitest-only project rejected`,
      durationMs: Date.now() - startTime,
      runner: 'jest' as RunnerName,
      signal: null,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
    };
  }

  const { runner } = selection;

  if (runner === 'vitest') {
    const { runVitestNative } = await import('./vitest-native-runner.js');
    return runVitestNative({ ...spec, runner: 'vitest' });
  }

  if (runner === 'jest') {
    const { runJestNative } = await import('./jest-native-runner.js');
    return runJestNative({ ...spec, runner: 'jest' });
  }

  throw new Error(`Unknown runner: ${runner}`);
}

// Re-export capabilities and types for convenience
export { VITEST_CAPABILITIES, JEST_CAPABILITIES };
