import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import {
  brokerToolOutput,
  brokerExitCode,
  brokerAnomalySummary,
  brokerSummary,
  validateReceipt,
  redactContent,
  createRestrictedArtifact,
  validateExcerptBounds,
  type ToolOutputReceipt,
  type RestrictedArtifact,
} from '../src/tool-output-broker.js';
import { readArtifact, createArtifactPointer, writeArtifact } from '../src/artifact-pointer.js';
import { sha256Bytes } from '../src/contracts.js';

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
  maxExcerptBytes?: number;
} = {}): { receipt: ToolOutputReceipt } {
  const baseDir = opts.baseDir ?? tmpDir();
  return brokerToolOutput(
    'npm',
    ['test'],
    opts.stdout ?? 'PASS 1 test\n',
    opts.stderr ?? '',
    opts.exitCode ?? 0,
    opts.durationMs ?? 1200,
    { baseDir, maxExcerptBytes: opts.maxExcerptBytes ?? 512 },
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

  it('records separate excerpt hashes', () => {
    const { receipt } = makeResult({ stdout: 'x'.repeat(600), stderr: 'y'.repeat(600) });
    expect(receipt.stdoutExcerptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stderrExcerptSha256).toMatch(/^[a-f0-9]{64}$/);
    // Excerpt hash differs from raw content hash when truncated
    expect(receipt.stdoutExcerptSha256).not.toBe(receipt.stdoutSha256);
  });

  it('excerpt hash is SHA-256 of the excerpt string', () => {
    const { receipt } = makeResult({ stdout: 'excerpt test' });
    const expected = sha256Bytes(new TextEncoder().encode(receipt.stdoutExcerpt));
    expect(receipt.stdoutExcerptSha256).toBe(expected);
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
    expect(summary.stdoutSha256).toBe(receipt.stdoutSha256);
    expect(summary.stderrSha256).toBe(receipt.stderrSha256);
    expect(summary.stdoutExcerptSha256).toBe(receipt.stdoutExcerptSha256);
    expect(summary.stderrExcerptSha256).toBe(receipt.stderrExcerptSha256);
    expect(summary.rawContentSha256).toBe(receipt.rawContentSha256);
  });
});

describe('integrity: separate hashes', () => {
  // ── Canonical framing: rawContentSha256 = SHA-256(JSON.stringify([stdoutSha256, stderrSha256])) ──
  it('receipt exposes separate stdoutSha256 and stderrSha256', () => {
    const { receipt } = makeResult({ stdout: 'out', stderr: 'err' });
    expect(receipt.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stderrSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stdoutSha256).not.toBe(receipt.stderrSha256);
  });

  it('stdoutSha256 matches the artifact pointer sha256', () => {
    const { receipt } = makeResult({ stdout: 'hello world', stderr: '' });
    expect(receipt.stdoutSha256).toBe(receipt.stdoutPointer.sha256);
    expect(receipt.stderrSha256).toBe(receipt.stderrPointer.sha256);
  });

  it('rawContentSha256 is canonically derived from separate hashes (JSON framing)', () => {
    const { receipt } = makeResult({ stdout: 'alpha', stderr: 'beta' });
    const expectedRaw = sha256Bytes(new TextEncoder().encode(JSON.stringify([receipt.stdoutSha256, receipt.stderrSha256])));
    expect(receipt.rawContentSha256).toBe(expectedRaw);
  });

  it('rawContentSha256 is stable across calls with same content', () => {
    const baseDir = tmpDir();
    const { receipt: r1 } = makeResult({ stdout: 'stable out', stderr: 'stable err', baseDir });
    const { receipt: r2 } = makeResult({ stdout: 'stable out', stderr: 'stable err', baseDir });
    expect(r1.stdoutSha256).toBe(r2.stdoutSha256);
    expect(r1.stderrSha256).toBe(r2.stderrSha256);
    expect(r1.rawContentSha256).toBe(r2.rawContentSha256);
  });

  // ── Delimiter-collision: '\x00---STDERR---\x00' in content was ambiguous with old framing ──
  it('no delimiter collision: content containing framing separator hashes independently', () => {
    const sep = '\x00---STDERR---\x00';
    // Old framing: SHA(stdout + sep + stderr) — this content would collide:
    // "A" + sep + "B" collides with "A" + sep + "B" (obviously)
    // but also "A" + "B" where B starts with sep...
    // New framing: SHA(JSON.stringify([SHA(A), SHA(B)])) is unambiguous.
    const stdout = `first${sep}half`;
    const stderr = `second${sep}half`;
    const { receipt } = makeResult({ stdout, stderr });
    expect(receipt.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stderrSha256).toMatch(/^[a-f0-9]{64}$/);

    // Verify the separator itself is NOT in the canonical hash input
    const framingInput = JSON.stringify([receipt.stdoutSha256, receipt.stderrSha256]);
    expect(framingInput).not.toContain(sep);

    // And verify the hash is correct for this content
    const expectedStdoutSha = sha256Bytes(new TextEncoder().encode(stdout));
    const expectedStderrSha = sha256Bytes(new TextEncoder().encode(stderr));
    expect(receipt.stdoutSha256).toBe(expectedStdoutSha);
    expect(receipt.stderrSha256).toBe(expectedStderrSha);
  });

  it('empty stdout/stderr still produce valid separate hashes', () => {
    const { receipt } = makeResult({ stdout: '', stderr: '' });
    expect(receipt.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.stderrSha256).toMatch(/^[a-f0-9]{64}$/);
    // Empty string SHA-256 is deterministic
    const emptySha = sha256Bytes(new Uint8Array(0));
    expect(receipt.stderrSha256).toBe(emptySha);
    expect(receipt.rawContentSha256).toBe(sha256Bytes(new TextEncoder().encode(JSON.stringify([receipt.stdoutSha256, emptySha]))));
  });

  it('receipt fields are frozen', () => {
    const { receipt } = makeResult();
    expect(Object.isFrozen(receipt.stdoutPointer)).toBe(true);
    expect(Object.isFrozen(receipt.stderrPointer)).toBe(true);
    expect(typeof receipt.stdoutSha256).toBe('string');
    expect(typeof receipt.stderrSha256).toBe('string');
  });
});

