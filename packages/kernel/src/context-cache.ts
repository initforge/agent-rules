import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ContextCapsuleKey {
  effectivePlanSha256: string;
  orderedAmendmentSha256: string;
  baselineSha: string;
  assignmentId: string;
  ownedPaths: readonly string[];
  forbiddenPaths: readonly string[];
  sourceFileHashes: Readonly<Record<string, string>>;
  toolchainManifestSha256: string;
  acceptanceCriteriaSha256: string;
}

export interface ContextCapsule {
  key: ContextCapsuleKey;
  capsuleSha256: string;
  planAnchors: readonly unknown[];
  amendmentExcerpts: readonly unknown[];
  relevantContracts: readonly unknown[];
  diffFacts: string;
  failingEvidence: readonly string[];
  verificationCommands: readonly string[];
  createdAt: string;
  expiresAt?: string;
}

export interface CacheGetResult {
  capsule: ContextCapsule;
  source: 'local' | 'provider';
}

export interface LastCacheTelemetry {
  reads: number;
  writes: number;
  localHits: number;
  providerHits: number;
  providerCacheStatus: 'VERIFIED' | 'UNVERIFIED' | 'ABSENT';
}

export interface ContextCacheConfig {
  cacheDir?: string;
  /** In-memory entry ceiling. Evicted entries spill to disk and stay readable. */
  maxEntries?: number;
  maxBytes?: number;
  defaultTTLMs?: number;
  /**
   * On-disk entry ceiling. Must exceed `maxEntries` for spill-then-reload to work:
   * memory eviction is what puts an entry on disk, so a disk budget equal to the
   * memory budget would delete the entry the moment it spilled. Defaults to a
   * multiple of `maxEntries`.
   */
  maxDiskEntries?: number;
}

interface MetadataEntry {
  key: ContextCapsuleKey;
  capsuleSha256: string;
  file: string;
  size: number;
  createdAt: string;
  expiresAt?: string;
  lastAccess: string;
}

interface MetadataFile {
  version: number;
  entries: MetadataEntry[];
}

const METADATA_FILE = 'index.json';
const LOCK_FILE = '.lock';
const CACHE_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 1000;
/** Disk holds more than memory so evicted entries remain reloadable. */
const DISK_ENTRY_MULTIPLIER = 10;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function canonicalizeKey(key: ContextCapsuleKey): unknown {
  const sortedSourceFileHashes = Object.fromEntries(
    Object.entries(key.sourceFileHashes).sort(([a], [b]) => a.localeCompare(b)),
  );
  return [
    key.effectivePlanSha256,
    key.orderedAmendmentSha256,
    key.baselineSha,
    key.assignmentId,
    [...key.ownedPaths].sort(),
    [...key.forbiddenPaths].sort(),
    sortedSourceFileHashes,
    key.toolchainManifestSha256,
    key.acceptanceCriteriaSha256,
  ];
}

function computeCacheKey(key: ContextCapsuleKey): string {
  const payload = JSON.stringify(canonicalizeKey(key));
  return sha256(new TextEncoder().encode(payload));
}

function extractContent(capsule: ContextCapsule): { planAnchors: readonly unknown[]; amendmentExcerpts: readonly unknown[]; relevantContracts: readonly unknown[]; diffFacts: string; failingEvidence: readonly string[]; verificationCommands: readonly string[] } {
  return {
    planAnchors: capsule.planAnchors,
    amendmentExcerpts: capsule.amendmentExcerpts,
    relevantContracts: capsule.relevantContracts,
    diffFacts: capsule.diffFacts,
    failingEvidence: capsule.failingEvidence,
    verificationCommands: capsule.verificationCommands,
  };
}

function computeCapsuleSha256(key: ContextCapsuleKey, content: { planAnchors: readonly unknown[]; amendmentExcerpts: readonly unknown[]; relevantContracts: readonly unknown[]; diffFacts: string; failingEvidence: readonly string[]; verificationCommands: readonly string[] }): string {
  const payload = JSON.stringify([canonicalizeKey(key), content]);
  return sha256(new TextEncoder().encode(payload));
}

