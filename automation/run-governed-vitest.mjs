#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SLOT_COUNT = 2;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 50;
const INCOMPLETE_LEASE_GRACE_MS = 5_000;

export class VitestLeaseTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VitestLeaseTimeoutError';
  }
}

function canonicalPath(input) {
  const resolved = path.resolve(input);
  let canonical;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    canonical = resolved;
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function projectLeaseDirectory(projectRoot, leaseRoot) {
  const canonicalProjectRoot = canonicalPath(projectRoot);
  const key = crypto.createHash('sha256').update(canonicalProjectRoot).digest('hex').slice(0, 24);
  const base = leaseRoot
    ? path.resolve(leaseRoot)
    : path.join(os.tmpdir(), 'agent-rules-vitest-governor');
  return {
    canonicalProjectRoot,
    directory: path.join(base, key),
  };
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLease(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Number.isInteger(parsed.pid) && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function activeLease(filePath, isProcessAlive = processIsAlive) {
  if (!fs.existsSync(filePath)) return null;

  const lease = readLease(filePath);
  if (lease && isProcessAlive(lease.pid)) return lease;

  // A contender can observe the file between exclusive creation and its
  // synchronous write. Treat a very recent incomplete file as active.
  if (!lease) {
    try {
      if (Date.now() - fs.statSync(filePath).mtimeMs < INCOMPLETE_LEASE_GRACE_MS) {
        return { pid: 0, token: 'pending-write' };
      }
    } catch {
      return null;
    }
  }

  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // A concurrent contender may already have recovered it.
  }
  return null;
}

function tryCreateLease(filePath, record, isProcessAlive) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(filePath, `${JSON.stringify(record)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (activeLease(filePath, isProcessAlive)) return false;
    }
  }
  return false;
}

function releaseOwnedLease(filePath, token) {
  const current = readLease(filePath);
  if (current?.token !== token) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // A released lease is already in the desired state.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertBeforeDeadline(deadline, mode, projectRoot) {
  if (Date.now() >= deadline) {
    throw new VitestLeaseTimeoutError(
      `Timed out waiting for ${mode} Vitest capacity in project ${projectRoot}`,
    );
  }
}

function newLeaseRecord(projectRoot, mode, kind, pid) {
  return {
    version: 1,
    token: crypto.randomUUID(),
    pid,
    mode,
    kind,
    projectRoot,
    acquiredAt: new Date().toISOString(),
  };
}

/**
 * Acquire per-project Vitest capacity.
 *
 * focused: one of two slots; two focused parents may coexist.
 * full: an exclusive gate plus both slots; no focused parent can enter.
 *
 * The project-keyed directory deliberately does not impose a cross-project
 * ceiling. The adaptive global governor remains the authority above this
 * per-project hard limit.
 */
export async function acquireProjectVitestLease(options) {
  const mode = options.mode;
  if (mode !== 'focused' && mode !== 'full') {
    throw new Error(`Vitest lease mode must be "focused" or "full"; received ${mode}`);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const pid = options.pid ?? process.pid;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const { canonicalProjectRoot, directory } = projectLeaseDirectory(
    options.projectRoot,
    options.leaseRoot,
  );
  const exclusivePath = path.join(directory, 'exclusive.lease.json');
  const slotPaths = Array.from(
    { length: SLOT_COUNT },
    (_, index) => path.join(directory, `slot-${index}.lease.json`),
  );
  const deadline = Date.now() + timeoutMs;

  if (mode === 'focused') {
    while (true) {
      assertBeforeDeadline(deadline, mode, canonicalProjectRoot);
      if (activeLease(exclusivePath, isProcessAlive)) {
        await delay(pollMs);
        continue;
      }

      for (const slotPath of slotPaths) {
        const record = newLeaseRecord(canonicalProjectRoot, mode, 'slot', pid);
        if (!tryCreateLease(slotPath, record, isProcessAlive)) continue;

        // Close the race where a full run raised its gate after our first check.
        if (activeLease(exclusivePath, isProcessAlive)) {
          releaseOwnedLease(slotPath, record.token);
          break;
        }

        return {
          mode,
          projectRoot: canonicalProjectRoot,
          paths: [slotPath],
          release: () => releaseOwnedLease(slotPath, record.token),
        };
      }
      await delay(pollMs);
    }
  }

  let gateRecord;
  while (!gateRecord) {
    assertBeforeDeadline(deadline, mode, canonicalProjectRoot);
    const candidate = newLeaseRecord(canonicalProjectRoot, mode, 'exclusive', pid);
    if (tryCreateLease(exclusivePath, candidate, isProcessAlive)) gateRecord = candidate;
    else await delay(pollMs);
  }

  try {
    while (true) {
      assertBeforeDeadline(deadline, mode, canonicalProjectRoot);
      const acquired = [];
      for (const slotPath of slotPaths) {
        const record = newLeaseRecord(canonicalProjectRoot, mode, 'slot', pid);
        if (!tryCreateLease(slotPath, record, isProcessAlive)) break;
        acquired.push({ path: slotPath, record });
      }

      if (acquired.length === SLOT_COUNT) {
        return {
          mode,
          projectRoot: canonicalProjectRoot,
          paths: [exclusivePath, ...slotPaths],
          release: () => {
            for (const item of acquired) releaseOwnedLease(item.path, item.record.token);
            releaseOwnedLease(exclusivePath, gateRecord.token);
          },
        };
      }

      for (const item of acquired) releaseOwnedLease(item.path, item.record.token);
      await delay(pollMs);
    }
  } catch (error) {
    releaseOwnedLease(exclusivePath, gateRecord.token);
    throw error;
  }
}

const FORBIDDEN_WORKER_ARGUMENTS = [
  '--maxWorkers',
  '--minWorkers',
  '--fileParallelism',
  '--file-parallelism',
];

export function governedVitestArguments(input) {
  for (const argument of input) {
    if (FORBIDDEN_WORKER_ARGUMENTS.some(
      (flag) => argument === flag || argument.startsWith(`${flag}=`),
    )) {
      throw new Error(
        `Worker override ${argument} is forbidden; governed Vitest always uses one worker without file parallelism`,
      );
    }
  }

  const args = input.length > 0 ? [...input] : ['run'];
  args.push('--maxWorkers=1', '--minWorkers=1', '--no-file-parallelism');
  return args;
}

function findVitestExecutable(projectRoot, cwd) {
  const monorepoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const candidates = [
    path.join(monorepoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
  ];
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(`Unable to locate node_modules/vitest/vitest.mjs from monorepo root, ${projectRoot}, or ${cwd}`);
  }
  return executable;
}

function parseCli(argv) {
  const separator = argv.indexOf('--');
  const control = separator === -1 ? argv : argv.slice(0, separator);
  const vitestArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const options = {
    projectRoot: process.cwd(),
    cwd: process.cwd(),
    mode: undefined,
    timeoutMs: undefined,
  };

  for (let index = 0; index < control.length; index += 1) {
    const flag = control[index];
    const value = control[index + 1];
    if (flag === '--project-root' && value) options.projectRoot = value;
    else if (flag === '--cwd' && value) options.cwd = value;
    else if (flag === '--mode' && value) options.mode = value;
    else if (flag === '--timeout-ms' && value) options.timeoutMs = Number(value);
    else throw new Error(`Unknown or incomplete governed Vitest option: ${flag}`);
    index += 1;
  }

  options.projectRoot = canonicalPath(options.projectRoot);
  options.cwd = canonicalPath(options.cwd);
  if (!Number.isFinite(options.timeoutMs)) {
    const fromEnvironment = Number(process.env.AGENT_RULES_VITEST_LEASE_TIMEOUT_MS);
    options.timeoutMs = Number.isFinite(fromEnvironment) && fromEnvironment > 0
      ? fromEnvironment
      : DEFAULT_TIMEOUT_MS;
  }
  return { options, vitestArgs };
}

export async function runGovernedVitest(argv) {
  const { options, vitestArgs } = parseCli(argv);
  const args = governedVitestArguments(vitestArgs);
  const lease = await acquireProjectVitestLease({
    projectRoot: options.projectRoot,
    leaseRoot: process.env.AGENT_RULES_VITEST_LEASE_ROOT,
    mode: options.mode,
    timeoutMs: options.timeoutMs,
  });

  try {
    const executable = findVitestExecutable(options.projectRoot, options.cwd);
    const result = spawnSync(process.execPath, [executable, ...args], {
      cwd: options.cwd,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    return typeof result.status === 'number' ? result.status : 1;
  } finally {
    lease.release();
  }
}

const isEntrypoint = process.argv[1]
  && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  runGovernedVitest(process.argv.slice(2))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(`[vitest-governor] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
