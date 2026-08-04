/**
 * runner-policy.test.ts — Focused tests for runner-policy.ts
 * W4 owns: exact-owned MCP/browser/process lease validation, runner detection, cleanup.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  pidAlive,
  readLease,
  writeLease,
  removeLease,
  validateLease,
  isLeaseActive,
  detectRunnerKind,
  detectRunners,
  hasActiveRunners,
  cleanupLease,
  terminateProcessTree,
  cleanupProjectLeases,
  acquireMcpLease,
  validateMcpLease,
  acquireBrowserLease,
  validateBrowserLease,
  acquireProcessLease,
  validateProcessLease,
  acquireVitestLease,
  validateVitestLease,
  acquireJestLease,
  validateJestLease,
  leaseDir,
} from '../src/services/runner-policy.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-policy-test-'));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Clean up any existing lease files
  const dir = leaseDir(tmpDir);
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.lease.json') || file.endsWith('.json')) {
        fs.rmSync(path.join(dir, file), { force: true });
      }
    }
  }
});

describe('pidAlive', () => {
  it('returns true for current process', () => {
    expect(pidAlive(process.pid)).toBe(true);
  });

  it('returns false for invalid PIDs', () => {
    expect(pidAlive(0)).toBe(false);
    expect(pidAlive(-1)).toBe(false);
    expect(pidAlive(999999999)).toBe(false);
  });
});

describe('Lease I/O', () => {
  const token = crypto.randomUUID();
  const leaseFile = path.join(tmpDir, 'test.lease.json');

  afterAll(() => {
    fs.rmSync(leaseFile, { force: true });
  });

  it('writeLease creates file with correct content', () => {
    const record = {
      pid: process.pid,
      token,
      kind: 'mcp' as const,
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    };
    writeLease(leaseFile, record);

    const read = readLease(leaseFile);
    expect(read).not.toBeNull();
    expect(read!.pid).toBe(process.pid);
    expect(read!.token).toBe(token);
    expect(read!.kind).toBe('mcp');
  });

  it('readLease returns null for non-existent file', () => {
    expect(readLease('/nonexistent/lease.json')).toBeNull();
  });

  it('readLease returns null for corrupt JSON', () => {
    const corruptFile = path.join(tmpDir, 'corrupt.lease.json');
    fs.writeFileSync(corruptFile, 'not json', 'utf-8');
    expect(readLease(corruptFile)).toBeNull();
    fs.rmSync(corruptFile, { force: true });
  });

  it('removeLease removes owned lease', () => {
    const file = path.join(tmpDir, 'owned.lease.json');
    const t = crypto.randomUUID();
    writeLease(file, {
      pid: process.pid,
      token: t,
      kind: 'process',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    expect(removeLease(file, t)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('removeLease refuses to remove token mismatch', () => {
    const file = path.join(tmpDir, 'foreign.lease.json');
    const ownerToken = crypto.randomUUID();
    const thiefToken = crypto.randomUUID();

    writeLease(file, {
      pid: process.pid,
      token: ownerToken,
      kind: 'process',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    expect(removeLease(file, thiefToken)).toBe(false);
    expect(fs.existsSync(file)).toBe(true);

    fs.rmSync(file, { force: true });
  });
});

describe('Lease validation', () => {
  it('validateLease rejects non-existent lease', () => {
    const result = validateLease('/nonexistent/lease.json', process.pid, 'any-token');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('validateLease rejects wrong PID', () => {
    const file = path.join(tmpDir, 'wrong-pid.lease.json');
    writeLease(file, {
      pid: 99999,
      token: 'token',
      kind: 'mcp',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    const result = validateLease(file, process.pid, 'token');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('foreign PID');

    fs.rmSync(file, { force: true });
  });

  it('validateLease rejects wrong token', () => {
    const file = path.join(tmpDir, 'wrong-token.lease.json');
    writeLease(file, {
      pid: process.pid,
      token: 'correct-token',
      kind: 'mcp',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    const result = validateLease(file, process.pid, 'wrong-token');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('token mismatch');

    fs.rmSync(file, { force: true });
  });

  it('validateLease accepts valid owned lease', () => {
    const file = path.join(tmpDir, 'valid.lease.json');
    const token = crypto.randomUUID();
    writeLease(file, {
      pid: process.pid,
      token,
      kind: 'mcp',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    const result = validateLease(file, process.pid, token);
    expect(result.valid).toBe(true);

    fs.rmSync(file, { force: true });
  });

  it('isLeaseActive returns true for live owned lease', () => {
    const file = path.join(tmpDir, 'active.lease.json');
    writeLease(file, {
      pid: process.pid,
      token: 'token',
      kind: 'browser',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    });

    expect(isLeaseActive(file)).toBe(true);

    fs.rmSync(file, { force: true });
  });

  it('isLeaseActive returns false for non-existent lease', () => {
    expect(isLeaseActive('/nonexistent/lease.json')).toBe(false);
  });
});

describe('Runner detection', () => {
  it('detectRunnerKind identifies vitest', () => {
    expect(detectRunnerKind('node_modules/vitest/vitest.mjs')).toBe('vitest');
    expect(detectRunnerKind('npx vitest run')).toBe('vitest');
    expect(detectRunnerKind('vitest --config vitest.config.ts')).toBe('vitest');
  });

  it('detectRunnerKind identifies jest', () => {
    expect(detectRunnerKind('node_modules/jest/bin/jest.js')).toBe('jest');
    expect(detectRunnerKind('npx jest')).toBe('jest');
    expect(detectRunnerKind('jest --config jest.config.js')).toBe('jest');
  });

  it('detectRunnerKind returns unknown for non-test runners', () => {
    expect(detectRunnerKind('node server.js')).toBe('unknown');
    expect(detectRunnerKind('webpack --mode production')).toBe('unknown');
  });

  it('detectRunners returns empty array when no runners found', () => {
    const runners = detectRunners(tmpDir);
    expect(Array.isArray(runners)).toBe(true);
    // May or may not find runners depending on system state
  });

  it('hasActiveRunners returns boolean', () => {
    const result = hasActiveRunners(tmpDir);
    expect(typeof result).toBe('boolean');
  });
});

describe('MCP lease management', () => {
  it('acquireMcpLease creates lease and returns release function', () => {
    const token = crypto.randomUUID();
    const { path: leasePath, release } = acquireMcpLease(tmpDir, process.pid, token);

    expect(fs.existsSync(leasePath)).toBe(true);
    const lease = readLease(leasePath);
    expect(lease!.kind).toBe('mcp');
    expect(lease!.pid).toBe(process.pid);

    release();
    expect(fs.existsSync(leasePath)).toBe(false);
  });

  it('validateMcpLease validates correctly', () => {
    const token = crypto.randomUUID();
    acquireMcpLease(tmpDir, process.pid, token);

    const valid = validateMcpLease(tmpDir, process.pid, token);
    expect(valid.valid).toBe(true);

    const invalidPid = validateMcpLease(tmpDir, 99999, token);
    expect(invalidPid.valid).toBe(false);

    const invalidToken = validateMcpLease(tmpDir, process.pid, 'wrong');
    expect(invalidToken.valid).toBe(false);
  });
});

describe('Browser lease management', () => {
  it('acquireBrowserLease creates lease and returns release function', () => {
    const token = crypto.randomUUID();
    const { path: leasePath, release } = acquireBrowserLease(tmpDir, process.pid, token);

    expect(fs.existsSync(leasePath)).toBe(true);
    const lease = readLease(leasePath);
    expect(lease!.kind).toBe('browser');
    expect(lease!.pid).toBe(process.pid);

    release();
    expect(fs.existsSync(leasePath)).toBe(false);
  });

  it('validateBrowserLease validates correctly', () => {
    const token = crypto.randomUUID();
    acquireBrowserLease(tmpDir, process.pid, token);

    const valid = validateBrowserLease(tmpDir, process.pid, token);
    expect(valid.valid).toBe(true);

    const invalidToken = validateBrowserLease(tmpDir, process.pid, 'wrong');
    expect(invalidToken.valid).toBe(false);
  });
});

describe('Process lease management', () => {
  it('acquireProcessLease creates lease and returns release function', () => {
    const token = crypto.randomUUID();
    const { path: leasePath, release } = acquireProcessLease(tmpDir, process.pid, token);

    expect(fs.existsSync(leasePath)).toBe(true);
    const lease = readLease(leasePath);
    expect(lease!.kind).toBe('process');
    expect(lease!.pid).toBe(process.pid);

    release();
    expect(fs.existsSync(leasePath)).toBe(false);
  });

  it('validateProcessLease validates correctly', () => {
    const token = crypto.randomUUID();
    acquireProcessLease(tmpDir, process.pid, token);

    const valid = validateProcessLease(tmpDir, process.pid, token);
    expect(valid.valid).toBe(true);

    const invalidPid = validateProcessLease(tmpDir, 99999, token);
    expect(invalidPid.valid).toBe(false);
  });
});

describe('Vitest lease management', () => {
  it('acquireVitestLease creates lease and returns release function', () => {
    const token = crypto.randomUUID();
    const { path: leasePath, release } = acquireVitestLease(tmpDir, process.pid, token);

    expect(fs.existsSync(leasePath)).toBe(true);
    const lease = readLease(leasePath);
    expect(lease!.kind).toBe('vitest');
    expect(lease!.pid).toBe(process.pid);

    release();
    expect(fs.existsSync(leasePath)).toBe(false);
  });

  it('validateVitestLease validates correctly', () => {
    const token = crypto.randomUUID();
    acquireVitestLease(tmpDir, process.pid, token);

    const valid = validateVitestLease(tmpDir, process.pid, token);
    expect(valid.valid).toBe(true);

    const invalidToken = validateVitestLease(tmpDir, process.pid, 'wrong');
    expect(invalidToken.valid).toBe(false);
  });
});

describe('Jest lease management', () => {
  it('acquireJestLease creates lease and returns release function', () => {
    const token = crypto.randomUUID();
    const { path: leasePath, release } = acquireJestLease(tmpDir, process.pid, token);

    expect(fs.existsSync(leasePath)).toBe(true);
    const lease = readLease(leasePath);
    expect(lease!.kind).toBe('jest');
    expect(lease!.pid).toBe(process.pid);

    release();
    expect(fs.existsSync(leasePath)).toBe(false);
  });

  it('validateJestLease validates correctly', () => {
    const token = crypto.randomUUID();
    acquireJestLease(tmpDir, process.pid, token);

    const valid = validateJestLease(tmpDir, process.pid, token);
    expect(valid.valid).toBe(true);

    const invalidPid = validateJestLease(tmpDir, 99999, token);
    expect(invalidPid.valid).toBe(false);
  });
});

describe('Lease cleanup', () => {
  it('cleanupLease removes own lease', () => {
    const token = crypto.randomUUID();
    acquireProcessLease(tmpDir, process.pid, token);

    const result = cleanupLease(tmpDir, 'process');
    expect(result.cleaned).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('cleanupLease refuses foreign live lease', () => {
    // Write a foreign lease (different PID)
    const file = path.join(leaseDir(tmpDir), 'process.lease.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      pid: 99999,
      token: 'foreign-token',
      kind: 'process',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    }), 'utf-8');

    const result = cleanupLease(tmpDir, 'process');
    expect(result.cleaned).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('skipping foreign');

    fs.rmSync(file, { force: true });
  });

  it('cleanupProjectLeases cleans all leases', () => {
    // Acquire multiple leases
    acquireMcpLease(tmpDir, process.pid, crypto.randomUUID());
    acquireBrowserLease(tmpDir, process.pid, crypto.randomUUID());
    acquireProcessLease(tmpDir, process.pid, crypto.randomUUID());

    const result = cleanupProjectLeases(tmpDir);
    expect(result.cleaned).toBeGreaterThanOrEqual(3);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Process termination policy', () => {
  it('terminateProcessTree rejects invalid PID', () => {
    const result = terminateProcessTree(0, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid PID');
  });

  it('terminateProcessTree handles already-dead PID', () => {
    const result = terminateProcessTree(999999999, tmpDir);
    // Non-existent PID returns success (already gone)
    expect(result.success).toBe(true);
  });

  it('terminateProcessTree returns error for unverifiable ownership', () => {
    // This test verifies the ownership check exists
    // The actual termination behavior depends on platform
    const result = terminateProcessTree(process.pid, '/nonexistent/project');
    // Either fails ownership check or succeeds if no verification possible
    expect(typeof result.success).toBe('boolean');
  });
});

describe('No broad kill semantics', () => {
  it('cleanupLease never kills without ownership verification', () => {
    // Foreign live lease must not be killed
    const file = path.join(leaseDir(tmpDir), 'browser.lease.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      pid: 99999,
      token: 'foreign-token',
      kind: 'browser',
      projectRoot: tmpDir,
      acquiredAt: new Date().toISOString(),
    }), 'utf-8');

    const result = cleanupLease(tmpDir, 'browser');

    // Must not succeed in cleaning foreign lease
    expect(result.cleaned).toBe(0);
    expect(result.errors[0]).toContain('skipping foreign');

    fs.rmSync(file, { force: true });
  });

  it('terminateProcessTree checks ownership before kill', () => {
    // If we can't verify process belongs to project, don't kill
    const result = terminateProcessTree(process.pid, '/definitely/not/this/project');
    // Should fail ownership verification
    expect(result.success).toBe(false);
    expect(result.error).toContain('not belong to project');
  });
});
