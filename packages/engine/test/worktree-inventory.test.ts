import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const SCRIPT = fileURLToPath(new URL('../../../automation/inventory-worktree-candidates.mjs', import.meta.url));
const SCHEMA = JSON.parse(readFileSync(fileURLToPath(new URL('../../../schemas/worktree-inventory.schema.json', import.meta.url)), 'utf8')) as object;

let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'worktree-inventory-test-'));
});

afterEach(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

function command(cwd: string, executable: string, arguments_: string[]): string {
  return execFileSync(executable, arguments_, { cwd, encoding: 'utf8' });
}

function git(cwd: string, ...arguments_: string[]): string {
  return command(cwd, 'git', arguments_);
}

function createRepository(): { repo: string; worktree: string } {
  const repo = path.join(temporaryRoot, 'repository');
  git(temporaryRoot, 'init', '--initial-branch=main', repo);
  git(repo, 'config', 'user.name', 'Inventory Test');
  git(repo, 'config', 'user.email', 'inventory@example.test');
  writeFileSync(path.join(repo, 'tracked.txt'), 'base\n');
  git(repo, 'add', 'tracked.txt');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'branch', 'candidate');
  const worktree = path.join(temporaryRoot, 'candidate-worktree');
  git(repo, 'worktree', 'add', worktree, 'candidate');
  return { repo, worktree };
}

function runInventory(repo: string, output: string): void {
  command(temporaryRoot, process.execPath, [SCRIPT, '--repo', repo, '--output', output]);
}

describe('worktree candidate inventory', () => {
  it('deterministically inventories worktrees, local branches, and stashes without Git side effects', () => {
    const { repo, worktree } = createRepository();
    writeFileSync(path.join(worktree, 'tracked.txt'), 'changed\n');
    writeFileSync(path.join(worktree, 'new file.txt'), 'untracked content\n');
    writeFileSync(path.join(repo, 'stash-me.txt'), 'stash content\n');
    git(repo, 'add', 'stash-me.txt');
    git(repo, 'stash', 'push', '-m', 'inventory fixture');

    const output = path.join(temporaryRoot, 'inventory.json');
    const beforeStatus = git(repo, 'status', '--porcelain=v1');
    const beforeStashes = git(repo, 'stash', 'list');
    runInventory(repo, output);
    const first = readFileSync(output, 'utf8');
    runInventory(repo, output);
    const second = readFileSync(output, 'utf8');

    expect(second).toBe(first);
    expect(git(repo, 'status', '--porcelain=v1')).toBe(beforeStatus);
    expect(git(repo, 'stash', 'list')).toBe(beforeStashes);

    const inventory = JSON.parse(first) as {
      schema: string;
      worktrees: Array<{ path: string; branch: string | null; head: string; tree: string; dirty_fingerprint: string; classification: string; untracked: Array<{ path: string; sha256: string }> }>;
      branches: Array<{ name: string; classification: string }>;
      stashes: Array<{ reference: string; message: string; classification: string }>;
    };
    const validate = new Ajv2020({ strict: true }).compile(SCHEMA);
    expect(validate(inventory), JSON.stringify(validate.errors)).toBe(true);
    expect(inventory.schema).toBe('artifact/worktree-inventory');
    expect(inventory.worktrees.map((entry) => entry.path)).toEqual([...inventory.worktrees.map((entry) => entry.path)].sort());
    expect(inventory.branches.map((entry) => entry.name)).toEqual(['candidate', 'main']);
    expect(inventory.branches.every((entry) => entry.classification === 'PENDING_REVIEW')).toBe(true);
    expect(inventory.stashes).toHaveLength(1);
    expect(inventory.stashes[0]).toMatchObject({ reference: 'stash@{0}', message: 'On main: inventory fixture', classification: 'PENDING_REVIEW' });

    const candidate = inventory.worktrees.find((entry) => entry.path === worktree)!;
    expect(candidate).toMatchObject({ branch: 'candidate', classification: 'PENDING_REVIEW' });
    expect(candidate.head).toMatch(/^[a-f0-9]{40}$/);
    expect(candidate.tree).toMatch(/^[a-f0-9]{40}$/);
    expect(candidate.dirty_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate.untracked).toEqual([{ path: 'new file.txt', kind: 'file', sha256: createHash('sha256').update('untracked content\n').digest('hex') }]);
  });

  it('rejects an output path inside an inventoried worktree', () => {
    const { repo } = createRepository();
    expect(() => runInventory(repo, path.join(repo, 'inventory.json'))).toThrow(/outside every inventoried worktree/);
  });
});