function validateKey(key: ContextCapsuleKey): boolean {
  const stringFields: (keyof ContextCapsuleKey)[] = ['effectivePlanSha256', 'orderedAmendmentSha256', 'baselineSha', 'assignmentId', 'toolchainManifestSha256', 'acceptanceCriteriaSha256'];
  for (const f of stringFields) {
    const v = key[f];
    if (typeof v !== 'string' || v.length === 0) return false;
  }
  const arrFields: (keyof ContextCapsuleKey)[] = ['ownedPaths', 'forbiddenPaths'];
  for (const f of arrFields) {
    const v = key[f] as readonly unknown[];
    if (!Array.isArray(v) || v.length === 0) return false;
  }
  if (typeof key.sourceFileHashes !== 'object' || Object.keys(key.sourceFileHashes).length === 0) return false;
  return true;
}

function acquireLock(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
    return true;
  } catch { return false; }
}

function releaseLock(lockPath: string): void {
  try { fs.unlinkSync(lockPath); } catch { /* ok */ }
}

function atomicWrite(targetPath: string, data: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = targetPath + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(tmp, 'wx');
  try {
    fs.writeFileSync(fd, data, 'utf-8');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, targetPath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    // Windows / some FS reject fsync on directory handles with EPERM.
    // The file is already durable via the file fsync above; the dir fsync is only
    // a power-loss meta-data flush, so a best-effort attempt is enough.
    try { fs.fsyncSync(dirFd); } catch { /* not supported on this platform */ }
  } finally { fs.closeSync(dirFd); }
  // ponytail: if rename fails (exception above), cleanup temp on next startup via exists check
  if (fs.existsSync(tmp)) try { fs.unlinkSync(tmp); } catch { /* ok */ }
}

/** F5 (R5): disk entry info for bootstrap enforcement */
interface DiskEntryInfo {
  key: string;
  path: string;
  size: number;
  createdAt: number;
}

export class ContextCache {
  private readonly cacheDir: string | null;
  private readonly maxEntries: number;
  private readonly maxDiskEntries: number;
  private readonly maxBytes: number;
  private readonly defaultTTLMs: number;
  private memory = new Map<string, ContextCapsule>();
  private accessOrder: string[] = [];
  private totalBytes = 0;
  /** F7 (R7): keys whose size is already in totalBytes from disk bootstrap */
  private diskAccounted = new Set<string>();
  public cacheReads = 0;
  public cacheWrites = 0;
  public localHits = 0;
  public providerHits = 0;
  public lastTelemetry: LastCacheTelemetry = { reads: 0, writes: 0, localHits: 0, providerHits: 0, providerCacheStatus: 'UNVERIFIED' };

