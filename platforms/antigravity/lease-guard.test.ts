import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { LeaseGuard } from './lease-guard.js';
import { antigravityAdapter, createAntigravityLeaseGuard } from './adapter.js';

/** Fresh guard over a temp project root + temp worktree, canonical `.agent` under project root. */
async function freshGuard(): Promise<{ guard: LeaseGuard; projectRoot: string; worktreeRoot: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ag-leasetest-'));
  const projectRoot = path.join(base, 'project');
  const worktreeRoot = path.join(base, 'worktree');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(worktreeRoot, { recursive: true });
  const guard = new LeaseGuard({
    ownedRoots: [projectRoot, worktreeRoot],
    canonicalAgentPath: path.join(projectRoot, '.agent'),
  });
  return { guard, projectRoot, worktreeRoot };
}

describe('antigravity lease guard — path confinement (fail closed)', () => {
  it('1. out-of-ownership write rejected (path outside every owned root)', async () => {
    const { guard, projectRoot } = await freshGuard();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'ag-outside-'));
    const verdict = guard.checkMutation(path.join(outside, 'file.txt'));
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe('OUT_OF_SCOPE');
    expect(verdict.reason).toContain('out-of-ownership');
    expect(guard.mode).toBe('ADVISORY_READ_ONLY');
    expect(path.join(outside, 'file.txt').startsWith(projectRoot)).toBe(false);
  });

  it('2. traversal and symlink-escape rejected', async () => {
    // Parent traversal
    {
      const { guard, projectRoot } = await freshGuard();
      const traversal = guard.checkMutation(path.join(projectRoot, '..', 'escape.txt'));
      expect(traversal.allowed).toBe(false);
      expect(traversal.code).toBe('OUT_OF_SCOPE');
      // assertPathInsideRoot throws for traversal
      expect(() => guard.assertPathInsideRoot(path.join(projectRoot, '..', 'x'), projectRoot)).toThrow(
        /lease rejection/,
      );
    }
    // Symlink escape: symlink inside owned root points outside
    {
      const { guard, projectRoot } = await freshGuard();
      const outside = await mkdtemp(path.join(os.tmpdir(), 'ag-outside2-'));
      const link = path.join(projectRoot, 'escape-link');
      await symlink(outside, link, 'dir');
      const escape = guard.checkMutation(path.join(link, 'secret.txt'));
      expect(escape.allowed).toBe(false);
      expect(escape.code).toBe('OUT_OF_SCOPE');
    }
  });

  it('3. canonical .agent mutation rejected even inside owned root', async () => {
    const { guard, projectRoot } = await freshGuard();
    const agentFile = path.join(projectRoot, '.agent', 'plans', 'x.md');
    const verdict = guard.checkMutation(agentFile);
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe('CANONICAL_AGENT');
    expect(verdict.reason).toContain('canonical .agent');
  });

  it('4. in-lease write allowed (project root and worktree root)', async () => {
    const { guard, projectRoot, worktreeRoot } = await freshGuard();
    const inProject = guard.checkMutation(path.join(projectRoot, 'src', 'main.ts'));
    expect(inProject.allowed).toBe(true);
    expect(inProject.code).toBe('IN_SCOPE');
    const inWorktree = guard.checkMutation(path.join(worktreeRoot, 'notes.md'));
    expect(inWorktree.allowed).toBe(true);
    expect(guard.mode).toBe('ACTIVE');
  });

  it('5. assertPathInsideRoot accepts subpaths and root itself', async () => {
    const { guard, projectRoot } = await freshGuard();
    const sub = guard.assertPathInsideRoot(path.join(projectRoot, 'sub'), projectRoot);
    expect(sub).toBe(path.join(projectRoot, 'sub'));
    expect(guard.assertPathInsideRoot(projectRoot, projectRoot)).toBe(projectRoot);
  });
});

describe('antigravity lease guard — no merge', () => {
  it('6. merge/push/rebase/rewrite git commands rejected', async () => {
    for (const args of [
      ['merge', 'feature/x'],
      ['push', 'origin', 'main'],
      ['pull', '--rebase'],
      ['rebase', 'main'],
      ['cherry-pick', 'abc123'],
      ['reset', '--hard', 'HEAD~1'],
      ['commit', '--amend', '-m', 'x'],
      ['filter-branch', '--all'],
    ]) {
      const { guard } = await freshGuard();
      const verdict = guard.checkGitCommand(args);
      expect(verdict.allowed).toBe(false);
      expect(verdict.code).toBe('MERGE_FORBIDDEN');
      expect(guard.mode).toBe('ADVISORY_READ_ONLY');
    }
  });

  it('7. read-only git commands allowed', async () => {
    const { guard } = await freshGuard();
    for (const args of [
      ['status'],
      ['diff'],
      ['log', '--oneline'],
      ['show', 'HEAD'],
      ['rev-parse', 'HEAD'],
    ]) {
      const verdict = guard.checkGitCommand(args);
      expect(verdict.allowed).toBe(true);
    }
    expect(guard.mode).toBe('ACTIVE');
  });
});

