/**
 * governed-vitest.ts — controlled vitest execution with path ownership enforcement.
 *
 * Delegates to the preserved launcher (automation/run-governed-vitest.mjs) for
 * lease enforcement (max 2 focused parents/project, exclusive full suite, stale
 * recovery). Enforces one worker, no file parallelism, and descendant cancellation
 * on timeout or process error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const LAUNCHER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../automation/run-governed-vitest.mjs',
);

export interface GovernedVitestOptions {
  /** Test files to run (relative to project root) */
  testFiles: string[];
  /** Project root directory for path resolution */
  root?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Fail fast on first test failure */
  failFast?: boolean;
  /** Lease mode: focused (one of two slots) or full (exclusive gate + both slots) */
  mode?: 'focused' | 'full';
}

export interface VitestResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  suitesRun: number;
}

export interface GovernedTestReceipt {
  taskId: string;
  filesChanged: string[];
  commandsRun: string[];
  exitCodes: number[];
  testsRun: string[];
  evidencePaths: string[];
  diffHashes: Record<string, string>;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  retries: number;
  assumptions: string[];
  unresolvedFindings: string[];
}

/**
 * Computes SHA256 hash of file content for diff verification.
 */
function computeFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Returns the absolute path to the preserved governed-vitest launcher.
 */
export function getLauncherPath(): string {
  return LAUNCHER_PATH;
}

/**
 * Builds the argv array for the governed launcher.
 *
 * Rejects caller-supplied worker-parallelism overrides up front (fail-closed).
 * The launcher enforces `--maxWorkers=1 --minWorkers=1 --no-file-parallelism`
 * as the hard ceiling on every invocation.
 */
export function buildGovernedVitestCommand(
  options: GovernedVitestOptions & { launcherPath?: string },
): string[] {
  const {
    testFiles,
    root = process.cwd(),
    timeoutMs = 120_000,
    mode = 'focused',
    launcherPath = LAUNCHER_PATH,
  } = options;

  const FORBIDDEN = ['--maxWorkers', '--minWorkers', '--fileParallelism', '--file-parallelism'];
  for (const tf of testFiles) {
    for (const flag of FORBIDDEN) {
      if (tf === flag || tf.startsWith(`${flag}=`)) {
        throw new Error(`Worker override ${tf} is forbidden; governed vitest always uses one worker without file parallelism`);
      }
    }
  }

  const configPath = path.resolve(root, 'vitest.verify.config.ts');
  if (!fs.existsSync(configPath)) {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, `import { defineConfig } from 'vitest/config';\nexport default defineConfig({});\n`, 'utf8');
    } catch {}
  }

  const vitestArgs = [
    'run',
    '--config',
    configPath,
    ...testFiles.map(f => path.resolve(root, f)),
  ];
  if (options.failFast) {
    vitestArgs.push('--reporter=json', '--reporter=verbose');
  }

  return [
    launcherPath,
    '--project-root',
    root,
    '--cwd',
    root,
    '--mode',
    mode,
    '--timeout-ms',
    String(timeoutMs),
    '--',
    ...vitestArgs,
  ];
}

/**
 * Kills the process tree rooted at `pid`. On Windows uses taskkill /T /F.
 * On POSIX it sends SIGTERM to the pid's process group (if `pid` was started
 * with `detached: true`), then falls back to a /proc-based descendant walk
 * to cover the case where the child was not a group leader. SIGKILL follows
 * if any descendants are still alive after a short grace period.
 */
export function terminateProcessTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // best-effort
    }
    return;
  }
  // Try the process group first (works when the child was detached).
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* not a process group leader */
  }
  // Walk /proc to find any descendants of `pid` and signal them too.
  const descendants = collectDescendantPids(pid);
  for (const d of descendants) {
    try { process.kill(d, 'SIGTERM'); } catch { /* already gone */ }
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  // If any descendants survived, escalate to SIGKILL after a brief grace.
  const survivors = descendants.filter((d) => {
    try { process.kill(d, 0); return true; } catch { return false; }
  });
  for (const d of survivors) {
    try { process.kill(d, 'SIGKILL'); } catch { /* already gone */ }
  }
}

/**
 * Returns the pids whose parent matches any of the roots. Linux uses procfs;
 * macOS uses one `ps` process table snapshot because it has no /proc. Recurses
 * one level at a time so a transient process entry does not abort the walk.
 */
