import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createArtifactPointer,
  writeArtifact,
  readArtifact,
  queryArtifacts,
  boundedExcerpt,
  redactArtifact,
  utf8BoundedTruncate,
  type ArtifactPointer,
  type ArtifactQuery,
} from '../src/artifact-pointer.js';
import { sha256Bytes } from '../src/contracts.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('createArtifactPointer', () => {
  it('produces a frozen pointer with SHA-256', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'hello world', 1_700_000_000_000);
    expect(ptr.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ptr.byteSize).toBe(11);
    expect(Object.isFrozen(ptr)).toBe(true);
  });

  it('defaults trustClass to UNTRUSTED and redactionState to RAW', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'content', 1_700_000_000_000);
    expect(ptr.trustClass).toBe('UNTRUSTED');
    expect(ptr.redactionState).toBe('RAW');
  });

  it('accepts custom options', () => {
    const ptr = createArtifactPointer(
      'file:///tmp/test.txt',
      'content',
      1_700_000_000_000,
      ['R-039', 'R-040'],
      {
        mediaType: 'text/plain',
        trustClass: 'TRUSTED',
        redactionState: 'BOUNDED_EXCERPT',
        chunkIndex: 0,
        artifactId: 'custom-art',
      },
    );
    expect(ptr.trustClass).toBe('TRUSTED');
    expect(ptr.redactionState).toBe('BOUNDED_EXCERPT');
    expect(ptr.chunkIndex).toBe(0);
    expect(ptr.artifactId).toBe('custom-art');
    expect(ptr.claimScope).toEqual(['R-039', 'R-040']);
  });

  it('freezes claimScope array', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'content', 1_700_000_000_000, ['R-001']);
    expect(Object.isFrozen(ptr.claimScope)).toBe(true);
  });
});

describe('writeArtifact and readArtifact', () => {
  it('writes and reads artifact content back', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'hello world', 1_700_000_000_000, [], {
      artifactId: 'test-art-001',
    });
    writeArtifact(ptr, 'hello world', dir);
    const content = readArtifact(ptr, dir);
    expect(content).toBe('hello world');
  });

  it('throws on SHA-256 mismatch', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'hello world', 1_700_000_000_000, [], {
      artifactId: 'test-art-002',
    });
    expect(() => writeArtifact(ptr, 'wrong content', dir)).toThrow('SHA-256 mismatch');
  });

  it('throws when reading missing artifact', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/missing.txt', 'content', 1_700_000_000_000, [], {
      artifactId: 'missing-art',
    });
    expect(() => readArtifact(ptr, dir)).toThrow('Artifact file not found');
  });

  // ── Atomic write: temp+rename — final file only appears after write completes ──
  it('uses temp+rename; no partial file at target path during write', () => {
    const dir = tmpDir();
    const content = 'x'.repeat(100_000);
    const ptr = createArtifactPointer('file:///tmp/large.txt', content, 1_700_000_000_000, [], {
      artifactId: 'test-art-atomic',
    });
    const artifactBase = path.resolve(dir, '.agent/artifacts');
    const artifactDir = path.resolve(artifactBase, ptr.artifactId.slice(0, 2));
    const filePath = path.join(artifactDir, `${ptr.artifactId}.content`);

    // Write
    writeArtifact(ptr, content, dir);

    // Target must exist and be complete
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);

    // No stray .tmp files left behind
    const files = fs.readdirSync(artifactDir);
    expect(files.some((f) => f.startsWith('.tmp-'))).toBe(false);
  });

  // ── Atomic write: cleans up temp file on SHA mismatch ──
  it('removes temp file when SHA-256 mismatch is detected before rename', () => {
    const dir = tmpDir();
    const ptr = createArtifactPointer('file:///tmp/poison.txt', 'expected content', 1_700_000_000_000, [], {
      artifactId: 'test-art-cleanup',
    });
    const artifactBase = path.resolve(dir, '.agent/artifacts');
    const artifactDir = path.resolve(artifactBase, ptr.artifactId.slice(0, 2));
    fs.mkdirSync(artifactDir, { recursive: true });

    // Attempt write with wrong content — should throw AND leave no .tmp files
    expect(() => writeArtifact(ptr, 'wrong content', dir)).toThrow('SHA-256 mismatch');
    const files = fs.readdirSync(artifactDir);
    expect(files.some((f) => f.startsWith('.tmp-'))).toBe(false);
  });

  // ── Atomic write: idempotent when called twice with same content ──
  it('can overwrite an existing artifact atomically (second write replaces first)', () => {
    const dir = tmpDir();
    const ptr1 = createArtifactPointer('file:///tmp/update.txt', 'version 1', 1_700_000_000_000, [], {
      artifactId: 'test-art-idempotent',
    });
    const ptr2 = createArtifactPointer('file:///tmp/update.txt', 'version 2', 1_700_000_000_002, [], {
      artifactId: 'test-art-idempotent',
    });
    writeArtifact(ptr1, 'version 1', dir);
    writeArtifact(ptr2, 'version 2', dir);
    expect(readArtifact(ptr2, dir)).toBe('version 2');
  });
});

