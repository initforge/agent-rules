import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/**
 * Real diff capture via git.
 *
 * Approach: capture the set of dirty files (tracked + untracked) before and after
 * agent execution. The delta is only the NEW changes introduced by this agent,
 * excluding pre-existing dirty state.
 *
 * This prevents:
 * - Pre-existing dirty state being counted as task output
 * - Diff accumulating across tasks (no commit/reset needed)
 * - Changes outside owned paths being counted
 */

export interface DiffCapture {
  /** SHA-256 of the diff text, or null when nothing changed. */
  diffSha256: string | null;
  filesChanged: string[];
  /** Diff text size, for logging. The text itself is never returned upward. */
  diffBytes: number;
  /** Files changed but outside ownedPaths — ownership violations. */
  ownershipViolations: string[];
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: res.status === 0, stdout: res.stdout ?? '' };
}

/**
 * Snapshot the set of dirty files (tracked changes + untracked) at a point in time.
 * Returns a sorted array of file paths that differ from HEAD.
 */
export function snapshotDirtyFiles(cwd: string, excludePaths: readonly string[] = []): string[] {
  // Tracked changes (modified, deleted, renamed)
  const tracked = git(cwd, ['diff', '--name-only', 'HEAD']);
  const trackedFiles = tracked.stdout.split('\n').filter(Boolean);

  // Untracked files (new files not yet in git)
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
  const untrackedFiles = untracked.stdout.split('\n').filter(Boolean);

  const excludeSet = new Set(excludePaths);
  const isExcluded = (f: string) => excludeSet.has(f) || excludePaths.some((ep) => f.startsWith(ep + '/') || f.startsWith(ep + '\\'));

  return [...new Set([...trackedFiles, ...untrackedFiles])].filter((f) => !isExcluded(f)).sort();
}

/**
 * Compute the diff text for a set of files, scoped to owned paths.
 */
function computeDiffText(cwd: string, files: string[], ownedPaths: readonly string[]): string {
  const ownedSet = new Set(ownedPaths);
  const isOwned = (f: string) => {
    if (ownedPaths.length === 0) return true; // empty = all paths
    return ownedSet.has(f) || ownedPaths.some((op) => f.startsWith(op + '/') || f.startsWith(op + '\\'));
  };

  const ownedFiles = files.filter(isOwned);
  if (ownedFiles.length === 0) return '';

  let diffText = '';
  for (const file of ownedFiles) {
    // For tracked files, use git diff HEAD
    const trackedDiff = git(cwd, ['diff', 'HEAD', '--', file]);
    diffText += trackedDiff.stdout;
    // For untracked files, diff against /dev/null
    if (!trackedDiff.stdout) {
      const untrackedDiff = spawnSync('git', ['diff', '--no-index', '--', '/dev/null', file], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      diffText += untrackedDiff.stdout ?? '';
    }
  }
  return diffText;
}

/**
 * Capture the delta between two dirty-file snapshots, scoped to owned paths.
 *
 * @param beforeFiles Snapshot of dirty files captured before task execution
 * @param afterFiles Snapshot of dirty files captured after task execution
 * @param ownedPaths Paths the task is allowed to modify. Empty = all paths.
 */
export function captureDelta(
  cwd: string,
  beforeFiles: string[],
  afterFiles: string[],
  ownedPaths: readonly string[],
): DiffCapture {
  // Files that are new or changed after the agent ran
  const beforeSet = new Set(beforeFiles);
  const newFiles = afterFiles.filter((f) => !beforeSet.has(f));

  // Also check for files that existed before but changed after
  // (git diff --name-only shows these, but we need the actual diff text)
  const ownedSet = new Set(ownedPaths);
  const isOwned = (f: string) => {
    if (ownedPaths.length === 0) return true;
    return ownedSet.has(f) || ownedPaths.some((op) => f.startsWith(op + '/') || f.startsWith(op + '\\'));
  };

  // Compute diff text for all changed files (owned scope)
  const allChanged = [...new Set([...beforeFiles, ...afterFiles])];
  const diffText = computeDiffText(cwd, allChanged, ownedPaths);

  if (diffText.length === 0) {
    return { diffSha256: null, filesChanged: [], diffBytes: 0, ownershipViolations: [] };
  }

  const filesChanged = newFiles.sort();

  // Ownership violations: files changed but not in ownedPaths
  let ownershipViolations: string[] = [];
  if (ownedPaths.length > 0) {
    const allChangedFiles = afterFiles.filter((f) => !beforeSet.has(f));
    ownershipViolations = allChangedFiles.filter((f) => !isOwned(f));
  }

  return {
    diffSha256: createHash('sha256').update(diffText).digest('hex'),
    filesChanged,
    diffBytes: Buffer.byteLength(diffText),
    ownershipViolations,
  };
}

/** True when every changed path is documentation. Used to reject doc-only "work". */
export function isDocOnly(filesChanged: readonly string[]): boolean {
  if (filesChanged.length === 0) return false;
  return filesChanged.every((f) => /\.(md|txt|rst|adoc)$/i.test(f));
}

/**
 * Legacy API: capture the current working-tree diff for `ownedPaths`.
 *
 * Used by tests and backward-compatible callers. New code should use
 * `snapshotDirtyFiles` + `captureDelta` for true before/after deltas.
 *
 * Note: this counts pre-existing dirty state as part of the diff.
 * The new `captureDelta` approach isolates only the agent's changes.
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
    return { diffSha256: null, filesChanged: [], diffBytes: 0, ownershipViolations: [] };
  }

  const named = git(cwd, ['diff', '--name-only', 'HEAD', ...pathArgs]);
  const filesChanged = [...new Set([...named.stdout.split('\n').filter(Boolean), ...untrackedFiles])].sort();

  return {
    diffSha256: createHash('sha256').update(diffText).digest('hex'),
    filesChanged,
    diffBytes: Buffer.byteLength(diffText),
    ownershipViolations: [],
  };
}