  constructor(config?: ContextCacheConfig) {
    this.cacheDir = config?.cacheDir ? path.resolve(config.cacheDir) : null;
    this.maxEntries = config?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxDiskEntries = config?.maxDiskEntries ?? this.maxEntries * DISK_ENTRY_MULTIPLIER;
    this.maxBytes = config?.maxBytes ?? DEFAULT_MAX_BYTES;
    this.defaultTTLMs = config?.defaultTTLMs ?? DEFAULT_TTL_MS;
    if (this.cacheDir && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.loadMetadata();
    // F5 (R5): bootstrap enforce limits + load disk-only entries into accounting
    if (this.cacheDir) {
      this.bootstrapDiskAccounting();
    }
  }

  get productionReady(): boolean { return this.cacheDir !== null; }

  get(key: ContextCapsuleKey): CacheGetResult | undefined {
    this.cacheReads++;
    const k = computeCacheKey(key);

    let capsule: ContextCapsule | undefined = this.memory.get(k);
    if (!capsule && this.cacheDir) {
      capsule = this.readFromDisk(k);
    }

    if (!capsule) {
      this.lastTelemetry = { reads: this.cacheReads, writes: this.cacheWrites, localHits: this.localHits, providerHits: this.providerHits, providerCacheStatus: 'ABSENT' };
      return undefined;
    }

    if (capsule.expiresAt && Date.now() > new Date(capsule.expiresAt).getTime()) {
      this.memory.delete(k);
      this.deleteFromDisk(k);
      this.lastTelemetry = { reads: this.cacheReads, writes: this.cacheWrites, localHits: this.localHits, providerHits: this.providerHits, providerCacheStatus: 'ABSENT' };
      return undefined;
    }

    this.localHits++;
    this.touchAccess(k);
    this.lastTelemetry = { reads: this.cacheReads, writes: this.cacheWrites, localHits: this.localHits, providerHits: this.providerHits, providerCacheStatus: 'VERIFIED' };
    return { capsule, source: 'local' };
  }

  // F9 (R9): transactional set — backup BEFORE mutation, fail if backup fails; capture old size; rollback telemetry
  set(key: ContextCapsuleKey, capsule: ContextCapsule, ttlMs?: number): boolean {
    if (!validateKey(key)) return false;
    const contentOnly = extractContent(capsule);
    const expectedSha = computeCapsuleSha256(key, contentOnly);
    if (capsule.capsuleSha256 && capsule.capsuleSha256 !== expectedSha) return false;

    const k = computeCacheKey(key);
    const now = new Date().toISOString();
    const expiresAt = ttlMs ?? this.defaultTTLMs;
    const stored: ContextCapsule = {
      ...capsule,
      capsuleSha256: capsule.capsuleSha256 || expectedSha,
      expiresAt: new Date(Date.now() + expiresAt).toISOString(),
    };

    // Acquire transaction lock upfront
    const lockPath = this.cacheDir ? path.join(this.cacheDir, LOCK_FILE) : null;
    let lockAcquired = !lockPath;
    if (lockPath) {
      lockAcquired = acquireLock(lockPath);
      if (!lockAcquired) return false;
    }

    // F9 (R9): snapshot pre-mutation state for rollback
    const preAccessOrder = [...this.accessOrder];
    const preTotalBytes = this.totalBytes;
    const preDiskAccounted = new Set(this.diskAccounted);
    const preMemory = new Map(this.memory);
    const preTelemetry = this.lastTelemetry;
    const preCacheWrites = this.cacheWrites;

    // F9 (R9): capture old disk file size BEFORE overwrite
    let oldDiskSize = 0;
    if (this.cacheDir && this.diskAccounted.has(k)) {
      try {
        oldDiskSize = fs.statSync(path.join(this.cacheDir, k + '.json')).size;
      } catch { /* no old disk file or stat failed */ }
    }

    // F9 (R9): backup all disk files that might be overwritten or evicted
    // If ANY backup read fails, fail transaction BEFORE mutation
    const diskBackups = new Map<string, string | null>();
    if (this.cacheDir) {
      const maybeFiles = [k, ...this.accessOrder];
      for (const fk of maybeFiles) {
        const fpath = path.join(this.cacheDir, fk + '.json');
        if (fs.existsSync(fpath)) {
          try {
            diskBackups.set(fk, fs.readFileSync(fpath, 'utf-8'));
          } catch {
            // Backup read failure — fail transaction before any write
            if (lockPath && lockAcquired) releaseLock(lockPath);
            return false;
          }
        } else {
          diskBackups.set(fk, null);
        }
      }
    }

    // F4 (R3): reject if new entry alone exceeds maxBytes (pre-write check)
    if (this.maxBytes < Number.MAX_SAFE_INTEGER) {
      const newEntrySize = new TextEncoder().encode(JSON.stringify(stored)).length;
      let projectedTotal = this.totalBytes - (preMemory.has(k) ? new TextEncoder().encode(JSON.stringify(preMemory.get(k))).length : 0);
      projectedTotal += newEntrySize;
      if (projectedTotal > this.maxBytes) {
        if (lockPath && lockAcquired) releaseLock(lockPath);
        return false;
      }
    }

    try {
      // Stage 1: write new entry to disk (overwrites old file under lock)
      if (this.cacheDir) {
        this.writeToDisk(k, stored);
      }

      // Stage 2: update memory + accounting
      this.cacheWrites++;
      const existing = this.memory.get(k);
      if (existing) {
        this.totalBytes -= new TextEncoder().encode(JSON.stringify(existing)).length;
      }
      if (this.diskAccounted.has(k)) {
        // F9 (R9): use captured old size (stat BEFORE write, not after)
        this.totalBytes = Math.max(0, this.totalBytes - oldDiskSize);
        this.diskAccounted.delete(k);
      }
      this.memory.set(k, stored);
      this.totalBytes += new TextEncoder().encode(JSON.stringify(stored)).length;
      this.touchAccess(k);

      // Stage 3: evict if over limits (evict handles disk+memory)
      this.evict();
      // Spilled entries stay readable on disk, but the disk cannot grow without bound:
      // enforce the disk budget on every write, not only at bootstrap. Without this,
      // `maxEntries` was silently a memory-only limit and the cache directory kept
      // every capsule ever written.
      this.deleteOldestDiskEntries(lockAcquired);

      this.lastTelemetry = { reads: this.cacheReads, writes: this.cacheWrites, localHits: this.localHits, providerHits: this.providerHits, providerCacheStatus: 'VERIFIED' };
      return true;
    } catch (err) {
      // F9 (R9): restore everything to pre-mutation state (including telemetry + cacheWrites)
      this.memory.clear();
      for (const [mk, mv] of preMemory) this.memory.set(mk, mv);
      this.accessOrder = preAccessOrder;
      this.totalBytes = preTotalBytes;
      this.diskAccounted = new Set(preDiskAccounted);
      this.lastTelemetry = preTelemetry;
      this.cacheWrites = preCacheWrites;

      // F10 (R10): restore disk files — atomic temp+rename+fsync; throw on failure
      if (this.cacheDir) {
        for (const [fk, fb] of diskBackups) {
          const fpath = path.join(this.cacheDir, fk + '.json');
          if (fb !== null) {
            const tmpPath = fpath + '.restore.tmp';
            fs.writeFileSync(tmpPath, fb, 'utf-8');
            const tmpFd = fs.openSync(tmpPath, 'r');
            try { fs.fsyncSync(tmpFd); } finally { fs.closeSync(tmpFd); }
            fs.renameSync(tmpPath, fpath);
            const dirFd = fs.openSync(path.dirname(fpath), 'r');
            try {
              // See atomicWrite: Windows directory handles reject fsync with EPERM.
              try { fs.fsyncSync(dirFd); } catch { /* not supported on this platform */ }
            } finally { fs.closeSync(dirFd); }
          } else {
            try { if (fs.existsSync(fpath)) fs.unlinkSync(fpath); } catch { /* ok */ }
          }
        }
      }
      return false;
    } finally {
      if (lockPath && lockAcquired) releaseLock(lockPath);
    }
  }

  recordProviderHit(key: ContextCapsuleKey): void {
    this.providerHits++;
    this.lastTelemetry = { ...this.lastTelemetry, providerHits: this.providerHits, providerCacheStatus: 'VERIFIED' };
  }

  invalidate(partial: Partial<ContextCapsuleKey>): number {
    const toDelete: string[] = [];
    // Scan memory
    for (const [k, capsule] of this.memory.entries()) {
      if (this.matchesPartial(capsule.key, partial)) {
        toDelete.push(k);
      }
    }
    // Scan disk for disk-only entries not in memory
    if (this.cacheDir) {
      try {
        const files = fs.readdirSync(this.cacheDir);
        for (const f of files) {
          if (f === METADATA_FILE || f === LOCK_FILE || !f.endsWith('.json')) continue;
          const k = f.replace(/\.json$/, '');
          if (this.memory.has(k)) continue;
          try {
            const raw = fs.readFileSync(path.join(this.cacheDir, f), 'utf-8');
            const capsule = JSON.parse(raw) as ContextCapsule;
            if (capsule?.key && this.matchesPartial(capsule.key, partial)) {
              toDelete.push(k);
            }
          } catch { /* skip */ }
        }
      } catch { /* ok */ }
    }

    if (toDelete.length === 0) return 0;

    // Acquire transaction lock
    const lockPath = this.cacheDir ? path.join(this.cacheDir, LOCK_FILE) : null;
    let lockAcquired = !lockPath;
    if (lockPath) {
      lockAcquired = acquireLock(lockPath);
      if (!lockAcquired) {
        throw new Error('Cannot acquire cache lock for invalidation');
      }
    }

    try {
      for (const k of toDelete) {
        const removed = this.memory.get(k);
        if (removed) {
          const size = new TextEncoder().encode(JSON.stringify(removed)).length;
          this.totalBytes = Math.max(0, this.totalBytes - size);
        }
        this.memory.delete(k);
        this.accessOrder = this.accessOrder.filter((a) => a !== k);
        if (this.cacheDir) {
          try { fs.unlinkSync(path.join(this.cacheDir, k + '.json')); } catch { /* ok */ }
        }
      }
    } finally {
      if (lockPath && lockAcquired) releaseLock(lockPath);
    }
    return toDelete.length;
  }

  invalidateAll(): void {
    const lockPath = this.cacheDir ? path.join(this.cacheDir, LOCK_FILE) : null;
    let lockAcquired = !lockPath;
    if (lockPath) {
      lockAcquired = acquireLock(lockPath);
      if (!lockAcquired) {
        throw new Error('Cannot acquire cache lock for full invalidation');
      }
    }

    try {
      this.memory.clear();
      this.accessOrder = [];
      this.totalBytes = 0;
      this.diskAccounted.clear();
      if (this.cacheDir) {
        try {
          const files = fs.readdirSync(this.cacheDir);
          for (const f of files) {
            if (f === METADATA_FILE || f === LOCK_FILE) continue;
            try { fs.unlinkSync(path.join(this.cacheDir, f)); } catch { /* ok */ }
          }
        } catch { /* ok */ }
      }
    } finally {
      if (lockPath && lockAcquired) releaseLock(lockPath);
    }
  }

  size(): number { return this.memory.size; }

  private touchAccess(k: string): void {
    this.accessOrder = this.accessOrder.filter((a) => a !== k);
    this.accessOrder.push(k);
  }

  // F7 (R7): evict under lock — handles memory + disk-only, maintains diskAccounted
  private evict(): void {
    while ((this.accessOrder.length > this.maxEntries || this.totalBytes > this.maxBytes) && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (!oldest) break;
      const removed = this.memory.get(oldest);
      if (removed) {
        const size = new TextEncoder().encode(JSON.stringify(removed)).length;
        this.totalBytes = Math.max(0, this.totalBytes - size);
        this.memory.delete(oldest);
        // Memory eviction spills to disk rather than deleting: a later get() must be
        // able to reload the capsule, which is the whole point of a disk-backed cache.
        // The disk budget is enforced separately by deleteOldestDiskEntries().
        if (this.cacheDir && !this.diskAccounted.has(oldest)) {
          const fp = path.join(this.cacheDir, oldest + '.json');
          if (fs.existsSync(fp)) this.diskAccounted.add(oldest);
        }
      } else if (this.diskAccounted.has(oldest)) {
        // Disk-only entry — remove from accounting and disk
        this.diskAccounted.delete(oldest);
        if (this.cacheDir) {
          let stat: fs.Stats | null = null;
          try {
            stat = fs.statSync(path.join(this.cacheDir, oldest + '.json'));
          } catch { /* already deleted */ }
          this.deleteFromDisk(oldest);
          if (stat) this.totalBytes = Math.max(0, this.totalBytes - stat.size);
        }
      }
    }
  }

  private readFromDisk(k: string): ContextCapsule | undefined {
    if (!this.cacheDir) return undefined;
    const entryPath = path.join(this.cacheDir, k + '.json');
    if (!fs.existsSync(entryPath)) return undefined;
    try {
      const raw = fs.readFileSync(entryPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.capsuleSha256 || !parsed.key) {
        this.handleCorruption(entryPath);
        return undefined;
      }
      const capsule = parsed as ContextCapsule;
      const contentOnly = extractContent(capsule);
      const expectedSha = computeCapsuleSha256(capsule.key, contentOnly);
      if (capsule.capsuleSha256 !== expectedSha) {
        this.handleCorruption(entryPath);
        return undefined;
      }
      const storedKey = computeCacheKey(capsule.key);
      if (storedKey !== k) {
        this.handleCorruption(entryPath);
        return undefined;
      }
      const existing = this.memory.get(k);
      const capsuleSize = new TextEncoder().encode(JSON.stringify(capsule)).length;
      // AM-0021 fix: evict to make room BEFORE adding to memory + accounting
      if (!existing && !this.diskAccounted.has(k)) {
        this.totalBytes += capsuleSize;
        this.evict();
        // Eviction may have removed entries; verify we're still within limits
        if (this.totalBytes > this.maxBytes || this.accessOrder.length >= this.maxEntries) {
          // Not enough room — return undefined (entry stays on disk for later)
          this.totalBytes -= capsuleSize;
          return undefined;
        }
        this.totalBytes -= capsuleSize; // will be re-added below
      } else {
        // Re-loading existing entry: adjust accounting for old size
        if (existing) {
          this.totalBytes = Math.max(0, this.totalBytes - new TextEncoder().encode(JSON.stringify(existing)).length);
        }
        if (this.diskAccounted.has(k)) {
          this.diskAccounted.delete(k);
        }
      }
      this.memory.set(k, capsule);
      this.totalBytes += capsuleSize;
      this.touchAccess(k);
      return capsule;
    } catch {
      this.handleCorruption(entryPath);
      return undefined;
    }
  }

  private handleCorruption(filePath: string): void {
    try {
      const backup = filePath + '.corrupt.' + Date.now();
      fs.renameSync(filePath, backup);
    } catch { /* ok */ }
  }

  private writeToDisk(k: string, capsule: ContextCapsule): void {
    if (!this.cacheDir) return;
    const entryPath = path.join(this.cacheDir, k + '.json');
    atomicWrite(entryPath, JSON.stringify(capsule));
  }

  private deleteFromDisk(k: string): void {
    if (!this.cacheDir) return;
    try {
      fs.unlinkSync(path.join(this.cacheDir, k + '.json'));
    } catch { /* ok */ }
  }

  /** F6 (R6): enforce maxBytes/maxEntries on disk during bootstrap, then load remaining into accounting */
  private bootstrapDiskAccounting(): void {
    if (!this.cacheDir) return;
    // Phase 1: enforce limits — delete oldest files over budget
    this.deleteOldestDiskEntries();
    // Phase 2: load remaining disk-only entries into totalBytes + accessOrder
    try {
      const files = fs.readdirSync(this.cacheDir);
      const diskEntries: { key: string; size: number; mtime: number }[] = [];
      for (const f of files) {
        if (f === METADATA_FILE || f === LOCK_FILE || !f.endsWith('.json')) continue;
        const k = f.replace(/\.json$/, '');
        if (this.memory.has(k)) continue;
        const fp = path.join(this.cacheDir, f);
        try {
          const stat = fs.statSync(fp);
          diskEntries.push({ key: k, size: stat.size, mtime: stat.mtimeMs || stat.birthtimeMs });
        } catch { /* skip */ }
      }
      diskEntries.sort((a, b) => a.mtime - b.mtime);
      for (const de of diskEntries) {
        this.accessOrder.push(de.key);
        this.totalBytes += de.size;
        this.diskAccounted.add(de.key);
      }
    } catch { /* best-effort */ }
  }

  /**
   * Delete oldest disk entries until within the maxBytes/maxEntries budget.
   *
   * `alreadyLocked` exists because `set()` holds the cache lock for its whole
   * transaction. Re-acquiring it here would always fail, and the failure path was a
   * silent `break` — so calling this from `set()` did nothing at all and the disk cache
   * grew without bound.
   */
  private deleteOldestDiskEntries(alreadyLocked = false): void {
    if (!this.cacheDir) return;
    let diskEntries: DiskEntryInfo[] = [];
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const f of files) {
        if (f === METADATA_FILE || f === LOCK_FILE || !f.endsWith('.json')) continue;
        const fp = path.join(this.cacheDir, f);
        try {
          const stat = fs.statSync(fp);
          diskEntries.push({
            key: f.replace(/\.json$/, ''),
            path: fp,
            size: stat.size,
            createdAt: stat.birthtimeMs || stat.mtimeMs,
          });
        } catch { /* skip */ }
      }
    } catch { return; }

