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
