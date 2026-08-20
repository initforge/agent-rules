/**
 * candidate-epoch.ts — M11-R32 immutable candidate verification (AM-0020 §3).
 *
 * Every final verification cycle binds to a `CandidateEpoch`:
 *   source_tree_sha, candidate_commit_or_tree, artifact_digest,
 *   container_image_digests, dependency_lock_hash, migration_set_hash,
 *   environment_hash, fixture_hash, topology_hash, created_at.
 *
 * - `snapshotCandidateEpoch()` computes the epoch from a git repo. A dirty
 *   worktree is allowed for implementation (`allowDirty: true`) but can never
 *   be the terminal candidate: with `allowDirty: false` it refuses any tracked
 *   change and any untracked/ignored file that matches the build-critical
 *   manifest (gitignored source cannot silently join a candidate).
 * - The candidate identity is a content-addressed snapshot: the Git tree of the
 *   tracked state (temporary-index `read-tree HEAD` + `add -u` + `write-tree`)
 *   or the exact HEAD commit when the worktree is clean.
 * - `candidateEpochHash()` is a deterministic sha256 over the canonical JSON of
 *   the epoch EXCLUDING `created_at` — same candidate content ⇒ same epoch hash.
 * - `bindEvidence()` stamps evidence with the epoch and fails closed when the
 *   evidence predates the epoch unless digest equivalence is demonstrated.
 * - `assertEpochCurrent()` re-derives the current epoch and reports any field
 *   that changed (any source/config/lock/migration change = new epoch).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileTopology, topologyHash, type SystemTopology } from './topology-compiler.js';

export const CANDIDATE_EPOCH_SCHEMA = 'artifact/candidate-epoch/v1';
export const EMPTY_HASH = createHash('sha256').update('').digest('hex');

export interface CandidateEpoch {
  schema: typeof CANDIDATE_EPOCH_SCHEMA;
  /** Git tree sha of the candidate source tree (`HEAD^{tree}` when clean). */
  source_tree_sha: string;
  /** Exact HEAD commit (clean) or the content-addressed Git tree snapshot. */
  candidate_commit_or_tree: string;
  /** Tree digest of the built artifacts (dist). Empty only when not built. */
  artifact_digest: string;
  /** Container image digests — the harness declares none, so honest empty. */
  container_image_digests: string[];
  /** sha256 over every package-lock.json in the repo. */
  dependency_lock_hash: string;
  /** sha256 over migration files; honest empty when none are declared. */
  migration_set_hash: string;
  /** Deterministic subset of the runtime environment (node/platform/env shape). */
  environment_hash: string;
  /** Tree digest of fixture dirs; honest empty when none exist. */
  fixture_hash: string;
  /** C6 topology hash (system-topology.yaml or all-GAP empty topology). */
  topology_hash: string;
  created_at: string;
  /** Manifest of build-critical path patterns used for the untracked check. */
  build_critical_manifest: string[];
  notes: Record<string, string>;
}

export interface SnapshotOptions {
  /** Permit a dirty worktree. The result is informational and never terminal-eligible. */
  allowDirty?: boolean;
  now?: string;
  migrationDirs?: string[];
  fixtureDirs?: string[];
  artifactDirs?: string[];
  topologyPath?: string;
  buildCriticalPatterns?: string[];
  /** JSON file (relative to repoRoot) whose array of globs replaces the defaults. */
  candidateManifest?: string;
}

export class CandidateEpochError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CandidateEpochError';
    this.code = code;
  }
}

export const DEFAULT_BUILD_CRITICAL_PATTERNS: readonly string[] = [
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json',
  'tsconfig*.json', '**/src/**', '**/migrations/**', '**/fixtures/**',
  'system-topology.yaml', '**/*.sql',
];

// ── helpers ──────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function sha256Buf(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return v;
  });
}

interface GitResult { status: number; stdout: string; stderr: string; }
function git(args: string[], cwd: string, opts: { env?: NodeJS.ProcessEnv } = {}): GitResult {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: opts.env });
  if (r.error) throw new CandidateEpochError('GIT_SPAWN', `could not execute git: ${r.error.message}`);
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Deterministic glob → regex supporting `**`, `*`, `?`. */
export function globToRegExp(glob: string): RegExp {
  let out = '^';
  let i = 0;
  const n = glob.length;
  while (i < n) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 3; }
        else { out += '.*'; i += 2; }
      } else { out += '[^/]*'; i += 1; }
    } else if (c === '?') { out += '[^/]'; i += 1; }
    else if (c === '.') { out += '\\.'; i += 1; }
    else { out += c.replace(/[|\\{}()[\]^$+*]/g, '\\$&'); i += 1; }
  }
  out += '$';
  return new RegExp(out);
}