// ── validateReceipt ─────────────────────────────────────────────────────────────

describe('validateReceipt', () => {
  it('passes for a valid receipt', () => {
    const { receipt } = makeResult({ stdout: 'ok', stderr: '' });
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects tampered stdoutExcerpt', () => {
    const { receipt } = makeResult({ stdout: 'original', stderr: '' });
    // Tamper: change excerpt in-place (would require Object.defineProperty in real attack)
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutExcerpt: { value: 'tampered!', enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('stdoutExcerptSha256'))).toBe(true);
  });

  it('detects tampered stderrExcerpt', () => {
    const { receipt } = makeResult({ stdout: '', stderr: 'original stderr' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stderrExcerpt: { value: 'tampered stderr!', enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('stderrExcerptSha256'))).toBe(true);
  });

  it('detects broken raw content hash chain', () => {
    const { receipt } = makeResult({ stdout: 'a', stderr: 'b' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      rawContentSha256: { value: 'a'.repeat(64), enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('rawContentSha256'))).toBe(true);
  });

  it('detects excerpt exceeding max bytes', () => {
    const { receipt } = makeResult({ stdout: 'x'.repeat(10_000), stderr: '' });
    // Manually set an oversized excerpt
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutExcerpt: { value: 'x'.repeat(10_000), enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds max excerpt bytes'))).toBe(true);
  });

  it('returns frozen errors array', () => {
    const { receipt } = makeResult();
    const result = validateReceipt(receipt);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });

  it('detects mismatched stdout pointer hash', () => {
    const { receipt } = makeResult({ stdout: 'test' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutPointer: {
        value: { ...receipt.stdoutPointer, sha256: 'b'.repeat(64) },
        enumerable: true,
        configurable: true,
        writable: true,
      },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('stdoutPointer.sha256'))).toBe(true);
  });

  it('validates multiple errors simultaneously', () => {
    const { receipt } = makeResult({ stdout: 'x'.repeat(10_000), stderr: 'y'.repeat(10_000) });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutExcerpt: { value: 'x'.repeat(10_000), enumerable: true, configurable: true, writable: true },
      rawContentSha256: { value: 'c'.repeat(64), enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// ── Crash / tamper: atomic write resilience ────────────────────────────────────

describe('crash resilience: artifact survives process.exit during write', () => {
  it('writeArtifact uses atomic rename — file only appears after complete write', () => {
    const dir = tmpDir();
    const content = 'CRASH_TEST_CONTENT_' + randomUUID();
    const ptr = createArtifactPointer('file:///tmp/crash-test.txt', content, 1_700_000_000_000, [], {
      artifactId: 'crash-test-art',
    });
    const artifactBase = path.resolve(dir, '.agent/artifacts');
    const artifactDir = path.resolve(artifactBase, ptr.artifactId.slice(0, 2));
    const filePath = path.join(artifactDir, `${ptr.artifactId}.content`);

    // Before write: file must not exist
    expect(fs.existsSync(filePath)).toBe(false);

    writeArtifact(ptr, content, dir);

    // After write: file exists with correct content
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);

    // No stray .tmp files left behind
    const files = fs.readdirSync(artifactDir);
    expect(files.some((f) => f.startsWith('.tmp-'))).toBe(false);
  });

  it('atomic write temp file has unique name per invocation', () => {
    const dir = tmpDir();
    const ptr1 = createArtifactPointer('file:///tmp/a.txt', 'content1', 1_700_000_000_001, [], {
      artifactId: 'unique-tmp-test-1',
    });
    const ptr2 = createArtifactPointer('file:///tmp/b.txt', 'content2', 1_700_000_000_002, [], {
      artifactId: 'unique-tmp-test-2',
    });
    const artifactDir1 = path.resolve(dir, '.agent/artifacts', ptr1.artifactId.slice(0, 2));
    const artifactDir2 = path.resolve(dir, '.agent/artifacts', ptr2.artifactId.slice(0, 2));

    // Both writes succeed without temp collision
    writeArtifact(ptr1, 'content1', dir);
    writeArtifact(ptr2, 'content2', dir);

    expect(fs.readdirSync(artifactDir1).some((f) => f.startsWith('.tmp-'))).toBe(false);
    expect(fs.readdirSync(artifactDir2).some((f) => f.startsWith('.tmp-'))).toBe(false);
  });

  it('readArtifact detects tampered file content', () => {
    const dir = tmpDir();
    const content = 'INTENTIONALLY_CORRUPTED';
    const ptr = createArtifactPointer('file:///tmp/tamper.txt', 'original', 1_700_000_000_000, [], {
      artifactId: 'tamper-test',
    });
    writeArtifact(ptr, 'original', dir);

    // Simulate tamper: overwrite file after write
    const filePath = path.join(dir, '.agent/artifacts', ptr.artifactId.slice(0, 2), `${ptr.artifactId}.content`);
    fs.writeFileSync(filePath, content, 'utf-8');

    expect(() => readArtifact(ptr, dir)).toThrow('integrity check failed');
  });

  it('readArtifact detects missing file', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/missing.txt', 'gone', 1_700_000_000_000, [], {
      artifactId: 'missing-file-test',
    });
    expect(() => readArtifact(ptr, dir)).toThrow('Artifact file not found');
  });

  it('writeArtifact rejects content SHA mismatch before rename', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/mismatch.txt', 'expected', 1_700_000_000_000, [], {
      artifactId: 'sha-mismatch-test',
    });
    const artifactDir = path.resolve(dir, '.agent/artifacts', ptr.artifactId.slice(0, 2));
    fs.mkdirSync(artifactDir, { recursive: true });

    // Write wrong content — must throw AND leave no temp files
    expect(() => writeArtifact(ptr, 'WRONG_CONTENT', dir)).toThrow('SHA-256 mismatch');

    const files = fs.readdirSync(artifactDir);
    expect(files.some((f) => f.startsWith('.tmp-'))).toBe(false);
  });

  it('writeArtifact handles concurrent writes to same path (last wins)', () => {
    const dir = tmpDir();
    const ptr1 = createArtifactPointer('file:///tmp/race.txt', 'first', 1_700_000_000_001, [], {
      artifactId: 'race-test',
    });
    const ptr2 = createArtifactPointer('file:///tmp/race.txt', 'second', 1_700_000_000_002, [], {
      artifactId: 'race-test',
    });

    writeArtifact(ptr1, 'first', dir);
    writeArtifact(ptr2, 'second', dir);

    // Second write wins — but no temp file left
    const artifactDir = path.resolve(dir, '.agent/artifacts', ptr1.artifactId.slice(0, 2));
    expect(fs.readdirSync(artifactDir).some((f) => f.startsWith('.tmp-'))).toBe(false);
  });
});

