import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  brokerToolOutput,
  brokerExitCode,
  brokerAnomalySummary,
  brokerSummary,
  type ToolOutputReceipt,
} from '../src/tool-output-broker.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeResult(opts: {
  exitCode?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  baseDir?: string;
} = {}): { receipt: ToolOutputReceipt; stdoutContent: string; stderrContent: string } {
  const baseDir = opts.baseDir ?? tmpDir();
  return brokerToolOutput(
    'npm',
    ['test'],
    opts.stdout ?? 'PASS 1 test\n',
    opts.stderr ?? '',
    opts.exitCode ?? 0,
    opts.durationMs ?? 1200,
    { baseDir, maxExcerptBytes: 512 },
  );
}

describe('brokerToolOutput', () => {
  it('produces a receipt with artifact pointers', () => {
    const { receipt } = makeResult();
    expect(receipt.toolOutputId).toMatch(/^toolout-/);
    expect(receipt.exitCode).toBe(0);
    expect(receipt.durationMs).toBe(1200);
    expect(receipt.stdoutArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stderrArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stdoutPointer.artifactId).toBe(receipt.toolOutputId + '-stdout');
    expect(receipt.stderrPointer.artifactId).toBe(receipt.toolOutputId + '-stderr');
  });

  it('excludes full raw content from main context via excerpts', () => {
    const longStdout = 'x'.repeat(10_000);
    const { receipt } = makeResult({ stdout: longStdout });
    expect(receipt.stdoutExcerpt.length).toBeLessThanOrEqual(512);
    expect(receipt.stdoutBytes).toBe(10_000);
  });

  it('detects anomaly flags for secret-like content', () => {
    const { receipt } = makeResult({
      stdout: 'password=supersecret\n',
    });
    expect(receipt.anomalyFlags.length).toBeGreaterThan(0);
  });

  it('records raw content hash for integrity', () => {
    const { receipt } = makeResult();
    expect(receipt.rawContentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('freezes receipt fields', () => {
    const { receipt } = makeResult();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.args)).toBe(true);
    expect(Object.isFrozen(receipt.anomalyFlags)).toBe(true);
  });
});

describe('brokerExitCode', () => {
  it('returns success for exit code 0', () => {
    const { receipt } = makeResult({ exitCode: 0 });
    expect(brokerExitCode(receipt)).toEqual({ exitCode: 0, success: true });
  });

  it('returns failure for non-zero exit code', () => {
    const { receipt } = makeResult({ exitCode: 1 });
    expect(brokerExitCode(receipt)).toEqual({ exitCode: 1, success: false });
  });
});

describe('brokerAnomalySummary', () => {
  it('reports safe when no anomalies and small output', () => {
    const { receipt } = makeResult({ stdout: 'ok', stderr: '' });
    const summary = brokerAnomalySummary(receipt);
    expect(summary.hasAnomalies).toBe(false);
    expect(summary.safeForMainContext).toBe(true);
  });

  it('reports unsafe when anomalies detected', () => {
    const { receipt } = makeResult({ stdout: 'api_key=sk-abc123\n' });
    const summary = brokerAnomalySummary(receipt);
    expect(summary.hasAnomalies).toBe(true);
    expect(summary.safeForMainContext).toBe(false);
  });
});

describe('brokerSummary', () => {
  it('returns a safe summary without raw content', () => {
    const { receipt } = makeResult({ exitCode: 0, durationMs: 500 });
    const summary = brokerSummary(receipt);
    expect(summary.exitCode).toBe(0);
    expect(summary.success).toBe(true);
    expect(summary.durationMs).toBe(500);
    expect(summary.stdoutBytes).toBeGreaterThan(0);
    expect(summary.stderrBytes).toBe(0);
    expect(summary.stdoutArtifactId).toBe(receipt.stdoutPointer.artifactId);
    expect(summary.stderrArtifactId).toBe(receipt.stderrPointer.artifactId);
    expect(summary.rawContentSha256).toBe(receipt.rawContentSha256);
  });
});
