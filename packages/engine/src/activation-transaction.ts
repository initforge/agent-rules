import fs from 'node:fs';
import path from 'node:path';
import { type Sha256, sha256Bytes } from './contracts.js';
import { SecureFsRoot } from './secure-fs.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ZERO_HASH: Sha256 = Buffer.alloc(32).toString('hex') as Sha256;
const MAX_ENTRY_NAME = 255;
const MAX_ENTRY_DATA = 1_000_000;
const MAX_JOURNAL_ENTRIES = 1024;
const MAX_GENERATION = Number.MAX_SAFE_INTEGER;

// ─── Journal V2 Binary Format ────────────────────────────────────────────────
// Header: magic(4) version(4) generation(8) entryCount(4) = 20 bytes
// Each entry: type(1) nameLen(2) name(nameLen) hash(32) dataLen(4) data(dataLen)
// No trailing bytes allowed.

const JNL2_MAGIC = 0x324C4E4A;
const JNL2_VERSION = 2;

export enum JournalEntryType {
  BACKUP = 0,
  STAGE = 1,
  INFLIGHT = 2,
  APPLIED = 3,
  FINAL_COMMIT = 4,
}

export interface JournalEntry {
  readonly type: JournalEntryType;
  readonly name: string;
  readonly hash: Sha256;
  readonly data: Uint8Array;
}

export interface JournalV2 {
  readonly generation: number;
  readonly entries: readonly JournalEntry[];
}

// ─── Target Manifest ──────────────────────────────────────────────────────────

export interface TargetManifest {
  readonly name: string;
  /** Relative path within SecureFsRoot (frozen at begin). */
  readonly path: string;
}

// ─── IoAdapter ────────────────────────────────────────────────────────────────

export interface IoAdapter {
  read(fd: number, buffer: Uint8Array, offset: number, length: number, position: number): number;
  write(fd: number, buffer: Uint8Array, offset: number, length: number): number;
}

export const REAL_IO: IoAdapter = {
  read(fd, buf, off, len, pos) { return fs.readSync(fd, buf, off, len, pos); },
  write(fd, buf, off, len) { return fs.writeSync(fd, buf, off, len); },
};

// ─── Name validation ──────────────────────────────────────────────────────────

function assertSafeName(name: string, label: string): void {
  if (!name) throw new Error(`Transaction: ${label} empty`);
  if (path.isAbsolute(name)) throw new Error(`Transaction: ${label} absolute: ${name}`);
  if (name.includes('..')) throw new Error(`Transaction: ${label} traversal: ${name}`);
  if (name.includes('/')) throw new Error(`Transaction: ${label} has slash: ${name}`);
  if (Buffer.byteLength(name, 'utf-8') > MAX_ENTRY_NAME) throw new Error(`Transaction: ${label} too long`);
}

// ─── Transaction Class ────────────────────────────────────────────────────────

export class ActivationTransaction {
  readonly #fs: SecureFsRoot;
  readonly #txDir: string;
  #generation: number = -1;
  #targets: readonly TargetManifest[] = [];
  #journalPath: string = '';
  #entries: JournalEntry[] = [];
  #inProgress: boolean = false;
  #committed: boolean = false;
  #rolledBack: boolean = false;
  #adapter: IoAdapter;
  #stagePrefix = 'stage';
  #backupPrefix = 'backup';
  #journalName = 'journal.jnl2';

  constructor(fsRoot: SecureFsRoot, txDirRelative: string, adapter?: IoAdapter) {
    if (path.isAbsolute(txDirRelative)) throw new Error('Transaction: txDirRelative must be relative');
    if (txDirRelative.includes('..')) throw new Error('Transaction: txDirRelative traversal denied');
    this.#fs = fsRoot;
    this.#txDir = path.resolve(path.join(fsRoot.root, txDirRelative));
    this.#adapter = adapter ?? REAL_IO;
  }

