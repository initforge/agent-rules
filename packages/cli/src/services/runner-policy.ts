/**
 * runner-policy.ts — Exact-owned lease validation, runner detection, process-group cleanup.
 *
 * Scope: MCP/browser/process lease validation without broad kill semantics.
 * - Lease validity: only owned PIDs; no foreign kill.
 * - Runner detection: Vitest/Jest processes by command signature.
 * - Cleanup policy: targeted, lease-aware process termination.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeaseRecord {
  pid: number;
  token: string;
  kind: 'mcp' | 'browser' | 'process' | 'vitest' | 'jest';
  projectRoot: string;
  acquiredAt: string;
  expiresAt?: string;
}

export interface RunnerInfo {
  pid: number;
  kind: 'vitest' | 'jest' | 'unknown';
  command: string;
  projectRoot: string;
  startedAt: string;
}

export interface CleanupResult {
  cleaned: number;
  errors: string[];
}

export interface LeaseValidation {
  valid: boolean;
  reason?: string;
}

// ── Process liveness check ─────────────────────────────────────────────────────

/**
 * Checks if a PID is alive.
 * Returns true for EPERM (Windows process exists but access denied).
 */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ── Lease file I/O ─────────────────────────────────────────────────────────────

function canonicalPath(input: string): string {
  const resolved = path.resolve(input);
  let canonical: string;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    canonical = resolved;
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function leaseDir(projectRoot: string): string {
  const canonical = canonicalPath(projectRoot);
  const key = require('node:crypto')
    .createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 24);
  return path.join(process.env.AGENT_RULES_LEASE_ROOT ?? path.join(require('node:os').tmpdir(), 'agent-rules-runner'), key);
}

export function readLease(filePath: string): LeaseRecord | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.pid === 'number' &&
      typeof parsed.token === 'string' &&
      typeof parsed.kind === 'string' &&
      typeof parsed.projectRoot === 'string'
    ) {
      return parsed as LeaseRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLease(filePath: string, record: LeaseRecord): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: 'utf-8', flag: 'wx' });
}

