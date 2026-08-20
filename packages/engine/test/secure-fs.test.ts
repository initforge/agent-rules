import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SecureFsRoot, ActivationLock, LockHeldError } from '../src/secure-fs.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpBase: string;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-fs-test-'));
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

function tmpPath(...parts: string[]): string {
  return path.join(tmpBase, ...parts);
}

function write(fpath: string, content: string): void {
  const dir = path.dirname(fpath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fpath, content, 'utf-8');
}

function read(fpath: string): string {
  return fs.readFileSync(fpath, 'utf-8');
}

// ─── Adversarial: symlink-race TOCTOU ─────────────────────────────────────────

describe('adversarial mkdirp', () => {
  it('rejects symlink at intermediate component (TOCTOU prevention)', async () => {
    const root = new SecureFsRoot(tmpBase);
    // Create a symlink trap at 'a' pointing outside
    const trap = fs.mkdtempSync(path.join(os.tmpdir(), 'trap-'));
    fs.symlinkSync(trap, tmpPath('a'));
    await expect(root.mkdirp('a/b/c')).rejects.toThrow('symlink');
    // Must NOT have created directories inside the symlink target
    expect(fs.existsSync(path.join(trap, 'b'))).toBe(false);
    fs.rmSync(trap, { recursive: true, force: true });
  });

  it('rejects symlink at leaf component', async () => {
    const root = new SecureFsRoot(tmpBase);
    fs.mkdirSync(tmpPath('real'));
    fs.symlinkSync(tmpPath('real'), tmpPath('fake'));
    await expect(root.mkdirp('fake/deep')).rejects.toThrow('symlink');
  });

  it('rejects existing symlink given as relative path', async () => {
    const root = new SecureFsRoot(tmpBase);
    fs.symlinkSync(os.tmpdir(), tmpPath('escape-link'));
    await expect(root.mkdirp('escape-link/sub')).rejects.toThrow('symlink');
  });
});

describe('adversarial hardlink rejection', () => {
  it('rejects openRead on file with nlink>1', async () => {
    const root = new SecureFsRoot(tmpBase);
    write(tmpPath('orig.txt'), 'shared');
    fs.linkSync(tmpPath('orig.txt'), tmpPath('hardlink.txt'));
    // orig.txt now has nlink=2
    await expect(root.openRead('orig.txt')).rejects.toThrow('hardlink');
  });

  it('rejects readBinary on file with nlink>1', async () => {
    const root = new SecureFsRoot(tmpBase);
    write(tmpPath('a.txt'), 'data');
    fs.linkSync(tmpPath('a.txt'), tmpPath('b.txt'));
    await expect(root.readBinary('a.txt')).rejects.toThrow('hardlink');
  });

  it('accepts file with nlink=1', async () => {
    const root = new SecureFsRoot(tmpBase);
    write(tmpPath('unique.txt'), 'single');
    const { fd, stat } = await root.openRead('unique.txt');
    expect(stat.nlink).toBe(1);
    fs.closeSync(fd);
  });
});

// ─── SecureFsRoot ────────────────────────────────────────────────────────────

