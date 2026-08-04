import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalWorkerAdapter } from '../src/adapters/local-worker.js';
import { validateWorkerReceipt } from '../src/services/orchestrator.js';
import type { DelegationAssignment, DelegationReceipt } from '../src/services/orchestrator.js';
import { SYMLINK_CAPABLE } from './helpers/symlink-capability.js';

/** Resolve absolute path to a package bin, walking up from startDir. */
function resolvePackageBin(packageName: string, startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', packageName);
    try {
      const pkgPath = path.join(candidate, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.bin) {
        const binName = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0] as string;
        return path.join(candidate, binName);
      }
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/** Absolute path to tsx for running .ts scripts in security tests. */
const TSX_BIN = resolvePackageBin('tsx', process.cwd()) ?? 'tsx';

function validAssignment(overrides?: Partial<DelegationAssignment>): DelegationAssignment {
  return {
    taskId: 'T-001',
    reqIds: ['REQ-001'],
    objective: 'Implement REQ-001',
    ownedPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: ['REQ-001 is implemented and verified'],
    verificationCommands: [],
    model: 'gpt-4o',
    effort: 'small',
    ...overrides,
  };
}

function validReceipt(overrides?: Partial<DelegationReceipt>): DelegationReceipt {
  return {
    taskId: 'T-001',
    filesChanged: [],
    commandsRun: [],
    exitCodes: [],
    testsRun: [],
    evidencePaths: [],
    diffHashes: {},
    status: 'PASS',
    retries: 0,
    assumptions: [],
    unresolvedFindings: [],
    ...overrides,
  };
}

describe('LocalWorkerAdapter', () => {
  it('healthCheck returns ok', async () => {
    const adapter = new LocalWorkerAdapter();
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.version).toBeDefined();
  });

  it('submitAssignment works with a real assignment', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      verificationCommands: ['node --version'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.taskId).toBe('T-001');
    expect(receipt.status).toBe('PASS');
    expect(receipt.exitCodes.length).toBeGreaterThan(0);
  });

  it('submitAssignment returns a proper receipt with filesChanged', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-002',
      reqIds: ['REQ-002'],
      objective: 'Check package.json exists',
      ownedPaths: ['package.json'],
      verificationCommands: ['node --version'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.taskId).toBe('T-002');
    expect(receipt.filesChanged).toContain('package.json');
    expect(receipt.status).toBe('PASS');
    expect(receipt.exitCodes).toContain(0);
  });

  it('cancellation kills the worker process', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-cancel-'));
    const loopPath = path.join(tmp, 'loop.cjs');
    fs.writeFileSync(loopPath, 'setInterval(() => {}, 1000);\n', 'utf-8');
    try {
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-003',
        objective: 'Infinite loop',
        verificationCommands: [`node ${loopPath}`],
      });

      const receiptPromise = adapter.submitAssignment(assignment);
      await adapter.cancelTask('T-003');
      await expect(receiptPromise).rejects.toThrow();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('Timeout causes task failure', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-timeout-'));
    const sleepPath = path.join(tmp, 'sleep.cjs');
    fs.writeFileSync(sleepPath, 'setTimeout(() => {}, 5000);\n', 'utf-8');
    try {
      const adapter = new LocalWorkerAdapter(100);
      const assignment = validAssignment({
        taskId: 'T-004',
        objective: 'Slow task',
        verificationCommands: [`node ${sleepPath}`],
      });

      await expect(adapter.submitAssignment(assignment)).rejects.toThrow(/timed out/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('GAP-1: refuses owned paths that escape the project root', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-005',
      root: process.cwd(),
      ownedPaths: ['/etc/hostname'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /escapes/.test(f))).toBe(true);
  });

  it.skipIf(!SYMLINK_CAPABLE)('F2: rejects owned paths that escape via symlink to an outside file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-leak-'));
    try {
      // Self-contained outside file (deterministic on all platforms — /etc/hostname
      // does not exist on macOS, which would produce a dangling symlink).
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-outside-'));
      try {
        fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret\n', 'utf-8');
        fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(tmp, 'leak'));
        const adapter = new LocalWorkerAdapter();
        const assignment = validAssignment({
          taskId: 'T-006',
          root: tmp,
          ownedPaths: ['leak'],
        });
        const receipt = await adapter.submitAssignment(assignment);
        expect(receipt.status).toBe('FAIL');
        expect(receipt.filesChanged).toEqual([]);
        expect(receipt.unresolvedFindings.some(f => /escapes/.test(f))).toBe(true);
        expect(receipt.unresolvedFindings.some(f => /does not exist/.test(f))).toBe(false);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.skipIf(!SYMLINK_CAPABLE)('F2: symlink that stays inside the root is allowed', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-link-'));
    try {
      fs.writeFileSync(path.join(tmp, 'real.txt'), 'content\n', 'utf-8');
      fs.symlinkSync('real.txt', path.join(tmp, 'link.txt'));
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-007',
        root: tmp,
        ownedPaths: ['link.txt'],
      });
      const receipt = await adapter.submitAssignment(assignment);
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toEqual(['link.txt']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Receipt hardening', () => {
  it('receipt includes exitCodes field', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-008',
      objective: 'Run verification',
      ownedPaths: [],
      verificationCommands: ['node --version'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt).toHaveProperty('exitCodes');
    expect(Array.isArray(receipt.exitCodes)).toBe(true);
    expect(receipt.exitCodes.length).toBeGreaterThan(0);
    expect(receipt.exitCodes.every(c => c === 0)).toBe(true);
  });

  it('receipt includes diffHashes field', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-diff-'));
    try {
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'hello\n', 'utf-8');
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-009',
        root: tmp,
        ownedPaths: ['test.txt'],
        verificationCommands: ['node --version'],
      });
      const receipt = await adapter.submitAssignment(assignment);
      expect(receipt).toHaveProperty('diffHashes');
      expect(typeof receipt.diffHashes).toBe('object');
      expect(receipt.diffHashes['test.txt']).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('PASS without evidence/commands/exits is rejected by validation', () => {
    const receipt = validReceipt({ status: 'PASS' });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(false);
    expect(result.fakePassDetected).toBe(true);
  });

  it('PASS with evidence but no commands passes validation', () => {
    const receipt = validReceipt({
      status: 'PASS',
      filesChanged: ['src/foo.ts'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
    });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(true);
    expect(result.fakePassDetected).toBe(false);
  });

  it('receipt with non-zero exit code fails validation', () => {
    const receipt = validReceipt({
      status: 'PASS',
      commandsRun: ['npm test'],
      exitCodes: [1],
      testsRun: ['npm test'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
    });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Non-zero exit codes'))).toBe(true);
  });

  it('commandsRun without exitCodes fails validation', () => {
    const receipt = validReceipt({
      status: 'PASS',
      commandsRun: ['npm test'],
      exitCodes: [],
      evidencePaths: ['src/foo.ts'],
      diffHashes: { 'src/foo.ts': 'abc123' },
    });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('no exit codes recorded'))).toBe(true);
  });

  it('filesChanged outside ownedPaths fails validation', () => {
    const receipt = validReceipt({
      status: 'PASS',
      filesChanged: ['evil.ts'],
      evidencePaths: ['evil.ts'],
      diffHashes: { 'evil.ts': 'abc123' },
    });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('outside owned paths'))).toBe(true);
  });

  it('missing diff hash for changed file fails validation', () => {
    const receipt = validReceipt({
      status: 'PASS',
      filesChanged: ['src/foo.ts'],
      evidencePaths: ['src/foo.ts'],
      diffHashes: {},
    });
    const assignment = validAssignment({ ownedPaths: ['src/foo.ts'] });
    const result = validateWorkerReceipt(receipt, assignment);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing diff hash'))).toBe(true);
  });
});

