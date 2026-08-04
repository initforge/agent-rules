import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  runGovernedVitest,
  validateGovernedReceipt,
  createGovernedReceipt,
  buildGovernedVitestCommand,
  terminateProcessTree,
  getLauncherPath,
  type GovernedTestReceipt,
} from '../src/services/governed-vitest.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

describe('governed-vitest', () => {
  let tempDir: string;
  const repoRoot = path.resolve(__dirname, '../../../');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'governed-vitest-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('buildGovernedVitestCommand', () => {
    it('routes through the preserved launcher with lease control flags', () => {
      const argv = buildGovernedVitestCommand({ testFiles: ['a.test.ts'], root: tempDir });
      expect(argv[0]).toBe(getLauncherPath());
      expect(argv).toContain('--project-root');
      expect(argv).toContain(tempDir);
      expect(argv).toContain('--cwd');
      expect(argv).toContain('--mode');
      expect(argv).toContain('focused');
      expect(argv).toContain('--timeout-ms');
      expect(argv).toContain('--');
      const dashDash = argv.indexOf('--');
      expect(argv.slice(dashDash + 1)).toEqual([
        'run',
        '--config',
        path.join(tempDir, 'vitest.verify.config.ts'),
        path.join(tempDir, 'a.test.ts'),
      ]);
    });

    it('requests exclusive full-suite mode when mode=full', () => {
      const argv = buildGovernedVitestCommand({ testFiles: [], mode: 'full', root: tempDir });
      const modeIndex = argv.indexOf('--mode');
      expect(argv[modeIndex + 1]).toBe('full');
    });

    it('fails closed on caller worker override --maxWorkers', () => {
      expect(() =>
        buildGovernedVitestCommand({ testFiles: ['--maxWorkers=2'], root: tempDir }),
      ).toThrow(/forbidden/);
    });

    it('fails closed on caller worker override --minWorkers', () => {
      expect(() =>
        buildGovernedVitestCommand({ testFiles: ['--minWorkers=2'], root: tempDir }),
      ).toThrow(/forbidden/);
    });

    it('fails closed on caller file-parallelism override', () => {
      expect(() =>
        buildGovernedVitestCommand({ testFiles: ['--fileParallelism=true'], root: tempDir }),
      ).toThrow(/forbidden/);
    });

    it('fails closed on caller file-parallelism flag', () => {
      expect(() =>
        buildGovernedVitestCommand({ testFiles: ['--file-parallelism'], root: tempDir }),
      ).toThrow(/forbidden/);
    });
  });

  describe('terminateProcessTree', () => {
    it('kills a spawned process and its descendants', async () => {
      const marker = path.join(tempDir, 'grandchild.pid');
      const fixture = path.join(tempDir, 'holder.mjs');
      fs.writeFileSync(fixture, `
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const marker = ${JSON.stringify(marker)};
const grandchild = spawn(process.execPath, ['-e', 'fs.writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);', marker], { stdio: 'ignore' });
console.log('READY');
setInterval(() => {}, 1000);
`);
      const child = spawn(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'inherit'] });
      // Wait for READY line
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('holder did not start')), 3_000);
        child.stdout?.on('data', (chunk) => {
          if (chunk.toString().includes('READY')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('error', (err) => { clearTimeout(timer); reject(err); });
      });
      // Wait for grandchild pid file
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (fs.existsSync(marker)) { clearInterval(poll); resolve(); }
        }, 10);
        setTimeout(() => { clearInterval(poll); resolve(); }, 2_000);
      });

      const grandchildPid = Number(fs.readFileSync(marker, 'utf8'));
      expect(grandchildPid).toBeGreaterThan(0);

      terminateProcessTree(child.pid);
      await new Promise<void>((resolve) => child.once('close', () => resolve()));

      // Poll for grandchild death
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          try { process.kill(grandchildPid, 0); } catch { clearInterval(poll); resolve(); }
        }, 10);
        setTimeout(() => { clearInterval(poll); resolve(); }, 3_000);
      });

      let alive = false;
      try { process.kill(grandchildPid, 0); alive = true; } catch { /* dead */ }
      expect(alive).toBe(false);
    });
  });

  describe('runGovernedVitest', () => {
    it('returns FAIL for missing test files', async () => {
      const result = await runGovernedVitest({
        taskId: 'test-1',
        testFiles: ['nonexistent.spec.ts'],
        ownedPaths: ['packages/test.ts'],
        root: tempDir,
        timeoutMs: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.receipt?.status).toBe('FAIL');
      expect(result.receipt?.unresolvedFindings).toContainEqual(expect.stringContaining('Missing test files'));
    });

    it('creates receipt with proper structure', async () => {
      // Create a simple test file
      const testFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(testFile, `
import { describe, it, expect } from 'vitest';
describe('sample', () => {
  it('works', () => expect(true).toBe(true));
});
`);

      const result = await runGovernedVitest({
        taskId: 'test-receipt-1',
        testFiles: ['test.ts'],
        ownedPaths: ['test.ts'],
        root: tempDir,
        timeoutMs: 10000,
      });

      expect(result.receipt).toBeDefined();
      expect(result.receipt?.taskId).toBe('test-receipt-1');
      expect(result.receipt?.exitCodes).toContain(result.exitCode);
    });

    it('runs a real passing test through the governed launcher', async () => {
      const projectDir = path.join(repoRoot, '.w2-vitest-integ');
      fs.mkdirSync(projectDir, { recursive: true });
      try {
        fs.writeFileSync(
          path.join(projectDir, 'vitest.verify.config.ts'),
          `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['sample.test.ts'] } });
`,
        );
        fs.writeFileSync(
          path.join(projectDir, 'sample.test.ts'),
          `import { describe, it, expect } from 'vitest';
describe('w2-integ', () => { it('runs', () => expect(1).toBe(1)); });
`,
        );

        const result = await runGovernedVitest({
          taskId: 'w2-integ-1',
          testFiles: ['sample.test.ts'],
          ownedPaths: ['sample.test.ts'],
          root: projectDir,
          mode: 'focused',
          timeoutMs: 30_000,
        });

        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.receipt?.status).toBe('PASS');
      } finally {
        try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
      }
    });
  });

  describe('validateOwnedPaths', () => {
    it('returns empty array when all files are owned', () => {
      // This tests through validateGovernedReceipt which uses similar logic
      const receipt: GovernedTestReceipt = {
        taskId: 'test-1',
        filesChanged: ['test.ts', 'src/index.ts'],
        commandsRun: ['npx vitest run test.ts'],
        exitCodes: [0],
        testsRun: ['test-1'],
        evidencePaths: [],
        diffHashes: { 'test.ts': 'abc123', 'src/index.ts': 'def456' },
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const result = validateGovernedReceipt(receipt, ['test.ts', 'src/index.ts']);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error when files changed outside owned paths', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'test-1',
        filesChanged: ['unowned.ts'],
        commandsRun: ['npx vitest run unowned.ts'],
        exitCodes: [0],
        testsRun: [],
        evidencePaths: [],
        diffHashes: {},
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const result = validateGovernedReceipt(receipt, ['owned.ts']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File changed outside owned paths: unowned.ts');
    });
  });

  describe('validateGovernedReceipt', () => {
    it('accepts valid PASS receipt with exit codes', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'task-1',
        filesChanged: ['packages/test.ts'],
        commandsRun: ['npx vitest run test.ts'],
        exitCodes: [0],
        testsRun: ['test-1'],
        evidencePaths: [],
        diffHashes: { 'packages/test.ts': 'hash123' },
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const result = validateGovernedReceipt(receipt, ['packages/test.ts']);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects PASS receipt without evidence', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'task-1',
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
      };

      const result = validateGovernedReceipt(receipt, []);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('FABRICATED PASS: no evidence/commands/exits/diffs');
    });

    it('rejects exit code mismatch', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'task-1',
        filesChanged: ['test.ts'],
        commandsRun: ['npx vitest'],
        exitCodes: [1],
        testsRun: [],
        evidencePaths: [],
        diffHashes: {},
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const result = validateGovernedReceipt(receipt, ['test.ts']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Non-zero exit codes with PASS status: 1');
    });

    it('detects missing diff hashes for changed files', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'task-1',
        filesChanged: ['test.ts'],
        commandsRun: ['npx vitest'],
        exitCodes: [0],
        testsRun: [],
        evidencePaths: [],
        diffHashes: {},
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const result = validateGovernedReceipt(receipt, ['test.ts']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing diff hash for changed file: test.ts');
    });
  });

  describe('createGovernedReceipt', () => {
    it('uses result receipt when available', () => {
      const mockResult = {
        success: true,
        exitCode: 0,
        stdout: 'test output',
        stderr: '',
        durationMs: 100,
        testsRun: 10,
        testsPassed: 10,
        testsFailed: 0,
        suitesRun: 1,
        receipt: {
          taskId: 'task-1',
          filesChanged: ['test.ts'],
          commandsRun: ['npx vitest'],
          exitCodes: [0],
          testsRun: ['test-1'],
          evidencePaths: [],
          diffHashes: { 'test.ts': 'hash' },
          status: 'PASS' as const,
          retries: 0,
          assumptions: [],
          unresolvedFindings: [],
        },
      };

      const receipt = createGovernedReceipt('task-1', mockResult, ['test.ts']);

      expect(receipt.taskId).toBe('task-1');
      expect(receipt.status).toBe('PASS');
    });

    it('creates new receipt when result lacks one', () => {
      const mockResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'error',
        durationMs: 50,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 1,
        suitesRun: 0,
      };

      const receipt = createGovernedReceipt('task-1', mockResult, ['test.ts']);

      expect(receipt.taskId).toBe('task-1');
      expect(receipt.status).toBe('FAIL');
    });
  });

  describe('integration validation', () => {
    it('enforces exclusive ownership on receipt', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'exclusive-1',
        filesChanged: ['owned/path.ts', 'unowned/external.ts'],
        commandsRun: ['npx vitest'],
        exitCodes: [0],
        testsRun: ['test-1'],
        evidencePaths: [],
        diffHashes: {},
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const validation = validateGovernedReceipt(receipt, ['owned/path.ts']);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('File changed outside owned paths: unowned/external.ts');
    });

    it('accepts when files match owned paths exactly', () => {
      const receipt: GovernedTestReceipt = {
        taskId: 'exact-1',
        filesChanged: ['test.ts'],
        commandsRun: ['npx vitest'],
        exitCodes: [0],
        testsRun: ['test-1'],
        evidencePaths: [],
        diffHashes: { 'test.ts': 'abc123' },
        status: 'PASS',
        retries: 0,
        assumptions: [],
        unresolvedFindings: [],
      };

      const validation = validateGovernedReceipt(receipt, ['test.ts']);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});