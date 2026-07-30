#!/usr/bin/env node
/**
 * Read-only Git workspace inventory.
 *
 * The only write performed by this program is the explicitly requested output
 * file.  It deliberately does not run any Git command which can mutate refs,
 * indexes, worktrees, or stashes.
 */
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readlink, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CLASSIFICATION = 'PENDING_REVIEW';

function usage(message) {
  if (message) process.stderr.write(`error: ${message}\n`);
  process.stderr.write('usage: node automation/inventory-worktree-candidates.mjs --repo <git-repository> --output <inventory.json>\n');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--repo' && argument !== '--output') throw new Error(`unknown argument: ${argument}`);
    if (values[argument]) throw new Error(`duplicate argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
    values[argument] = value;
    index += 1;
  }
  if (!values['--repo'] || !values['--output']) throw new Error('--repo and --output are required');
  return { repo: path.resolve(values['--repo']), output: path.resolve(values['--output']) };
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'buffer' });
  if (result.error) throw new Error(`could not execute git: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8').trim()}`);
  }
  return result;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function lines(value) {
  return value.toString('utf8').split('\n').filter(Boolean);
}

function parseWorktrees(value) {
  const records = [];
  let current = null;
  for (const line of lines(value)) {
    if (line.startsWith('worktree ')) {
      if (current) records.push(current);
      current = { path: line.slice('worktree '.length) };
    } else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) current.branchRef = line.slice(7);
    else if (line === 'detached') current.detached = true;
  }
  if (current) records.push(current);
  return records.sort((left, right) => compareText(left.path, right.path));
}

function parseStatus(buffer) {
  const fields = buffer.toString('utf8').split('\0');
  const entries = [];
  for (let index = 0; index < fields.length - 1; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const code = field.slice(0, 2);
    const filePath = field.slice(3);
    // In -z mode renamed/copied entries have a second, original path field.
    const originalPath = (code[0] === 'R' || code[0] === 'C' || code[1] === 'R' || code[1] === 'C')
      ? fields[++index]
      : undefined;
    entries.push(originalPath === undefined ? { code, path: filePath } : { code, path: filePath, original_path: originalPath });
  }
  return entries.sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));
}

async function contentAddressedUntracked(worktree, statusEntries) {
  const entries = [];
  for (const entry of statusEntries.filter((candidate) => candidate.code === '??')) {
    const relative = entry.path;
    const absolute = path.resolve(worktree, relative);
    if (path.relative(worktree, absolute).startsWith(`..${path.sep}`) || path.isAbsolute(path.relative(worktree, absolute))) {
      throw new Error(`Git reported an untracked path outside worktree: ${relative}`);
    }
    const stat = await lstat(absolute);
    if (stat.isFile()) {
      const contents = await readFile(absolute);
      entries.push({ path: relative, kind: 'file', sha256: sha256(contents) });
    } else if (stat.isSymbolicLink()) {
      const target = await readlink(absolute);
      entries.push({ path: relative, kind: 'symlink', sha256: sha256(Buffer.from(target, 'utf8')) });
    } else {
      entries.push({ path: relative, kind: 'other', sha256: sha256(Buffer.alloc(0)) });
    }
  }
  return entries.sort((left, right) => compareText(left.path, right.path));
}

function dirtyFingerprint(worktree, statusEntries, untracked) {
  const hash = createHash('sha256');
  // Binary diffs distinguish different contents with the same porcelain status.
  // `--no-ext-diff` keeps this independent from a caller's Git configuration.
  for (const [label, value] of [
    ['status', Buffer.from(JSON.stringify(statusEntries), 'utf8')],
    ['worktree-diff', git(worktree, ['diff', '--binary', '--no-ext-diff', 'HEAD']).stdout],
    ['index-diff', git(worktree, ['diff', '--cached', '--binary', '--no-ext-diff', 'HEAD']).stdout],
    ['untracked', Buffer.from(JSON.stringify(untracked), 'utf8')],
  ]) {
    hash.update(label).update('\0').update(value).update('\0');
  }
  return hash.digest('hex');
}

async function inspectWorktree(record) {
  const worktree = await realpath(record.path);
  const head = git(worktree, ['rev-parse', 'HEAD']).stdout.toString('utf8').trim();
  const tree = git(worktree, ['rev-parse', 'HEAD^{tree}']).stdout.toString('utf8').trim();
  const branch = record.branchRef ? record.branchRef.replace(/^refs\/heads\//, '') : null;
  const statusEntries = parseStatus(git(worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).stdout);
  const untracked = await contentAddressedUntracked(worktree, statusEntries);
  return {
    path: worktree,
    branch,
    head,
    tree,
    dirty_fingerprint: dirtyFingerprint(worktree, statusEntries, untracked),
    status: statusEntries,
    untracked,
    classification: CLASSIFICATION,
  };
}

function inspectBranches(repo) {
  const format = '%(refname)%00%(objectname)%00';
  const output = git(repo, ['for-each-ref', '--sort=refname', `--format=${format}`, 'refs/heads']).stdout.toString('utf8');
  const fields = output.split('\0');
  const branches = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const ref = fields[index].trim();
    const head = fields[index + 1].trim();
    if (!ref) continue;
    branches.push({
      name: ref.replace(/^refs\/heads\//, ''),
      head,
      tree: git(repo, ['rev-parse', `${ref}^{tree}`]).stdout.toString('utf8').trim(),
      classification: CLASSIFICATION,
    });
  }
  return branches.sort((left, right) => compareText(left.name, right.name));
}

function inspectStashes(repo) {
  const output = git(repo, ['stash', 'list', '--format=%H%x00%gd%x00%gs%x00']).stdout.toString('utf8');
  const fields = output.split('\0');
  const stashes = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const head = fields[index].trim();
    if (!head) continue;
    stashes.push({
      reference: fields[index + 1],
      message: fields[index + 2],
      head,
      tree: git(repo, ['rev-parse', `${head}^{tree}`]).stdout.toString('utf8').trim(),
      classification: CLASSIFICATION,
    });
  }
  return stashes.sort((left, right) => compareText(left.reference, right.reference));
}

async function atomicWrite(output, inventory) {
  const parent = await realpath(path.dirname(output));
  const destination = path.join(parent, path.basename(output));
  try {
    const existing = await lstat(destination);
    if (existing.isSymbolicLink()) throw new Error(`output path must not be a symlink: ${destination}`);
    if (!existing.isFile()) throw new Error(`output path must be a regular file: ${destination}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const tempDirectory = await mkdtemp(path.join(parent, '.worktree-inventory-'));
  const temporary = path.join(tempDirectory, 'inventory.json');
  try {
    await writeFile(temporary, `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, destination);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const { repo, output } = parseArgs(process.argv.slice(2));
  const canonicalRepo = await realpath(repo);
  git(canonicalRepo, ['rev-parse', '--is-inside-work-tree']);
  const worktreeRecords = parseWorktrees(git(canonicalRepo, ['worktree', 'list', '--porcelain']).stdout);
  const worktrees = await Promise.all(worktreeRecords.map(inspectWorktree));
  const outputInsideWorktree = worktrees.some((entry) => {
    const relative = path.relative(entry.path, output);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
  if (outputInsideWorktree) throw new Error('output path must be outside every inventoried worktree');

  await atomicWrite(output, {
    schema: 'artifact/worktree-inventory',
    version: 1,
    repository: canonicalRepo,
    worktrees,
    branches: inspectBranches(canonicalRepo),
    stashes: inspectStashes(canonicalRepo),
  });
}

main().catch((error) => {
  usage(error instanceof Error ? error.message : String(error));
});
