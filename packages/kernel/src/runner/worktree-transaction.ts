import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * REQ-015 — disposable worktree transactions.
 *
 * Every mutating worker runs by default inside a disposable worktree; only the
 * diff is promoted into the canonical branch after scope audit, verification
 * and acceptance. Read-only work may run directly only when a sandbox proves
 * it cannot mutate (see decideEnforcement). Git is the mutation-control
 * mechanism: the worktree is a separate checkout, the diff is captured as a
 * patch with a receipt, and promotion is an explicit, audited act.
 */

export interface WorktreeTransaction {
  transaction_id: string;
  worktree_path: string;
  repo_root: string;
  base_commit: string;
  branch: string | null;
  created_at: string;
  receipt_path?: string;
}

export interface WorktreeTransactionDiff {
  transaction_id: string;
  diff_sha256: string;
  changed_files: string[];
  diff: string;
  dirty: boolean;
}

export interface WorktreeTransactionOptions {
  /** Alternative worktree directory (default: os tmp under agent-rules). */
  worktreeRoot?: string;
  /** Optional dedicated branch name; default is a detached worktree. */
  branch?: string;
}

function runGit(repoRoot: string, args: readonly string[], opts: { cwd?: string } = {}): string {
  return execFileSync('git', [...args], {
    cwd: opts.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

function isGitRepo(repoRoot: string): boolean {
  try {
    runGit(repoRoot, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

/** Create a disposable worktree transaction (detached, isolated checkout). */
export function createWorktreeTransaction(repoRoot: string, options: WorktreeTransactionOptions = {}): WorktreeTransaction {
  if (!isGitRepo(repoRoot)) throw new Error('worktree transaction requires a git repository');
  const baseCommit = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const transactionId = `wtx-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const worktreeRoot = options.worktreeRoot ?? path.join(process.env.TMPDIR ?? process.env.TEMP ?? osTmp(), 'agent-rules-worktrees');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  const worktreePath = path.join(worktreeRoot, transactionId);
  const branchArg = options.branch ? ['-b', options.branch] : ['--detach'];
  runGit(repoRoot, ['worktree', 'add', '--quiet', ...branchArg, worktreePath, baseCommit]);
  const transaction: WorktreeTransaction = {
    transaction_id: transactionId,
    worktree_path: worktreePath,
    repo_root: repoRoot,
    base_commit: baseCommit,
    branch: options.branch ?? null,
    created_at: new Date().toISOString(),
  };
  writeReceipt(transaction);
  return transaction;
}

/** Capture the transaction's working-tree diff against the base commit. */
export function captureTransactionDiff(transaction: WorktreeTransaction): WorktreeTransactionDiff {
  // Stage the disposable worktree's working tree so the full diff is captured
  // even though the worker never commits inside the transaction.
  try {
    runGit(transaction.repo_root, ['add', '-A'], { cwd: transaction.worktree_path });
  } catch {
    /* staging failure still lets us diff what exists */
  }
  const diff = runGit(transaction.repo_root, ['diff', '--cached', transaction.base_commit], { cwd: transaction.worktree_path });
  const changedFiles = diff ? parseChangedFiles(diff) : [];
  return {
    transaction_id: transaction.transaction_id,
    diff_sha256: createHash('sha256').update(diff || '<empty>').digest('hex'),
    changed_files: changedFiles,
    diff,
    dirty: changedFiles.length > 0,
  };
}

function parseChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split('\n')) {
    const match = /^diff --git a\/(.*?) b\//.exec(line);
    if (match?.[1]) files.add(match[1]);
  }
  return [...files];
}

/** Discard the transaction: remove the worktree and record the receipt. */
export function discardWorktreeTransaction(transaction: WorktreeTransaction): { discarded: boolean; receipt_path?: string } {
  try {
    runGit(transaction.repo_root, ['worktree', 'remove', '--force', transaction.worktree_path]);
    writeReceipt(transaction, 'DISCARDED');
    return { discarded: true, receipt_path: transaction.receipt_path };
  } catch {
    try {
      fs.rmSync(transaction.worktree_path, { recursive: true, force: true });
      runGit(transaction.repo_root, ['worktree', 'prune']);
      writeReceipt(transaction, 'DISCARDED_FORCED');
      return { discarded: true, receipt_path: transaction.receipt_path };
    } catch (error) {
      return { discarded: false, receipt_path: (error as Error).message };
    }
  }
}

export interface PromoteOptions {
  /** Must pass before promotion: scope audit + verification + acceptance evidence. */
  pre_promotion_evidence: string[];
  /** Apply as a commit on the canonical branch (default: yes). */
  commit?: boolean;
  message?: string;
}

/**
 * Promote the verified diff into the canonical branch. Refuses without
 * pre-promotion evidence (scope audit, verification, acceptance).
 */
export function promoteWorktreeTransaction(transaction: WorktreeTransaction, diff: WorktreeTransactionDiff, options: PromoteOptions): { promoted: boolean; commit: string | null; reason?: string } {
  if (options.pre_promotion_evidence.length === 0) {
    return { promoted: false, commit: null, reason: 'promotion refused: no pre-promotion evidence (scope audit / verification / acceptance)' };
  }
  if (!diff.dirty) {
    writeReceipt(transaction, 'PROMOTED_EMPTY');
    return { promoted: true, commit: null, reason: 'no diff to promote' };
  }
  const canonicalBranch = runGit(transaction.repo_root, ['symbolic-ref', '--short', 'HEAD']);
  runGit(transaction.repo_root, ['checkout', canonicalBranch]);
  try {
    // Apply the captured diff onto the canonical checkout from a temp patch
    // file (execFileSync cannot pipe stdin).
    const patchFile = path.join(transaction.repo_root, '.agent', 'worktree-transactions', `${transaction.transaction_id}.patch`);
    fs.mkdirSync(path.dirname(patchFile), { recursive: true });
    fs.writeFileSync(patchFile, diff.diff.endsWith('\n') ? diff.diff : `${diff.diff}\n`, 'utf8');
    runGit(transaction.repo_root, ['apply', '--whitespace=nowarn', patchFile]);
    fs.rmSync(patchFile, { force: true });
    const message = options.message ?? `worktree-transaction: ${transaction.transaction_id}`;
    runGit(transaction.repo_root, ['add', '-A']);
    runGit(transaction.repo_root, ['commit', '--quiet', '-m', message]);
    const commit = runGit(transaction.repo_root, ['rev-parse', 'HEAD']);
    writeReceipt(transaction, 'PROMOTED');
    return { promoted: true, commit };
  } catch (error) {
    runGit(transaction.repo_root, ['checkout', '--', '.']);
    return { promoted: false, commit: null, reason: (error as Error).message };
  }
}

function writeReceipt(transaction: WorktreeTransaction, status = 'ACTIVE'): void {
  const receipt = {
    schema: 'agent-rules/worktree-transaction-receipt',
    version: 1,
    transaction_id: transaction.transaction_id,
    worktree_path: transaction.worktree_path,
    repo_root: transaction.repo_root,
    base_commit: transaction.base_commit,
    status,
    created_at: transaction.created_at,
    sha256: '',
  };
  const body = { ...receipt };
  delete (body as Record<string, unknown>).sha256;
  receipt.sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const dir = path.join(transaction.repo_root, '.agent', 'worktree-transactions');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${transaction.transaction_id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  transaction.receipt_path = file;
}

function osTmp(): string {
  return process.platform === 'win32' ? (process.env.LOCALAPPDATA ?? process.cwd()) : '/tmp';
}
