import { execFileSync } from 'node:child_process';
import os from 'node:os';

/**
 * Cross-platform helpers used by the runner's spawn paths.
 *
 * Why this lives in its own module: every spawn call in the engine
 * (`runner/diff.ts` for `git`, `runner/mcp-config.ts` for the per-task
 * MCP server, `runner/verifier.ts` for Playwright's driver) historically
 * assumed POSIX behaviour on a Windows host — the obvious bugs that
 * surface during dogfood are all the same shape: a path with a space,
 * a binary that ends in `.cmd` (Windows npx shim), or a missing
 * `git` on PATH. The right fix is to centralise the differences, not
 * to sprinkle `if (process.platform === 'win32')` across the engine.
 *
 * Three rules of thumb for callers:
 *
 *  1. Use \`isWindows()\` for behaviour (POSIX process groups, `.cmd`
 *     shims, etc.) — never for paths.
 *  2. Use \`posixJoin(cwd, file)\` when emitting a path that will be
 *     serialised into JSON / TOML config (MCP server definitions,
 *     source-lock paths). \`spawn\` args on Windows are still native
 *     backslash; the OS accepts both.
 *  3. Use \`executableExtensionHint(name)\` when emitting a TOML
 *     \`command\` array on Windows: \`npx\` resolves to \`npx.cmd\`,
 *     which the loader will not spawn via plain execvp without
 *     \`cmd.exe /c\`.
 */

export function isWindows(): boolean {
  return os.platform() === 'win32';
}

/** Forward-slash path suitable for JSON / TOML / config content. */
export function posixJoin(cwd: string, file: string): string {
  if (path.isAbsolute(file) || /^[A-Za-z]:[\\/]/.test(file)) return file.split(/[\\/]+/).join('/');
  const c = cwd.split(/[\\/]+/).join('/').replace(/\/+$/, '');
  const f = file.split(/[\\/]+/).join('/').replace(/^\/+/, '');
  return c && f ? `${c}/${f}` : c || f;
}

/**
 * Probe PATH for an executable, returning the absolute path or `null`.
 * On Windows, also probes `<name>.cmd` and `<name>.bat` because the
 * Windows loader does that before reading PATH for a name with no
 * extension. POSIX only checks the literal name.
 */
export function whichBinary(name: string, extraDirs: readonly string[] = []): string | null {
  const pathEnv = process.env['PATH'] ?? '';
  const dirs = [...pathEnv.split(path.delimiter).filter(Boolean), ...extraDirs];
  const candidates: string[] = [];
  for (const d of dirs) {
    candidates.push(path.join(d, name));
    if (isWindows()) {
      candidates.push(path.join(d, `${name}.cmd`));
      candidates.push(path.join(d, `${name}.bat`));
      candidates.push(path.join(d, `${name}.exe`));
    }
  }
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
    } catch {
      /* not present */
    }
  }
  return null;
}

/**
 * Resolve the absolute path to the system `git` binary, or `null` if
 * `git` is not on PATH. Called once per process and cached; tests that
 * monkey with PATH should call \`clearGitPathCache()\` to re-probe.
 */
let gitPathCache: string | null | undefined;
export function clearGitPathCache(): void { gitPathCache = undefined; }
export function resolveGitPath(): string | null {
  if (gitPathCache !== undefined) return gitPathCache;
  const candidates = isWindows()
    ? ['git.exe', 'git.cmd', 'git.bat', 'git']
    : ['git'];
  const dirs = (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean);
  if (isWindows()) {
    dirs.push('C:\\\\Program Files\\\\Git\\\\bin');
    dirs.push('C:\\\\Program Files\\\\Git\\\\cmd');
  }
  for (const c of candidates) {
    const found = whichBinary(c, dirs);
    if (found) {
      gitPathCache = found;
      return found;
    }
  }
  gitPathCache = null;
  return null;
}

/**
 * Wrap a Windows `.cmd` / `.bat` / `.ps1` command so the loader accepts
 * it via plain execvp. On POSIX, the command is returned as-is.
 */
export function toMcpCommandArgv(command: readonly string[]): string[] {
  if (!isWindows()) return [...command];
  if (command.length === 0) return [];
  const first = command[0] ?? '';
  // This generic helper only wraps explicit script paths. Host-specific
  // projectors handle bare npm shims when their native launcher needs it.
  const needsShell = /\.(cmd|bat|ps1)$/i.test(first);
  if (!needsShell) return [...command];
  return ['cmd.exe', '/d', '/s', '/c', ...command];
}

/** Re-export path for callers that need it. */
import path from 'node:path';
import fs from 'node:fs';

// Re-export so callers do not have to import `path` separately.
export { path, fs };