describe('antigravity lease guard — diff-boundary validator', () => {
  it('8. mixed diff (allowed + rejected paths) rejected with reasons, allowed set intact', async () => {
    const { guard, projectRoot, worktreeRoot } = await freshGuard();
    const inLease = path.join(projectRoot, 'src', 'ok.ts');
    const outOfLease = await mkdtemp(path.join(os.tmpdir(), 'ag-diff-'));
    const inLeasePath = path.join(inLease);
    const outPath = path.join(outOfLease, 'bad.ts');
    const result = guard.validateDiff([inLeasePath, path.join(worktreeRoot, 'ok2.ts'), outPath]);
    expect(result.accepted).toBe(false);
    expect(result.allowed).toEqual([inLeasePath, path.join(worktreeRoot, 'ok2.ts')]);
    expect(result.rejected).toEqual([outPath]);
    expect(result.reasons[outPath]).toContain('out-of-ownership');
  });

  it('9. fully in-lease diff accepted, empty sets intact', async () => {
    const { guard, projectRoot, worktreeRoot } = await freshGuard();
    const result = guard.validateDiff([path.join(projectRoot, 'a.ts'), path.join(worktreeRoot, 'b.ts')]);
    expect(result.accepted).toBe(true);
    expect(result.rejected).toEqual([]);
    expect(result.allowed.length).toBe(2);
  });

  it('10. canonical .agent path in a diff rejected by the boundary validator', async () => {
    const { guard, projectRoot, worktreeRoot } = await freshGuard();
    const agent = path.join(projectRoot, '.agent', 'evidence.json');
    const result = guard.validateDiff([path.join(worktreeRoot, 'ok.ts'), agent]);
    expect(result.accepted).toBe(false);
    expect(result.rejected).toEqual([agent]);
    expect(result.reasons[agent]).toContain('canonical .agent');
    expect(result.allowed).toEqual([path.join(worktreeRoot, 'ok.ts')]);
  });
});

describe('antigravity lease guard — failure downgrades to advisory/read-only', () => {
  it('11. a rejected mutation flips state so a later in-lease write is also rejected', async () => {
    const { guard, projectRoot, worktreeRoot } = await freshGuard();
    expect(guard.mode).toBe('ACTIVE');
    const first = guard.checkMutation(path.join(projectRoot, 'src', 'ok.ts'));
    expect(first.allowed).toBe(true);
    const reject = guard.checkMutation(path.join(worktreeRoot, '..', 'escape.ts'));
    expect(reject.allowed).toBe(false);
    expect(guard.mode).toBe('ADVISORY_READ_ONLY');
    // Subsequent write attempt — even in-lease — is rejected: no retry as writer.
    const retry = guard.checkMutation(path.join(projectRoot, 'src', 'ok.ts'));
    expect(retry.allowed).toBe(false);
    expect(retry.code).toBe('ADVISORY_READ_ONLY');
    const diffRetry = guard.validateDiff([path.join(projectRoot, 'src', 'ok.ts')]);
    expect(diffRetry.accepted).toBe(false);
    expect(diffRetry.rejected).toEqual([path.join(projectRoot, 'src', 'ok.ts')]);
  });

  it('12. merge rejection also downgrades to advisory/read-only', async () => {
    const { guard } = await freshGuard();
    expect(guard.checkGitCommand(['merge', 'feature/x']).allowed).toBe(false);
    expect(guard.mode).toBe('ADVISORY_READ_ONLY');
    expect(guard.checkMutation(path.join(process.cwd(), 'x.ts')).allowed).toBe(false);
  });
});

describe('antigravity adapter — lease surface wired', () => {
  it('13. adapter exposes leaseGuard/checkMutation/validateDiff/leaseState', async () => {
    expect(antigravityAdapter.leaseGuard).toBeInstanceOf(LeaseGuard);
    expect(typeof antigravityAdapter.checkMutation).toBe('function');
    expect(typeof antigravityAdapter.validateDiff).toBe('function');
    expect(typeof antigravityAdapter.leaseState).toBe('function');
  });

  it('14. adapter-level checkMutation rejects out-of-lease and .agent mutations', async () => {
    const guard = antigravityAdapter.leaseGuard;
    const projectRoot = guard.ownedRoots[0];
    const verdict = antigravityAdapter.checkMutation(path.join(projectRoot, '.agent', 'plans', 'x.md'));
    expect(verdict.allowed).toBe(false);
    expect(verdict.code).toBe('CANONICAL_AGENT');
  });

  it('15. createAntigravityLeaseGuard honours env-owned roots', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'ag-adapter-'));
    const prevRoot = process.env.ANTIGRAVITY_PROJECT_ROOT;
    const prevWorktree = process.env.ANTIGRAVITY_WORKTREE_ROOT;
    try {
      process.env.ANTIGRAVITY_PROJECT_ROOT = path.join(base, 'proj');
      process.env.ANTIGRAVITY_WORKTREE_ROOT = path.join(base, 'wt');
      const guard = createAntigravityLeaseGuard();
      expect(guard.ownedRoots).toEqual([path.join(base, 'proj'), path.join(base, 'wt')]);
      expect(guard.canonicalAgentPath).toBe(path.join(base, 'proj', '.agent'));
    } finally {
      if (prevRoot !== undefined) process.env.ANTIGRAVITY_PROJECT_ROOT = prevRoot;
      else delete process.env.ANTIGRAVITY_PROJECT_ROOT;
      if (prevWorktree !== undefined) process.env.ANTIGRAVITY_WORKTREE_ROOT = prevWorktree;
      else delete process.env.ANTIGRAVITY_WORKTREE_ROOT;
    }
  });
});
