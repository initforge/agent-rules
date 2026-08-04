import { describe, expect, it } from 'vitest';
import { validateReceipt, LocalWorkerAdapter, SafeArgvRunner } from '../src/worker-adapter.js';
import { IndependentVerifier } from '../src/verifier.js';
import type { WorkerReceipt } from '../src/contracts.js';

const hash = 'a'.repeat(64);
const validHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

function stubReceipt(overrides: Partial<WorkerReceipt> = {}): WorkerReceipt {
  return {
    receiptId: 'R1',
    assignmentId: 'A1',
    workerIdentity: 'worker-1',
    host: 'localhost',
    model: 'test-model',
    diffSha256: validHash,
    artifactUris: [],
    artifactHashes: [],
    filesChanged: ['packages/engine/src/foo.ts'],
    commands: [{ executable: 'npm', args: ['test'], cwd: undefined }],
    exitCodes: [0],
    logUris: [],
    logHashes: [],
    testEvidenceUris: [],
    testEvidenceHashes: [],
    startedAt: '2026-07-27T00:00:00.000Z',
    completedAt: '2026-07-27T01:00:00.000Z',
    ...overrides,
  };
}

describe('validateReceipt', () => {
  it('rejects blank receipt', () => {
    const result = validateReceipt({
      receiptId: '',
      assignmentId: '',
      workerIdentity: '',
      host: '',
      model: '',
      diffSha256: undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged: [],
      commands: [],
      exitCodes: [],
      logUris: [],
      logHashes: [],
      testEvidenceUris: [],
      testEvidenceHashes: [],
      startedAt: '',
      completedAt: '',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects stub receipt', () => {
    const result = validateReceipt(stubReceipt({
      receiptId: 'R1',
      assignmentId: 'A1',
      workerIdentity: 'worker-1',
      host: 'localhost',
      model: 'test-model',
      diffSha256: undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged: [],
      commands: [{ executable: 'true', args: [], cwd: undefined }],
      exitCodes: [0],
      logUris: [],
      logHashes: [],
      testEvidenceUris: [],
      testEvidenceHashes: [],
      startedAt: '2026-07-27T00:00:00.000Z',
      completedAt: '2026-07-27T01:00:00.000Z',
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('no diff');
  });

  it('rejects comment-only receipt', () => {
    const result = validateReceipt(stubReceipt({
      diffSha256: undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged: ['docs/README.md'],
      commands: [{ executable: 'true', args: [], cwd: undefined }],
      exitCodes: [0],
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('comment');
  });

  it('rejects receipt where verified=true but probe failed', () => {
    const receipt = stubReceipt({
      diffSha256: validHash,
      filesChanged: ['packages/engine/src/bar.ts'],
      commands: [{ executable: 'npm', args: ['test'], cwd: undefined }],
      exitCodes: [1],
    });
    (receipt as Record<string, unknown>).verified = true;
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('verified');
  });

  it('accepts valid receipt with diff fingerprint', () => {
    const result = validateReceipt(stubReceipt({
      diffSha256: validHash,
      filesChanged: ['packages/engine/src/bar.ts'],
      commands: [{ executable: 'npm', args: ['test'], cwd: undefined }],
      exitCodes: [0],
    }));
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('IndependentVerifier', () => {
  const verifier = new IndependentVerifier();

  it('rejects worker self-reported PASS as evidence', async () => {
    const receipt = stubReceipt();
    const evidence = {
      source: 'worker' as const,
      probeCommand: 'npm test',
      probeExitCode: 0,
      evidenceUris: ['file:///tmp/evidence.log'],
      evidenceHashes: [validHash],
    };
    await expect(verifier.verify(receipt, evidence)).rejects.toThrow('self-reported PASS');
  });

  it('records its own evidence hashes', async () => {
    const receipt = stubReceipt();
    const evidence = {
      source: 'verifier' as const,
      probeCommand: 'npm test',
      probeExitCode: 0,
      evidenceUris: ['file:///tmp/verifier-evidence.log'],
      evidenceHashes: [validHash],
    };
    const result = await verifier.verify(receipt, evidence);
    expect(result.passed).toBe(true);
    expect(result.independent).toBe(true);
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence).toBeDefined();
    expect(result.evidence['source']).toBe('verifier');
  });

  it('rejects null evidence', async () => {
    const receipt = stubReceipt();
    await expect(verifier.verify(receipt, null as unknown as Parameters<typeof verifier.verify>[1])).rejects.toThrow('evidence must not be null');
  });
});

describe('LocalWorkerAdapter', () => {
  const adapter = new LocalWorkerAdapter();

  it('detect returns available', async () => {
    const result = await adapter.detect();
    expect(result.available).toBe(true);
  });

  it('health returns ok', async () => {
    const result = await adapter.health();
    expect(result.ok).toBe(true);
  });
});

describe('SafeArgvRunner', () => {
  describe('validateCommand', () => {
    it('accepts valid npm test command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['test'] });
      expect(result.valid).toBe(true);
    });

    it('accepts valid git status command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'git', args: ['status', '--porcelain'] });
      expect(result.valid).toBe(true);
    });

    it('accepts node script with flags', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'node', args: ['--version'] });
      expect(result.valid).toBe(true);
    });

    it('accepts npx with compound args', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npx', args: ['vitest', 'run', '--reporter=verbose'] });
      expect(result.valid).toBe(true);
    });

    it('accepts absolute path executable', () => {
      const result = SafeArgvRunner.validateCommand({ executable: '/usr/local/bin/eslint', args: ['src/'] });
      expect(result.valid).toBe(true);
    });

    it('accepts absolute path with cwd', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['test'], cwd: 'P:/agent-rules' });
      expect(result.valid).toBe(true);
    });

    it('rejects shell metacharacters in executable', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm;rm -rf /', args: [] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('shell metacharacters');
    });

    it('rejects pipe metacharacter', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'cat | evil', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects backtick command substitution', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'echo `whoami`', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects dollar expansion', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'echo $HOME', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects path traversal in executable', () => {
      const result = SafeArgvRunner.validateCommand({ executable: '../bin/evil', args: [] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('path traversal');
    });

    it('rejects path traversal with backslash', () => {
      const result = SafeArgvRunner.validateCommand({ executable: '..\\..\\bin\\evil', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects shell metacharacters in args', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['test; rm -rf /'] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('shell metacharacters');
    });

    it('allows flags starting with dash', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['--force', '--ignore-scripts'] });
      expect(result.valid).toBe(true);
    });

    it('rejects relative cwd path', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['test'], cwd: './packages' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be absolute');
    });

    it('rejects path traversal in cwd', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm', args: ['test'], cwd: 'P:/agent-rules/../../../etc' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('path traversal');
    });

    it('rejects true command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'true', args: [] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('rejects false command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'false', args: [] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('rejects echo command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'echo', args: ['hello'] });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('rejects test/[ command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'test', args: ['-f', 'file.txt'] });
      expect(result.valid).toBe(false);
    });

    it('rejects pwd command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'pwd', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects whoami command', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'whoami', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects basename path traversal attempt', () => {
      const result = SafeArgvRunner.validateCommand({ executable: '../bin/bash', args: [] });
      expect(result.valid).toBe(false);
    });

    it('rejects null byte in executable', () => {
      const result = SafeArgvRunner.validateCommand({ executable: 'npm\0evil', args: [] });
      expect(result.valid).toBe(false);
    });
  });

  describe('isReadOnly', () => {
    it('true is read-only', () => {
      expect(SafeArgvRunner.isReadOnly('true', [])).toBe(true);
    });

    it('false is read-only', () => {
      expect(SafeArgvRunner.isReadOnly('false', [])).toBe(true);
    });

    it('npm is not read-only', () => {
      expect(SafeArgvRunner.isReadOnly('npm', ['test'])).toBe(false);
    });

    it('git is not read-only', () => {
      expect(SafeArgvRunner.isReadOnly('git', ['status'])).toBe(false);
    });

    it('node is not read-only', () => {
      expect(SafeArgvRunner.isReadOnly('node', ['script.js'])).toBe(false);
    });
  });

  describe('execCommand', () => {
    it('executes node --version and returns real exit code', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'node', args: ['--version'] });
      expect(result.exitCode).toBe(0);
      expect(result.stdoutHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.stderrHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns non-zero exit code for failing command', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', 'process.exit(42)'] });
      expect(result.exitCode).toBe(42);
    });

    it('returns -1 for non-existent executable (no throw)', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'nonexistent-command-xyz', args: [] });
      expect(result.exitCode).toBe(-1);
      expect(result.stdoutHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects shell metacharacter injection via validateCommand', async () => {
      const validation = SafeArgvRunner.validateCommand({ executable: 'npm;rm -rf /', args: [] });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('shell metacharacters');
    });

    it('rejects read-only command via validateCommand', async () => {
      const validation = SafeArgvRunner.validateCommand({ executable: 'true', args: [] });
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('read-only');
    });

    it('captures stdout hash correctly', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', 'console.log(1+1)'] });
      expect(result.exitCode).toBe(0);
      // Verify hash is deterministic
      expect(result.stdoutHash).toBe(
        require('crypto')
          .createHash('sha256')
          .update(Buffer.from('2\n'))
          .digest('hex')
      );
    });

    it('captures stderr hash correctly', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', 'console.error(42)'] });
      expect(result.exitCode).toBe(0);
      expect(result.stderrHash).toBe(
        require('crypto')
          .createHash('sha256')
          .update(Buffer.from('42\n'))
          .digest('hex')
      );
    });

    it('captures empty stdout as valid hash', async () => {
      const result = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', ''] });
      expect(result.exitCode).toBe(0);
      expect(result.stdoutHash).toBe(
        require('crypto').createHash('sha256').update(Buffer.from('')).digest('hex')
      );
    });

    it('returns deterministic hashes across invocations', async () => {
      const r1 = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', 'console.log("x")'] });
      const r2 = await SafeArgvRunner.execCommand({ executable: 'node', args: ['-e', 'console.log("x")'] });
      expect(r1.stdoutHash).toBe(r2.stdoutHash);
    });
  });

  describe('run (validateCommand then execCommand)', () => {
    it('run() throws on validation failure', async () => {
      await expect(
        SafeArgvRunner.prototype.run.call({} as SafeArgvRunner, { executable: 'true', args: [] })
      ).rejects.toThrow('validation failed');
    });

    it('run() executes validated command', async () => {
      const result = await SafeArgvRunner.prototype.run.call(
        {} as SafeArgvRunner,
        { executable: 'node', args: ['--version'] }
      );
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('validateReceipt adversarial', () => {
  it('rejects receipt with mismatched command/exitCode lengths', () => {
    const result = validateReceipt(stubReceipt({
      commands: [{ executable: 'npm', args: ['test'], cwd: undefined }, { executable: 'git', args: ['status'], cwd: undefined }],
      exitCodes: [0], // Only one exit code for two commands
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('rejects receipt with invalid SHA-256 fingerprint', () => {
    const result = validateReceipt(stubReceipt({
      diffSha256: 'not-a-valid-sha256',
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('SHA-256');
  });

  it('rejects receipt with completedAt before startedAt', () => {
    const result = validateReceipt(stubReceipt({
      startedAt: '2020-01-02T00:00:00.000Z',
      completedAt: '2020-01-01T00:00:00.000Z', // completed before started
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('precedes');
  });

  it('rejects receipt with artifact URI/hash mismatch', () => {
    const result = validateReceipt(stubReceipt({
      artifactUris: ['file:///a', 'file:///b'],
      artifactHashes: ['a'.repeat(64)], // Only one hash for two URIs
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  it('rejects receipt with blank receiptId', () => {
    const result = validateReceipt(stubReceipt({ receiptId: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('blank');
  });

  it('rejects receipt with blank assignmentId', () => {
    const result = validateReceipt(stubReceipt({ assignmentId: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('blank');
  });

  it('rejects receipt with blank workerIdentity', () => {
    const result = validateReceipt(stubReceipt({ workerIdentity: '' }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('blank');
  });

  it('rejects receipt with no diff, no artifacts, no files', () => {
    const result = validateReceipt(stubReceipt({
      diffSha256: undefined,
      artifactUris: [],
      artifactHashes: [],
      filesChanged: [],
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('no diff');
  });

  it('rejects receipt where verified=true but all probes failed', () => {
    const receipt = stubReceipt({
      diffSha256: validHash,
      filesChanged: ['packages/engine/src/baz.ts'],
      commands: [
        { executable: 'node', args: ['-e', 'process.exit(1)'] },
        { executable: 'node', args: ['-e', 'process.exit(1)'] },
      ],
      exitCodes: [1, 1],
    });
    (receipt as Record<string, unknown>).verified = true;
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('verified');
  });

  it('accepts receipt with valid artifact URIs (no diff required)', () => {
    const result = validateReceipt(stubReceipt({
      diffSha256: undefined,
      filesChanged: [],
      artifactUris: ['file:///tmp/artifact.js'],
      artifactHashes: [validHash],
    }));
    expect(result.valid).toBe(true);
  });

  it('rejects receipt with log URI/hash length mismatch', () => {
    const result = validateReceipt(stubReceipt({
      logUris: ['stdout://npm/a', 'stdout://npm/b'],
      logHashes: [validHash],
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('logs');
  });

  it('rejects receipt with invalid log hash', () => {
    const result = validateReceipt(stubReceipt({
      logHashes: ['not-a-valid-hash' as any],
    }));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('SHA-256');
  });
});

describe('LocalWorkerAdapter real execution', () => {
  it('collects receipt with real exit codes from commands', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-assignment',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: ['packages/engine/src'],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [
        { executable: 'node', args: ['--version'] },
      ],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);

    expect(receipt.commands.length).toBe(1);
    expect(receipt.exitCodes.length).toBe(1);
    expect(receipt.exitCodes[0]).toBe(0); // Real exit code from node --version
    expect(receipt.logHashes.length).toBe(1);
    expect(receipt.logHashes[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records non-zero exit code for failing command', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-fail',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [
        { executable: 'node', args: ['-e', 'process.exit(1)'] },
      ],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);

    expect(receipt.exitCodes[0]).toBe(1); // Real non-zero exit code
  });

  it('rejects read-only command and records failure', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-readonly',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [
        { executable: 'true', args: [] },
      ],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);

    expect(receipt.exitCodes[0]).toBe(-1); // Validation failure
    expect(receipt.logUris[0]).toContain('validation-error');
  });

  it('rejects shell injection attempt', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-injection',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [
        { executable: 'npm; rm -rf /', args: [] },
      ],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);

    expect(receipt.exitCodes[0]).toBe(-1); // Validation failure
  });

  it('collects receipt with multiple commands and real exit codes', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-multi',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [
        { executable: 'node', args: ['--version'] },
        { executable: 'node', args: ['-e', 'process.exit(1)'] },
      ],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);

    expect(receipt.commands.length).toBe(2);
    expect(receipt.exitCodes.length).toBe(2);
    expect(receipt.exitCodes[0]).toBe(0); // success
    expect(receipt.exitCodes[1]).toBe(1); // explicit failure
    expect(receipt.logHashes.length).toBe(2);
    expect(receipt.logUris.length).toBe(2);
  });

  it('throws on unknown jobId', async () => {
    const adapter = new LocalWorkerAdapter();
    await expect(adapter.collectReceipt('nonexistent-job-id')).rejects.toThrow('Unknown job');
  });

  it('receipt binds assignmentId correctly', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-binding-123',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [{ executable: 'node', args: ['--version'] }],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);
    expect(receipt.assignmentId).toBe('test-binding-123');
    expect(receipt.receiptId).toMatch(/^receipt-[a-f0-9]{16}$/);
    expect(receipt.workerIdentity).toBe('local-worker');
  });

  it('handles non-existent executable gracefully', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-nonexistent',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [{ executable: 'this-binary-does-not-exist-xyz', args: [] }],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);
    expect(receipt.exitCodes[0]).toBe(-1);
    expect(receipt.logUris[0]).toContain('error://');
  });

  it('handles empty verification commands array', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-empty-commands',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);
    expect(receipt.commands.length).toBe(0);
    expect(receipt.exitCodes.length).toBe(0);
    expect(receipt.logHashes.length).toBe(0);
  });

  it('computes diff fingerprint from ownedPaths', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-diff',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: ['packages/engine/src/worker-adapter.ts'],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [{ executable: 'node', args: ['--version'] }],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);
    expect(receipt.diffSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.filesChanged.length).toBeGreaterThan(0);
  });

  it('receipt timestamps are valid and ordered', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = {
      assignmentId: 'test-timestamps',
      taskId: 'test-task',
      requirementIds: ['req-1'],
      anchors: [],
      dependencies: [],
      sourceOfTruthPaths: [],
      ownedPaths: [],
      forbiddenPaths: [],
      allowedTools: ['edit', 'bash'],
      acceptanceCriteria: [],
      modelTier: 'standard' as const,
      riskTier: 'low' as const,
      tokenBudget: 1000,
      timeBudgetMs: 5000,
      costBudgetUsd: 0.01,
      verificationCommands: [{ executable: 'node', args: ['--version'] }],
      escalationConditions: [],
      receiptContractSha256: 'a'.repeat(64),
    };

    const { jobId } = await adapter.submit(assignment);
    const receipt = await adapter.collectReceipt(jobId);
    const start = new Date(receipt.startedAt).getTime();
    const end = new Date(receipt.completedAt).getTime();
    expect(end).toBeGreaterThanOrEqual(start);
  });
});