// Security tests run serialized: each spawns a child process that parses and
// validates commands; parallel execution can cause temp-dir collisions on
// Windows when multiple tests share the same cwd assignment root.
describe('Verification command security', () => {
  // Helper to call local-worker-script directly with a test assignment
  async function runScriptWithCommand(cmd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const { spawn } = await import('node:child_process');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-sec-'));
    const assignmentPath = path.join(tmpDir, 'assignment.json');

    // Use absolute tsx path for reliable execution on Windows/npm workspaces
    const scriptPath = path.join(process.cwd(), 'src', 'adapters', 'local-worker-script.ts');

    const assignment = {
      taskId: 'SEC-TEST',
      reqIds: ['REQ-SEC'],
      objective: 'Security test',
      ownedPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verificationCommands: [cmd],
      model: 'test',
      effort: 'small',
      root: tmpDir,
    };
    fs.writeFileSync(assignmentPath, JSON.stringify(assignment));

    return new Promise((resolve) => {
      // tsx bin is an ESM .mjs — not directly executable on Windows (spawn EFTYPE).
      // Run it via the node executable, same as LocalWorkerAdapter does.
      const child = spawn(process.execPath, [TSX_BIN, scriptPath, assignmentPath], {
        cwd: tmpDir,
        timeout: 10_000,
        env: { ...process.env, PATH: process.env.PATH },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', (code) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve({ exitCode: code ?? 0, stdout, stderr });
      });
      child.on('error', (err) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve({ exitCode: 1, stdout: '', stderr: err.message });
      });
    });
  }

  it('rejects shell operator injection (semicolon)', async () => {
    const result = await runScriptWithCommand('node --version; rm -rf /');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects shell operator injection (pipe)', async () => {
    const result = await runScriptWithCommand('node --version | cat');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects shell operator injection (backtick)', async () => {
    const result = await runScriptWithCommand('node --version `whoami`');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects shell operator injection (&&)', async () => {
    const result = await runScriptWithCommand('node --version && curl http://evil.com');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects forbidden command: curl', async () => {
    const result = await runScriptWithCommand('curl http://example.com');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Forbidden command|WORKER_ERROR/);
  });

  it('rejects forbidden command: wget', async () => {
    const result = await runScriptWithCommand('wget http://example.com');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Forbidden command|WORKER_ERROR/);
  });

  it('rejects forbidden command: rm', async () => {
    const result = await runScriptWithCommand('rm -rf /tmp/test');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Forbidden command|WORKER_ERROR/);
  });

  it('rejects forbidden command: bash', async () => {
    const result = await runScriptWithCommand('bash -c "echo pwned"');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Forbidden command|WORKER_ERROR/);
  });

  it('rejects command not in allowlist: python', async () => {
    const result = await runScriptWithCommand('python --version');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not in allowlist|WORKER_ERROR/);
  });

  it('accepts allowed command: node --version', async () => {
    const result = await runScriptWithCommand('node --version');
    expect(result.exitCode).toBe(0);
    // Script should output JSON receipt on stdout
    const receipt = JSON.parse(result.stdout);
    expect(receipt.status).toBeDefined();
    expect(receipt.commandsRun).toContain('node --version');
  });

  it('accepts allowed command: npm test', async () => {
    const result = await runScriptWithCommand('npm test');
    expect(result.exitCode).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.commandsRun).toContain('npm test');
  });

  it('rejects interpreter eval: node -e', async () => {
    const result = await runScriptWithCommand('node -e "console.log(1+1)"');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Interpreter eval flag|WORKER_ERROR/);
  });

  it('rejects interpreter eval: node -e with child_process exec', async () => {
    const result = await runScriptWithCommand('node -e "require(\'child_process\').exec(\'whoami\')"');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Interpreter eval flag|WORKER_ERROR/);
  });

  it('rejects interpreter eval: node --eval with child_process spawn', async () => {
    const result = await runScriptWithCommand('node --eval "require(\'child_process\').spawn(\'sh\',[\'-c\',\'echo pwned\'])"');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Interpreter eval flag|WORKER_ERROR/);
  });

  it('rejects shell metacharacter: command substitution $(...)', async () => {
    const result = await runScriptWithCommand('node --version $(whoami)');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects shell metacharacter: redirect', async () => {
    const result = await runScriptWithCommand('node --version > /tmp/owned');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects shell metacharacter: double ampersand chain', async () => {
    const result = await runScriptWithCommand('node --version && rm -rf /');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/shell operators|dangerous|WORKER_ERROR/);
  });

  it('rejects interpreter eval from command arguments', async () => {
    const result = await runScriptWithCommand('npx --eval "console.log(process)"');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Interpreter eval flag|WORKER_ERROR/);
  });

  it('rejects python via direct invocation', async () => {
    const result = await runScriptWithCommand('python3 script.py');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Forbidden command|WORKER_ERROR/);
  });
});