    diskEntries.sort((a, b) => a.createdAt - b.createdAt);

    let totalSize = diskEntries.reduce((s, e) => s + e.size, 0);
    let totalCount = diskEntries.length;

    while ((totalCount > this.maxDiskEntries || totalSize > this.maxBytes) && diskEntries.length > 0) {
      const oldest = diskEntries.shift()!;
      if (alreadyLocked) {
        try { fs.unlinkSync(oldest.path); } catch { /* ok */ }
      } else {
        const lockPath = path.join(this.cacheDir!, LOCK_FILE);
        if (!acquireLock(lockPath)) break;
        try {
          try { fs.unlinkSync(oldest.path); } catch { /* ok */ }
        } finally {
          releaseLock(lockPath);
        }
      }
      // Keep in-memory accounting consistent with what is left on disk.
      this.diskAccounted.delete(oldest.key);
      totalSize -= oldest.size;
      totalCount--;
    }
  }

  private loadMetadata(): void {
    if (!this.cacheDir) return;
    const metaPath = path.join(this.cacheDir, METADATA_FILE);
    if (!fs.existsSync(metaPath)) return;
    try {
      const raw = fs.readFileSync(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as MetadataFile;
      if (!meta || meta.version !== CACHE_VERSION) {
        this.rebuildMetadata();
        return;
      }
    } catch {
      this.rebuildMetadata();
    }
  }

  private rebuildMetadata(): void {
    if (!this.cacheDir) return;
    try {
      const lockPath = path.join(this.cacheDir, LOCK_FILE);
      const acquired = acquireLock(lockPath);
      if (!acquired) return;
      try {
        const files = fs.readdirSync(this.cacheDir);
        const entries: MetadataEntry[] = [];
        for (const f of files) {
          if (f === METADATA_FILE || f === LOCK_FILE || !f.endsWith('.json')) continue;
          const fp = path.join(this.cacheDir, f);
          try {
            const raw = fs.readFileSync(fp, 'utf-8');
            const capsule = JSON.parse(raw) as ContextCapsule;
            if (!capsule || !capsule.key || !capsule.capsuleSha256) {
              this.handleCorruption(fp);
              continue;
            }
            entries.push({
              key: capsule.key,
              capsuleSha256: capsule.capsuleSha256,
              file: f,
              size: raw.length,
              createdAt: capsule.createdAt,
              expiresAt: capsule.expiresAt,
              lastAccess: capsule.createdAt,
            });
          } catch { this.handleCorruption(fp); }
        }
        atomicWrite(path.join(this.cacheDir, METADATA_FILE), JSON.stringify({ version: CACHE_VERSION, entries } as MetadataFile));
      } finally { releaseLock(lockPath); }
    } catch { /* ok */ }
  }

  /** F8 (R8): recalculate totalBytes from all memory + disk entries for consistency */
  private recalculateTotalBytes(): void {
    let total = 0;
    for (const [, capsule] of this.memory) {
      total += new TextEncoder().encode(JSON.stringify(capsule)).length;
    }
    if (this.cacheDir) {
      for (const key of this.accessOrder) {
        if (this.memory.has(key)) continue;
        if (this.diskAccounted.has(key)) {
          try {
            const stat = fs.statSync(path.join(this.cacheDir, key + '.json'));
            total += stat.size;
          } catch { /* deleted */ }
        }
      }
    }
    this.totalBytes = total;
  }

  private matchesPartial(stored: ContextCapsuleKey, partial: Partial<ContextCapsuleKey>): boolean {
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined) continue;
      const storedValue = (stored as unknown as Record<string, unknown>)[key];
      if (key === 'sourceFileHashes') {
        const partialRecord = value as Record<string, string>;
        const storedRecord = storedValue as Record<string, string>;
        let anyKeyMatch = false;
        for (const pk of Object.keys(partialRecord)) {
          if (pk in storedRecord) { anyKeyMatch = true; break; }
        }
        if (!anyKeyMatch) return false;
        continue;
      }
      if (Array.isArray(value) && Array.isArray(storedValue)) {
        let anyMatch = false;
        for (const v of value) {
          if ((storedValue as unknown[]).includes(v)) { anyMatch = true; break; }
        }
        if (!anyMatch) return false;
        continue;
      }
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && storedValue !== null && typeof storedValue === 'object' && !Array.isArray(storedValue)) {
        const partialRecord = value as Record<string, string>;
        const storedRecord = storedValue as Record<string, string>;
        for (const [pk, pv] of Object.entries(partialRecord)) {
          if (storedRecord[pk] !== pv) return false;
        }
        continue;
      }
      if (storedValue !== value) return false;
    }
    return true;
  }
}