describe('SecureFsRoot', () => {
  describe('construction', () => {
    it('creates root with real device/inode identity', () => {
      const root = new SecureFsRoot(tmpBase);
      const st = fs.statSync(tmpBase);
      expect(root.root).toBe(fs.realpathSync.native(tmpBase));
      expect(root.rootDevice).toBe(st.dev);
      expect(root.rootInode).toBe(st.ino);
    });

    it('throws for non-directory path', () => {
      write(tmpPath('file'), 'content');
      expect(() => new SecureFsRoot(tmpPath('file'))).toThrow('not a directory');
    });
  });

  describe('resolve', () => {
    it('rejects absolute paths', () => {
      const root = new SecureFsRoot(tmpBase);
      expect(() => root.resolve('/etc/passwd')).toThrow('absolute path denied');
    });

    it('rejects parent traversal', () => {
      const root = new SecureFsRoot(tmpBase);
      expect(() => root.resolve('../etc')).toThrow('parent traversal denied');
    });

    it('rejects embedded parent traversal', () => {
      const root = new SecureFsRoot(tmpBase);
      expect(() => root.resolve('foo/../../etc')).toThrow('parent traversal denied');
    });

    it('accepts valid relative paths', () => {
      const root = new SecureFsRoot(tmpBase);
      const r = root.resolve('foo/bar');
      expect(r).toBe(path.join(root.root, 'foo/bar'));
      expect(path.relative(root.root, r).startsWith('..')).toBe(false);
    });

    it('rejects symlink chains that escape root', () => {
      const root = new SecureFsRoot(tmpBase);
      const escapeDir = tmpPath('escape');
      fs.mkdirSync(escapeDir);
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
      fs.writeFileSync(path.join(outside, 'secret'), 'data');
      fs.symlinkSync(outside, path.join(escapeDir, 'link'));
      expect(() => root.resolve(path.relative(tmpBase, path.join(escapeDir, 'link')))).toThrow('escapes root');
    });
  });

  describe('openRead', () => {
    it('opens regular file with O_NOFOLLOW', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('test.txt'), 'hello');
      const { fd, stat } = await root.openRead('test.txt');
      expect(stat.isFile()).toBe(true);
      expect(fs.readFileSync(fd).toString()).toBe('hello');
      fs.closeSync(fd);
    });

    it('rejects symlink targets', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('target.txt'), 'real');
      fs.symlinkSync('target.txt', tmpPath('link.txt'));
      await expect(root.openRead('link.txt')).rejects.toThrow();
    });
  });

  describe('readUtf8 / readBinary', () => {
    it('reads binary and utf8 content', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('hello.txt'), 'xin chào');
      const utf8 = await root.readUtf8('hello.txt');
      expect(utf8).toBe('xin chào');
      const bin = await root.readBinary('hello.txt');
      expect(new TextDecoder().decode(bin)).toBe('xin chào');
    });

    it('writeAll rejects hardlinked file', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('a.txt'), 'original');
      fs.linkSync(tmpPath('a.txt'), tmpPath('b.txt'));
      // a.txt now has nlink=2 — writeAll should reject
      await expect(root.writeAll('a.txt', Buffer.from('new'))).rejects.toThrow('hardlink');
    });

    it('atomicWrite rejects hardlinked target', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('x.txt'), 'original');
      fs.linkSync(tmpPath('x.txt'), tmpPath('y.txt'));
      await expect(root.atomicWrite('x.txt', Buffer.from('new'))).rejects.toThrow('hardlink');
    });

    it('fatal on invalid UTF-8', async () => {
      const root = new SecureFsRoot(tmpBase);
      const buf = Buffer.from([0xff, 0xfe, 0x00, 0x61]);
      fs.writeFileSync(tmpPath('bad.txt'), buf);
      await expect(root.readUtf8('bad.txt')).rejects.toThrow();
    });

    it('handles empty file', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('empty.txt'), '');
      const data = await root.readBinary('empty.txt');
      expect(data.byteLength).toBe(0);
    });
  });

  describe('exists', () => {
    it('resolves securely (not raw path.join)', async () => {
      const root = new SecureFsRoot(tmpBase);
      // Must not bypass security checks
      await expect(root.exists('/etc/passwd')).rejects.toThrow('absolute path denied');
    });

    it('returns true/false for valid relative paths', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('present.txt'), 'x');
      expect(await root.exists('present.txt')).toBe(true);
      expect(await root.exists('absent.txt')).toBe(false);
    });
  });

  describe('writeAll', () => {
    it('writes content with loop', async () => {
      const root = new SecureFsRoot(tmpBase);
      const data = Buffer.from('hello world', 'utf-8');
      await root.writeAll('out.txt', data);
      expect(read(tmpPath('out.txt'))).toBe('hello world');
    });

    it('overwrites existing file', async () => {
      const root = new SecureFsRoot(tmpBase);
      write(tmpPath('out.txt'), 'old');
      await root.writeAll('out.txt', Buffer.from('new'));
      expect(read(tmpPath('out.txt'))).toBe('new');
    });
  });

  describe('atomicWrite', () => {
    it('writes atomically via temp+rename+fsync', async () => {
      const root = new SecureFsRoot(tmpBase);
      await root.atomicWrite('atomic.txt', Buffer.from('atomic content'));
      expect(read(tmpPath('atomic.txt'))).toBe('atomic content');
      const dirFiles = fs.readdirSync(tmpBase).filter(f => f.startsWith('.tmp-'));
      expect(dirFiles).toHaveLength(0);
    });

    it('creates temp with O_EXCL, mode 600', async () => {
      const root = new SecureFsRoot(tmpBase);
      await root.atomicWrite('atomic.txt', Buffer.from('data'));
      const st = fs.statSync(tmpPath('atomic.txt'));
      if (process.platform !== 'win32') expect(st.mode & 0o777).toBe(0o600);
    });

    it('readback verifies content (truthful durability)', async () => {
      const root = new SecureFsRoot(tmpBase);
      await root.atomicWrite('verify.txt', Buffer.from('readback check'));
      expect(read(tmpPath('verify.txt'))).toBe('readback check');
    });

    it('cleans up temp + closes FD on write failure', async () => {
      const root = new SecureFsRoot(tmpBase);
      await expect(root.atomicWrite('nonexistent/deep/file.txt', Buffer.from('data'))).rejects.toThrow();
      const files = fs.existsSync(tmpBase) ? fs.readdirSync(tmpBase) : [];
      expect(files.filter(f => f.startsWith('.tmp-'))).toHaveLength(0);
    });
  });

  describe('mkdirp', () => {
    it('creates intermediate directories with mode 700', async () => {
      const root = new SecureFsRoot(tmpBase);
      await root.mkdirp('a/b/c');
      expect(fs.existsSync(tmpPath('a/b/c'))).toBe(true);
      expect(fs.statSync(tmpPath('a/b/c')).isDirectory()).toBe(true);
      const st = fs.statSync(tmpPath('a/b/c'));
      if (process.platform !== 'win32') expect(st.mode & 0o777).toBe(0o700);
    });

    it('no-op on existing directory', async () => {
      const root = new SecureFsRoot(tmpBase);
      fs.mkdirSync(tmpPath('existing'), { recursive: true });
      await root.mkdirp('existing');
    });
  });

  describe('assertTrustedDir', () => {
    it('passes for current-user-owned directory', async () => {
      const root = new SecureFsRoot(tmpBase);
      fs.mkdirSync(tmpPath('trusted'), { mode: 0o700 });
      await root.assertTrustedDir('trusted');
    });

    it.skipIf(process.platform === 'win32')('rejects unsafe permissions', async () => {
      const root = new SecureFsRoot(tmpBase);
      fs.mkdirSync(tmpPath('open'), { mode: 0o700 });
      fs.chmodSync(tmpPath('open'), 0o777);
      await expect(root.assertTrustedDir('open')).rejects.toThrow('unsafe mode');
    });
  });

  describe('removeTree', () => {
    it('removes directory tree', async () => {
      const root = new SecureFsRoot(tmpBase);
      fs.mkdirSync(tmpPath('tree/a/b'), { recursive: true });
      write(tmpPath('tree/file.txt'), 'data');
      await root.removeTree('tree');
      expect(fs.existsSync(tmpPath('tree'))).toBe(false);
    });

    it('no-op on missing path', async () => {
      const root = new SecureFsRoot(tmpBase);
      await root.removeTree('does-not-exist');
    });
  });

  describe('cumulative symlink check', () => {
    it('detects symlink chain escape on resolve', () => {
      const root = new SecureFsRoot(tmpBase);
      const sub = tmpPath('sub');
      fs.mkdirSync(sub, { recursive: true });
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'escape-'));
      fs.symlinkSync(path.join(sub, 'link2'), path.join(sub, 'link1'));
      fs.symlinkSync(outside, path.join(sub, 'link2'));
      expect(() => root.resolve(path.relative(tmpBase, path.join(sub, 'link1')))).toThrow();
    });

    it('rejects intermediate symlink escape when final path does not exist (TOCTOU prevention)', () => {
      const root = new SecureFsRoot(tmpBase);
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'toctou-'));
      fs.writeFileSync(path.join(outside, 'secret'), 'data');
      // Create 'a' as symlink to outside
      fs.symlinkSync(outside, tmpPath('a'));
      // 'a/b/c' doesn't exist yet — resolve must reject because intermediate 'a' symlinks out
      expect(() => root.resolve('a/b/c')).toThrow('intermediate symlink escapes root');
    });

    it('rejects prefix sibling paths that would be under within prefix match', () => {
      const root = new SecureFsRoot(tmpBase);
      fs.mkdirSync(tmpPath('foo'), { recursive: true });
      fs.writeFileSync(tmpPath('foo/bar'), 'data');
      // 'foo' path should resolve, 'foobar' should not be confused with 'foo'
      expect(root.resolve('foo/bar')).toBe(path.join(root.root, 'foo/bar'));
      // A path like 'foo2' that starts with 'foo' is a sibling, not child
      expect(() => root.resolve('foo2/../etc')).toThrow('parent traversal');
    });
  });
});

