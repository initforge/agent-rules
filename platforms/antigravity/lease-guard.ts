/**
 * M11-C10-C10 — Antigravity out-of-ownership mutation rejection (AM-0019 §10, §12).
 *
 * Antigravity is constrained:
 *   - signed context capsule
 *   - strict worktree/path lease (owned paths)
 *   - no merge (no git merge/push/rewrite)
 *   - no canonical `.agent` mutation
 *   - diff-boundary validator
 *   - review by another host
 *
 * Any guard rejection downgrades the adapter to advisory/read-only mode, so a
 * failed mutation attempt can never be retried as a writer. The diff-boundary
 * validator partitions a proposed mutation set into allowed/rejected paths with
 * per-path reasons; a diff that touches any out-of-lease path is rejected as a
 * whole while the allowed set is still reported intact.
 */
import fs from 'node:fs';
import path from 'node:path';

export type LeaseState = 'ACTIVE' | 'ADVISORY_READ_ONLY';

export interface LeaseScope {
  /** Realpath-canonical owned roots (project root, worktree root). */
  readonly ownedRoots: readonly string[];
  /** Canonical harness ledger/plans/evidence dir — never mutable by Antigravity. */
  readonly canonicalAgentPath: string;
}

export type MutationCode =
  | 'IN_SCOPE'
  | 'OUT_OF_SCOPE'
  | 'CANONICAL_AGENT'
  | 'MERGE_FORBIDDEN'
  | 'ADVISORY_READ_ONLY';

export interface MutationVerdict {
  readonly allowed: boolean;
  readonly code: MutationCode;
  readonly reason: string;
}

export interface DiffBoundaryResult {
  /** True only when every touched path is inside the lease. */
  readonly accepted: boolean;
  readonly allowed: readonly string[];
  readonly rejected: readonly string[];
  readonly reasons: Readonly<Record<string, string>>;
}

/** Git verbs that merge, publish, or rewrite history — forbidden for Antigravity. */
const FORBIDDEN_GIT_VERBS = new Set([
  'merge',
  'push',
  'pull',
  'rebase',
  'cherry-pick',
  'revert',
  'am',
  'filter-branch',
  'replace',
]);

/**
 * Resolve a candidate through symlinks even when the leaf does not exist yet
 * (mutation target not created). Mirrors SecureFsRoot.resolve ENOENT handling:
 * the deepest existing ancestor is realpathed and the remaining tail is
 * re-appended, so an intermediate symlink escaping the root is still caught.
 */
function resolveThroughAncestors(candidate: string): string {
  const resolved = path.resolve(candidate);
  try {
    return fs.realpathSync(resolved);
  } catch {
    const tail: string[] = [];
    let ancestor = resolved;
    for (;;) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return resolved;
      tail.unshift(path.basename(ancestor));
      ancestor = parent;
      try {
        const real = fs.realpathSync(ancestor);
        return path.join(real, ...tail);
      } catch {
        /* continue walking up */
      }
    }
  }
}

function realpathOrResolved(candidate: string): string {
  return resolveThroughAncestors(candidate);
}

export class LeaseGuard {
  readonly #ownedRoots: string[];
  readonly #canonicalAgentPath: string;
  #state: LeaseState = 'ACTIVE';

  constructor(scope: LeaseScope) {
    if (scope.ownedRoots.length === 0) {
      throw new Error('antigravity lease guard: at least one owned root is required');
    }
    this.#ownedRoots = scope.ownedRoots.map((root) => path.resolve(root));
    this.#canonicalAgentPath = path.resolve(scope.canonicalAgentPath);
  }

  get mode(): LeaseState {
    return this.#state;
  }

  get ownedRoots(): string[] {
    return [...this.#ownedRoots];
  }

  get canonicalAgentPath(): string {
    return this.#canonicalAgentPath;
  }

  /**
   * Realpath-based path-confinement, identical fail-closed semantics to the
   * Claude adapter's `assertPathInsideRoot`: absolute jumps, `..` traversal and
   * symlink escapes resolve outside root and are rejected.
   */
  assertPathInsideRoot(candidate: string, root: string): string {
    const resolved = path.resolve(candidate);
    const resolvedRoot = path.resolve(root);
    const real = realpathOrResolved(resolved);
    const realRoot = realpathOrResolved(resolvedRoot);
    const rel = path.relative(realRoot, real);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`antigravity lease rejection: ${resolved} escapes root ${resolvedRoot}`);
    }
    return resolved;
  }

  #inside(candidate: string, root: string): boolean {
    try {
      this.assertPathInsideRoot(candidate, root);
      return true;
    } catch {
      return false;
    }
  }

  /** Fail-closed check of a single candidate mutation path. */
  checkMutation(candidate: string): MutationVerdict {
    if (this.#state === 'ADVISORY_READ_ONLY') {
      return {
        allowed: false,
        code: 'ADVISORY_READ_ONLY',
        reason: 'antigravity is advisory/read-only after a guard rejection; no further mutations allowed',
      };
    }
    const resolved = path.resolve(candidate);
    // Canonical `.agent` ledger: never mutable by Antigravity, regardless of owned paths.
    if (this.#inside(resolved, this.#canonicalAgentPath)) {
      this.#downgrade();
      return {
        allowed: false,
        code: 'CANONICAL_AGENT',
        reason: `canonical .agent mutation rejected: ${resolved}`,
      };
    }
    for (const root of this.#ownedRoots) {
      if (this.#inside(resolved, root)) {
        return { allowed: true, code: 'IN_SCOPE', reason: `in-lease path: ${resolved}` };
      }
    }
    this.#downgrade();
    return {
      allowed: false,
      code: 'OUT_OF_SCOPE',
      reason: `out-of-ownership mutation rejected: ${resolved} not inside ${this.#ownedRoots.join(', ')}`,
    };
  }

  /** No-merge enforcement: rejects merge/publish/rewrite git commands. */
  checkGitCommand(args: readonly string[]): MutationVerdict {
    if (this.#state === 'ADVISORY_READ_ONLY') {
      return {
        allowed: false,
        code: 'ADVISORY_READ_ONLY',
        reason: 'antigravity is advisory/read-only after a guard rejection',
      };
    }
    const verb = args.find((arg) => !arg.startsWith('-')) ?? '';
    const isRewrite =
      FORBIDDEN_GIT_VERBS.has(verb) ||
      (verb === 'reset' && args.includes('--hard')) ||
      (verb === 'commit' && args.includes('--amend'));
    if (isRewrite) {
      this.#downgrade();
      return {
        allowed: false,
        code: 'MERGE_FORBIDDEN',
        reason: `no-merge enforcement: git ${args.join(' ')} rejected for Antigravity`,
      };
    }
    return { allowed: true, code: 'IN_SCOPE', reason: 'git command is read-only' };
  }

  /**
   * Diff-boundary validator: partitions proposed touched paths into allowed and
   * rejected sets. The diff is accepted only when every touched path is inside
   * the lease. Rejection downgrades the guard to advisory/read-only.
   */
  validateDiff(paths: readonly string[]): DiffBoundaryResult {
    const allowed: string[] = [];
    const rejected: string[] = [];
    const reasons: Record<string, string> = {};
    for (const candidate of paths) {
      const verdict = this.checkMutation(candidate);
      if (verdict.allowed) {
        allowed.push(path.resolve(candidate));
      } else {
        rejected.push(path.resolve(candidate));
        reasons[path.resolve(candidate)] = verdict.reason;
      }
    }
    return { accepted: rejected.length === 0, allowed, rejected, reasons };
  }

  #downgrade(): void {
    this.#state = 'ADVISORY_READ_ONLY';
  }
}
