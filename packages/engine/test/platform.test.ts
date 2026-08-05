import { describe, expect, it } from 'vitest';
import os from 'node:os';
import {
  isWindows,
  posixJoin,
  whichBinary,
  resolveGitPath,
  toMcpCommandArgv,
  clearGitPathCache,
} from '../src/runner/platform.js';

describe('isWindows', () => {
  it('matches process.platform', () => {
    expect(isWindows()).toBe(process.platform === 'win32');
  });
});

describe('posixJoin', () => {
  it('joins cwd + file with forward slashes', () => {
    expect(posixJoin('/tmp', 'foo.json')).toBe('/tmp/foo.json');
  });

  it('replaces backslashes on Windows paths', () => {
    expect(posixJoin('C:\\Users\\ADMIN', 'out.json')).toBe('C:/Users/ADMIN/out.json');
  });

  it('normalises absolute file input', () => {
    expect(posixJoin('/anywhere', 'C:\\Windows\\System32\\cmd.exe'))
      .toBe('C:/Windows/System32/cmd.exe');
  });

  it('collapses trailing slashes on cwd', () => {
    expect(posixJoin('/tmp/', 'file')).toBe('/tmp/file');
  });
});

describe('whichBinary', () => {
  it('returns null for a name that does not exist', () => {
    expect(whichBinary('definitely-not-a-real-cli-xyz-1234')).toBeNull();
  });

  it('finds `node` on PATH (every host with this test has it)', () => {
    const found = whichBinary('node');
    expect(found).not.toBeNull();
    expect(found!.length).toBeGreaterThan(0);
  });

  it('on Windows also probes .cmd and .bat', () => {
    if (!isWindows()) return;
    // `where` will find npx.cmd on most Windows hosts with Node.
    const found = whichBinary('npx');
    expect(found).not.toBeNull();
  });
});

describe('resolveGitPath', () => {
  it('returns a path on hosts with git, null otherwise (cache aware)', () => {
    clearGitPathCache();
    const found = resolveGitPath();
    // We do not assert truthiness because some test hosts lack git; the
    // contract is: cache the result, return the same value twice.
    const found2 = resolveGitPath();
    expect(found2).toBe(found);
  });
});

describe('toMcpCommandArgv', () => {
  it('passes through POSIX commands unchanged', () => {
    if (isWindows()) return; // POSIX-only assertion
    expect(toMcpCommandArgv(['npx', '-y', '@playwright/mcp@latest']))
      .toEqual(['npx', '-y', '@playwright/mcp@latest']);
  });

  it('wraps Windows .cmd / .bat / .ps1 commands with cmd.exe /d /s /c', () => {
    if (!isWindows()) return; // Windows-only assertion
    expect(toMcpCommandArgv(['npx.cmd', '-y', 'playwright']))
      .toEqual(['cmd.exe', '/d', '/s', '/c', 'npx.cmd', '-y', 'playwright']);
    expect(toMcpCommandArgv(['script.bat', 'arg']))
      .toEqual(['cmd.exe', '/d', '/s', '/c', 'script.bat', 'arg']);
    expect(toMcpCommandArgv(['run.ps1', '-File', 'foo']))
      .toEqual(['cmd.exe', '/d', '/s', '/c', 'run.ps1', '-File', 'foo']);
  });

  it('passes through Windows native .exe without wrapping', () => {
    if (!isWindows()) return;
    expect(toMcpCommandArgv(['node.exe', '-e', 'process.exit(0)']))
      .toEqual(['node.exe', '-e', 'process.exit(0)']);
  });

  it('returns an empty array for an empty command on every platform', () => {
    expect(toMcpCommandArgv([])).toEqual([]);
  });
});

// Suppress unused-warning for `os` import — kept as a future hook.
void os;