/**
 * C3 — worktree isolation and rolling integration train (AM-0019 §5).
 *
 * Full worktree lifecycle for the native swarm: immutable integration base
 * epoch, feature branch + isolated worktree, owned-path and semantic-resource
 * leases, release receipts, deterministic rolling integration with stale-review
 * detection. Accepted work merges into the train immediately — no wave barrier.
 *
 * State layout (all under the managed worktree root, default <repo>/.worktrees):
 *   state/leases/<taskId>.lease.json       active lease (owning record)
 *   state/reviews/<taskId>.review.json     review markers (stale-aware)
 *   state/receipts/<taskId>.release.json   release receipt
 *   state/receipts/integration-<ts>.json   integration receipt
 *   state/train-state.json                 rolling train HEAD
 *   worktrees/<taskId>                     isolated worker worktree
 *   train                                  integration train worktree
 *
 * Safety mirrors secure-fs.ts: every path resolves through a SecureFsRoot that
 * rejects absolute input, parent traversal, symlink ancestors escaping the root
 * and branch-name/path escaping. Task ids are validated against a safe charset
 * so they can never reach a git ref or path separator.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { SecureFsRoot } from './secure-fs.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DependencyRankSource = 'declared' | 'execution-graph' | 'default';

export interface WorktreeLeaseInput {
  taskId: string;
  /** Immutable integration base epoch — resolved to a full commit id. */
  baseEpoch: string;
  /** Paths the worker may own, relative to the repository root. */
  ownedPaths: string[];
  /** Semantic-resource leases: public API, schema, migration, lockfile, port… */
  semanticResources: string[];
  /** Execution-graph cluster id (e.g. "C4") for dependency-rank lookup. */
  clusterId?: string;
  /** Explicit dependency rank; overrides execution-graph lookup. */
  dependencyRank?: number;
  provider?: string;
  model?: string;
  effort?: string;
  resourceClass?: string;
  budget?: string;
  expectedDuration?: string;
  deadline?: string;
}

export interface WorktreeLease extends WorktreeLeaseInput {
  schema: 'artifact/worktree-lease';
  branch: string;
  worktreePath: string;
  dependencyRank: number;
  dependencyRankSource: DependencyRankSource;
  createdAt: string;
  state: 'ACTIVE' | 'RELEASED';
  releaseReceiptId?: string;
}

export interface ReleaseReceipt {
  schema: 'artifact/worktree-release';
  taskId: string;
  branch: string;
  baseEpoch: string;
  finalCommit: string;
  diffFingerprint: string;
  exitCodes: number[];
  clean: boolean;
  releasedAt: string;
}

export interface ReviewMarker {
  schema: 'artifact/worktree-review';
  taskId: string;
  reviewedCommit: string;
  reviewer?: string;
  approved: boolean;
  stale: boolean;
  staleReason?: string;
  reviewedAt: string;
}

export interface IntegrationReceipt {
  schema: 'artifact/integration-receipt';
  trainBranch: string;
  baseEpoch: string;
  mergeOrder: string[];
  acceptedCommits: Record<string, string>;
  refused: Array<{ taskId: string; reason: string }>;
  integrationHead: string;
  diffFingerprint: string;
  validation: { ran: boolean; failed: string[] };
  integratedAt: string;
}

export interface TrainState {
  schema: 'artifact/train-state';
  trainBranch: string;
  head: string;
  receiptCount: number;
  lastReceipt?: string;
}

export class WorktreeTrainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorktreeTrainError';
    this.code = code;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertTaskId(taskId: string): void {
  if (!TASK_ID_PATTERN.test(taskId) || taskId === '.' || taskId === '..' || taskId.includes('..')) {
    throw new WorktreeTrainError(
      'INVALID_TASK_ID',
      `task id must match ${TASK_ID_PATTERN} (no separators, traversal, or leading dash): ${JSON.stringify(taskId)}`,
    );
  }
}

function assertStringList(values: unknown[], field: string): void {
  if (!Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
    throw new WorktreeTrainError('INVALID_LEASE', `${field} must be an array of strings`);
  }
}

interface GitResult {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
}

/** Compute a dependency rank for a cluster id from execution-graph.yaml:
 *  longest HARD/SOFT dependency path depth into the cluster. */