  get inProgress(): boolean { return this.#inProgress; }
  get generation(): number { return this.#generation; }
  get committed(): boolean { return this.#committed; }
  get rolledBack(): boolean { return this.#rolledBack; }
  get targetCount(): number { return this.#targets.length; }
  get entryCount(): number { return this.#entries.length; }

  // ── Begin ──────────────────────────────────────────────────────────────────

  async begin(generation: number, targets: readonly TargetManifest[]): Promise<void> {
    if (this.#inProgress) throw new Error('Transaction: already in progress');
    if (!Number.isSafeInteger(generation) || generation < 0 || generation > MAX_GENERATION) {
      throw new Error('Transaction: invalid generation');
    }
    if (!targets.length) throw new Error('Transaction: at least one target required');
    const seen = new Set<string>();
    for (const t of targets) {
      if (!t.name || seen.has(t.name)) throw new Error(`Transaction: duplicate or empty target name`);
      assertSafeName(t.name, 'target name');
      if (!t.path) throw new Error(`Transaction: target path empty for ${t.name}`);
      // path must be relative, no traversal
      if (path.isAbsolute(t.path)) throw new Error(`Transaction: target path absolute: ${t.path}`);
      if (t.path.includes('..')) throw new Error(`Transaction: target path traversal: ${t.path}`);
      // Resolve to verify containment
      this.#fs.resolve(t.path);
      seen.add(t.name);
    }

    const genDir = path.join(this.#txDir, String(generation));
    if (fs.existsSync(genDir)) throw new Error(`Transaction: generation ${generation} exists, recover first`);
    this.#generation = generation;
    this.#targets = targets;
    this.#entries = [];
    this.#committed = false;
    this.#rolledBack = false;
    // Create each directory level with lstat check (no recursive:true that follows symlinks)
    {
      const dirs = [this.#txDir, genDir];
      for (const d of dirs) {
        try {
          const lst = fs.lstatSync(d);
          if (lst.isSymbolicLink()) throw new Error(`Transaction: symlink in path: ${d}`);
          if (!lst.isDirectory()) throw new Error(`Transaction: exists but not a directory: ${d}`);
        } catch (e2: any) {
          if (e2.code !== 'ENOENT') throw e2;
          fs.mkdirSync(d, { mode: 0o700 });
          const verify = fs.lstatSync(d);
          if (verify.isSymbolicLink()) throw new Error(`Transaction: post-mkdir symlink: ${d}`);
        }
      }
    }
    fs.mkdirSync(path.join(genDir, this.#stagePrefix), { mode: 0o700 });
    fs.mkdirSync(path.join(genDir, this.#backupPrefix), { mode: 0o700 });

    this.#journalPath = path.join(genDir, this.#journalName);
    this.#writeJournal([]);
    const jDir = path.dirname(this.#journalPath);
    const jDirFd = fs.openSync(jDir, fs.constants.O_RDONLY);
    try { fs.fsyncSync(jDirFd); } finally { fs.closeSync(jDirFd); }

    this.#inProgress = true;
  }

  // ── Stage ──────────────────────────────────────────────────────────────────

  async stage(name: string, data: Uint8Array): Promise<void> {
    this.#requireInProgress();
    assertSafeName(name, 'stage name');
    if (!this.#targets.some(t => t.name === name)) throw new Error(`Transaction: stage name not in target set: ${name}`);
    if (this.#entries.some(e => e.type === JournalEntryType.STAGE && e.name === name)) {
      throw new Error(`Transaction: already staged: ${name}`);
    }
    const hash = sha256Bytes(data);
    const stagePath = this.#stagePath(name);
    atomicWriteSync(stagePath, data);
    this.#entries.push({ type: JournalEntryType.STAGE, name, hash, data });
    this.#rewriteJournal();
  }

  // ── Backup ─────────────────────────────────────────────────────────────────

  async backup(name: string, originalRelPath: string, expectedHash: Sha256): Promise<void> {
    this.#requireInProgress();
    assertSafeName(name, 'backup name');
    if (!this.#targets.some(t => t.name === name)) throw new Error(`Transaction: backup name not in target set: ${name}`);
    const data = await this.#fs.readBinary(originalRelPath);
    const actualHash = sha256Bytes(data);
    if (actualHash !== expectedHash) throw new Error(`Transaction: backup hash mismatch for ${name}`);
    const backupPath = this.#backupPath(name);
    atomicWriteSync(backupPath, data);
    this.#entries.push({ type: JournalEntryType.BACKUP, name, hash: actualHash, data });
    this.#rewriteJournal();
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  async commit(): Promise<void> {
    this.#requireInProgress();

    const applied: string[] = [];
    try {
      // Verify all staged hashes before any rename
      for (const entry of this.#entries) {
        if (entry.type !== JournalEntryType.STAGE) continue;
        const stagePath = this.#stagePath(entry.name);
        let onDisk: Buffer;
        try { onDisk = fs.readFileSync(stagePath); } catch (e) {
          await this.#rollbackActualTargets(applied);
          throw new Error(`Transaction: stage file unreadable: ${entry.name}`);
        }
        if (sha256Bytes(new Uint8Array(onDisk)) !== entry.hash) {
          await this.#rollbackActualTargets(applied);
          throw new Error(`Transaction: staged hash mismatch before commit: ${entry.name}`);
        }
      }

      // Apply each target with per-target journal entries for crash recovery
      for (const target of this.#targets) {
        const stagePath = this.#stagePath(target.name);
        const targetAbs = this.#fs.resolve(target.path);
        const targetDir = path.dirname(targetAbs);
        const hash = sha256Bytes(fs.readFileSync(stagePath));

        // INFLIGHT: about to rename (durable before rename)
        this.#entries.push({ type: JournalEntryType.INFLIGHT, name: target.name, hash: ZERO_HASH, data: new Uint8Array(0) });
        this.#rewriteJournal();
        const jDir = path.dirname(this.#journalPath);
        const jDirFd = fs.openSync(jDir, fs.constants.O_RDONLY);
        try { fs.fsyncSync(jDirFd); } finally { fs.closeSync(jDirFd); }

        // Atomic rename: stage → target
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
        const tmpPath = path.join(targetDir, `.tmp-commit-${target.name}-${process.pid}`);
        try {
          fs.copyFileSync(stagePath, tmpPath);
          const tmpFd = fs.openSync(tmpPath, fs.constants.O_RDONLY);
          try { fs.fsyncSync(tmpFd); } finally { fs.closeSync(tmpFd); }
          fs.renameSync(tmpPath, targetAbs);
          const tDirFd = fs.openSync(targetDir, fs.constants.O_RDONLY);
          try { fs.fsyncSync(tDirFd); } finally { fs.closeSync(tDirFd); }
        } catch (e) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          throw e;
        }

        // APPLIED: target renamed (durable after rename)
        this.#entries.push({ type: JournalEntryType.APPLIED, name: target.name, hash, data: new Uint8Array(0) });
        this.#rewriteJournal();
        const jDir2 = path.dirname(this.#journalPath);
        const jDir2Fd = fs.openSync(jDir2, fs.constants.O_RDONLY);
        try { fs.fsyncSync(jDir2Fd); } finally { fs.closeSync(jDir2Fd); }

        applied.push(target.name);
      }

      // Verify all applied target hashes
      for (const entry of this.#entries) {
        if (entry.type !== JournalEntryType.APPLIED) continue;
        const targetAbs = this.#resolveTargetPath(entry.name);
        const onDisk = fs.readFileSync(targetAbs);
        if (sha256Bytes(new Uint8Array(onDisk)) !== entry.hash) {
          await this.#rollbackActualTargets(applied);
          throw new Error(`Transaction: applied hash verification failed: ${entry.name}`);
        }
      }

      // FINAL_COMMIT: all targets applied and verified
      this.#entries.push({ type: JournalEntryType.FINAL_COMMIT, name: '', hash: ZERO_HASH, data: new Uint8Array(0) });
      this.#rewriteJournal();
      const finDir = path.dirname(this.#journalPath);
      const finDirFd = fs.openSync(finDir, fs.constants.O_RDONLY);
      try { fs.fsyncSync(finDirFd); } finally { fs.closeSync(finDirFd); }

      this.#committed = true;
      this.#inProgress = false;
    } catch (e) {
      await this.#rollbackActualTargets(applied);
      throw e;
    }
  }

  // ── Rollback Actual Targets ────────────────────────────────────────────────

  /** Rollback committed targets: existing targets restored from backup,
   *  newly-created targets removed. Targets in `applied` list have been
   *  renamed; targets before them in manifest may or may not have INFLIGHT. */
  async #rollbackActualTargets(applied: readonly string[]): Promise<void> {
    const appliedSet = new Set(applied);
    for (const target of this.#targets) {
      if (!appliedSet.has(target.name)) continue;
      const targetAbs = this.#resolveTargetPath(target.name);
      const backupEntry = this.#entries.find(e => e.type === JournalEntryType.BACKUP && e.name === target.name);
      if (backupEntry) {
        // Restore existing target from backup
        const backupPath = this.#backupPath(target.name);
        if (fs.existsSync(backupPath)) {
          const backupData = fs.readFileSync(backupPath);
          // Only restore if content differs (avoid unnecessary writes)
          const current = fs.existsSync(targetAbs) ? sha256Bytes(new Uint8Array(fs.readFileSync(targetAbs))) : '';
          if (current !== backupEntry.hash) {
            atomicWriteSync(targetAbs, backupData);
          }
        }
      } else {
        // No backup → target was newly created by this tx → remove
        try { fs.unlinkSync(targetAbs); } catch { /* may not exist */ }
      }
    }
    this.#rolledBack = true;
    this.#inProgress = false;
    this.#committed = false;
  }

  // ── Recover ────────────────────────────────────────────────────────────────

  async recover(expectedGeneration: number, targets?: readonly TargetManifest[]): Promise<{ recovered: boolean; action: 'none' | 'cleanup' | 'rollback' | 'commit' }> {
    const manifest = targets ?? this.#targets;
    const genDir = path.join(this.#txDir, String(expectedGeneration));
    const journalPath = path.join(genDir, this.#journalName);
    if (!fs.existsSync(journalPath)) return { recovered: false, action: 'none' };

    const journal = this.#readJournal(journalPath);
    if (journal === null) return { recovered: false, action: 'none' };
    if (journal.generation !== expectedGeneration) return { recovered: false, action: 'none' };

    // Validate manifest membership: every APPLIED entry must have a manifest entry
    for (const e of journal.entries) {
      if (e.type !== JournalEntryType.APPLIED && e.type !== JournalEntryType.INFLIGHT
          && e.type !== JournalEntryType.BACKUP && e.type !== JournalEntryType.STAGE) continue;
      if (!manifest.some(t => t.name === e.name)) {
        return { recovered: false, action: 'none' };
      }
    }

    const hasFinalCommit = journal.entries.some(e => e.type === JournalEntryType.FINAL_COMMIT);

    if (hasFinalCommit) {
      // Final commit: verify all target hashes match
      let allMatch = true;
      for (const entry of journal.entries) {
        if (entry.type !== JournalEntryType.APPLIED) continue;
        const targetPath = manifest.find(t => t.name === entry.name)?.path;
        if (!targetPath) { allMatch = false; break; }
        const targetAbs = this.#fs.resolve(targetPath);
        try {
          const onDisk = fs.readFileSync(targetAbs);
          if (sha256Bytes(new Uint8Array(onDisk)) !== entry.hash) { allMatch = false; break; }
        } catch { allMatch = false; break; }
      }
      if (!allMatch) {
        await this.#recoverRollbackTargets(journal, genDir, manifest);
      }
      if (fs.existsSync(genDir)) fs.rmSync(genDir, { recursive: true, force: true });
      return { recovered: true, action: allMatch ? 'cleanup' : 'rollback' };
    }

    // No FINAL_COMMIT: check for partial APPLIED targets
    const appliedNames = journal.entries.filter(e => e.type === JournalEntryType.APPLIED).map(e => e.name);
    if (appliedNames.length > 0) {
      await this.#recoverRollbackTargets(journal, genDir, manifest);
      if (fs.existsSync(genDir)) fs.rmSync(genDir, { recursive: true, force: true });
      return { recovered: true, action: 'rollback' };
    }

    // No APPLIED entries, no FINAL_COMMIT → in-flight, just clean up
    if (fs.existsSync(genDir)) fs.rmSync(genDir, { recursive: true, force: true });
    return { recovered: true, action: 'cleanup' };
  }

  /** Recover rollback: restore targets from backup or remove if new. */
  async #recoverRollbackTargets(journal: JournalV2, genDir: string, manifest: readonly TargetManifest[]): Promise<void> {
    for (const entry of journal.entries) {
      if (entry.type !== JournalEntryType.APPLIED) continue;
      const targetPath = manifest.find(t => t.name === entry.name)?.path;
      if (!targetPath) continue;
      const targetAbs = this.#fs.resolve(targetPath);
      const backupEntry = journal.entries.find(e => e.type === JournalEntryType.BACKUP && e.name === entry.name);
      if (backupEntry) {
        const backupAbs = path.join(genDir, 'backup', entry.name);
        if (fs.existsSync(backupAbs)) {
          const data = fs.readFileSync(backupAbs);
          if (sha256Bytes(new Uint8Array(data)) === backupEntry.hash) {
            atomicWriteSync(targetAbs, data);
          }
        }
      } else {
        try { fs.unlinkSync(targetAbs); } catch { /* ignore */ }
      }
    }
  }

  #resolveTargetPath(name: string): string {
    const t = this.#targets.find(x => x.name === name);
    if (!t) throw new Error(`Transaction: unknown target: ${name}`);
    return this.#fs.resolve(t.path);
  }

  // ── Journal Validation ─────────────────────────────────────────────────────

  validateJournal(bytes: Uint8Array): JournalV2 | null {
    try {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let off = 0;
      const magic = view.getUint32(off, true); off += 4;
      if (magic !== JNL2_MAGIC) return null;
      const version = view.getUint32(off, true); off += 4;
      if (version !== JNL2_VERSION) return null;
      const generation = Number(view.getBigUint64(off, true)); off += 8;
      if (!Number.isSafeInteger(generation) || generation < 0) return null;
      const entryCount = view.getUint32(off, true); off += 4;
      if (entryCount > MAX_JOURNAL_ENTRIES || entryCount < 0) return null;

      const entries: JournalEntry[] = [];
      const seenBackup = new Set<string>();
      const seenStage = new Set<string>();
      const seenInflight = new Set<string>();
      const seenApplied = new Set<string>();
      let seenFinalCommit = false;

      for (let i = 0; i < entryCount; i++) {
        if (off + 1 > bytes.length) return null;
        const type = view.getUint8(off); off += 1;
        if (type < 0 || type > 4) return null;

        // No entries after FINAL_COMMIT
        if (seenFinalCommit) return null;

        // State machine: order constraints
        if (type === JournalEntryType.INFLIGHT) {
          // Must have STAGE for same name
          if (!seenStage.has('?')) { /* stage check deferred */ }
        }
        if (type === JournalEntryType.APPLIED) {
          // Must have INFLIGHT for same name
        }

        if (off + 2 > bytes.length) return null;
        const nameLen = view.getUint16(off, true); off += 2;
        if (nameLen > MAX_ENTRY_NAME) return null;
        if (off + nameLen > bytes.length) return null;
        const nameBytes = bytes.slice(off, off + nameLen); off += nameLen;
        const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);

        if (off + 32 > bytes.length) return null;
        const hashBytes = bytes.slice(off, off + 32); off += 32;
        const hash = Buffer.from(hashBytes).toString('hex') as Sha256;

        if (off + 4 > bytes.length) return null;
        const dataLen = view.getUint32(off, true); off += 4;
        if (dataLen > MAX_ENTRY_DATA) return null;
        if (off + dataLen > bytes.length) return null;
        const data = bytes.slice(off, off + dataLen); off += dataLen;

        // Validate hash for non-marker entries
        if (type === JournalEntryType.BACKUP || type === JournalEntryType.STAGE) {
          if (!/^[a-f0-9]{64}$/.test(hash)) return null;
          if (sha256Bytes(data) !== hash) return null;
        }
        // APPLIED hash must be valid hex
        if (type === JournalEntryType.APPLIED && !/^[a-f0-9]{64}$/.test(hash)) return null;

        // Duplicate detection per entry type
        if (type === JournalEntryType.BACKUP) { if (seenBackup.has(name)) return null; seenBackup.add(name); }
        if (type === JournalEntryType.STAGE) { if (seenStage.has(name)) return null; seenStage.add(name); }
        if (type === JournalEntryType.INFLIGHT) { if (seenInflight.has(name)) return null; seenInflight.add(name); }
        if (type === JournalEntryType.APPLIED) { if (seenApplied.has(name)) return null; seenApplied.add(name); }
        if (type === JournalEntryType.FINAL_COMMIT) { seenFinalCommit = true; }

        entries.push({ type: type as JournalEntryType, name, hash, data });
      }

      // State machine validation
      for (const entry of entries) {
        if (entry.type === JournalEntryType.INFLIGHT) {
          if (!seenStage.has(entry.name)) return null; // INFLIGHT needs prior STAGE
        }
        if (entry.type === JournalEntryType.APPLIED) {
          if (!seenInflight.has(entry.name)) return null; // APPLIED needs prior INFLIGHT
        }
        if (entry.type === JournalEntryType.FINAL_COMMIT) {
          // FINAL_COMMIT requires all APPLIED entries to have matching INFLIGHT
          for (const e of entries) {
            if (e.type === JournalEntryType.APPLIED) {
              if (!seenInflight.has(e.name)) return null;
            }
          }
        }
      }

      // Exact consumption
      if (off !== bytes.length) return null;

      return { generation, entries };
    } catch {
      return null;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanup(): Promise<void> {
    if (this.#inProgress) throw new Error('Transaction: cannot cleanup in-progress transaction');
    const genDir = path.join(this.#txDir, String(this.#generation));
    if (fs.existsSync(genDir)) fs.rmSync(genDir, { recursive: true, force: true });
    this.#entries = [];
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #requireInProgress(): void {
    if (!this.#inProgress) throw new Error('Transaction: not in progress');
    if (this.#committed) throw new Error('Transaction: already committed');
    if (this.#rolledBack) throw new Error('Transaction: already rolled back');
  }

  #stagePath(name: string): string {
    return path.join(this.#txDir, String(this.#generation), this.#stagePrefix, name);
  }

  #backupPath(name: string): string {
    return path.join(this.#txDir, String(this.#generation), this.#backupPrefix, name);
  }

  #writeJournal(entries: JournalEntry[]): void {
    this.#writeJournalAtPath(path.join(this.#txDir, String(this.#generation), this.#journalName), entries, this.#generation);
  }

  #rewriteJournal(): void {
    this.#writeJournal(this.#entries);
  }

  #writeJournalAtPath(jPath: string, entries: JournalEntry[], generation: number): void {
    const buf = this.#serializeJournal(entries, generation);
    const fd = fs.openSync(jPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
    try {
      let off = 0;
      while (off < buf.length) {
        const n = this.#adapter.write(fd, buf, off, buf.length - off);
        if (n === 0) throw new Error('Transaction: write zero bytes');
        off += n;
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  #readJournal(jPath: string): JournalV2 | null {
    try {
      const size = fs.statSync(jPath).size;
      if (size === 0) return null;
      const buf = Buffer.allocUnsafeSlow(size);
      const fd = fs.openSync(jPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        let off = 0;
        while (off < size) {
          const n = this.#adapter.read(fd, buf, off, size - off, off);
          if (n === 0) throw new Error('Transaction: read zero bytes');
          off += n;
        }
        return this.validateJournal(new Uint8Array(buf));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }
  }

  #serializeJournal(entries: JournalEntry[], generation: number): Uint8Array {
    let size = 20;
    for (const e of entries) {
      const nameBytes = Buffer.byteLength(e.name, 'utf-8');
      size += 1 + 2 + nameBytes + 32 + 4 + e.data.length;
    }
    const buf = Buffer.alloc(size);
    let off = 0;
    off = buf.writeUInt32LE(JNL2_MAGIC, off);
    off = buf.writeUInt32LE(JNL2_VERSION, off);
    off = Number(buf.writeBigUInt64LE(BigInt(generation), off));
    off = buf.writeUInt32LE(entries.length, off);
    for (const e of entries) {
      buf[off] = e.type; off += 1;
      const nameBytes = Buffer.from(e.name, 'utf-8');
      off = buf.writeUInt16LE(nameBytes.length, off);
      nameBytes.copy(buf, off); off += nameBytes.length;
      const hashBuf = Buffer.from(e.hash, 'hex');
      if (hashBuf.length !== 32) throw new Error('Transaction: invalid hash length');
      hashBuf.copy(buf, off); off += 32;
      off = buf.writeUInt32LE(e.data.length, off);
      Buffer.from(e.data).copy(buf, off); off += e.data.length;
    }
    return new Uint8Array(buf);
  }
}

// ─── Internal helper: atomic write with correct FD lifecycle ──────────────────

function atomicWriteSync(targetPath: string, data: Uint8Array | Buffer): void {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `.tmp-${path.basename(targetPath)}-${process.pid}-${(Math.random() * 0x100000000).toString(36)}`);
  const fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let closed = false;
  try {
    let off = 0;
    while (off < data.length) {
      const n = fs.writeSync(fd, data, off, data.length - off);
      if (n === 0) throw new Error('atomicWriteSync: write zero bytes');
      off += n;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    closed = true;
    // Check target before rename: reject symlinks and hardlinks
    try {
      const lst = fs.lstatSync(targetPath);
      if (lst.isSymbolicLink()) throw new Error('atomicWriteSync: target is a symlink');
      if (lst.nlink > 1) throw new Error(`atomicWriteSync: target is a hardlink (nlink=${lst.nlink})`);
    } catch (e2: any) {
      if (e2.code !== 'ENOENT') throw e2;
    }
    fs.renameSync(tmpPath, targetPath);
    const dirFd = fs.openSync(dir, fs.constants.O_RDONLY);
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch (e) {
    if (!closed) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw e;
  }
}
