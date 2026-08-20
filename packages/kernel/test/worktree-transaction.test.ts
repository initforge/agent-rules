/**
 * REQ-015 — disposable worktree transactions. Mutating work runs in an
 * isolated worktree; only the diff is promoted after scope audit +
 * verification + acceptance; discarding never touches the canonical branch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createWorktreeTransaction,
  captureTransactionDiff,
  discardWorktreeTransaction,
  promoteWorktreeTransaction,
} from '../src/runner/worktree-transaction.js';

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}

describe('REQ-015 — worktree transactions', () => {
  let repo: string;
  let worktreeRoot: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wtx-repo-'));
    worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wtx-root-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'base\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'base']);
  });

  afterEach(() => {
    try { git(repo, ['worktree', 'prune']); } catch { /* ignore */ }
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  });

  it('creates an isolated worktree at the base commit', () => {
    const tx = createWorktreeTransaction(repo, { worktreeRoot });
    expect(fs.existsSync(path.join(tx.worktree_path, 'a.txt'))).toBe(true);
    expect(tx.base_commit).toBe(git(repo, ['rev-parse', 'HEAD']));
    expect(tx.receipt_path && fs.existsSync(tx.receipt_path)).toBe(true);
    discardWorktreeTransaction(tx);
  });

  it('captures only the worktree diff; discarding never touches the canonical branch', () => {
    const tx = createWorktreeTransaction(repo, { worktreeRoot });
    fs.writeFileSync(path.join(tx.worktree_path, 'a.txt'), 'base\nchanged\n');
    fs.writeFileSync(path.join(tx.worktree_path, 'new.txt'), 'new\n');
    const diff = captureTransactionDiff(tx);
    expect(diff.dirty).toBe(true);
    expect(diff.changed_files).toEqual(expect.arrayContaining(['a.txt', 'new.txt']));
    expect(diff.diff_sha256).toMatch(/^[a-f0-9]{64}$/);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    discardWorktreeTransaction(tx);
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('base\n');
  });

  it('promotes the verified diff only with pre-promotion evidence', () => {
    const tx = createWorktreeTransaction(repo, { worktreeRoot });
    fs.writeFileSync(path.join(tx.worktree_path, 'a.txt'), 'base\npromoted\n');
    const diff = captureTransactionDiff(tx);

    const refused = promoteWorktreeTransaction(tx, diff, { pre_promotion_evidence: [] });
    expect(refused.promoted).toBe(false);
    expect(refused.reason).toMatch(/no pre-promotion evidence/);

    const promoted = promoteWorktreeTransaction(tx, diff, {
      pre_promotion_evidence: ['scope-audit:pass', 'verification:pass', 'acceptance:pass'],
      message: 'wtx test promotion',
    });
    expect(promoted.promoted).toBe(true);
    expect(promoted.commit).toBeTruthy();
    expect(git(repo, ['log', '-1', '--format=%s'])).toContain('wtx test promotion');
    const promotedContent = fs.readFileSync(path.join(repo, 'a.txt'), 'utf8').replace(/\r\n/g, '\n');
    expect(promotedContent).toBe('base\npromoted\n');
  });

  it('a transaction with no diff promotes as empty (no commit created)', () => {
    const tx = createWorktreeTransaction(repo, { worktreeRoot });
    const diff = captureTransactionDiff(tx);
    expect(diff.dirty).toBe(false);
    const promoted = promoteWorktreeTransaction(tx, diff, { pre_promotion_evidence: ['scope-audit:pass', 'verification:pass', 'acceptance:pass'] });
    expect(promoted.promoted).toBe(true);
    expect(promoted.commit).toBeNull();
    discardWorktreeTransaction(tx);
  });
});
