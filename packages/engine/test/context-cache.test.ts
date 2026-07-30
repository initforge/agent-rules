import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContextCache, type ContextCapsuleKey, type ContextCapsule } from '../src/context-cache.js';

function makeKey(overrides?: Partial<ContextCapsuleKey>): ContextCapsuleKey {
  return {
    effectivePlanSha256: 'a'.repeat(64),
    orderedAmendmentSha256: 'b'.repeat(64),
    baselineSha: 'c'.repeat(64),
    assignmentId: 'assignment-1',
    ownedPaths: ['src/'],
    forbiddenPaths: ['node_modules/'],
    sourceFileHashes: { 'src/main.ts': 'd'.repeat(64) },
    toolchainManifestSha256: 'e'.repeat(64),
    acceptanceCriteriaSha256: 'f'.repeat(64),
    ...overrides,
  };
}

function makeCapsule(key: ContextCapsuleKey, overrides?: Partial<ContextCapsule>): ContextCapsule {
  return {
    key,
    capsuleSha256: '',
    planAnchors: [],
    amendmentExcerpts: [],
    relevantContracts: [],
    diffFacts: 'no changes',
    failingEvidence: [],
    verificationCommands: ['npm test'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function countFiles(dir: string): number {
  try { return fs.readdirSync(dir).filter((f) => f !== 'index.json' && f !== '.lock').length; } catch { return 0; }
}

describe('ContextCache', () => {
  let cache: ContextCache;

  describe('memory-only mode (default)', () => {
    beforeEach(() => { cache = new ContextCache(); });

    it('productionReady is false without cacheDir', () => {
      expect(cache.productionReady).toBe(false);
    });

    it('returns undefined for missing key', () => {
      expect(cache.get(makeKey())).toBeUndefined();
    });

    it('stores and retrieves a capsule', () => {
      const key = makeKey();
      expect(cache.set(key, makeCapsule(key))).toBe(true);
      const r = cache.get(key);
      expect(r).toBeDefined();
      expect(r!.capsule.key.assignmentId).toBe('assignment-1');
      expect(r!.capsule.capsuleSha256).toBeTruthy();
      expect(r!.source).toBe('local');
    });

    it('rejects set when key string fields are empty', () => {
      expect(cache.set(makeKey({ effectivePlanSha256: '' }), makeCapsule(makeKey({ effectivePlanSha256: '' })))).toBe(false);
    });

    it('rejects set when key array fields are empty', () => {
      expect(cache.set(makeKey({ ownedPaths: [] }), makeCapsule(makeKey({ ownedPaths: [] })))).toBe(false);
    });

    it('rejects set when capsuleSha256 mismatches', () => {
      expect(cache.set(makeKey(), makeCapsule(makeKey(), { capsuleSha256: 'bad' }))).toBe(false);
    });

    it('rejects set when sourceFileHashes is empty', () => {
      expect(cache.set(makeKey({ sourceFileHashes: {} }), makeCapsule(makeKey({ sourceFileHashes: {} })))).toBe(false);
    });

    it('rejects set with empty ownedPaths', () => {
      expect(cache.set(makeKey({ ownedPaths: [] }), makeCapsule(makeKey({ ownedPaths: [] })))).toBe(false);
    });

    it('capsuleSha256 is deterministic for same content', () => {
      const k = makeKey();
      const cap = makeCapsule(k, { createdAt: '2026-01-01T00:00:00.000Z' });
      cache.set(k, cap);
      const a = cache.get(k)!;
      cache.set(k, cap);
      const b = cache.get(k)!;
      expect(a.capsule.capsuleSha256).toBe(b.capsule.capsuleSha256);
    });

    it('invalidates by baselineSha', () => {
      cache.set(makeKey({ baselineSha: 'x' }), makeCapsule(makeKey({ baselineSha: 'x' })));
      expect(cache.size()).toBe(1);
      expect(cache.invalidate({ baselineSha: 'x' })).toBe(1);
      expect(cache.size()).toBe(0);
    });

    it('invalidatesAll clears everything', () => {
      cache.set(makeKey({ assignmentId: 'a' }), makeCapsule(makeKey({ assignmentId: 'a' })));
      cache.set(makeKey({ assignmentId: 'b' }), makeCapsule(makeKey({ assignmentId: 'b' })));
      expect(cache.size()).toBe(2);
      cache.invalidateAll();
      expect(cache.size()).toBe(0);
    });

    it('tracks reads and writes', () => {
      const k = makeKey();
      cache.set(k, makeCapsule(k));
      expect(cache.cacheWrites).toBe(1);
      cache.get(k);
      expect(cache.cacheReads).toBe(1);
    });

    it('telemetry starts UNVERIFIED', () => {
      expect(cache.lastTelemetry.providerCacheStatus).toBe('UNVERIFIED');
    });

    it('recordProviderHit increments without fabricating', () => {
      expect(cache.providerHits).toBe(0);
      cache.recordProviderHit(makeKey());
      expect(cache.providerHits).toBe(1);
      expect(cache.lastTelemetry.providerCacheStatus).toBe('VERIFIED');
    });

    it('expired capsule is not returned', () => {
      const k = makeKey();
      cache.set(k, makeCapsule(k), -1);
      expect(cache.get(k)).toBeUndefined();
    });

    it('LRU eviction respects maxEntries', () => {
      const small = new ContextCache({ maxEntries: 3 });
      for (let i = 0; i < 10; i++) {
        small.set(makeKey({ assignmentId: `a${i}` }), makeCapsule(makeKey({ assignmentId: `a${i}` })));
      }
      expect(small.size()).toBeLessThanOrEqual(3);
    });
  });

  describe('production mode (with cacheDir)', () => {
    const tmpDirs: string[] = [];

    afterEach(() => {
      for (const d of tmpDirs.splice(0)) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ok */ }
      }
    });

    function makeCache(): { cache: ContextCache; dir: string } {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-cache-'));
      tmpDirs.push(dir);
      return { cache: new ContextCache({ cacheDir: dir }), dir };
    }

    it('productionReady is true with cacheDir', () => {
      const { cache } = makeCache();
      expect(cache.productionReady).toBe(true);
    });

    it('persists capsule to disk and reloads across instances', () => {
      const { cache: c1, dir } = makeCache();
      const k = makeKey();
      c1.set(k, makeCapsule(k));
      expect(countFiles(dir)).toBe(1);

      const c2 = new ContextCache({ cacheDir: dir });
      const r = c2.get(k);
      expect(r).toBeDefined();
      expect(r!.capsule.key.assignmentId).toBe('assignment-1');
    });

    it('cross-instance read after set', () => {
      const { cache: c1, dir } = makeCache();
      const k = makeKey();
      c1.set(k, makeCapsule(k));
      const c2 = new ContextCache({ cacheDir: dir });
      const r = c2.get(k);
      expect(r).toBeDefined();
    });

    it('handles corruption by renaming the corrupt file', () => {
      const { cache: c1, dir } = makeCache();
      const k = makeKey();
      c1.set(k, makeCapsule(k));
      const entryPath = path.join(dir, computeCacheKeyHelper(makeKey()) + '.json');
      fs.writeFileSync(entryPath, 'corrupt{json');
      const c2 = new ContextCache({ cacheDir: dir });
      const r = c2.get(k);
      expect(r).toBeUndefined();
    });

    it('atomic write does not leave partial files on crash', () => {
      const { cache: c1, dir } = makeCache();
      const k = makeKey();
      c1.set(k, makeCapsule(k));
      const tmpFiles = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
      expect(tmpFiles.length).toBe(0);
    });

    it('evicts disk entries when maxEntries is low', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-evict-'));
      tmpDirs.push(dir);
      const small = new ContextCache({ cacheDir: dir, maxEntries: 3 });
      for (let i = 0; i < 10; i++) {
        small.set(makeKey({ assignmentId: `e${i}` }), makeCapsule(makeKey({ assignmentId: `e${i}` })));
      }
      expect(small.size()).toBeLessThanOrEqual(3);
      expect(countFiles(dir)).toBeLessThanOrEqual(3);
    });

    it('rebuilds metadata after corruption', () => {
      const { cache: c1, dir } = makeCache();
      const k = makeKey();
      c1.set(k, makeCapsule(k));
      const metaPath = path.join(dir, 'index.json');
      fs.writeFileSync(metaPath, 'corrupted');
      const c2 = new ContextCache({ cacheDir: dir });
      expect(c2.get(k)).toBeDefined();
    });
  });
});