function matchesAny(patterns: readonly string[], p: string): boolean {
  return patterns.some((pat) => {
    const re = globToRegExp(pat);
    return re.test(p) || re.test(`${p}/**`);
  });
}

const REPO_SKIP = new Set(['.git', 'node_modules', 'dist', 'generated', 'coverage', '.worktrees', 'scratch', 'tmp']);
const DIR_SKIP = new Set(['.git', 'node_modules']);

/** Recursive deterministic file walk. Symlinks are skipped (never content). */
function walkFiles(root: string, skipDirs: ReadonlySet<string> = DIR_SKIP): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue;
        visit(p);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  };
  visit(root);
  return out;
}

function dirTreeHash(dir: string): string {
  const entries = walkFiles(dir)
    .map((p) => `${path.relative(dir, p).split(path.sep).join('/')}\0${sha256Buf(fs.readFileSync(p))}`)
    .sort();
  return sha256(entries.join('\n'));
}

function hashPairs(pairs: ReadonlyArray<readonly [string, string]>): string {
  return sha256(pairs.map(([k, v]) => `${k}\0${v}`).sort().join('\n'));
}

function relShaPairs(root: string, files: string[]): Array<[string, string]> {
  return files.map((p) => [path.relative(root, p).split(path.sep).join('/'), sha256Buf(fs.readFileSync(p))] as [string, string]);
}

function dependencyLockHash(root: string): { hash: string; note: string } {
  const files = walkFiles(root, REPO_SKIP).filter((p) => path.basename(p) === 'package-lock.json');
  if (files.length === 0) return { hash: EMPTY_HASH, note: 'no package-lock.json found' };
  const pairs = relShaPairs(root, files);
  return { hash: hashPairs(pairs), note: `${files.length} package-lock.json(s)` };
}

function migrationSetHash(root: string, dirs?: string[]): { hash: string; note: string } {
  let files: string[] = [];
  if (dirs) {
    for (const d of dirs) {
      const p = path.resolve(root, d);
      if (fs.existsSync(p)) files = files.concat(walkFiles(p, REPO_SKIP));
    }
  } else {
    files = walkFiles(root, REPO_SKIP).filter((p) => p.split(path.sep).includes('migrations'));
  }
  if (files.length === 0) return { hash: EMPTY_HASH, note: 'no migrations declared' };
  const pairs = relShaPairs(root, files);
  return { hash: hashPairs(pairs), note: `${files.length} migration file(s)` };
}

function fixtureHash(root: string, dirs?: string[]): { hash: string; note: string } {
  const candidates = dirs ?? ['packages/engine/test/fixtures', 'test/fixtures'];
  const found = candidates.filter((d) => fs.existsSync(path.resolve(root, d)));
  if (found.length === 0) return { hash: EMPTY_HASH, note: 'no fixture dir found' };
  const pairs = found.map((d) => [d, dirTreeHash(path.resolve(root, d))] as [string, string]);
  return { hash: hashPairs(pairs), note: found.join(', ') };
}

function artifactDigest(root: string, dirs?: string[]): { hash: string; note: string } {
  const candidates = dirs ?? ['packages/engine/dist', 'packages/cli/dist', 'packages/control-plane/dist'];
  const found = candidates.filter((d) => fs.existsSync(path.resolve(root, d)));
  if (found.length === 0) return { hash: EMPTY_HASH, note: 'no built dist found' };
  const pairs = found.map((d) => [d, dirTreeHash(path.resolve(root, d))] as [string, string]);
  return { hash: hashPairs(pairs), note: found.join(', ') };
}

function environmentHash(): string {
  const shape = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    env: { NODE_ENV: process.env.NODE_ENV ?? null, CI: process.env.CI ?? null },
  };
  return sha256(canonicalJson(shape));
}

function resolveTopologyHash(root: string, given?: string): { hash: string; note: string } {
  let file: string | null = null;
  if (given) {
    const p = path.resolve(root, given);
    if (fs.existsSync(p)) file = p;
  } else {
    const direct = path.join(root, 'system-topology.yaml');
    if (fs.existsSync(direct)) file = direct;
    else {
      const plans = path.join(root, '.agent', 'plans');
      if (fs.existsSync(plans)) {
        for (const d of fs.readdirSync(plans).reverse()) {
          const p = path.join(plans, d, 'system-topology.yaml');
          if (fs.existsSync(p)) { file = p; break; }
        }
      }
    }
  }
  if (file) return { hash: topologyHash(compileTopology(fs.readFileSync(file, 'utf8')).topology), note: path.relative(root, file) };
  return { hash: topologyHash(compileTopology('').topology), note: 'no system-topology.yaml — compiled all-GAP empty topology' };
}