describe('Path traversal defense', () => {
  it('GAP-1: rejects paths with explicit parent traversal', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-TRAV-1',
      root: process.cwd(),
      ownedPaths: ['../etc/passwd'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /traversal|escapes/.test(f))).toBe(true);
  });

  it('GAP-1: rejects absolute path outside root', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-TRAV-2',
      root: process.cwd(),
      ownedPaths: ['/etc/passwd'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /escapes/.test(f))).toBe(true);
  });

  it('rejects sensitive file: .env', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-SEC-1',
      root: process.cwd(),
      ownedPaths: ['.env'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /sensitive|blocked/.test(f))).toBe(true);
  });

  it('rejects sensitive file: .aws directory', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-SEC-2',
      root: process.cwd(),
      ownedPaths: ['.aws/credentials'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /sensitive|blocked/.test(f))).toBe(true);
  });

  it('rejects sensitive file: .git directory', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-SEC-3',
      root: process.cwd(),
      ownedPaths: ['.git/config'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /sensitive|blocked/.test(f))).toBe(true);
  });

  it('rejects blocked directory: generated', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-BLOCK-1',
      root: process.cwd(),
      ownedPaths: ['generated/outside.js'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /blocked\.directory|generated/.test(f))).toBe(true);
  });

  it('rejects blocked directory: .agent', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-BLOCK-2',
      root: process.cwd(),
      ownedPaths: ['.agent/ledger.json'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /blocked\.directory|\.agent/.test(f))).toBe(true);
  });

  it('rejects path with null byte', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-NULL-1',
      root: process.cwd(),
      ownedPaths: ['package.json\0.evil'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /null\.byte/.test(f))).toBe(true);
  });

  it('allows legitimate paths in platforms directory', async () => {
    // Test that reading from valid directories still works
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-legit-'));
    try {
      fs.writeFileSync(path.join(tmp, 'test.txt'), 'content\n', 'utf-8');
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-LEGIT-1',
        root: tmp,
        ownedPaths: ['test.txt'],
        verificationCommands: ['node --version'],
      });
      const receipt = await adapter.submitAssignment(assignment);
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toContain('test.txt');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows reading files from nested valid directories', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-nested-'));
    try {
      fs.mkdirSync(path.join(tmp, 'deep', 'nested', 'dir'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'deep', 'nested', 'dir', 'file.txt'), 'content\n', 'utf-8');
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-NESTED-1',
        root: tmp,
        ownedPaths: ['deep/nested/dir/file.txt'],
        verificationCommands: ['node --version'],
      });
      const receipt = await adapter.submitAssignment(assignment);
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toContain('deep/nested/dir/file.txt');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
