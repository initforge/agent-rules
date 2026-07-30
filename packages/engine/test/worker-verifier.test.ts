import { describe, expect, it } from 'vitest';
import { validateReceipt, LocalWorkerAdapter } from '../src/worker-adapter.js';
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