interface GitStatus { tracked: string[]; untracked: string[]; ignored: string[]; }
function gitStatus(repoRoot: string): GitStatus {
  const r = git(['status', '--porcelain=v1', '--untracked-files=all', '--ignored'], repoRoot);
  if (r.status !== 0) throw new CandidateEpochError('GIT_STATUS', `git status failed: ${r.stderr.trim()}`);
  const tracked: string[] = [];
  const untracked: string[] = [];
  const ignored: string[] = [];
  for (const line of r.stdout.split('\n')) {
    if (line.trim().length === 0) continue;
    if (line.startsWith('?? ')) untracked.push(line.slice(3));
    else if (line.startsWith('!! ')) ignored.push(line.slice(3));
    else tracked.push(line.slice(3).trim());
  }
  return { tracked, untracked, ignored };
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

// ── public API ───────────────────────────────────────────────────────────

/**
 * Snapshot the candidate epoch for `repoRoot`.
 *
 * Terminal candidates (`allowDirty: false`, the default) are REFUSED when the
 * worktree has tracked changes or when any untracked/ignored file matches the
 * build-critical manifest. `allowDirty: true` is informational only: the tree
 * snapshots the tracked state via a temporary index and build-critical
 * untracked files are recorded in notes (never silently included).
 */
export function snapshotCandidateEpoch(repoRoot: string, opts: SnapshotOptions = {}): CandidateEpoch {
  const root = fs.realpathSync(repoRoot);
  const headRes = git(['rev-parse', '--verify', 'HEAD'], root);
  if (headRes.status !== 0) throw new CandidateEpochError('NO_HEAD', 'candidate epoch requires a committed HEAD in the repository');
  const head = headRes.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new CandidateEpochError('BAD_HEAD', `unexpected HEAD sha: ${head.slice(0, 12)}`);

  let patterns: string[] = [...DEFAULT_BUILD_CRITICAL_PATTERNS];
  if (opts.candidateManifest) {
    const manifestPath = path.resolve(root, opts.candidateManifest);
    if (fs.existsSync(manifestPath)) {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
      if (!Array.isArray(raw) || raw.some((p) => typeof p !== 'string')) {
        throw new CandidateEpochError('BAD_MANIFEST', `candidate manifest ${opts.candidateManifest} must be a string array of glob patterns`);
      }
      patterns = raw;
    }
  }
  if (opts.buildCriticalPatterns?.length) patterns = [...new Set([...patterns, ...opts.buildCriticalPatterns])];
  patterns.sort();

  const status = gitStatus(root);
  const critical = [...status.untracked, ...status.ignored]
    .map(stripTrailingSlash)
    .filter((p) => matchesAny(patterns, p));
  const dirtyTracked = status.tracked.length > 0;

  if (!opts.allowDirty) {
    if (dirtyTracked) {
      throw new CandidateEpochError('DIRTY_TRACKED', `DIRTY_TRACKED: terminal candidate refused: ${status.tracked.length} tracked change(s) — ${status.tracked.slice(0, 8).join(', ')}${status.tracked.length > 8 ? ', …' : ''}`);
    }
    if (critical.length > 0) {
      throw new CandidateEpochError('UNTRACKED_BUILD_CRITICAL', `UNTRACKED_BUILD_CRITICAL: terminal candidate refused: build-critical file(s) not tracked — ${critical.slice(0, 8).join(', ')}${critical.length > 8 ? ', …' : ''} (manifest: ${patterns.join(',')})`);
    }
  }

  const notes: Record<string, string> = {};
  if (critical.length > 0) notes.untracked_build_critical = critical.slice(0, 16).join(', ');

  // Content-addressed snapshot: clean ⇒ exact HEAD tree + commit; dirty ⇒
  // temporary-index tree of the tracked state (untracked files never silently
  // join the candidate — terminal refuses them via the manifest above).
  let source_tree_sha: string;
  let candidate_commit_or_tree: string;
  if (!dirtyTracked && critical.length === 0) {
    const tree = git(['rev-parse', 'HEAD^{tree}'], root);
    if (tree.status !== 0) throw new CandidateEpochError('NO_TREE', `cannot resolve HEAD tree: ${tree.stderr.trim()}`);
    source_tree_sha = tree.stdout.trim();
    candidate_commit_or_tree = head;
  } else {
    const tmpIdx = path.join(os.tmpdir(), `candidate-epoch-idx-${process.pid}-${Date.now()}`);
    try {
      const env = { ...process.env, GIT_INDEX_FILE: tmpIdx };
      for (const args of [['read-tree', 'HEAD'], ['add', '-u']]) {
        const r = git(args, root, { env });
        if (r.status !== 0) throw new CandidateEpochError('GIT_SNAPSHOT', `git ${args.join(' ')} failed: ${r.stderr.trim()}`);
      }
      const wt = git(['write-tree'], root, { env });
      if (wt.status !== 0) throw new CandidateEpochError('GIT_SNAPSHOT', `git write-tree failed: ${wt.stderr.trim()}`);
      source_tree_sha = wt.stdout.trim();
      candidate_commit_or_tree = source_tree_sha;
      notes.dirty_snapshot = 'tracked working-tree state snapshotted as a Git tree object (temporary index)';
    } finally {
      fs.rmSync(tmpIdx, { force: true });
    }
  }

  const locks = dependencyLockHash(root);
  const migrations = migrationSetHash(root, opts.migrationDirs);
  const fixtures = fixtureHash(root, opts.fixtureDirs);
  const topo = resolveTopologyHash(root, opts.topologyPath);
  const artifacts = artifactDigest(root, opts.artifactDirs);

  const epoch: CandidateEpoch = {
    schema: CANDIDATE_EPOCH_SCHEMA,
    source_tree_sha,
    candidate_commit_or_tree,
    artifact_digest: artifacts.hash,
    container_image_digests: [],
    dependency_lock_hash: locks.hash,
    migration_set_hash: migrations.hash,
    environment_hash: environmentHash(),
    fixture_hash: fixtures.hash,
    topology_hash: topo.hash,
    created_at: opts.now ?? new Date().toISOString(),
    build_critical_manifest: patterns,
    notes: {
      dependency_lock: locks.note,
      migrations: migrations.note,
      fixtures: fixtures.note,
      topology: topo.note,
      artifacts: artifacts.note,
      containers: 'no container images declared in harness',
      ...notes,
    },
  };
  return epoch;
}

/**
 * Deterministic content hash of the epoch. `created_at` is provenance, not
 * content: the same candidate tree always yields the same epoch hash.
 */
export function candidateEpochHash(epoch: CandidateEpoch): string {
  const { created_at: _created, ...content } = epoch;
  return sha256(canonicalJson(content));
}

export interface EvidenceBinding {
  bound: boolean;
  reason: string;
  record: Record<string, unknown>;
}

/**
 * Stamp evidence with the candidate epoch and enforce the freshness rule
 * (AM-0020 §3): evidence produced before the epoch cannot bind unless its
 * artifact digest demonstrates equivalence with the epoch's artifact.
 */
export function bindEvidence(evidence: Record<string, unknown>, epoch: CandidateEpoch, now = new Date().toISOString()): EvidenceBinding {
  const record = { ...evidence, candidate_epoch: epoch, candidate_epoch_hash: candidateEpochHash(epoch), bound_at: now };
  const at = evidenceTimeMs(evidence);
  if (at === undefined) {
    return { bound: false, reason: 'evidence carries no parseable creation timestamp (finished_at/created_at/observed_at/started_at) — cannot prove freshness', record };
  }
  if (at >= Date.parse(epoch.created_at)) {
    return { bound: true, reason: `evidence produced at ${new Date(at).toISOString()} — at/after epoch ${epoch.created_at}`, record };
  }
  const digests = [
    ...(typeof evidence.artifact_digest === 'string' ? [evidence.artifact_digest] : []),
    ...(Array.isArray(evidence.raw_artifact_hashes) ? evidence.raw_artifact_hashes.filter((d): d is string => typeof d === 'string') : []),
  ];
  if (epoch.artifact_digest !== '' && digests.includes(epoch.artifact_digest)) {
    return { bound: true, reason: `evidence predates epoch but digest equivalence demonstrated via ${epoch.artifact_digest.slice(0, 12)}`, record };
  }
  return { bound: false, reason: `evidence created before candidate epoch (${epoch.created_at}) and no artifact digest equivalence`, record };
}

function evidenceTimeMs(e: Record<string, unknown>): number | undefined {
  for (const k of ['finished_at', 'created_at', 'observed_at', 'started_at']) {
    const v = e[k];
    if (typeof v === 'string') { const t = Date.parse(v); if (!Number.isNaN(t)) return t; }
    if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
  }
  return undefined;
}

export interface EpochCurrency {
  current: boolean;
  changed: string[];
  currentHash: string;
}

/**
 * Re-derive the current epoch and fail when any content field changed.
 * Any source/config/lockfile/migration/runner/tool change ⇒ a new epoch.
 */
export function assertEpochCurrent(epoch: CandidateEpoch, repoRoot: string): EpochCurrency {
  const now = snapshotCandidateEpoch(repoRoot, { allowDirty: true });
  const fields = [
    'schema', 'source_tree_sha', 'candidate_commit_or_tree', 'artifact_digest',
    'container_image_digests', 'dependency_lock_hash', 'migration_set_hash',
    'environment_hash', 'fixture_hash', 'topology_hash',
  ] as const;
  const changed = fields.filter((f) => JSON.stringify(epoch[f]) !== JSON.stringify(now[f]));
  return { current: changed.length === 0, changed, currentHash: candidateEpochHash(now) };
}