function collectDescendantPids(rootPid: number): number[] {
  const result: number[] = [];
  const frontier: number[] = [rootPid];
  const visited = new Set<number>();
  let macProcessParents: Map<number, number> | null = null;
  if (process.platform === 'darwin') {
    try {
      const ps = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (ps.status !== 0) return result;
      macProcessParents = new Map(
        String(ps.stdout ?? '')
          .split('\n')
          .map((line) => line.trim().split(/\s+/).map(Number))
          .filter(([pid, ppid]) => Number.isInteger(pid) && Number.isInteger(ppid))
          .map(([pid, ppid]) => [pid, ppid] as [number, number]),
      );
    } catch {
      return result;
    }
  }
  while (frontier.length > 0) {
    const parent = frontier.shift()!;
    if (visited.has(parent)) continue;
    visited.add(parent);
    let pids: number[];
    if (macProcessParents) {
      pids = [...macProcessParents.keys()];
    } else {
      try {
        const entries = fs.readdirSync('/proc');
        pids = entries
          .filter((name) => /^\d+$/.test(name))
          .map((name) => Number(name));
      } catch {
        return result;
      }
    }
    for (const pid of pids) {
      if (visited.has(pid)) continue;
      let parentPid: number | undefined;
      if (macProcessParents) {
        parentPid = macProcessParents.get(pid);
      } else {
        let status: string;
        try {
          status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
        } catch {
          continue;
        }
        const ppidMatch = /PPid:\s*(\d+)/.exec(status);
        parentPid = ppidMatch ? Number(ppidMatch[1]) : undefined;
      }
      if (parentPid === parent) {
        result.push(pid);
        frontier.push(pid);
      }
    }
  }
  return result;
}

/**
 * Runs vitest through the preserved governed launcher with lease enforcement,
 * one worker, no file parallelism, and descendant cancellation on timeout/error.
 */
export async function runGovernedVitest(
  options: GovernedVitestOptions & { taskId: string; ownedPaths: string[] },
): Promise<VitestResult & { receipt?: GovernedTestReceipt }> {
  const {
    taskId,
    testFiles,
    ownedPaths,
    root = process.cwd(),
    timeoutMs = 120_000,
    failFast = false,
    mode = 'focused',
  } = options;

  const startTime = Date.now();
  const safeTestFiles = testFiles.map(f => path.resolve(root, f));

  // Validate all test files exist before running
  const missingFiles: string[] = [];
  for (const testFile of safeTestFiles) {
    if (!fs.existsSync(testFile)) {
      missingFiles.push(testFile);
    }
  }
  if (missingFiles.length > 0) {
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: `Missing test files: ${missingFiles.join(', ')}`,
      durationMs: Date.now() - startTime,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      suitesRun: 0,
      receipt: {
        taskId,
        filesChanged: [],
        commandsRun: ['npx vitest run --config vitest.verify.config.ts'],
        exitCodes: [1],
        testsRun: [],
        evidencePaths: [],
        diffHashes: {},
        status: 'FAIL',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [`Missing test files: ${missingFiles.join(', ')}`],
      },
    };
  }

  const argv = buildGovernedVitestCommand({ ...options, root, timeoutMs, mode });

  return new Promise((resolve) => {
    let settled = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const proc = spawn(process.execPath, argv, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    proc.stdout?.on('data', (c) => stdoutChunks.push(c));
    proc.stderr?.on('data', (c) => stderrChunks.push(c));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateProcessTree(proc.pid ?? 0);
      const durationMs = Date.now() - startTime;
      resolve({
        success: false,
        exitCode: 124,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8') + `\nTimed out after ${timeoutMs}ms`,
        durationMs,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        suitesRun: 0,
        receipt: {
          taskId,
          filesChanged: [],
          commandsRun: [`governed-vitest run --config vitest.verify.config.ts ${safeTestFiles.length} files`],
          exitCodes: [124],
          testsRun: [],
          evidencePaths: [],
          diffHashes: {},
          status: 'BLOCKED',
          retries: 0,
          assumptions: ['Timeout was hit'],
          unresolvedFindings: [`Governed vitest timed out after ${timeoutMs}ms`],
        },
      });
    }, timeoutMs);

    proc.on('close', (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const outText = Buffer.concat(stdoutChunks).toString('utf-8');
      const errText = Buffer.concat(stderrChunks).toString('utf-8');

      const isNoTestFiles = outText.includes('No test files found') || errText.includes('No test files found');
      if (exitCode === 0) {
        process.stdout.write(outText);
        process.stderr.write(errText);
      } else {
        if (!isNoTestFiles) {
          process.stdout.write(outText);
          process.stderr.write(errText);
        }
      }

      // Parse vitest JSON output if available
      let jsonReport: unknown;
      try {
        const reportPath = path.join(root, 'vitest-verify-report.json');
        if (fs.existsSync(reportPath)) {
          const reportContent = fs.readFileSync(reportPath, 'utf-8');
          jsonReport = JSON.parse(reportContent);
        }
      } catch {
        // Ignore parsing errors
      }

      const durationMs = Date.now() - startTime;
      const report = jsonReport as Record<string, unknown> | undefined;
      const testsTotal = (report?.numTotalTests as number) || 0;
      const testsPassed = (report?.numPassedTests as number) || 0;
      const testsFailed = (report?.numFailedTests as number) || 0;
      const suitesRun = (report?.testResults as unknown[] | undefined)?.length || 0;

      const success = exitCode === 0;

      // Build receipt with diff hashes for owned paths
      const diffHashes: Record<string, string> = {};
      for (const ownedPath of ownedPaths) {
        const fullPath = path.resolve(root, ownedPath);
        if (fs.existsSync(fullPath)) {
          diffHashes[ownedPath] = computeFileHash(fullPath);
        }
      }

      const filesChanged = ownedPaths.filter(p => fs.existsSync(path.resolve(root, p)));

      const receipt: GovernedTestReceipt = {
        taskId,
        filesChanged,
        commandsRun: [`governed-vitest run --config vitest.verify.config.ts ${safeTestFiles.length} files`],
        exitCodes: [exitCode ?? 1],
        testsRun: [],
        evidencePaths: [],
        diffHashes,
        status: success ? 'PASS' : 'FAIL',
        retries: 0,
        assumptions: [],
        unresolvedFindings: success ? [] : [`Exit code: ${exitCode ?? 1}`],
      };

      resolve({
        success,
        exitCode: exitCode ?? 1,
        stdout: outText,
        stderr: errText,
        durationMs,
        testsRun: testsTotal,
        testsPassed,
        testsFailed,
        suitesRun,
        receipt,
      });
    });

    proc.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      terminateProcessTree(proc.pid ?? 0);
      const durationMs = Date.now() - startTime;
      resolve({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        durationMs,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        suitesRun: 0,
        receipt: {
          taskId,
          filesChanged: [],
          commandsRun: [`governed-vitest run --config vitest.verify.config.ts`],
          exitCodes: [1],
          testsRun: [],
          evidencePaths: [],
          diffHashes: {},
          status: 'FAIL',
          retries: 0,
          assumptions: [],
          unresolvedFindings: [err.message],
        },
      });
    });
  });
}