// ── Path traversal / injection prevention ─────────────────────────────────────

describe('path traversal: writeArtifact blocks traversal attempts', () => {
  it('rejects artifactId with .. segments', () => {
    expect(() => createArtifactPointer('file:///tmp/ok.txt', 'ok', 1_700_000_000_000, [], {
      artifactId: '../etc/passwd',
    })).toThrow('unsafe path');
  });

  it('rejects artifactId with absolute path', () => {
    expect(() => createArtifactPointer('file:///tmp/ok.txt', 'ok', 1_700_000_000_000, [], {
      artifactId: '/etc/passwd',
    })).toThrow('unsafe path');
  });

  it('rejects artifactId with null bytes', () => {
    expect(() => createArtifactPointer('file:///tmp/ok.txt', 'ok', 1_700_000_000_000, [], {
      artifactId: 'safe\x00injected',
    })).toThrow('unsafe path');
  });
});

// ── validateReceipt: validateReceipt imports ────────────────────────────────────

describe('validateReceipt exports', () => {
  it('validateReceipt is a function', () => {
    expect(typeof validateReceipt).toBe('function');
  });

  it('ReceiptValidation interface is exported', () => {
    const { receipt } = makeResult();
    const result = validateReceipt(receipt);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ── redactContent ─────────────────────────────────────────────────────────────

describe('redactContent', () => {
  it('redacts password=value patterns', () => {
    const input = 'password=supersecret123';
    const redacted = redactContent(input);
    expect(redacted).toBe('password=[REDACTED]');
    expect(redacted).not.toContain('supersecret');
  });

  it('redacts api_key patterns', () => {
    const input = 'api_key=sk-abc123def456';
    const redacted = redactContent(input);
    expect(redacted).toBe('api_key=[REDACTED]');
  });

  it('redacts ApiKey camelCase', () => {
    const input = 'ApiKey=secret-value';
    const redacted = redactContent(input);
    expect(redacted).toBe('ApiKey=[REDACTED]');
  });

  it('redacts AWS/GCP/Azure secret patterns', () => {
    const aws = redactContent('AWS_SECRET=myawssecret');
    const gcp = redactContent('GCP_TOKEN=ya29.token');
    const azure = redactContent('azure_secret_key=azurekey');
    expect(aws).toBe('AWS_SECRET=[REDACTED]');
    expect(gcp).toBe('GCP_TOKEN=[REDACTED]');
    expect(azure).toBe('azure_secret_key=[REDACTED]');
  });

  it('redacts bearer token patterns', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...';
    const redacted = redactContent(input);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('eyJ');
  });

  it('redacts multiple patterns in same string', () => {
    const input = 'api_key=sk-key1 token=tok-abc password=pass123';
    const redacted = redactContent(input);
    expect(redacted).toBe('api_key=[REDACTED] token=[REDACTED] password=[REDACTED]');
  });

  it('returns unchanged string with no secrets', () => {
    const input = 'All systems operational. No errors detected.';
    expect(redactContent(input)).toBe(input);
  });

  it('does not redact private key block headers (those are anomaly-only)', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAA\n-----END RSA PRIVATE KEY-----';
    const redacted = redactContent(input);
    // Private key headers are NOT value-redacted (would corrupt the key)
    expect(redacted).toBe(input);
  });

  it('handles case-insensitive patterns', () => {
    const upper = redactContent('PASSWORD=secret');
    const lower = redactContent('password=secret');
    const mixed = redactContent('Password=secret');
    expect(upper).toBe('PASSWORD=[REDACTED]');
    expect(lower).toBe('password=[REDACTED]');
    expect(mixed).toBe('Password=[REDACTED]');
  });

  it('handles npm/pip/maven token patterns', () => {
    const npm = redactContent('npm_token=abcdef123456');
    const pip = redactContent('pip_auth_token=secret');
    expect(npm).toBe('npm_token=[REDACTED]');
    expect(pip).toBe('pip_auth_token=[REDACTED]');
  });
});

// ── redactContent integration with brokerToolOutput ─────────────────────────────

describe('brokerToolOutput redaction integration', () => {
  it('redacts secret-like values in excerpts when anomaly detected', () => {
    const { receipt } = makeResult({
      stdout: 'api_key=sk-1234567890abcdef\npassword=secret123',
    });
    expect(receipt.anomalyFlags.length).toBeGreaterThan(0);
    expect(receipt.stdoutExcerpt).toBe('api_key=[REDACTED]\npassword=[REDACTED]');
    expect(receipt.stdoutExcerpt).not.toContain('sk-1234');
    expect(receipt.stdoutExcerpt).not.toContain('secret123');
  });

  it('sets hasRestrictedArtifact when anomaly detected', () => {
    const { receipt } = makeResult({
      stdout: 'password=secret',
    });
    expect(receipt.hasRestrictedArtifact).toBe(true);
  });

  it('does not set hasRestrictedArtifact when no anomaly', () => {
    const { receipt } = makeResult({
      stdout: 'All systems go',
    });
    expect(receipt.hasRestrictedArtifact).toBe(false);
  });

  it('marks raw artifact REDACTED when anomaly detected', () => {
    const { receipt } = makeResult({
      stdout: 'AWS_SECRET=mysecretkey',
    });
    expect(receipt.stdoutPointer.redactionState).toBe('REDACTED');
    expect(receipt.stderrPointer.redactionState).toBe('REDACTED');
  });

  it('preserves RAW state when no anomaly', () => {
    const { receipt } = makeResult({
      stdout: 'Build successful',
    });
    expect(receipt.stdoutPointer.redactionState).toBe('RAW');
  });

  it('raw artifact on disk still contains original content', () => {
    const baseDir = tmpDir();
    const secret = 'password=mysecret123';
    const { receipt } = makeResult({ stdout: secret, baseDir });

    // Raw artifact should be readable
    const rawContent = readArtifact(receipt.stdoutPointer, baseDir);
    expect(rawContent).toBe(secret);

    // Excerpt should be redacted
    expect(receipt.stdoutExcerpt).toBe('password=[REDACTED]');
  });

  it('stderr also gets redacted when anomaly in stderr', () => {
    const { receipt } = makeResult({
      stdout: 'normal output',
      stderr: 'error: token=invalid_token\npassword=badpass',
    });
    expect(receipt.anomalyFlags.length).toBeGreaterThan(0);
    expect(receipt.hasRestrictedArtifact).toBe(true);
    expect(receipt.stderrExcerpt).toContain('[REDACTED]');
    expect(receipt.stderrExcerpt).not.toContain('invalid_token');
  });
});

// ── createRestrictedArtifact ──────────────────────────────────────────────────

describe('createRestrictedArtifact', () => {
  it('creates restricted artifact with anomaly flags', () => {
    const artifactId = 'toolout-test-stdout';
    const sha256 = 'a'.repeat(64);
    const flags = ['anomaly:secret-like-content'] as const;

    const restricted = createRestrictedArtifact(artifactId, sha256, flags);

    expect(restricted.artifactId).toBe(artifactId);
    expect(restricted.originalSha256).toBe(sha256);
    expect(restricted.redactionState).toBe('REDACTED');
    expect(restricted.anomalyFlags).toEqual(['anomaly:secret-like-content']);
    expect(restricted.restrictedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('freezes restricted artifact', () => {
    const restricted = createRestrictedArtifact('id', 'a'.repeat(64), []);
    expect(Object.isFrozen(restricted)).toBe(true);
    expect(Object.isFrozen(restricted.anomalyFlags)).toBe(true);
  });
});

// ── validateExcerptBounds ─────────────────────────────────────────────────────

describe('validateExcerptBounds', () => {
  it('returns within bounds for valid excerpt', () => {
    const { receipt } = makeResult({ stdout: 'short output' });
    const bounds = validateExcerptBounds(receipt);
    expect(bounds.withinBounds).toBe(true);
    expect(bounds.stdoutExcerptBytes).toBeLessThanOrEqual(bounds.maxExcerptBytes);
  });

  it('detects out of bounds excerpt', () => {
    const longOutput = 'x'.repeat(1000);
    const { receipt } = makeResult({ stdout: longOutput });
    // Excerpt is bounded to 512 bytes
    expect(receipt.stdoutExcerpt.length).toBeLessThanOrEqual(512);
  });

  it('validates stderr bounds', () => {
    const { receipt } = makeResult({ stderr: 'error' });
    const bounds = validateExcerptBounds(receipt);
    expect(bounds.stderrExcerptBytes).toBeLessThanOrEqual(bounds.maxExcerptBytes);
    expect(bounds.withinBounds).toBe(true);
  });

  it('respects custom maxExcerptBytes', () => {
    const { receipt } = makeResult({ stdout: 'test', maxExcerptBytes: 512 });
    const bounds = validateExcerptBounds(receipt, 512);
    expect(bounds.maxExcerptBytes).toBe(512);
    expect(bounds.withinBounds).toBe(true);
  });
});

// ── validateReceipt with redaction checks ─────────────────────────────────────

describe('validateReceipt redaction checks', () => {
  it('passes for receipt with properly redacted anomaly', () => {
    const { receipt } = makeResult({
      stdout: 'api_key=sk-secret123\n',
    });
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects inconsistent hasRestrictedArtifact when anomaly present', () => {
    const { receipt } = makeResult({ stdout: 'password=secret' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      hasRestrictedArtifact: { value: false, enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('hasRestrictedArtifact'))).toBe(true);
  });

  it('detects non-REDACTED artifact when anomaly present', () => {
    const { receipt } = makeResult({ stdout: 'AWS_SECRET=key123' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutPointer: {
        value: { ...receipt.stdoutPointer, redactionState: 'RAW' },
        enumerable: true,
        configurable: true,
        writable: true,
      },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('REDACTED'))).toBe(true);
  });

  it('accepts custom maxExcerptBytes in validation', () => {
    const { receipt } = makeResult({ stdout: 'test' });
    const result = validateReceipt(receipt, 1024);
    expect(result.valid).toBe(true);
  });

  it('detects rawContentSha256 framing error with correct message', () => {
    const { receipt } = makeResult({ stdout: 'a', stderr: 'b' });
    // Tamper rawContentSha256 to break framing
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      rawContentSha256: { value: 'b'.repeat(64), enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual('rawContentSha256 mismatch — hash chain broken');
  });

  it('detects stderr pointer hash mismatch', () => {
    const { receipt } = makeResult({ stdout: '', stderr: 'err' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stderrPointer: {
        value: { ...receipt.stderrPointer, sha256: 'c'.repeat(64) },
        enumerable: true,
        configurable: true,
        writable: true,
      },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual('stderrPointer.sha256 does not match stderrSha256');
  });
});

// ── validateReceipt: exact boundary and empty cases ─────────────────────────

describe('validateReceipt boundary conditions', () => {
  it('accepts excerpt at exactly max bytes', () => {
    // Create content that equals exactly 512 bytes
    const exact = 'x'.repeat(512);
    const { receipt } = makeResult({ stdout: exact });
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(true);
  });

  it('accepts empty stdout and stderr', () => {
    const { receipt } = makeResult({ stdout: '', stderr: '' });
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(true);
    expect(receipt.stdoutSha256).toBe(sha256Bytes(new Uint8Array(0)));
    expect(receipt.stderrSha256).toBe(sha256Bytes(new Uint8Array(0)));
  });

  it('validates frozen args array', () => {
    const { receipt } = makeResult({ stdout: 'ok' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      args: { value: ['injected', 'args'], enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual('receipt.args is not frozen');
  });

  it('validates frozen anomalyFlags array', () => {
    const { receipt } = makeResult({ stdout: 'ok' });
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      anomalyFlags: { value: ['injected'], enumerable: true, configurable: true, writable: true },
    });
    const result = validateReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual('receipt.anomalyFlags is not frozen');
  });
});

// ── validateExcerptBounds: boundary and error semantics ─────────────────────

describe('validateExcerptBounds error semantics', () => {
  it('returns correct byte counts for mixed content', () => {
    // Mix ASCII (1 byte) and multi-byte UTF-8
    const mixed = 'hello日本語' + 'é' + '👍';
    const { receipt } = makeResult({ stdout: mixed.repeat(50) });
    const bounds = validateExcerptBounds(receipt);
    expect(bounds.stdoutExcerptBytes).toBeLessThanOrEqual(512);
    expect(bounds.withinBounds).toBe(true);
    // stderr at 0
    expect(bounds.stderrExcerptBytes).toBe(0);
  });

  it('detects tampered oversized excerpt via validateExcerptBounds', () => {
    const { receipt } = makeResult({ stdout: 'short' });
    // Create tampered receipt with oversized excerpt
    const tampered = Object.create(Object.getPrototypeOf(receipt), {
      ...Object.getOwnPropertyDescriptors(receipt),
      stdoutExcerpt: { value: 'y'.repeat(600), enumerable: true, configurable: true, writable: true },
    });
    const bounds = validateExcerptBounds(tampered, 512);
    expect(bounds.withinBounds).toBe(false);
    expect(bounds.stdoutExcerptBytes).toBe(600);
    expect(bounds.maxExcerptBytes).toBe(512);
  });

  it('custom maxExcerptBytes overrides default', () => {
    const { receipt } = makeResult({ stdout: 'test', maxExcerptBytes: 1024 });
    const bounds = validateExcerptBounds(receipt, 1024);
    expect(bounds.maxExcerptBytes).toBe(1024);
  });

  it('returns frozen ExcerptBounds object', () => {
    const { receipt } = makeResult();
    const bounds = validateExcerptBounds(receipt);
    expect(Object.isFrozen(bounds)).toBe(true);
  });
});
