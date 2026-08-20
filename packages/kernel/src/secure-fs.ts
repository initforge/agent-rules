import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Sha256 } from './contracts.js';

// ─── Threat Model ─────────────────────────────────────────────────────────────
// Single-user local CLI exclusive activation. NO multi-user hostile openat
// protection. SecureFsRoot prevents accidental path escape (abs/../symlink)
// but does NOT guard against a compromised peer process sharing the same uid.
// ActivationLock uses O_EXCL files + PID liveness (kill(pid,0)). Stale locks
// broken only when holder dead AND past age threshold. Malformed lock content
// fails closed (treated as live).
// ──────────────────────────────────────────────────────────────────────────────

// ─── Public Types ────────────────────────────────────────────────────────────

export interface LockAcquireResult {
  readonly token: string;
  readonly fd: number;
  readonly ino: number;
  readonly pid: number;
}

export interface LockStatus {
  readonly held: boolean;
  readonly alive: boolean;
  readonly stale: boolean;
  readonly pid?: number;
  readonly timestamp?: number;
}

// ─── SecureFsRoot ────────────────────────────────────────────────────────────

export class SecureFsRoot {
  readonly #rootReal: string;
  readonly #rootDev: number;
  readonly #rootIno: number;
  readonly #maxSymlinks = 40;
  readonly #maxPathBytes = 4096;

  constructor(root: string) {
    const real = fs.realpathSync.native(root);
    const st = fs.statSync(real);
    if (!st.isDirectory()) throw new Error(`SecureFsRoot: not a directory: ${root}`);
    this.#rootReal = real;
    this.#rootDev = st.dev;
    this.#rootIno = st.ino;
  }