export function dependencyRankFromGraph(graphPath: string, clusterId: string): number | null {
  let doc: { stages?: Array<{ id: string }>; edges?: Array<{ from: string; to: string; type: string }> };
  try {
    doc = parseYaml(fs.readFileSync(graphPath, 'utf8')) as typeof doc;
  } catch {
    return null;
  }
  if (!doc || !Array.isArray(doc.stages) || !Array.isArray(doc.edges)) return null;
  const stages = new Set(doc.stages.map((s) => s.id));
  if (!stages.has(clusterId)) return null;
  const edges = doc.edges.filter((e) => stages.has(e.from) && stages.has(e.to) && (e.type === 'HARD' || e.type === 'SOFT'));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const deps = edges.filter((e) => e.to === id).map((e) => e.from);
    const value = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(visit));
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };
  return visit(clusterId);
}

// ─── WorktreeTrain ──────────────────────────────────────────────────────────

export interface WorktreeTrainOptions {
  /** Managed dir for worktrees/state. Default <repo>/.worktrees. */
  worktreeRoot?: string;
  /** Rolling train branch. Default integration/m8-convergence. */
  trainBranch?: string;
  /** Optional pre-accept validation: return false to refuse the task. */
  validate?: (taskId: string, worktreePath: string) => boolean | Promise<boolean>;
}