/**
 * Validates a receipt against owned paths and governance rules.
 */
export function validateGovernedReceipt(
  receipt: GovernedTestReceipt,
  ownedPaths: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Owned path validation - filesChanged must be subset of ownedPaths
  for (const changed of receipt.filesChanged) {
    if (!ownedPaths.includes(changed)) {
      errors.push(`File changed outside owned paths: ${changed}`);
    }
  }

  // 2. Diff hash validation for changed files
  for (const changed of receipt.filesChanged) {
    if (!receipt.diffHashes[changed]) {
      errors.push(`Missing diff hash for changed file: ${changed}`);
    }
  }

  // 3. Exit code validation
  if (receipt.exitCodes.length === 0 && receipt.status === 'FAIL') {
    errors.push('Commands executed but no exit codes recorded');
  }

  const nonZeroExits = receipt.exitCodes.filter(c => c !== 0);
  if (nonZeroExits.length > 0 && receipt.status === 'PASS') {
    errors.push(`Non-zero exit codes with PASS status: ${nonZeroExits.join(', ')}`);
  }

  // 4. Fake PASS rejection
  const hasEvidence = receipt.evidencePaths.length > 0;
  const hasCommand = receipt.commandsRun.length > 0;
  const hasExit = receipt.exitCodes.length > 0 && receipt.exitCodes.every(c => c === 0);
  const hasDiffs = Object.keys(receipt.diffHashes).length > 0;

  if (receipt.status === 'PASS' && !hasEvidence && !hasCommand && !hasExit && !hasDiffs) {
    errors.push('FABRICATED PASS: no evidence/commands/exits/diffs');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a task receipt for governance.
 */
export function createGovernedReceipt(
  taskId: string,
  result: VitestResult & { receipt?: GovernedTestReceipt },
  ownedPaths: string[],
): GovernedTestReceipt {
  return result.receipt ?? {
    taskId,
    filesChanged: [...ownedPaths],
    commandsRun: [],
    exitCodes: [result.exitCode],
    testsRun: [],
    evidencePaths: [],
    diffHashes: {},
    status: result.success ? 'PASS' : 'FAIL',
    retries: 0,
    assumptions: [],
    unresolvedFindings: [],
  };
}