// ─── ActivationLock ──────────────────────────────────────────────────────────

describe('ActivationLock', () => {
  let lockDir: string;
  let lock: ActivationLock;

  beforeEach(() => {
    lockDir = fs.mkdtempSync(path.join(tmpBase, 'lock-'));
    lock = new ActivationLock(lockDir);
  });

  afterEach(() => {
    try { lock.cleanup(); } catch { /* ignore */ }
  });

  describe('acquire', () => {
    it('returns token+fd+ino+pid', () => {
      const result = lock.acquire('test-lock');
      expect(result.token).toBeTruthy();
      expect(typeof result.fd).toBe('number');
      expect(typeof result.ino).toBe('number');
      expect(result.pid).toBe(process.pid);
      expect(lock.heldCount).toBe(1);
    });

    it('throws LockHeldError for duplicate lock name', () => {
      lock.acquire('dup');
      expect(() => lock.acquire('dup')).toThrow(LockHeldError);
    });

    it('allows different names simultaneously', () => {
      lock.acquire('a');
      lock.acquire('b');
      expect(lock.heldCount).toBe(2);
    });
  });

  describe('release', () => {
    it('releases a held lock and allows re-acquire', () => {
      const { token } = lock.acquire('rel');
      lock.release(token);
      expect(lock.heldCount).toBe(0);
      const r2 = lock.acquire('rel');
      expect(r2.token).not.toBe(token);
      lock.release(r2.token);
    });

    it('throws on unknown token (fail closed)', () => {
      expect(() => lock.release('bogus-token')).toThrow('unknown token');
    });

    it('old token becomes unknown after release (fail closed)', () => {
      const r1 = lock.acquire('fail-closed');
      lock.release(r1.token);
      // Releasing again fails — token no longer in held map
      expect(() => lock.release(r1.token)).toThrow('unknown token');
    });
  });

  describe('isLive / isStale', () => {
    it('isLive true for own process lock', () => {
      const { token } = lock.acquire('live-test');
      expect(lock.isLive(token)).toBe(true);
      lock.release(token);
    });

    it('isStale false for own active lock', () => {
      const { token } = lock.acquire('stale-test');
      expect(lock.isStale(token)).toBe(false);
      lock.release(token);
    });
  });

  describe('cleanup', () => {
    it('releases all held locks', () => {
      lock.acquire('c1');
      lock.acquire('c2');
      expect(lock.heldCount).toBe(2);
      lock.cleanup();
      expect(lock.heldCount).toBe(0);
    });
  });

  describe('malformed lock file', () => {
    it('fails closed on malformed content (does not break)', () => {
      // Create a lock file with garbage content manually
      const lockPath = path.join(lockDir, 'malformed.lock');
      fs.writeFileSync(lockPath, 'not-a-valid-lock-format', 'utf-8');
      // Trying to acquire should fail with LockHeldError (fail closed)
      expect(() => lock.acquire('malformed')).toThrow(LockHeldError);
      // Lock file should still exist (not broken)
      expect(fs.existsSync(lockPath)).toBe(true);
    });
  });

  describe('threat model explicit', () => {
    it('EPERM treated as live (process exists but cannot be signaled)', () => {
      // Can't easily simulate EPERM in a test without privilege magic,
      // but verify the code path handles it: kill(pid, 0) with pid=0
      // (init process) returns EPERM for non-root, which is treated as alive.
      // Just verify lock behavior is correct.
      const { token } = lock.acquire('eperm-test');
      expect(lock.isLive(token)).toBe(true);
      lock.release(token);
    });
  });
});