export function removeLease(filePath: string, token: string): boolean {
  const current = readLease(filePath);
  if (!current) return true;
  // Token mismatch: do not remove foreign lease
  if (current.token !== token) return false;
  try {
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Lease validation ───────────────────────────────────────────────────────────

/**
 * Validates a lease is owned by the given PID and token.
 * Fails closed: missing/foreign/corrupt leases are invalid.
 */
export function validateLease(
  filePath: string,
  ownerPid: number,
  ownerToken: string,
): LeaseValidation {
  const lease = readLease(filePath);
  if (!lease) {
    return { valid: false, reason: 'lease not found or corrupt' };
  }
  if (lease.pid !== ownerPid) {
    return { valid: false, reason: `lease owned by foreign PID ${lease.pid}` };
  }
  if (lease.token !== ownerToken) {
    return { valid: false, reason: 'lease token mismatch' };
  }
  if (!pidAlive(lease.pid)) {
    return { valid: false, reason: `lease owner PID ${lease.pid} is dead` };
  }
  return { valid: true };
}

/**
 * Check if a lease exists and is held by a live process.
 */
export function isLeaseActive(filePath: string): boolean {
  const lease = readLease(filePath);
  if (!lease) return false;
  return pidAlive(lease.pid);
}

// ── Runner detection ───────────────────────────────────────────────────────────

const VITEST_SIGNATURES = ['vitest', 'vitest.mjs', 'vitest.js', '@vitest', 'vitest.run'];
const JEST_SIGNATURES = ['jest', 'jest.js', '@jest'];

function detectRunnerKind(command: string): 'vitest' | 'jest' | 'unknown' {
  const lower = command.toLowerCase();
  for (const sig of VITEST_SIGNATURES) {
    if (lower.includes(sig)) return 'vitest';
  }
  for (const sig of JEST_SIGNATURES) {
    if (lower.includes(sig)) return 'jest';
  }
  return 'unknown';
}

/**
 * Lists running Vitest/Jest processes for a project root.
 * Uses platform-specific process listing.
 */
export function detectRunners(projectRoot: string): RunnerInfo[] {
  const runners: RunnerInfo[] = [];
  const canonical = canonicalPath(projectRoot);

  try {
    let psOutput: string;
    if (process.platform === 'win32') {
      psOutput = execSync(
        'wmic process where "name like \'%node%\'" get processid,commandline 2>nul',
        { encoding: 'utf-8', timeout: 5000 },
      );
    } else {
      psOutput = execSync(
        'ps aux 2>/dev/null || ps -ef 2>/dev/null',
        { encoding: 'utf-8', timeout: 5000 },
      );
    }

    const lines = psOutput.split('\n');
    for (const line of lines) {
      // Parse process info
      const pidMatch = line.match(/(?:^|\s)(\d+)(?:\s|$)/);
      if (!pidMatch) continue;

      const pid = parseInt(pidMatch[1]!, 10);
      if (pid === process.pid) continue; // Skip self

      const kind = detectRunnerKind(line);
      if (kind === 'unknown') continue;

      // Check if cwd or command references the project root
      if (line.includes(canonical) || line.includes(projectRoot)) {
        runners.push({
          pid,
          kind,
          command: line.trim(),
          projectRoot: canonical,
          startedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Process listing may fail; return empty
  }

  return runners;
}

/**
 * Check if any Vitest/Jest runners are active for the project.
 */
export function hasActiveRunners(projectRoot: string): boolean {
  return detectRunners(projectRoot).length > 0;
}

// ── Process cleanup policy ─────────────────────────────────────────────────────

/**
 * Cleans up a specific PID's lease file only if owned.
 * Never broad-kills: validates ownership before any action.
 */
export function cleanupLease(projectRoot: string, kind: LeaseRecord['kind']): CleanupResult {
  const errors: string[] = [];
  let cleaned = 0;
  const dir = leaseDir(projectRoot);

  if (!fs.existsSync(dir)) return { cleaned, errors };

  const leaseFile = path.join(dir, `${kind}.lease.json`);
  const lease = readLease(leaseFile);

  if (!lease) return { cleaned, errors };

  // Never remove foreign live leases
  if (lease.pid !== process.pid && pidAlive(lease.pid)) {
    errors.push(`skipping foreign live lease: PID ${lease.pid}`);
    return { cleaned, errors };
  }

  // Allow cleanup of own leases or dead foreign leases
  try {
    fs.rmSync(leaseFile, { force: true });
    cleaned = 1;
  } catch (e: unknown) {
    errors.push(`failed to remove ${leaseFile}: ${(e as Error).message}`);
  }

  return { cleaned, errors };
}

/**
 * Terminates a specific process tree without broad kill.
 * Validates: process must exist, must match expected owner context.
 */
export function terminateProcessTree(
  pid: number,
  expectedProjectRoot: string,
  _ownedToken?: string,
): { success: boolean; error?: string } {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { success: false, error: 'invalid PID' };
  }

  // Check if process is alive
  if (!pidAlive(pid)) {
    return { success: true }; // Already gone
  }

  // Verify this process belongs to the expected project
  // ponytail: full command-line verification when process ownership tracking is added
  try {
    if (process.platform === 'win32') {
      const result = execSync(`wmic process where processid=${pid} get commandline 2>nul`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (!result.includes(expectedProjectRoot)) {
        return { success: false, error: `PID ${pid} does not belong to project ${expectedProjectRoot}` };
      }
    } else {
      const result = execSync(`ps -p ${pid} -o args= 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (!result.includes(expectedProjectRoot)) {
        return { success: false, error: `PID ${pid} does not belong to project ${expectedProjectRoot}` };
      }
    }
  } catch {
    // Could not verify; be conservative and skip
    return { success: false, error: `cannot verify ownership of PID ${pid}` };
  }

  // Perform targeted termination
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
    } else {
      // Try process group first, then direct
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Cleanup all leases for a project root.
 * Protected: only removes own leases or stale dead foreign leases.
 */
export function cleanupProjectLeases(projectRoot: string): CleanupResult {
  const errors: string[] = [];
  let totalCleaned = 0;
  const dir = leaseDir(projectRoot);

  if (!fs.existsSync(dir)) return { cleaned: 0, errors };

  const kinds: LeaseRecord['kind'][] = ['mcp', 'browser', 'process', 'vitest', 'jest'];

  for (const kind of kinds) {
    const result = cleanupLease(projectRoot, kind);
    totalCleaned += result.cleaned;
    errors.push(...result.errors);
  }

  return { cleaned: totalCleaned, errors };
}

// ── MCP lease management ───────────────────────────────────────────────────────

export function acquireMcpLease(
  projectRoot: string,
  pid: number,
  token: string,
): { path: string; release: () => void } {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'mcp.lease.json');

  const record: LeaseRecord = {
    pid,
    token,
    kind: 'mcp',
    projectRoot: canonicalPath(projectRoot),
    acquiredAt: new Date().toISOString(),
  };

  writeLease(leaseFile, record);

  return {
    path: leaseFile,
    release: () => removeLease(leaseFile, token),
  };
}

export function validateMcpLease(projectRoot: string, pid: number, token: string): LeaseValidation {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'mcp.lease.json');
  return validateLease(leaseFile, pid, token);
}

// ── Browser lease management ───────────────────────────────────────────────────

export function acquireBrowserLease(
  projectRoot: string,
  pid: number,
  token: string,
): { path: string; release: () => void } {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'browser.lease.json');

  const record: LeaseRecord = {
    pid,
    token,
    kind: 'browser',
    projectRoot: canonicalPath(projectRoot),
    acquiredAt: new Date().toISOString(),
  };

  writeLease(leaseFile, record);

  return {
    path: leaseFile,
    release: () => removeLease(leaseFile, token),
  };
}

export function validateBrowserLease(projectRoot: string, pid: number, token: string): LeaseValidation {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'browser.lease.json');
  return validateLease(leaseFile, pid, token);
}

// ── Process lease management ───────────────────────────────────────────────────

export function acquireProcessLease(
  projectRoot: string,
  pid: number,
  token: string,
): { path: string; release: () => void } {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'process.lease.json');

  const record: LeaseRecord = {
    pid,
    token,
    kind: 'process',
    projectRoot: canonicalPath(projectRoot),
    acquiredAt: new Date().toISOString(),
  };

  writeLease(leaseFile, record);

  return {
    path: leaseFile,
    release: () => removeLease(leaseFile, token),
  };
}

export function validateProcessLease(projectRoot: string, pid: number, token: string): LeaseValidation {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'process.lease.json');
  return validateLease(leaseFile, pid, token);
}

// ── Vitest lease management ────────────────────────────────────────────────────

export function acquireVitestLease(
  projectRoot: string,
  pid: number,
  token: string,
): { path: string; release: () => void } {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'vitest.lease.json');

  const record: LeaseRecord = {
    pid,
    token,
    kind: 'vitest',
    projectRoot: canonicalPath(projectRoot),
    acquiredAt: new Date().toISOString(),
  };

  writeLease(leaseFile, record);

  return {
    path: leaseFile,
    release: () => removeLease(leaseFile, token),
  };
}

export function validateVitestLease(projectRoot: string, pid: number, token: string): LeaseValidation {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'vitest.lease.json');
  return validateLease(leaseFile, pid, token);
}

// ── Jest lease management ───────────────────────────────────────────────────────

export function acquireJestLease(
  projectRoot: string,
  pid: number,
  token: string,
): { path: string; release: () => void } {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'jest.lease.json');

  const record: LeaseRecord = {
    pid,
    token,
    kind: 'jest',
    projectRoot: canonicalPath(projectRoot),
    acquiredAt: new Date().toISOString(),
  };

  writeLease(leaseFile, record);

  return {
    path: leaseFile,
    release: () => removeLease(leaseFile, token),
  };
}

export function validateJestLease(projectRoot: string, pid: number, token: string): LeaseValidation {
  const dir = leaseDir(projectRoot);
  const leaseFile = path.join(dir, 'jest.lease.json');
  return validateLease(leaseFile, pid, token);
}

// ── Lease directory management ─────────────────────────────────────────────────

export { leaseDir };