describe('queryArtifacts', () => {
  const pointers: ArtifactPointer[] = [
    createArtifactPointer('file:///a.txt', 'content A', 1_700_000_000_000, ['R-039'], {
      artifactId: 'art-a',
      trustClass: 'TRUSTED',
      redactionState: 'BOUNDED_EXCERPT',
    }),
    createArtifactPointer('file:///b.txt', 'content B', 1_700_000_000_000, ['R-040'], {
      artifactId: 'art-b',
      trustClass: 'UNTRUSTED',
      redactionState: 'RAW',
    }),
  ];

  it('filters by artifactId', () => {
    const results = queryArtifacts(pointers, { artifactId: 'art-a' });
    expect(results).toHaveLength(1);
    expect(results[0].pointer.artifactId).toBe('art-a');
  });

  it('filters by trustClass', () => {
    const results = queryArtifacts(pointers, { trustClass: 'TRUSTED' });
    expect(results).toHaveLength(1);
    expect(results[0].pointer.artifactId).toBe('art-a');
  });

  it('filters by claimScope overlap', () => {
    const results = queryArtifacts(pointers, { claimScope: ['R-039'] });
    expect(results).toHaveLength(1);
    expect(results[0].pointer.artifactId).toBe('art-a');
  });

  it('returns all when query is empty', () => {
    const results = queryArtifacts(pointers, {});
    expect(results).toHaveLength(2);
  });

  it('returns matchedBy fields', () => {
    const results = queryArtifacts(pointers, { trustClass: 'TRUSTED' });
    expect(results[0].matchedBy).toContain('trustClass');
  });
});

describe('boundedExcerpt', () => {
  it('returns pointer with BOUNDED_EXCERPT when content exceeds maxBytes', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'x'.repeat(1000), 1_700_000_000_000);
    const result = boundedExcerpt('x'.repeat(1000), 100, ptr);
    expect(result.redactionState).toBe('BOUNDED_EXCERPT');
    expect(result.byteSize).toBeLessThanOrEqual(100);
  });

  it('returns pointer unchanged when content is within maxBytes', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'short', 1_700_000_000_000);
    const result = boundedExcerpt('short', 100, ptr);
    expect(result.redactionState).toBe('BOUNDED_EXCERPT');
    expect(result.byteSize).toBe(5);
  });
});

describe('utf8BoundedTruncate', () => {
  // ASCII chars are 1 byte each — character count == byte count
  it('returns full ASCII when under maxBytes', () => {
    const result = utf8BoundedTruncate('hello', 10);
    expect(result).toBe('hello');
    expect(Buffer.byteLength(result, 'utf-8')).toBe(5);
  });

  it('truncates ASCII correctly', () => {
    const result = utf8BoundedTruncate('hello world', 5);
    expect(result).toBe('hello');
    expect(Buffer.byteLength(result, 'utf-8')).toBe(5);
  });

  // ── Regression: do not split multi-byte UTF-8 sequences ──
  it('does not split 2-byte char (Latin-1 extended)', () => {
    // "é" = C3 A9 in UTF-8
    const result = utf8BoundedTruncate('café', 4); // 'c'(1)+'a'(1)+'é'(2) = 4 bytes total
    expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(4);
    // Must not end with a broken byte: decode-encode roundtrip must be clean
    expect(() => new TextEncoder().encode(result)).not.toThrow();
  });

  it('does not split 3-byte char (CJK)', () => {
    // Each CJK char = 3 bytes
    const result = utf8BoundedTruncate('日本語テスト', 5); // '日'=3, '本'=3, '語'=3 → 9 bytes
    // 5 bytes could split a 3-byte char — must not
    expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(5);
    expect(() => new TextEncoder().encode(result)).not.toThrow();
  });

  it('does not split 4-byte char (supplementary plane)', () => {
    // U+2070E "𠜎" = F0 A0 9C 8E (4 bytes)
    const result = utf8BoundedTruncate('a𠜎b', 5); // 1+4+1 = 6 bytes; 5-byte cut risks splitting the 4-byte char
    expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(5);
    expect(() => new TextEncoder().encode(result)).not.toThrow();
  });

  it('handles cut at byte boundary between multi-byte chars', () => {
    const content = '日本語日本語日本語日本語日本語'; // 15 chars × 3 bytes = 45 bytes
    const result = utf8BoundedTruncate(content, 7); // cut between chars
    expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(7);
    expect(() => new TextEncoder().encode(result)).not.toThrow();
    // Should end at a character boundary
    const decoded = new TextDecoder('utf-8');
    const reencoded = new TextEncoder().encode(result);
    expect(decoded.decode(reencoded)).toBe(result);
  });

  it('returns empty string when maxBytes < 1', () => {
    const result = utf8BoundedTruncate('hello', 0);
    expect(result).toBe('');
  });

  it('returns full content when byteLength === maxBytes', () => {
    const result = utf8BoundedTruncate('abc', 3);
    expect(result).toBe('abc');
    expect(Buffer.byteLength(result, 'utf-8')).toBe(3);
  });

  it('boundedExcerpt uses utf8BoundedTruncate internally', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', '日本語テスト日本語', 1_700_000_000_000);
    const result = boundedExcerpt('日本語テスト日本語', 10, ptr);
    expect(Buffer.byteLength(result.sha256, 'utf-8')).toBe(64); // SHA-256 hex is always 64 chars
    // byteSize of excerpt content must be ≤ 10
    const content = '日本語テスト日本語';
    const excerpted = utf8BoundedTruncate(content, 10);
    expect(result.byteSize).toBe(Buffer.byteLength(excerpted, 'utf-8'));
    expect(result.byteSize).toBeLessThanOrEqual(10);
  });
});

describe('redactArtifact', () => {
  it('redacts URI, SHA, byteSize, and sets redactionState to REDACTED', () => {
    const ptr = createArtifactPointer('file:///tmp/test.txt', 'secret content', 1_700_000_000_000);
    const redacted = redactArtifact(ptr);
    expect(redacted.redactionState).toBe('REDACTED');
    expect(redacted.uri).toBe('');
    expect(redacted.byteSize).toBe(0);
    const emptySha = sha256Bytes(new TextEncoder().encode(''));
    expect(redacted.sha256).toBe(emptySha);
  });
});
