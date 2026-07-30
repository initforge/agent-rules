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
  maxEntries?: number;
  maxBytes?: number;
  defaultTTLMs?: number;
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
  fs.writeFileSync(tmp, data, 'utf-8');
  const fd = fs.openSync(tmp, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, targetPath);
  const dirFd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
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
            try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
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
        // If also on disk, add to diskAccounted for future eviction
        if (this.cacheDir) this.diskAccounted.add(oldest);
      } else if (this.diskAccounted.has(oldest)) {
        // Disk-only entry — remove from accounting and disk
        this.diskAccounted.delete(oldest);
        if (this.cacheDir) {
          try {
            const stat = fs.statSync(path.join(this.cacheDir, oldest + '.json'));
            this.totalBytes = Math.max(0, this.totalBytes - stat.size);
          } catch { /* already deleted */ }
        }
      }
      if (this.cacheDir) this.deleteFromDisk(oldest);
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
      if (existing) {
        const oldSize = new TextEncoder().encode(JSON.stringify(existing)).length;
        this.totalBytes = Math.max(0, this.totalBytes - oldSize);
      } else if (this.diskAccounted.has(k)) {
        // Already counted in totalBytes from bootstrap — remove from diskAccounted
        // (now loaded into memory, size tracked via memory)
        this.diskAccounted.delete(k);
      } else {
        // New disk entry not previously counted — add to totalBytes
        this.totalBytes += new TextEncoder().encode(JSON.stringify(capsule)).length;
      }
      this.memory.set(k, capsule);
      this.touchAccess(k);
      this.evict();
      if (!this.memory.has(k)) return undefined;
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

  /** Delete oldest disk entries until within maxBytes/maxEntries budget */
  private deleteOldestDiskEntries(): void {
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

    while ((totalCount > this.maxEntries || totalSize > this.maxBytes) && diskEntries.length > 0) {
      const oldest = diskEntries.shift()!;
      const lockPath = path.join(this.cacheDir!, LOCK_FILE);
      const acquired = acquireLock(lockPath);
      if (!acquired) break;
      try {
        try { fs.unlinkSync(oldest.path); } catch { /* ok */ }
      } finally {
        releaseLock(lockPath);
      }
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
