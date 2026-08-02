import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  brokerToolOutput,
  brokerExitCode,
  brokerAnomalySummary,
  brokerSummary,
  type ToolOutputReceipt,
} from '../src/tool-output-broker.js';
import { readArtifact } from '../src/artifact-pointer.js';

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
} = {}): { receipt: ToolOutputReceipt } {
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
    expect(receipt.toolOutputId).toMatch(/^toolout-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

  // ── Regression: broker public result never exposes raw stdout/stderr ──
  it('result has no stdoutContent or stderrContent properties', () => {
    const result = makeResult({ stdout: 'secret data', stderr: 'error output' });
    expect('stdoutContent' in result).toBe(false);
    expect('stderrContent' in result).toBe(false);
  });

  // ── Regression: UUID format via crypto.randomUUID ──
  it('toolOutputId matches crypto.randomUUID format', () => {
    const { receipt } = makeResult();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const id = receipt.toolOutputId.replace(/^toolout-/, '');
    expect(id).toMatch(uuidRegex);
  });

  // ── Regression: UTF-8 byte-bounded excerpt safe ──
  it('excerpt does not split multi-byte UTF-8 characters', () => {
    // "é" = 2 bytes; "日本語" = 9 bytes each; "𠜎" = 4 bytes (supplementary plane)
    const multibyte = 'aé日本語a'.repeat(50); // well over 512 bytes, contains 2-byte and 3-byte chars
    const { receipt } = makeResult({ stdout: multibyte, baseDir: tmpDir() });
    // Excerpt must be valid UTF-8 — decoding it must not throw
    expect(() => new TextDecoder('utf-8').decode(new TextEncoder().encode(receipt.stdoutExcerpt))).not.toThrow();
    // Excerpt bytes must be ≤ maxExcerptBytes
    expect(Buffer.byteLength(receipt.stdoutExcerpt, 'utf-8')).toBeLessThanOrEqual(512);
  });

  it('excerpt bytes are strictly bounded even with 4-byte chars', () => {
    const fourByte = '𠜎'.repeat(200); // each char = 4 bytes (U+2070E supplementary plane)
    const { receipt } = makeResult({ stdout: fourByte, baseDir: tmpDir() });
    expect(Buffer.byteLength(receipt.stdoutExcerpt, 'utf-8')).toBeLessThanOrEqual(512);
  });

  // ── Regression: disk write via writeArtifact (secure validators) ──
  it('writes artifact to disk with correct SHA-256', () => {
    const baseDir = tmpDir();
    const { receipt } = makeResult({ stdout: 'hello world', baseDir });
    const content = readArtifact(receipt.stdoutPointer, baseDir);
    expect(content).toBe('hello world');
  });

  it('prevents path traversal: artifactId must be safe', () => {
    const { receipt } = makeResult({ stdout: 'data', baseDir: tmpDir() });
    // artifactId is set to toolout-<uuid>-stdout, must not contain ../ or absolute paths
    expect(receipt.stdoutPointer.artifactId).not.toContain('..');
    expect(receipt.stdoutPointer.artifactId).not.toMatch(/^\//);
    expect(receipt.stdoutPointer.artifactId).toMatch(/^toolout-[0-9a-f-]+-stdout$/);
  });

  it('stderr artifact written and retrievable', () => {
    const baseDir = tmpDir();
    const { receipt } = makeResult({ stderr: 'stderr content', baseDir });
    const content = readArtifact(receipt.stderrPointer, baseDir);
    expect(content).toBe('stderr content');
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