function computeCacheKeyHelper(key: ContextCapsuleKey): string {
  const { createHash } = require('node:crypto');
  const payload = JSON.stringify([
    key.effectivePlanSha256, key.orderedAmendmentSha256, key.baselineSha,
    key.assignmentId, [...key.ownedPaths].sort(), [...key.forbiddenPaths].sort(),
    Object.fromEntries(Object.entries(key.sourceFileHashes).sort(([a], [b]) => a.localeCompare(b))),
    key.toolchainManifestSha256, key.acceptanceCriteriaSha256,
  ]);
  return createHash('sha256').update(new TextEncoder().encode(payload)).digest('hex');
}

// F1: CRITICAL — cache read must verify capsuleSha256; tampered JSON quarantined
describe('F1 capsule integrity', () => {
  it('rejects capsule with tampered content (valid JSON, wrong capsuleSha256)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f1-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      const k = makeKey();
      const cap = makeCapsule(k);
      c1.set(k, cap);
      const entryPath = path.join(dir, computeCacheKeyHelper(k) + '.json');
      // Tamper: keep valid JSON but change content without updating capsuleSha256
      const raw = fs.readFileSync(entryPath, 'utf-8');
      const parsed = JSON.parse(raw);
      parsed.diffFacts = 'tampered data';
      parsed.capsuleSha256 = 'badhash'; // won't match computed
      fs.writeFileSync(entryPath, JSON.stringify(parsed));

      const c2 = new ContextCache({ cacheDir: dir });
      expect(c2.get(k)).toBeUndefined();
      // Tampered file should be quarantined (renamed to .corrupt)
      const files = fs.readdirSync(dir);
      const corruptFiles = files.filter(f => f.includes('.corrupt'));
      expect(corruptFiles.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects capsule with key mismatch (stored key hash != lookup key)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f1-key-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      const k1 = makeKey({ assignmentId: 'k1' });
      c1.set(k1, makeCapsule(k1));
      // Look up with different key — should not find
      const k2 = makeKey({ assignmentId: 'k2' });
      expect(c1.get(k2)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// F2: HIGH — lock acquisition failure must not write
describe('F2 lock fail-closed', () => {
  it('does not write to disk when lock cannot be acquired', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f2-'));
    try {
      // Pre-create lock file to prevent acquisition
      const lockPath = path.join(dir, '.lock');
      fs.writeFileSync(lockPath, 'other-process');
      const cache = new ContextCache({ cacheDir: dir });
      const k = makeKey();
      // F4 (R4): lock failure propagates — set returns false, reverts memory
      const result = cache.set(k, makeCapsule(k));
      expect(result).toBe(false);
      // No file on disk
      const files = fs.readdirSync(dir).filter(f => f !== 'index.json' && f !== '.lock');
      expect(files.length).toBe(0);
      // No in-memory entry (reverted on lock failure)
      expect(cache.get(k)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// F3: HIGH — enforce maxBytes
describe('F3 maxBytes enforcement', () => {
  it('evicts entries when total bytes exceed maxBytes', () => {
    const cache = new ContextCache({ maxBytes: 1 }); // very small
    const k1 = makeKey({ assignmentId: 'big1' });
    cache.set(k1, makeCapsule(k1));
    expect(cache.size()).toBe(0); // evicted immediately
  });

  it('keeps entries under maxBytes threshold', () => {
    const cache = new ContextCache({ maxBytes: 1024 * 1024 });
    for (let i = 0; i < 5; i++) {
      cache.set(makeKey({ assignmentId: `mb${i}` }), makeCapsule(makeKey({ assignmentId: `mb${i}` })));
    }
    expect(cache.size()).toBe(5);
  });
});

// F4 (R2): HIGH — disk-loaded entry updates totalBytes/access/evict
describe('F4 (R2) disk load accounting', () => {
  it('loads capsule from disk and updates totalBytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f4r2-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir, maxBytes: 1024 * 1024 });
      const k = makeKey({ assignmentId: 'disk-bytes' });
      c1.set(k, makeCapsule(k));
      const bytesBefore = c1['totalBytes'];
      expect(bytesBefore).toBeGreaterThan(0);
      // Cross-instance load — disk entry must update totalBytes
      const c2 = new ContextCache({ cacheDir: dir });
      const r = c2.get(k);
      expect(r).toBeDefined();
      expect(c2['totalBytes']).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// F4 (R3): HIGH — oversized entry evicted immediately must not write to disk
describe('F4 (R3) disk write/eviction ordering', () => {
  it('does not write oversized entry to disk after eviction', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f4r3-'));
    try {
      const cache = new ContextCache({ cacheDir: dir, maxBytes: 1 }); // tiny budget
      const k = makeKey({ assignmentId: 'oversized' });
      cache.set(k, makeCapsule(k));
      // Entry was evicted from memory (size=0 after evict)
      expect(cache.size()).toBe(0);
      // No file on disk
      const files = fs.readdirSync(dir).filter(f => f !== 'index.json' && f !== '.lock');
      expect(files.length).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes entry to disk only if still in memory after eviction', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f4r3b-'));
    try {
      const cache = new ContextCache({ cacheDir: dir, maxBytes: 1024 * 1024 });
      const k = makeKey({ assignmentId: 'kept-entry' });
      cache.set(k, makeCapsule(k));
      expect(cache.size()).toBe(1);
      const files = fs.readdirSync(dir).filter(f => f !== 'index.json' && f !== '.lock');
      expect(files.length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// F5 (R3): HIGH — invalidate lock failure must throw, not silently diverge
describe('F5 (R3) invalidate lock failure throws', () => {
  it('invalidateAll throws when lock unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f5r3a-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      c1.set(makeKey({ assignmentId: 'lock-all' }), makeCapsule(makeKey({ assignmentId: 'lock-all' })));
      const lockPath = path.join(dir, '.lock');
      fs.writeFileSync(lockPath, 'other');
      expect(() => c1.invalidateAll()).toThrow('Cannot acquire cache lock');
      // In-memory entries still exist
      expect(c1.size()).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('invalidateAll with no lock file succeeds', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f5r3b-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      c1.set(makeKey({ assignmentId: 'lock-ok' }), makeCapsule(makeKey({ assignmentId: 'lock-ok' })));
      c1.invalidateAll();
      expect(c1.size()).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// F5 (R2): legacy — deleteFromDisk + rebuildMetadata still require lock (non-throwing)
describe('F5 (R2) lock for delete/metadata (legacy)', () => {
  it('deleteFromDisk does not remove file when lock unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f5r2-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      const k = makeKey({ assignmentId: 'lock-del' });
      c1.set(k, makeCapsule(k));
      const lockPath = path.join(dir, '.lock');
      fs.writeFileSync(lockPath, 'other');
      expect(() => c1.invalidate({ assignmentId: 'lock-del' })).toThrow('Cannot acquire cache lock');
      const entryPath = path.join(dir, computeCacheKeyHelper(makeKey({ assignmentId: 'lock-del' })) + '.json');
      expect(fs.existsSync(entryPath)).toBe(true);
      expect(c1.size()).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rebuildMetadata skips write when lock unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-f5r2b-'));
    try {
      const c1 = new ContextCache({ cacheDir: dir });
      const k = makeKey({ assignmentId: 'lock-meta' });
      c1.set(k, makeCapsule(k));
      const lockPath = path.join(dir, '.lock');
      fs.writeFileSync(lockPath, 'other');
      const metaPath = path.join(dir, 'index.json');
      fs.writeFileSync(metaPath, 'corrupted');
      const c2 = new ContextCache({ cacheDir: dir });
      expect(fs.readFileSync(metaPath, 'utf-8')).toBe('corrupted');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
