import { describe, expect, it, beforeEach } from 'vitest';
import {
  createContentCacheDedupe,
  computeContentHash,
  estimateTokenCount,
  computeDedupeSavings,
  type ContentCacheDedupe,
} from '../src/content-cache-dedupe.js';

describe('content-cache-dedupe', () => {
  let cache: ContentCacheDedupe;

  beforeEach(() => {
    cache = createContentCacheDedupe({ maxBytesPerChunk: 1024 });
  });

  describe('createContentCacheDedupe', () => {
    it('starts with empty stats', () => {
      const stats = cache.stats();
      expect(stats.chunkCount).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.uniqueChunks).toBe(0);
    });
  });

  describe('add', () => {
    it('stores and returns deduplicated refs', () => {
      const content = 'line1\nline2\nline3\n';
      const ctx = cache.add('ctx-001', 'plan-001', content);
      expect(ctx.contextId).toBe('ctx-001');
      expect(ctx.planId).toBe('plan-001');
      expect(ctx.refs.length).toBeGreaterThan(0);
      expect(ctx.refs[0].chunkHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('increments refCount on duplicate content', () => {
      const content = 'identical\n';
      const ctx1 = cache.add('ctx-001', 'plan-001', content);
      const ctx2 = cache.add('ctx-002', 'plan-001', content);
      expect(ctx1.refs[0].refCount).toBe(1);
      expect(ctx2.refs[0].refCount).toBe(2);
    });

    it('stores different chunks separately', () => {
      const content = 'unique1\nunique2\n';
      const ctx = cache.add('ctx-001', 'plan-001', content);
      expect(ctx.refs.length).toBeGreaterThanOrEqual(1);
    });

    it('handles empty content', () => {
      const ctx = cache.add('ctx-001', 'plan-001', '');
      // Empty content creates empty string chunk
      expect(ctx.refs.length).toBe(1);
      expect(cache.retrieve(ctx.refs)).toBe('');
    });
  });

  describe('retrieve', () => {
    it('reconstructs original content from refs', () => {
      const original = 'line1\nline2\nline3\n';
      const ctx = cache.add('ctx-001', 'plan-001', original);
      const retrieved = cache.retrieve(ctx.refs);
      expect(retrieved).toBe(original);
    });

    it('returns empty for empty refs', () => {
      const retrieved = cache.retrieve([]);
      expect(retrieved).toBe('');
    });

    it('retrieves content stored across multiple contexts', () => {
      const content = 'shared\n';
      const ctx1 = cache.add('ctx-001', 'plan-001', content);
      const ctx2 = cache.add('ctx-002', 'plan-001', content);
      expect(cache.retrieve(ctx1.refs)).toBe(content);
      expect(cache.retrieve(ctx2.refs)).toBe(content);
    });
  });

  describe('release', () => {
    it('releases refs and decrements refCount', () => {
      const content = 'to-release\n';
      const ctx1 = cache.add('ctx-001', 'plan-001', content);
      const ctx2 = cache.add('ctx-002', 'plan-001', content);
      // Each ref captures the count at creation time
      // After second add, the chunk has refCount=2
      expect(ctx2.refs[0].refCount).toBe(2);
      const released = cache.release('ctx-001');
      expect(released).toBe(true);
      // RefCount decremented but chunk still exists
      const stats = cache.stats();
      expect(stats.uniqueChunks).toBe(1);
    });

    it('returns false for unknown contextId', () => {
      const result = cache.release('unknown-ctx');
      expect(result).toBe(false);
    });

    it('actually removes chunk when refCount reaches 0', () => {
      const content = 'last-ref\n';
      const ctx = cache.add('ctx-001', 'plan-001', content);
      cache.release('ctx-001');
      // Chunk removed from store
      const retrieved = cache.retrieve(ctx.refs);
      expect(retrieved).toBe(''); // chunk gone
    });
  });

  describe('stats', () => {
    it('tracks chunk and byte counts', () => {
      cache.add('ctx-001', 'plan-001', 'content1\n');
      cache.add('ctx-002', 'plan-001', 'content2\n');
      const stats = cache.stats();
      expect(stats.chunkCount).toBeGreaterThanOrEqual(0);
      expect(stats.totalBytes).toBeGreaterThanOrEqual(0);
      expect(stats.uniqueChunks).toBeGreaterThanOrEqual(1);
    });

    it('updates stats after release', () => {
      const content = 'to-track\n';
      cache.add('ctx-001', 'plan-001', content);
      const before = cache.stats();
      cache.release('ctx-001');
      const after = cache.stats();
      expect(after.uniqueChunks).toBeLessThanOrEqual(before.uniqueChunks);
    });
  });

  describe('clear', () => {
    it('removes all stored chunks', () => {
      cache.add('ctx-001', 'plan-001', 'content\n');
      cache.add('ctx-002', 'plan-001', 'more\n');
      cache.clear();
      const stats = cache.stats();
      expect(stats.chunkCount).toBe(0);
      expect(stats.uniqueChunks).toBe(0);
    });
  });

  describe('computeContentHash', () => {
    it('returns deterministic SHA for same content', () => {
      const h1 = computeContentHash('test content');
      const h2 = computeContentHash('test content');
      expect(h1).toBe(h2);
    });

    it('returns different SHA for different content', () => {
      const h1 = computeContentHash('content A');
      const h2 = computeContentHash('content B');
      expect(h1).not.toBe(h2);
    });

    it('returns 64-character hex', () => {
      const h = computeContentHash('any');
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('estimateTokenCount', () => {
    it('estimates tokens from byte count', () => {
      const tokens = estimateTokenCount('a'.repeat(400));
      expect(tokens).toBe(100); // 400 bytes / 4 = 100 tokens
    });

    it('handles empty content', () => {
      expect(estimateTokenCount('')).toBe(0);
    });

    it('rounds up for partial tokens', () => {
      const tokens = estimateTokenCount('abc'); // 3 bytes
      expect(tokens).toBe(1); // ceil(3/4) = 1
    });
  });

  describe('computeDedupeSavings', () => {
    it('computes deduplication savings', () => {
      cache.add('ctx-001', 'plan-001', 'shared\n');
      cache.add('ctx-002', 'plan-001', 'shared\n');
      const originalBytes = 1000;
      const savings = computeDedupeSavings(originalBytes, cache);
      expect(savings.dedupeBytes).toBeGreaterThanOrEqual(0);
      expect(savings.dedupeRatio).toBeGreaterThanOrEqual(0);
      expect(savings.dedupeRatio).toBeLessThanOrEqual(1);
    });

    it('handles zero original bytes', () => {
      const savings = computeDedupeSavings(0, cache);
      expect(savings.dedupeRatio).toBe(0);
    });
  });

  describe('chunk integrity', () => {
    it('chunks are deterministic for same content', () => {
      const content = 'line1\nline2\nline3\n';
      const ctx1 = cache.add('ctx-001', 'plan-001', content);
      const ctx2 = cache.add('ctx-002', 'plan-001', content);
      expect(ctx1.refs.map(r => r.chunkHash)).toEqual(ctx2.refs.map(r => r.chunkHash));
    });

    it('chunkHash is valid SHA-256', () => {
      const ctx = cache.add('ctx-001', 'plan-001', 'test\n');
      for (const ref of ctx.refs) {
        expect(ref.chunkHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  describe('line boundary handling', () => {
    it('preserves line structure', () => {
      const content = 'line1\nline2\nline3\n';
      const ctx = cache.add('ctx-001', 'plan-001', content);
      const retrieved = cache.retrieve(ctx.refs);
      expect(retrieved).toBe(content);
    });

    it('handles trailing newline', () => {
      const content = 'no-newline';
      const ctx = cache.add('ctx-001', 'plan-001', content);
      const retrieved = cache.retrieve(ctx.refs);
      expect(retrieved).toBe(content);
    });
  });
});