export class WorktreeTrain {
  readonly repo: string;
  readonly worktreeRoot: string;
  readonly trainBranch: string;
  readonly #root: SecureFsRoot;
  readonly #validate: ((taskId: string, worktreePath: string) => boolean | Promise<boolean>) | undefined;
  readonly #paths = {
    leases: 'state/leases',
    receipts: 'state/receipts',
    reviews: 'state/reviews',
    taskWorktrees: 'worktrees',
    train: 'train',
    trainState: 'state/train-state.json',
  };

  constructor(repoRoot: string, options: WorktreeTrainOptions = {}) {
    this.repo = fs.realpathSync(repoRoot);
    this.trainBranch = options.trainBranch ?? 'integration/m8-convergence';
    this.worktreeRoot = path.resolve(options.worktreeRoot ?? path.join(this.repo, '.worktrees'));
    fs.mkdirSync(this.worktreeRoot, { recursive: true, mode: 0o700 });
    this.#root = new SecureFsRoot(this.worktreeRoot);
    this.#validate = options.validate;
    for (const dir of ['state', this.#paths.leases, this.#paths.receipts, this.#paths.reviews, this.#paths.taskWorktrees]) {
      this.#root.mkdirp(dir, 0o700);
    }
    this.git(['rev-parse', '--is-inside-work-tree']); // fail fast on non-repo root
  }

  // ── Lifecycle: create ────────────────────────────────────────────────

  async createLease(input: WorktreeLeaseInput): Promise<WorktreeLease> {
    assertTaskId(input.taskId);
    assertStringList(input.ownedPaths, 'ownedPaths');
    assertStringList(input.semanticResources, 'semanticResources');
    const leasePath = `${this.#paths.leases}/${input.taskId}.lease.json`;
    if (await this.#root.exists(leasePath)) {
      throw new WorktreeTrainError('LEASE_EXISTS', `task ${input.taskId} already leased`);
    }
    const baseEpoch = this.resolveCommit(input.baseEpoch);
    const branch = `feature/${input.taskId}`;
    if (this.branchExists(branch)) {
      throw new WorktreeTrainError('BRANCH_EXISTS', `branch ${branch} already exists`);
    }
    const worktreePath = this.#root.resolve(`${this.#paths.taskWorktrees}/${input.taskId}`);
    this.git(['worktree', 'add', '-b', branch, worktreePath, baseEpoch]);
    const rank = this.resolveDependencyRank(input);
    const lease: WorktreeLease = {
      schema: 'artifact/worktree-lease',
      taskId: input.taskId,
      baseEpoch,
      ownedPaths: [...input.ownedPaths],
      semanticResources: [...input.semanticResources],
      clusterId: input.clusterId,
      dependencyRank: rank.rank,
      dependencyRankSource: rank.source,
      provider: input.provider,
      model: input.model,
      effort: input.effort,
      resourceClass: input.resourceClass,
      budget: input.budget,
      expectedDuration: input.expectedDuration,
      deadline: input.deadline,
      branch,
      worktreePath,
      createdAt: new Date().toISOString(),
      state: 'ACTIVE',
    };
    await this.#root.atomicWrite(leasePath, Buffer.from(`${JSON.stringify(lease, null, 2)}\n`, 'utf8'));
    return lease;
  }

  // ── Lifecycle: release ───────────────────────────────────────────────

  async release(taskId: string, opts: { exitCodes?: number[] } = {}): Promise<ReleaseReceipt> {
    assertTaskId(taskId);
    const lease = await this.readLease(taskId);
    if (lease.state !== 'ACTIVE') {
      throw new WorktreeTrainError('LEASE_NOT_ACTIVE', `task ${taskId} is not ACTIVE (state=${lease.state})`);
    }
    if (!this.isRegisteredWorktree(lease.worktreePath)) {
      throw new WorktreeTrainError('WORKTREE_MISSING', `worktree for ${taskId} is not registered: ${lease.worktreePath}`);
    }
    const status = this.git(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: lease.worktreePath });
    const clean = status.stdout.toString('utf8').trim().length === 0;
    if (!clean) {
      throw new WorktreeTrainError('WORKTREE_DIRTY', `task ${taskId} worktree is dirty; release refused:\n${status.stdout.toString('utf8')}`);
    }
    const finalCommit = this.git(['rev-parse', 'HEAD'], { cwd: lease.worktreePath }).stdout.toString('utf8').trim();
    const diff = this.git(['diff', '--binary', '--no-ext-diff', lease.baseEpoch, finalCommit]).stdout;
    const receipt: ReleaseReceipt = {
      schema: 'artifact/worktree-release',
      taskId,
      branch: lease.branch,
      baseEpoch: lease.baseEpoch,
      finalCommit,
      diffFingerprint: sha256(diff),
      exitCodes: opts.exitCodes?.length ? opts.exitCodes : [0],
      clean: true,
      releasedAt: new Date().toISOString(),
    };
    await this.#root.atomicWrite(`${this.#paths.receipts}/${taskId}.release.json`, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'));
    this.git(['worktree', 'remove', lease.worktreePath]); // clean verified → no force
    await this.#root.atomicWrite(
      `${this.#paths.leases}/${taskId}.lease.json`,
      Buffer.from(`${JSON.stringify({ ...lease, state: 'RELEASED', releaseReceiptId: taskId }, null, 2)}\n`, 'utf8'),
    );
    return receipt;
  }

  // ── Review markers ───────────────────────────────────────────────────

  async recordReview(taskId: string, opts: { reviewer?: string; approved?: boolean; reviewedCommit?: string } = {}): Promise<ReviewMarker> {
    assertTaskId(taskId);
    const lease = await this.requireActive(taskId);
    const commit = opts.reviewedCommit ?? this.git(['rev-parse', 'HEAD'], { cwd: lease.worktreePath }).stdout.toString('utf8').trim();
    const reviewPath = `${this.#paths.reviews}/${taskId}.review.json`;
    let prior: ReviewMarker | undefined;
    if (await this.#root.exists(reviewPath)) {
      prior = JSON.parse(await this.#root.readUtf8(reviewPath)) as ReviewMarker;
    }
    // Any post-review commit makes the prior review stale (AM-0019 §5).
    const stale = prior !== undefined && prior.reviewedCommit !== commit;
    const marker: ReviewMarker = {
      schema: 'artifact/worktree-review',
      taskId,
      reviewedCommit: commit,
      reviewer: opts.reviewer,
      approved: opts.approved ?? true,
      stale,
      staleReason: stale ? `prior review at ${prior?.reviewedCommit} superseded by ${commit}` : undefined,
      reviewedAt: new Date().toISOString(),
    };
    await this.#root.atomicWrite(reviewPath, Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, 'utf8'));
    return marker;
  }

  /** Returns the current review state for a task. Marks the review stale in
   *  the marker file when a post-review commit exists. */
  async reviewStatus(taskId: string): Promise<{ marker: ReviewMarker | null; head: string; current: boolean }> {
    assertTaskId(taskId);
    const lease = await this.requireActive(taskId);
    const head = this.git(['rev-parse', 'HEAD'], { cwd: lease.worktreePath }).stdout.toString('utf8').trim();
    const reviewPath = `${this.#paths.reviews}/${taskId}.review.json`;
    if (!(await this.#root.exists(reviewPath))) return { marker: null, head, current: false };
    const marker = JSON.parse(await this.#root.readUtf8(reviewPath)) as ReviewMarker;
    const current = marker.reviewedCommit === head;
    if (marker.stale !== !current || (marker.stale && marker.staleReason === undefined)) {
      await this.#root.atomicWrite(
        reviewPath,
        Buffer.from(`${JSON.stringify({ ...marker, stale: !current, staleReason: !current ? `commit after review at ${marker.reviewedCommit}: ${head}` : undefined }, null, 2)}\n`, 'utf8'),
      );
    }
    return { marker, head, current };
  }

  // ── Rolling integration train ────────────────────────────────────────

  async integrate(taskIds: string[], opts: { allowUnreviewed?: boolean } = {}): Promise<IntegrationReceipt> {
    if (taskIds.length === 0) {
      throw new WorktreeTrainError('NO_TASKS', 'integrate requires at least one task id');
    }
    const entries: Array<{ id: string; lease: WorktreeLease }> = [];
    for (const id of taskIds) {
      assertTaskId(id);
      entries.push({ id, lease: await this.requireActive(id) });
    }

    for (const { id } of entries) {
      const review = await this.reviewStatus(id);
      if (review.marker && !review.current) {
        throw new WorktreeTrainError('STALE_REVIEW', `task ${id}: commit after review at ${review.marker.reviewedCommit} — review is stale`);
      }
      if (!review.marker && !opts.allowUnreviewed) {
        throw new WorktreeTrainError('NO_REVIEW', `task ${id} has no review marker; record a review or pass allowUnreviewed`);
      }
    }

    // Ensure the train branch + dedicated train worktree exist.
    const repoHead = this.git(['rev-parse', 'HEAD']).stdout.toString('utf8').trim();
    if (!this.branchExists(this.trainBranch)) this.git(['branch', this.trainBranch, repoHead]);
    const trainPath = this.#root.resolve(this.#paths.train);
    if (!this.isRegisteredWorktree(trainPath)) {
      this.git(['worktree', 'add', '-B', this.trainBranch, trainPath, this.trainBranch]);
    }

    // Deterministic merge order: epoch ordinal (commit reachability count),
    // then dependency rank, then id. SHA lexicographic order is NOT
    // chronological, so epochs are ranked by `git rev-list --count`.
    const ordered = [...entries].sort((a, b) =>
      this.epochOrdinal(a.lease.baseEpoch) - this.epochOrdinal(b.lease.baseEpoch) ||
      a.lease.dependencyRank - b.lease.dependencyRank ||
      compareText(a.id, b.id),
    );

    let trainHead = this.git(['rev-parse', 'HEAD'], { cwd: trainPath }).stdout.toString('utf8').trim();
    const baseEpoch = trainHead;
    const accepted: Record<string, string> = {};
    const mergeOrder: string[] = [];
    const refused: Array<{ taskId: string; reason: string }> = [];
    const validationFailures: string[] = [];

    for (const { id, lease } of ordered) {
      if (!this.isRegisteredWorktree(lease.worktreePath)) {
        refused.push({ taskId: id, reason: 'WORKTREE_MISSING' });
        continue;
      }
      // Rebase accepted branch onto the current train head (rolling).
      if (!this.isAncestor(lease.branch, trainHead)) {
        const rebase = this.git(['rebase', trainHead], { cwd: lease.worktreePath, allowFailure: true });
        if (rebase.status !== 0) {
          this.git(['rebase', '--abort'], { cwd: lease.worktreePath, allowFailure: true });
          refused.push({ taskId: id, reason: 'REBASE_CONFLICT' });
          continue;
        }
      }
      // Validate build/typecheck before accepting.
      if (this.#validate) {
        let ok = false;
        try {
          ok = await this.#validate(id, lease.worktreePath);
        } catch (error) {
          validationFailures.push(id);
          refused.push({ taskId: id, reason: `VALIDATE_ERROR: ${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
        if (!ok) {
          validationFailures.push(id);
          refused.push({ taskId: id, reason: 'VALIDATE_FAILED' });
          continue;
        }
      }
      const merged = this.git(['merge', '--no-ff', '--no-edit', lease.branch], { cwd: trainPath, allowFailure: true });
      if (merged.status !== 0) {
        this.git(['merge', '--abort'], { cwd: trainPath, allowFailure: true });
        refused.push({ taskId: id, reason: 'MERGE_CONFLICT' });
        continue;
      }
      const newHead = this.git(['rev-parse', 'HEAD'], { cwd: trainPath }).stdout.toString('utf8').trim();
      accepted[id] = newHead;
      mergeOrder.push(id);
      trainHead = newHead;
    }

    const diff = this.git(['diff', '--binary', '--no-ext-diff', baseEpoch, trainHead]).stdout;
    const receipt: IntegrationReceipt = {
      schema: 'artifact/integration-receipt',
      trainBranch: this.trainBranch,
      baseEpoch,
      mergeOrder,
      acceptedCommits: accepted,
      refused,
      integrationHead: trainHead,
      diffFingerprint: sha256(diff),
      validation: { ran: this.#validate !== undefined, failed: validationFailures },
      integratedAt: new Date().toISOString(),
    };
    const receiptPath = `${this.#paths.receipts}/integration-${Date.now()}.json`;
    await this.#root.atomicWrite(receiptPath, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'));
    const previous = await this.readTrainState();
    const trainState: TrainState = {
      schema: 'artifact/train-state',
      trainBranch: this.trainBranch,
      head: trainHead,
      receiptCount: (previous?.receiptCount ?? 0) + 1,
      lastReceipt: receiptPath,
    };
    await this.#root.atomicWrite(this.#paths.trainState, Buffer.from(`${JSON.stringify(trainState, null, 2)}\n`, 'utf8'));
    return receipt;
  }

  // ── Read-only queries ────────────────────────────────────────────────

  async listActive(): Promise<WorktreeLease[]> {
    const leases: WorktreeLease[] = [];
    const entries = await this.#root.readdir(this.#paths.leases);
    for (const name of entries.sort()) {
      if (!name.endsWith('.lease.json')) continue;
      const lease = JSON.parse(await this.#root.readUtf8(`${this.#paths.leases}/${name}`)) as WorktreeLease;
      if (lease.state === 'ACTIVE') leases.push(lease);
    }
    return leases;
  }

  async readLease(taskId: string): Promise<WorktreeLease> {
    assertTaskId(taskId);
    const leasePath = `${this.#paths.leases}/${taskId}.lease.json`;
    if (!(await this.#root.exists(leasePath))) {
      throw new WorktreeTrainError('LEASE_MISSING', `no lease for task ${taskId}`);
    }
    return JSON.parse(await this.#root.readUtf8(leasePath)) as WorktreeLease;
  }

  async readTrainState(): Promise<TrainState | null> {
    if (!(await this.#root.exists(this.#paths.trainState))) return null;
    return JSON.parse(await this.#root.readUtf8(this.#paths.trainState)) as TrainState;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async requireActive(taskId: string): Promise<WorktreeLease> {
    const lease = await this.readLease(taskId);
    if (lease.state !== 'ACTIVE') {
      throw new WorktreeTrainError('LEASE_NOT_ACTIVE', `task ${taskId} is not ACTIVE (state=${lease.state})`);
    }
    return lease;
  }

  private git(args: string[], opts: { cwd?: string; allowFailure?: boolean } = {}): GitResult {
    const cwd = opts.cwd ?? this.repo;
    const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'buffer' });
    if (result.error) throw new WorktreeTrainError('GIT_SPAWN', `could not execute git: ${result.error.message}`);
    if (result.status !== 0 && !opts.allowFailure) {
      throw new WorktreeTrainError('GIT_FAILED', `git ${args.join(' ')} failed: ${result.stderr.toString('utf8').trim()}`);
    }
    return { status: result.status ?? -1, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
  }

  private resolveCommit(rev: string): string {
    const result = this.git(['rev-parse', '--verify', `${rev}^{commit}`], { allowFailure: true });
    if (result.status !== 0) {
      throw new WorktreeTrainError('BAD_EPOCH', `cannot resolve base epoch commit: ${rev}`);
    }
    return result.stdout.toString('utf8').trim();
  }

  private branchExists(branch: string): boolean {
    const result = this.git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true });
    return result.status === 0;
  }

  private isAncestor(ancestor: string, descendant: string): boolean {
    return this.git(['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true }).status === 0;
  }

  /** Deterministic commit ordinal: number of commits reachable from `rev`
   *  (later linear commits have strictly larger counts). */
  private epochOrdinal(rev: string): number {
    const result = this.git(['rev-list', '--count', rev], { allowFailure: true });
    if (result.status !== 0) return 0;
    const parsed = parseInt(result.stdout.toString('utf8').trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isRegisteredWorktree(worktreePath: string): boolean {
    const output = this.git(['worktree', 'list', '--porcelain']).stdout.toString('utf8');
    return output.split('\n').some((line) => line.startsWith('worktree ') && line.slice('worktree '.length) === worktreePath);
  }

  private resolveDependencyRank(input: WorktreeLeaseInput): { rank: number; source: DependencyRankSource } {
    if (input.dependencyRank !== undefined) return { rank: input.dependencyRank, source: 'declared' };
    if (input.clusterId !== undefined) {
      const graphPath = this.findExecutionGraph();
      if (graphPath) {
        const rank = dependencyRankFromGraph(graphPath, input.clusterId);
        if (rank !== null) return { rank, source: 'execution-graph' };
      }
    }
    return { rank: 0, source: 'default' };
  }

  private findExecutionGraph(): string | null {
    const planDir = path.join(this.repo, '.agent', 'plans');
    if (!fs.existsSync(planDir)) return null;
    for (const entry of fs.readdirSync(planDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(planDir, entry.name, 'execution-graph.yaml');
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
}
