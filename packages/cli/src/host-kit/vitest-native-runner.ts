/**
 * host-kit/vitest-native-runner — Native Vitest runner for the host-kit.
 *
 * Executes vitest natively with governance enforced at the runner level:
 *   - 2 parents/project (lease slots are managed by the preserved governed-vitest.mjs)
 *   - 1 worker (--maxWorkers=1, --minWorkers=1)
 *   - no file parallelism (--no-file-parallelism)
 *
 * This module does NOT delegate to the governed launcher; it invokes vitest
 * directly to demonstrate native runner selection. File ownership and
 * lease control remain the responsibility of the caller or the higher-level
 * orchestrator when using the preserved launcher.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { RunnerName, NativeTestResult, TestJobSpec } from './types.js';
import { VITEST_CAPABILITIES } from './types.js';
import { spawnDisposable, type DisposeProcessHandle } from './process-cleanup.js';
import { createHash } from 'node:crypto';

/**
 * Resolve the vitest binary at the project root, or null if not found.
 */
export function resolveVitestBinary(projectRoot: string): string | null {
  const candidates = [
    // Monorepo-level vitest
    path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'),
    // Project-level vitest
    path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    // npx-style fallback (will use system vitest if available)
    'vitest',
  ];

  for (const candidate of candidates) {
    if (candidate === 'vitest') {
      // Check for vitest in the path
      try {
        require.resolve('vitest', { paths: [projectRoot] });
        return 'vitest';
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

/** Parse vitest summary output for test counts. */
function parseVitestResult(output: string): { testsRun: number; testsPassed: number; testsFailed: number } {
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  // Vitest outputs a summary like:
  // "Test Files  2 passed (2)"
  // "     Tests  10 passed (10)"
  const testFileMatch = output.match(/Tests\s+(\d+)\s+(?:passed|failed)/i);
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);

  if (passedMatch) testsPassed = parseInt(passedMatch[1], 10);
  if (failedMatch) testsFailed = parseInt(failedMatch[1], 10);
  testsRun = testsPassed + testsFailed;

  return { testsRun, testsPassed, testsFailed };
}

/**
 * Run vitest natively with the governed flags.
 *
 * This spawn keeps the child in a process group for cleanable
 * termination. The caller is responsible for lease coordination
 * if running in focused mode alongside other parents.
 */
export async function runVitestNative(
  spec: TestJobSpec,
): Promise<NativeTestResult> {
  const startTime = Date.now();
  const binaryPath = resolveVitestBinary(spec.projectRoot);

  if (!binaryPath) {
    return {
      exitCode: 1,
      success: false,
      stdout: '',
      stderr: 'vitest binary not found; ensure vitest is installed in the project',
      durationMs: Date.now() - startTime,
      runner: VITEST_CAPABILITIES.name,
      signal: null,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
    };
  }

  const testFiles = spec.testFiles.map((f) =>
    path.isAbsolute(f) ? f : path.join(spec.projectRoot, f),
  );

  // Build vitest args: run + enforced flags + test files
  const args = [
    'run',
    ...VITEST_CAPABILITIES.enforcedFlags,
    ...testFiles,
  ];

  const handle = spawnDisposable(binaryPath, args, {
    cwd: spec.projectRoot,
    env: { ...spec.env },
    stdio: 'pipe',
    timeoutMs: spec.timeoutMs,
  });

  // Aggregate stdout for parsing
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

  const parsed = parseVitestResult(stdout + stderr);

  return {
    exitCode: result.exitCode ?? 1,
    success: result.exitCode === 0,
    stdout,
    stderr,
    durationMs,
    runner: VITEST_CAPABILITIES.name as RunnerName,
    signal: result.signal,
    testsRun: parsed.testsRun,
    testsPassed: parsed.testsPassed,
    testsFailed: parsed.testsFailed,
  };
}

/**
 * Verify the vitest binary exists in the project root.
 * Returns true if vitest can be invoked natively.
 */
export function hasVitestBinary(projectRoot: string): boolean {
  return resolveVitestBinary(projectRoot) !== null;
}

/**
 * Compute a content hash for a file, used for diff verification.
 */
export function computeDiffHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

// Export the capabilities as a singleton for importers
export const vitestCapabilities = VITEST_CAPABILITIES;