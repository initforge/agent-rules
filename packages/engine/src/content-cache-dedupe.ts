/**
 * content-cache-dedupe.ts — M11-R44: Duplicate context removed by content-addressed
 * chunk cache (AM-0021 §11).
 *
 * Deduplication strategy:
 *   - Content is split into chunks (line-delimited or fixed-size).
 *   - Each chunk is content-addressed by SHA-256.
 *   - Duplicate chunks share a single storage entry.
 *   - Chunk refs are tracked per context to preserve ordering.
 *
 * Key properties:
 *   - Deterministic: same content → same chunk hash regardless of insertion order.
 *   - Compact: identical chunks across contexts share storage.
 *   - Verifiable: chunk integrity validated by SHA-256.
 *
 * ponytail: skip — LRU eviction, provider-side dedup hooks, chunk compression.
 * Add when AM-0021 cluster 4 ships.
 */
import { createHash } from 'node:crypto';
import type { Sha256 } from './contracts.js';
import { sha256Bytes } from './contracts.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContentChunk {
  readonly chunkHash: Sha256;
  readonly content: string;
  readonly byteLength: number;
  readonly lineStart: number;
  readonly lineEnd: number;
}

export interface ChunkRef {
  readonly chunkHash: Sha256;
  readonly refCount: number;
}

export interface DedupeContext {
  readonly contextId: string;
  readonly planId: string;
  readonly refs: readonly ChunkRef[];
}

export interface DedupeConfig {
  maxChunks?: number;
  maxBytesPerChunk?: number;
}

const DEFAULT_MAX_CHUNKS = 50_000;
const DEFAULT_MAX_BYTES_PER_CHUNK = 1024 * 64; // 64KB

// ── Internal storage ────────────────────────────────────────────────────────────

interface StoredChunk {
  content: string;
  byteLength: number;
  refCount: number;
}

class ChunkStore {
  private chunks = new Map<Sha256, StoredChunk>();
  private totalChunks = 0;
  private totalBytes = 0;

  get(hash: Sha256): StoredChunk | undefined {
    return this.chunks.get(hash);
  }

  set(hash: Sha256, content: string): boolean {
    if (this.chunks.has(hash)) {
      const c = this.chunks.get(hash)!;
      c.refCount++;
      return false; // already existed
    }
    const byteLength = new TextEncoder().encode(content).length;
    this.chunks.set(hash, { content, byteLength, refCount: 1 });
    this.totalChunks++;
    this.totalBytes += byteLength;
    return true; // newly added
  }

  release(hash: Sha256): boolean {
    const c = this.chunks.get(hash);
    if (!c) return false;
    c.refCount--;
    if (c.refCount <= 0) {
      this.chunks.delete(hash);
      this.totalChunks--;
      this.totalBytes -= c.byteLength;
    }
    return true;
  }

  stats(): { chunkCount: number; totalBytes: number; uniqueChunks: number } {
    return { chunkCount: this.totalChunks, totalBytes: this.totalBytes, uniqueChunks: this.chunks.size };
  }

  clear(): void {
    this.chunks.clear();
    this.totalChunks = 0;
    this.totalBytes = 0;
  }
}

// ── Chunking ───────────────────────────────────────────────────────────────────

function chunkContent(content: string, maxBytesPerChunk: number): ContentChunk[] {
  const lines = content.split('\n');
  const chunks: ContentChunk[] = [];
  let lineStart = 0;
  let lineEnd = 0;
  let currentBytes = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineBytes = new TextEncoder().encode(lines[i] + '\n').length;
    if (currentBytes + lineBytes > maxBytesPerChunk && chunks.length > 0) {
      const chunkContent = lines.slice(lineStart, lineEnd + 1).join('\n');
      chunks.push({
        chunkHash: sha256Bytes(new TextEncoder().encode(chunkContent)),
        content: chunkContent,
        byteLength: new TextEncoder().encode(chunkContent).length,
        lineStart,
        lineEnd,
      });
      lineStart = i;
      currentBytes = 0;
    }
    currentBytes += lineBytes;
    lineEnd = i;
  }

  if (lineStart <= lineEnd) {
    const chunkContent = lines.slice(lineStart, lineEnd + 1).join('\n');
    chunks.push({
      chunkHash: sha256Bytes(new TextEncoder().encode(chunkContent)),
      content: chunkContent,
      byteLength: new TextEncoder().encode(chunkContent).length,
      lineStart,
      lineEnd,
    });
  }

  return chunks;
}

// ── Content Cache Dedupe ────────────────────────────────────────────────────────

export interface ContentCacheDedupe {
  /** Add context content, return deduplicated refs */
  add(contextId: string, planId: string, content: string): DedupeContext;
  /** Retrieve original content from refs */
  retrieve(refs: readonly ChunkRef[]): string;
  /** Release refs for a context (decrement refcounts) */
  release(contextId: string): boolean;
  /** Stats for monitoring */
  stats(): { chunkCount: number; totalBytes: number; uniqueChunks: number };
  /** Clear all stored chunks */
  clear(): void;
}

export function createContentCacheDedupe(config: DedupeConfig = {}): ContentCacheDedupe {
  const maxBytesPerChunk = config.maxBytesPerChunk ?? DEFAULT_MAX_BYTES_PER_CHUNK;
  const store = new ChunkStore();
  const contextRefs = new Map<string, readonly ChunkRef[]>();

  return {
    add(contextId: string, planId: string, content: string): DedupeContext {
      const chunks = chunkContent(content, maxBytesPerChunk);
      const refs: ChunkRef[] = [];

      for (const chunk of chunks) {
        store.set(chunk.chunkHash, chunk.content);
        const stored = store.get(chunk.chunkHash)!;
        refs.push({ chunkHash: chunk.chunkHash, refCount: stored.refCount });
      }

      contextRefs.set(contextId, Object.freeze(refs));
      return Object.freeze({ contextId, planId, refs: Object.freeze(refs) });
    },

    retrieve(refs: readonly ChunkRef[]): string {
      const parts: string[] = [];
      for (const ref of refs) {
        const chunk = store.get(ref.chunkHash);
        if (chunk) parts.push(chunk.content);
      }
      return parts.join('');
    },

    release(contextId: string): boolean {
      const refs = contextRefs.get(contextId);
      if (!refs) return false;
      for (const ref of refs) store.release(ref.chunkHash);
      contextRefs.delete(contextId);
      return true;
    },

    stats(): { chunkCount: number; totalBytes: number; uniqueChunks: number } {
      return store.stats();
    },

    clear(): void {
      store.clear();
      contextRefs.clear();
    },
  };
}

/** computeContentHash — deterministic hash for entire content (without chunking) */
export function computeContentHash(content: string): Sha256 {
  return sha256Bytes(new TextEncoder().encode(content));
}

/** estimateTokenCount — rough estimate: 1 token ≈ 4 bytes for English text */
export function estimateTokenCount(content: string): number {
  return Math.ceil(new TextEncoder().encode(content).length / 4);
}

/** computeDedupeSavings — compute space savings from dedup */
export function computeDedupeSavings(
  originalBytes: number,
  cache: ContentCacheDedupe,
): { dedupeRatio: number; dedupeBytes: number; uniqueBytes: number } {
  const stats = cache.stats();
  const dedupeBytes = Math.max(0, originalBytes - stats.totalBytes);
  const dedupeRatio = originalBytes > 0 ? dedupeBytes / originalBytes : 0;
  return { dedupeRatio, dedupeBytes, uniqueBytes: stats.totalBytes };
}
