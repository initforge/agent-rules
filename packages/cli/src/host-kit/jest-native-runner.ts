/**
 * host-kit/jest-native-runner — Native Jest runner for the host-kit.
 *
 * Executes Jest with `--runInBand` which enforces serial, single-process test
 * execution. This is the idiomatic Jest equivalent of vitest's
 * `--maxWorkers=1 --no-file-parallelism` for controlled concurrency.
 *
 * Repo policy: Jest only. Vitest-only projects are rejected by the runner-selector
 * at detection time; this module never invokes Vitest.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { RunnerName, NativeTestResult, TestJobSpec } from './types.js';
import { JEST_CAPABILITIES } from './types.js';
import { spawnDisposable, type DisposeProcessHandle } from './process-cleanup.js';

/**
 * Resolve the Jest binary at the project root, or null if not found.
 */
export function resolveJestBinary(projectRoot: string): string | null {
  const candidates = [
    // npx-style fallback
    'jest',
    // Project-level jest
    path.join(projectRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
    // npm bin
    path.join(projectRoot, 'node_modules', '.bin', 'jest'),
  ];

  for (const candidate of candidates) {
    if (candidate === 'jest') {
      try {
        // Check if jest is resolvable via require
        require.resolve('jest', { paths: [projectRoot] });
        return 'jest';
      } catch {
        continue;
      }
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Parse Jest summary output for test counts. */
function parseJestResult(output: string): { testsRun: number; testsPassed: number; testsFailed: number } {
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  // Jest outputs summary like:
  // "Test Suites: 2 passed, 2 total"
  // "Tests:       10 passed, 10 total"
  const passedMatch = output.match(/(\d+) passed/i);
  const totalMatch = output.match(/(\d+)\s+(?:tests|total)/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);

  if (passedMatch && totalMatch) {
    testsPassed = parseInt(passedMatch[1], 10);
    testsRun = parseInt(totalMatch[1], 10);
  }
  if (failedMatch) {
    testsFailed = parseInt(failedMatch[1], 10);
    testsRun = Math.max(testsRun, testsPassed + testsFailed);
  }

  return { testsRun, testsPassed, testsFailed };
}

/**
 * Run Jest natively with `--runInBand` for controlled concurrency.
 *
 * `--runInBand` runs all tests in a single process (serial), which
 * provides the same ceiling of 1 worker as vitest's
 * `--maxWorkers=1 --no-file-parallelism`.
 */
export async function runJestNative(
  spec: TestJobSpec,
): Promise<NativeTestResult> {
  const startTime = Date.now();
  const binaryPath = resolveJestBinary(spec.projectRoot);

  if (!binaryPath) {
    return {
      exitCode: 1,
      success: false,
      stdout: '',
      stderr: 'jest binary not found; ensure jest is installed in the project',
      durationMs: Date.now() - startTime,
      runner: JEST_CAPABILITIES.name,
      signal: null,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
    };
  }

  const testFiles = spec.testFiles.map((f) =>
    path.isAbsolute(f) ? f : path.join(spec.projectRoot, f),
  );

  const args = [
    ...JEST_CAPABILITIES.enforcedFlags,
    ...testFiles,
  ];

  const handle = spawnDisposable(binaryPath, args, {
    cwd: spec.projectRoot,
    env: { ...spec.env },
    stdio: 'pipe',
    timeoutMs: spec.timeoutMs,
  });

  let stdout = '';
  let stderr = '';

  if (handle.process.stdout) {
    handle.process.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
  }
  if (handle.process.stderr) {
    handle.process.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
  }

  const result = await handle.wait(spec.timeoutMs);
  const durationMs = Date.now() - startTime;

  const parsed = parseJestResult(stdout + stderr);

  return {
    exitCode: result.exitCode ?? 1,
    success: result.exitCode === 0,
    stdout,
    stderr,
    durationMs,
    runner: JEST_CAPABILITIES.name as RunnerName,
    signal: result.signal,
    testsRun: parsed.testsRun,
    testsPassed: parsed.testsPassed,
    testsFailed: parsed.testsFailed,
  };
}

/**
 * Check if Jest is available in the project.
 */
export function hasJestBinary(projectRoot: string): boolean {
  return resolveJestBinary(projectRoot) !== null;
}

/**
 * Check whether the project has Vitest but no Jest.
 * Used by callers to distinguish "no runner at all" from "vitest-only (rejected)".
 */
export function hasOnlyVitest(projectRoot: string): boolean {
  // Check package.json
  try {
    const pkgJsonPath = path.join(projectRoot, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const hasJest = pkgJson.dependencies?.jest || pkgJson.devDependencies?.jest;
    const hasVitest = pkgJson.dependencies?.vitest || pkgJson.devDependencies?.vitest;
    if (hasJest) return false;
    if (hasVitest) return true;
  } catch {
    // fall through to binary check
  }
  // Binary check
  const jestPath = resolveJestBinary(projectRoot);
  if (jestPath) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require.resolve('vitest', { paths: [projectRoot] });
    return true;
  } catch {
    return false;
  }
}

export const jestCapabilities = JEST_CAPABILITIES;