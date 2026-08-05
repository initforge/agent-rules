import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveGitPath } from './platform.js';

/**
 * Real diff capture via git.
 *
 * `LocalWorkerAdapter.computeDiffFingerprint()` hashed the *entire current content* of
 * every owned path and called the result a diff fingerprint. That value changes when
 * an unrelated file is touched and stays identical when a file is modified and
 * reverted, so it could neither prove that work happened nor that it did not. It also
 * reported every file under an owned path as "changed".
 *
 * Here the fingerprint is the SHA-256 of the actual `git diff` text, scoped to the
 * paths a task owns, and `filesChanged` comes from `git diff --name-only`. An empty
 * diff yields null, which lets `validateReceipt` reject a task that claims success
 * without changing anything.
 */

export interface DiffCapture {
  /** SHA-256 of the diff text, or null when nothing changed. */
  diffSha256: string | null;
  filesChanged: string[];
  /** Diff text size, for logging. The text itself is never returned upward. */
  diffBytes: number;
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  // Resolve the system `git` once. If the host has no git on PATH the
  // runner still returns `{ ok: false, stdout: '' }` instead of crashing;
  // callers downstream treat an empty diff as "no changes" and pass.
  // The clearer error belongs at the call site (captureDiff), not here.
  const exe = resolveGitPath();
  if (!exe) return { ok: false, stdout: '' };
  const res = spawnSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: res.status === 0, stdout: res.stdout ?? '' };
}

/**
 * Capture the working-tree diff for `ownedPaths` (all tracked paths when empty).
 *
 * `excludePaths` keeps the runner's own state (queue directories, logs, journal) out
 * of the result. Without it a task that did nothing still looks like work, because the
 * runner wrote its own bookkeeping into the repo — which would defeat the
 * "verification passed but nothing changed" check entirely.
 *
 * Includes untracked files: a new file that git does not yet know about still counts
 * as work, and omitting it would let a task that only creates files look like a no-op.
 */
export function captureDiff(
  cwd: string,
  ownedPaths: readonly string[],
  excludePaths: readonly string[] = []
): DiffCapture {
  const exclusions = excludePaths.map((p) => `:(exclude)${p}`);
  const scope = ownedPaths.length > 0 || exclusions.length > 0;
  const pathArgs = scope ? ['--', ...(ownedPaths.length > 0 ? ownedPaths : ['.']), ...exclusions] : [];

  const tracked = git(cwd, ['diff', 'HEAD', ...pathArgs]);
  const untrackedList = git(cwd, ['ls-files', '--others', '--exclude-standard', ...pathArgs]);

  const untrackedFiles = untrackedList.stdout.split('\n').filter(Boolean);

  // `git diff --no-index` against /dev/null renders a new file as an addition, so the
  // fingerprint covers created files rather than silently ignoring them.
  let untrackedDiff = '';
  for (const file of untrackedFiles) {
    const d = spawnSync('git', ['diff', '--no-index', '--', '/dev/null', file], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    untrackedDiff += d.stdout ?? '';
  }

  const diffText = tracked.stdout + untrackedDiff;
  if (diffText.length === 0) {
    return { diffSha256: null, filesChanged: [], diffBytes: 0 };
  }

  const named = git(cwd, ['diff', '--name-only', 'HEAD', ...pathArgs]);
  const filesChanged = [...new Set([...named.stdout.split('\n').filter(Boolean), ...untrackedFiles])].sort();

  return {
    diffSha256: createHash('sha256').update(diffText).digest('hex'),
    filesChanged,
    diffBytes: Buffer.byteLength(diffText),
  };
}

/** True when every changed path is documentation. Used to reject doc-only "work". */
export function isDocOnly(filesChanged: readonly string[]): boolean {
  if (filesChanged.length === 0) return false;
  return filesChanged.every((f) => /\.(md|txt|rst|adoc)$/i.test(f));
}