  get root(): string { return this.#rootReal; }
  get rootDevice(): number { return this.#rootDev; }
  get rootInode(): number { return this.#rootIno; }

  /** Resolve trustedRelative to an absolute path inside root.
   *  Rejects absolute input, parent traversal, and paths that escape root
   *  after full symlink resolution. Uses `path.relative` for canonical
   *  containment check (not simple prefix). */
  resolve(trustedRelative: string): string {
    if (path.isAbsolute(trustedRelative)) throw new Error(`SecureFsRoot: absolute path denied: ${trustedRelative}`);
    if (trustedRelative.includes('..')) throw new Error(`SecureFsRoot: parent traversal denied: ${trustedRelative}`);
    if (Buffer.byteLength(trustedRelative, 'utf-8') > this.#maxPathBytes) throw new Error(`SecureFsRoot: path too long: ${Buffer.byteLength(trustedRelative, 'utf-8')}`);
    const joined = path.resolve(this.#rootReal, trustedRelative);
    // Canonical containment: relative path from root must not start with '..'
    if (path.relative(this.#rootReal, joined).startsWith('..')) throw new Error(`SecureFsRoot: path escapes root: ${joined}`);
    // Cumulative symlink check: resolve full chain, verify still inside root
    try {
      const real = fs.realpathSync.native(joined);
      if (path.relative(this.#rootReal, real).startsWith('..')) throw new Error(`SecureFsRoot: symlink chain escapes root: ${real}`);
    } catch (e: any) {
      if (e.code === 'ELOOP') throw new Error(`SecureFsRoot: symlink loop: ${trustedRelative}`);
      if (e.code === 'ENOENT') {
        /* ponytail: Without openat(2) the walk-check below has a TOCTOU window
         * between lstat and subsequent use. On Linux this is a same-user race
         * — we document it, not claim to eliminate it.  The walk IS better
         * than the prior code (which had zero intermediate-component checking
         * when the final path did not exist). */
        let current = this.#rootReal;
        const rel = path.relative(this.#rootReal, joined);
        const parts = rel.split(/[\\/]/).filter(Boolean);
        for (const part of parts) {
          current = path.join(current, part);
          try {
            const lst = fs.lstatSync(current);
            if (lst.isSymbolicLink()) {
              const target = fs.realpathSync.native(current);
              if (path.relative(this.#rootReal, target).startsWith('..')) {
                throw new Error(`SecureFsRoot: intermediate symlink escapes root: ${path.relative(this.#rootReal, current)}`);
              }
            }
          } catch (e2: any) {
            if (e2.code === 'ENOENT') break;
            throw e2;
          }
        }
        return joined;
      }
      else throw e;
    }
    return joined;
  }

  /** Open a file for read with O_NOFOLLOW.  Returns fd + stat after verifying
   *  it is a regular file with nlink === 1 (rejects hardlinks).  Caller must close fd. */
  async openRead(relative: string): Promise<{ fd: number; stat: fs.Stats }> {
    const resolved = this.resolve(relative);
    // O_NOFOLLOW is not enforced by every Windows Node/libuv combination.
    // Check the directory entry before opening and again after opening so a
    // symlink target is rejected on Windows as well as on POSIX.  The second
    // check closes the descriptor before any bytes are consumed.
    const before = fs.lstatSync(resolved);
    if (before.isSymbolicLink()) throw new Error(`SecureFsRoot: symlink target rejected: ${relative}`);
    const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const after = fs.lstatSync(resolved);
      if (after.isSymbolicLink()) throw new Error(`SecureFsRoot: symlink target rejected: ${relative}`);
      const st = fs.fstatSync(fd);
      if (!st.isFile()) throw new Error(`SecureFsRoot: not a regular file: ${relative}`);
      if (st.nlink > 1) throw new Error(`SecureFsRoot: hardlink (nlink=${st.nlink}) rejected: ${relative}`);
      return { fd, stat: st };
    } catch (e) {
      fs.closeSync(fd);
      throw e;
    }
  }

  /** Read entire file as UTF-8 with fatal decoding. */
  async readUtf8(relative: string): Promise<string> {
    const bytes = await this.readBinary(relative);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  /** Read entire file as binary.  Uses read loop for partial-read safety. */
  async readBinary(relative: string): Promise<Uint8Array> {
    const { fd, stat } = await this.openRead(relative);
    try {
      const size = stat.size;
      if (size === 0) return new Uint8Array(0);
      const buf = Buffer.allocUnsafeSlow(size);
      let offset = 0;
      while (offset < size) {
        const n = fs.readSync(fd, buf, offset, size - offset, offset);
        if (n === 0) throw new Error(`SecureFsRoot: unexpected EOF: ${relative}`);
        offset += n;
      }
      return new Uint8Array(buf);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Write all bytes to a file (truncating).  Uses write loop for safety.
   *  Rejects hardlinks: after opening with O_NOFOLLOW, checks nlink === 1. */
  async writeAll(relative: string, data: Uint8Array): Promise<void> {
    const resolved = this.resolve(relative);
    const fd = fs.openSync(resolved, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
    try {
      const st = fs.fstatSync(fd);
      if (st.nlink > 1) throw new Error(`SecureFsRoot: hardlink (nlink=${st.nlink}) rejected: ${relative}`);
      let offset = 0;
      while (offset < data.length) {
        const n = fs.writeSync(fd, data, offset, data.length - offset);
        if (n === 0) throw new Error(`SecureFsRoot: write returned 0 at offset ${offset}: ${relative}`);
        offset += n;
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Atomic write: temp file in same directory with O_EXCL|O_NOFOLLOW, mode 600,
   *  fsync, close FD, rename, dir-fsync.  Rejects target that is symlink or
   *  hardlink before rename.  Verifies content after rename for truthful
   *  durability report.  Cleans up temp on any failure before rename. */
  async atomicWrite(relative: string, data: Uint8Array): Promise<void> {
    const resolved = this.resolve(relative);
    const dir = path.dirname(resolved);
    const tmpName = `.tmp-${path.basename(resolved)}-${process.pid}-${(Math.random() * 0x100000000).toString(36)}`;
    const tmpPath = path.join(dir, tmpName);
    const fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    let closed = false;
    try {
      let offset = 0;
      while (offset < data.length) {
        const n = fs.writeSync(fd, data, offset, data.length - offset);
        if (n === 0) throw new Error(`SecureFsRoot: atomic write incomplete: ${relative}`);
        offset += n;
      }
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      closed = true;
      // Check target before rename: reject symlinks and hardlinks
      try {
        const lst = fs.lstatSync(resolved);
        if (lst.isSymbolicLink()) throw new Error(`SecureFsRoot: atomic write target is a symlink: ${relative}`);
        if (lst.nlink > 1) throw new Error(`SecureFsRoot: atomic write target is a hardlink (nlink=${lst.nlink}): ${relative}`);
      } catch (e2: any) {
        if (e2.code !== 'ENOENT') throw e2;
      }
      fs.renameSync(tmpPath, resolved);
      // Durable rename: fsync the parent directory
      // Windows cannot fsync directory handles; rename remains atomic but its
      // directory-entry durability cannot be requested through Node there.
      if (process.platform !== 'win32') {
        const dirFd = fs.openSync(dir, fs.constants.O_RDONLY);
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      }
      // Truthful durability: readback verify content
      const verify = fs.readFileSync(resolved);
      if (Buffer.compare(verify, Buffer.from(data)) !== 0) {
        throw new Error(`SecureFsRoot: atomic write readback mismatch: ${relative}`);
      }
    } catch (e) {
      if (!closed) { try { fs.closeSync(fd); } catch { /* ignore */ } }
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      throw e;
    }
  }

  /** mkdir -p with mode 0o700.  Walks each component individually using
   *  lstat before any operation to prevent recursive symlink-follow TOCTOU.
   *  Never uses mkdirSync({recursive:true}) as it follows symlinks. */
  async mkdirp(relative: string, mode: number = 0o700): Promise<void> {
    const resolved = this.resolve(relative);
    const parts = relative.split('/').filter(Boolean);
    let current = this.#rootReal;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        const lst = fs.lstatSync(current);
        if (lst.isSymbolicLink()) throw new Error(`SecureFsRoot: symlink in mkdir chain: ${path.relative(this.#rootReal, current)}`);
        if (!lst.isDirectory()) throw new Error(`SecureFsRoot: exists but not a directory: ${path.relative(this.#rootReal, current)}`);
        continue;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      fs.mkdirSync(current, { mode });
      const verify = fs.lstatSync(current);
      if (verify.isSymbolicLink()) throw new Error(`SecureFsRoot: post-mkdir symlink at: ${path.relative(this.#rootReal, current)}`);
      if (!verify.isDirectory()) throw new Error(`SecureFsRoot: post-mkdir not a directory: ${path.relative(this.#rootReal, current)}`);
    }
  }

  /** Check if path exists. Resolves safely through containment checks. */
  async exists(relative: string): Promise<boolean> {
    const resolved = this.resolve(relative);
    return fs.existsSync(resolved);
  }

  /** Stat a path inside root. */
  async stat(relative: string): Promise<fs.Stats> {
    const resolved = this.resolve(relative);
    return fs.statSync(resolved);
  }

  /** Read directory entries. */
  async readdir(relative: string): Promise<string[]> {
    const resolved = this.resolve(relative);
    return fs.readdirSync(resolved);
  }

  /** Unlink (remove) a file. */
  async unlink(relative: string): Promise<void> {
    const resolved = this.resolve(relative);
    fs.unlinkSync(resolved);
  }

  /** Remove an empty directory. */
  async rmdir(relative: string): Promise<void> {
    const resolved = this.resolve(relative);
    fs.rmdirSync(resolved);
  }

  /** Recursively remove a directory tree (cleanup).  Uses rmSync with force. */
  async removeTree(relative: string): Promise<void> {
    const resolved = this.resolve(relative);
    if (!fs.existsSync(resolved)) return;
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  /** Assert a directory has trusted ownership and safe permissions.
   *  Defaults to: owned by current uid/gid, mode at most 0o755. */
  async assertTrustedDir(relative: string, opts?: { uid?: number; gid?: number; modeMask?: number }): Promise<void> {
    const resolved = this.resolve(relative);
    const st = fs.statSync(resolved);
    if (!st.isDirectory()) throw new Error(`SecureFsRoot: not a directory: ${relative}`);
    // Windows stat ownership/mode values do not represent POSIX trust bits.
    if (process.platform === 'win32') return;
    const uid = opts?.uid ?? process.getuid?.() ?? 0;
    const gid = opts?.gid ?? process.getgid?.() ?? 0;
    const modeMask = opts?.modeMask ?? 0o755;
    if (st.uid !== uid) throw new Error(`SecureFsRoot: owner mismatch: ${relative} (expected ${uid}, got ${st.uid})`);
    if (st.gid !== gid) throw new Error(`SecureFsRoot: group mismatch: ${relative} (expected ${gid}, got ${st.gid})`);
    const mode = st.mode & 0o777;
    // Reject if any permission bit is set that is not allowed by the mask
    if ((mode | modeMask) !== modeMask) throw new Error(`SecureFsRoot: unsafe mode: ${relative} (${mode.toString(8)} exceeds ${modeMask.toString(8)})`);
  }

  /** Read a symlink target. */
  async readlink(relative: string): Promise<string> {
    const resolved = this.resolve(relative);
    return fs.readlinkSync(resolved);
  }

  /** Create a symlink. */
  async symlink(target: string, relative: string): Promise<void> {
    const resolved = this.resolve(relative);
    fs.symlinkSync(target, resolved);
  }
}

// ─── ActivationLock ──────────────────────────────────────────────────────────

const STALE_AGE_MS = 30_000; // 30 seconds before a dead lock is considered stale

export class ActivationLock {
  readonly #lockDir: string;
  readonly #held = new Map<string, { token: string; fd: number; path: string; ino: number; pid: number; timestamp: number }>();
  #cleaning = false;

  constructor(lockDir: string) {
    this.#lockDir = lockDir;
    if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true, mode: 0o700 });
  }

  /** Acquire a named lock.  Returns token, fd, ino, pid.
   *  Throws LockHeldError if lock is held by a live process.
   *  Breaks stale locks (dead process + age threshold) automatically. */
  acquire(name: string): LockAcquireResult {
    const lockPath = path.join(this.#lockDir, `${name}.lock`);
    // Try O_EXCL|O_CREAT for atomic lock acquisition
    let fd: number;
    try {
      fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
      // Lock exists — check if stale
      this.#checkStaleAndBreak(lockPath);
      // Retry after breaking stale lock
      fd = fs.openSync(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    }

    try {
      const pid = process.pid;
      const timestamp = Date.now();
      const raw = `${pid}\n${timestamp}`;
      // Write ownership info atomically
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, raw);
      fs.fsyncSync(fd);

      const st = fs.fstatSync(fd);
      // Timestamp/inode pairs can repeat when a lock is released and
      // reacquired within one clock tick. Keep the token identity unique so
      // an old token can never address a new lock instance.
      const token = `${pid}-${timestamp}-${st.ino}-${name}-${randomUUID()}`;

      this.#held.set(token, { token, fd, path: lockPath, ino: st.ino, pid, timestamp });
      return { token, fd, ino: st.ino, pid };
    } catch (e) {
      fs.closeSync(fd);
      fs.unlinkSync(lockPath);
      throw e;
    }
  }

  /** Release a lock identified by token.  Verifies pathname + inode identity
   *  immediately before unlink.  Fail-closed: throws on invalid token,
   *  mismatched inode, or missing lock file. */
  release(token: string): void {
    const entry = this.#held.get(token);
    if (!entry) {
      // Fail-closed: unknown token means invalid lock state
      throw new Error(`ActivationLock: unknown token — lock not held by this scope: ${token}`);
    }
    // Verify PATHNAME still points to our inode (not replaced)
    let pathSt: fs.Stats;
    try {
      pathSt = fs.statSync(entry.path);
    } catch (e: any) {
      if (e.code === 'ENOENT') throw new Error(`ActivationLock: lock file missing — ${entry.path}`);
      throw e;
    }
    if (pathSt.ino !== entry.ino) throw new Error(`ActivationLock: inode mismatch — lock file replaced under us`);
    // Release: close (fd still open), then unlink
    try {
      fs.ftruncateSync(entry.fd, 0);
      fs.fsyncSync(entry.fd);
    } finally {
      fs.closeSync(entry.fd);
    }
    try { fs.unlinkSync(entry.path); } catch { /* file re-acquired in race window — ok */ }
    this.#held.delete(token);
  }

  /** Check whether a lock token is still live (holder process exists). */
  isLive(token: string): boolean {
    const entry = this.#held.get(token);
    if (!entry) return false;
    return this.#pidAlive(entry.pid);
  }

  /** Check whether a lock is stale: holder dead AND lock older than threshold. */
  isStale(token: string): boolean {
    const entry = this.#held.get(token);
    if (!entry) return false;
    if (this.#pidAlive(entry.pid)) return false;
    return (Date.now() - entry.timestamp) >= STALE_AGE_MS;
  }

  /** Cleanup all held locks (called on shutdown). */
  cleanup(): void {
    if (this.#cleaning) return;
    this.#cleaning = true;
    for (const [token, entry] of this.#held) {
      try {
        fs.ftruncateSync(entry.fd, 0);
        fs.fsyncSync(entry.fd);
      } catch { /* ignore */ }
      try { fs.closeSync(entry.fd); } catch { /* ignore */ }
      try { fs.unlinkSync(entry.path); } catch { /* ignore */ }
    }
    this.#held.clear();
  }

  /** Number of currently held locks. */
  get heldCount(): number { return this.#held.size; }

  // ── Private ──

  #pidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e: any) {
      // ESRCH means no such process
      return e.code !== 'ESRCH';
    }
  }

  #checkStaleAndBreak(lockPath: string): void {
    let content: string;
    try {
      content = fs.readFileSync(lockPath, 'utf-8');
    } catch {
      // Lock file disappeared — race, retry acquire (treat as transient)
      return;
    }
    const [pidStr, tsStr] = content.trim().split('\n');
    const pid = parseInt(pidStr, 10);
    const timestamp = parseInt(tsStr, 10);
    if (isNaN(pid) || isNaN(timestamp)) {
      // Malformed lock file — fail closed (treat as live, do not break)
      throw new LockHeldError(`ActivationLock: malformed lock file (fail closed): ${lockPath}`);
    }
    // Check if holder process is alive
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (e: any) {
      // ESRCH = dead; EPERM = alive but can't signal (e.g. cross-user zombie)
      alive = e.code === 'ESRCH' ? false : true;
    }
    if (alive) {
      throw new LockHeldError(`ActivationLock: lock held by live process ${pid}: ${lockPath}`);
    }
    // Process is dead — check age
    const age = Date.now() - timestamp;
    if (age < STALE_AGE_MS) {
      throw new LockHeldError(`ActivationLock: lock held by dead process (age ${age}ms < ${STALE_AGE_MS}ms): ${lockPath}`);
    }
    // Stale (dead + past age) — break it
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class LockHeldError extends Error {
  readonly code = 'LOCK_HELD';
  constructor(message: string) {
    super(message);
    this.name = 'LockHeldError';
  }
}

export class SecureFsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SecureFsError';
    this.code = code;
  }
}
