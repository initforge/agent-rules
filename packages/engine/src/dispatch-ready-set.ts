/**
 * dispatch-ready-set.ts — C2 max-useful conflict-free antichain scheduler (AM-0019 §4–§5)
 *
 * Replaces sequential dispatch with a cross-stage typed ready queue. No wave
 * barriers: only unsatisfied HARD / GLOBAL_GATE edges stop successor work.
 * SEMANTIC_CONFLICT edges are not readiness blockers; they are enforced by the
 * lease-conflict check (two tasks conflict iff any conflict domain intersects).
 *
 * Pool ceilings (AM-0019 §5) are enforced here; the absolute child bound reuses
 * the governor's DEFAULT_MAX_PROCESS_CEILING so the process ceiling is never
 * reimplemented.
 */
import { DEPENDENCY_TYPES, type DependencyType, type RecoverableState } from './contracts.js';
import { DEFAULT_MAX_PROCESS_CEILING } from './resource-governor.js';

// ── Pool ceilings (AM-0019 §5 table) ────────────────────────────────────────

export const POOL_CEILINGS = {
  total: 14,
  writers: 8,
  reviewers: 5,
  integration: 1,
  browserDefault: 2,
  browserBurst: 4,
  build: 2,
  compose: 1,
  absoluteMax: DEFAULT_MAX_PROCESS_CEILING,
} as const;

export type PoolKind = 'writer' | 'reviewer' | 'integration' | 'browser' | 'build' | 'compose';
export const POOL_KINDS: readonly PoolKind[] = ['writer', 'reviewer', 'integration', 'browser', 'build', 'compose'];

export const BLOCKING_DEPENDENCY_TYPES: readonly DependencyType[] = ['HARD', 'GLOBAL_GATE'];
export const NONBLOCKING_DEPENDENCY_TYPES = DEPENDENCY_TYPES.filter((t) => !BLOCKING_DEPENDENCY_TYPES.includes(t));

// ── Graph model ─────────────────────────────────────────────────────────────

export interface DependencyEdge { readonly to: string; readonly type: DependencyType; }

/** A schedulable execution node. Deps are typed; lease fields produce conflict domains. */
export interface ExecutionNode {
  readonly id: string;
  /** Pool class used for ceiling accounting; defaults to 'writer'. */
  readonly kind?: PoolKind;
  /** Critical-path distance from graph start (0 = root). Lower dispatches first. */
  readonly rank?: number;
  readonly onCriticalPath?: boolean;
  readonly deps?: readonly DependencyEdge[];
  /** Owned paths/globs — path/glob conflict domain. */
  readonly ownedPaths?: readonly string[];
  /** Public API / schema surfaces (public-api-schema domain). */
  readonly apiSurfaceKeys?: readonly string[];
  /** DB migration revision keys (migration domain). */
  readonly migrationKeys?: readonly string[];
  /** Lockfile keys, e.g. 'package-lock.json' (lockfile domain). */
  readonly lockfileKeys?: readonly string[];
  /** Generated manifest keys, e.g. 'generated/manifest.json' (generated-manifest domain). */
  readonly generatedKeys?: readonly string[];
  /** Port/container/fixture keys (port/container/fixture domain). */
  readonly portKeys?: readonly string[];
  /** Shared data keys (shared-data domain). */
  readonly sharedDataKeys?: readonly string[];
  /** Browser page leases, e.g. 'REF:pair-1' / 'TGT:pair-1' (browser-page-lease domain). */
  readonly browserPages?: readonly string[];
  /** Explicit conflict-domain keys, emitted verbatim (bypasses leaseKey derivation). */
  readonly leaseDomains?: readonly string[];
}

export interface ExecutionGraph { readonly nodes: readonly ExecutionNode[]; }

// ── Runtime state ───────────────────────────────────────────────────────────

export type NodeStatus = 'PENDING' | 'RUNNING' | 'CLOSED' | 'WAITING';

export interface TaskWaitInfo { readonly state: RecoverableState; readonly wake: string; readonly since: string; }

export interface SchedulerState {
  readonly status: Readonly<Record<string, NodeStatus>>;
  /** Wake conditions for WAITING tasks; required for waiting-closure derivation. */
  readonly waiting?: Readonly<Record<string, TaskWaitInfo>>;
}

export interface PoolCeilings {
  total?: number; writers?: number; reviewers?: number; integration?: number;
  browser?: number; build?: number; compose?: number;
}

export interface PoolUsage {
  total: number; writers: number; reviewers: number; integration: number;
  browser: number; build: number; compose: number;
}

export interface WaitingClosureEntry {
  taskId: string;
  wake: string[];
  reason: string;
}

export interface RejectedConflict {
  taskId: string;
  domain: string;
  against: string[];
}

export interface ReadySetInput {
  graph: ExecutionGraph;
  state: SchedulerState;
  /** Task ids currently holding leases/slots (running or READY-but-not-started). */
  running?: readonly string[];
  /** Explicit current usage; when omitted it is derived from running node kinds. */
  usage?: PoolUsage;
  /** Allow browser burst ceiling (4) instead of default (2). */
  browserBurst?: boolean;
  /** Ceiling overrides, e.g. tests with tiny pools. */
  ceilings?: PoolCeilings;
}

export interface ReadySetResult {
  /** Maximum conflict-free antichain ready to dispatch now (ordered, deterministic). */
  ready: string[];
  /** Nonterminal tasks: blocked only by WAITING_* deps, or waiting themselves. */
  waitingClosure: WaitingClosureEntry[];
  /** Pool usage after this dispatch. */
  usage: PoolUsage;
  /** Candidates rejected because their lease conflicts with running or already-selected work. */
  rejectedConflicts: RejectedConflict[];
  /** Candidates deferred purely by pool ceilings. */
  deferredByPool: string[];
}

export const EMPTY_READY_SET: ReadySetResult = {
  ready: [],
  waitingClosure: [],
  usage: { total: 0, writers: 0, reviewers: 0, integration: 0, browser: 0, build: 0, compose: 0 },
  rejectedConflicts: [],
  deferredByPool: [],
};

// ── Path normalization + glob matching ──────────────────────────────────────

function normalizePathKey(value: string): string {
  let p = value.trim().replace(/\\/g, '/');
  while (p.startsWith('/')) p = p.slice(1);
  while (p.endsWith('/')) p = p.slice(0, -1);
  return p.toLowerCase();
}

function pathSegments(value: string): string[] {
  return value.split('/').filter(Boolean);
}

function isGlob(value: string): boolean {
  return /[*?[\]]/.test(value);
}

function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (const ch of glob) {
    if (ch === '*') pattern += '.*';
    else if (ch === '?') pattern += '.';
    else if (ch === '[') pattern += '[';
    else if (ch === ']') pattern += ']';
    else pattern += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

function isPathPrefix(prefix: string, candidate: string): boolean {
  const a = pathSegments(prefix);
  const b = pathSegments(candidate);
  if (a.length === 0 || b.length === 0) return false;
  if (a.length > b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}

// ── Conflict domains ────────────────────────────────────────────────────────

const PATH_PREFIX = 'path:';
const API_PREFIX = 'api:';
const MIGRATION_PREFIX = 'mig:';
const LOCKFILE_PREFIX = 'lock:';
const GENERATED_PREFIX = 'gen:';
const PORT_PREFIX = 'port:';
const SHARED_PREFIX = 'data:';
const BROWSER_PREFIX = 'browser:';

export interface ConflictDomain { readonly key: string; readonly isPath: boolean; }

/**
 * Produce the conflict domain set for a task. Two tasks conflict iff any of
 * their domains intersect (exact match, or path containment / glob match for
 * the path/glob domain).
 */
export function leaseKey(node: ExecutionNode): ConflictDomain[] {
  const domains: ConflictDomain[] = [];
  for (const d of node.leaseDomains ?? []) domains.push({ key: d, isPath: false });
  for (const p of node.ownedPaths ?? []) {
    const key = normalizePathKey(p);
    if (isGlob(key)) domains.push({ key, isPath: true });
    else domains.push({ key: `${PATH_PREFIX}${key}`, isPath: true });
  }
  for (const s of node.apiSurfaceKeys ?? []) domains.push({ key: `${API_PREFIX}${s}`, isPath: false });
  for (const m of node.migrationKeys ?? []) domains.push({ key: `${MIGRATION_PREFIX}${m}`, isPath: false });
  for (const l of node.lockfileKeys ?? []) domains.push({ key: `${LOCKFILE_PREFIX}${l}`, isPath: false });
  for (const g of node.generatedKeys ?? []) domains.push({ key: `${GENERATED_PREFIX}${g}`, isPath: false });
  for (const p of node.portKeys ?? []) domains.push({ key: `${PORT_PREFIX}${p}`, isPath: false });
  for (const s of node.sharedDataKeys ?? []) domains.push({ key: `${SHARED_PREFIX}${s}`, isPath: false });
  for (const b of node.browserPages ?? []) domains.push({ key: `${BROWSER_PREFIX}${b}`, isPath: false });
  return domains;
}

function domainsOverlap(a: ConflictDomain, b: ConflictDomain): boolean {
  if (a.key === b.key) return true;
  if (!a.isPath || !b.isPath) return false;
  const pa = a.key.startsWith(PATH_PREFIX) ? a.key.slice(PATH_PREFIX.length) : a.key;
  const pb = b.key.startsWith(PATH_PREFIX) ? b.key.slice(PATH_PREFIX.length) : b.key;
  if (isGlob(pa) && globToRegExp(pa).test(pb)) return true;
  if (isGlob(pb) && globToRegExp(pb).test(pa)) return true;
  return isPathPrefix(pa, pb) || isPathPrefix(pb, pa);
}

export function leaseSetsOverlap(a: readonly ConflictDomain[], b: readonly ConflictDomain[]): ConflictDomain | null {
  for (const da of a) {
    for (const db of b) {
      if (domainsOverlap(da, db)) return da;
    }
  }
  return null;
}

// ── Ceiling helpers ─────────────────────────────────────────────────────────

function effectiveCeilings(input: ReadySetInput): {
  total: number; writers: number; reviewers: number; integration: number;
  browser: number; build: number; compose: number;
} {
  const c = input.ceilings ?? {};
  return {
    total: Math.min(c.total ?? POOL_CEILINGS.total, POOL_CEILINGS.absoluteMax),
    writers: c.writers ?? POOL_CEILINGS.writers,
    reviewers: c.reviewers ?? POOL_CEILINGS.reviewers,
    integration: c.integration ?? POOL_CEILINGS.integration,
    browser: c.browser ?? (input.browserBurst ? POOL_CEILINGS.browserBurst : POOL_CEILINGS.browserDefault),
    build: c.build ?? POOL_CEILINGS.build,
    compose: c.compose ?? POOL_CEILINGS.compose,
  };
}

function kindOf(node: ExecutionNode | undefined): PoolKind {
  const kind = node?.kind;
  return kind && POOL_KINDS.includes(kind) ? kind : 'writer';
}

const USAGE_KEY: Record<PoolKind, keyof PoolUsage> = {
  writer: 'writers', reviewer: 'reviewers', integration: 'integration',
  browser: 'browser', build: 'build', compose: 'compose',
};

function usageFromRunning(running: readonly string[], nodes: ReadonlyMap<string, ExecutionNode>): PoolUsage {
  const usage = { total: 0, writers: 0, reviewers: 0, integration: 0, browser: 0, build: 0, compose: 0 };
  for (const id of running) {
    usage.total++;
    usage[USAGE_KEY[kindOf(nodes.get(id))]]++;
  }
  return usage;
}

function kindFits(usage: PoolUsage, kind: PoolKind, ceilings: ReturnType<typeof effectiveCeilings>): boolean {
  switch (kind) {
    case 'writer': return usage.writers < ceilings.writers;
    case 'reviewer': return usage.reviewers < ceilings.reviewers;
    case 'integration': return usage.integration < ceilings.integration;
    case 'browser': return usage.browser < ceilings.browser;
    case 'build': return usage.build < ceilings.build;
    case 'compose': return usage.compose < ceilings.compose;
  }
}

function totalFits(usage: PoolUsage, ceilings: ReturnType<typeof effectiveCeilings>): boolean {
  return usage.total < ceilings.total;
}

// ── Readiness ───────────────────────────────────────────────────────────────

function blockingDepsUnmet(node: ExecutionNode, status: Readonly<Record<string, NodeStatus>>): string[] {
  const unmet: string[] = [];
  for (const dep of node.deps ?? []) {
    if (!BLOCKING_DEPENDENCY_TYPES.includes(dep.type)) continue;
    if (status[dep.to] !== 'CLOSED') unmet.push(dep.to);
  }
  return unmet;
}

// ── Core scheduler ──────────────────────────────────────────────────────────

/**
 * Compute the maximum conflict-free ready antichain across the whole graph.
 *
 * - Candidate: status PENDING with no unmet HARD/GLOBAL_GATE edge.
 * - SEMANTIC_CONFLICT and other typed edges never block readiness; the lease
 *   check rejects candidates whose conflict domains intersect running work or
 *   an already-selected candidate.
 * - Critical-path priority: within a rank, critical-path candidates come first;
 *   ranks are processed ascending. Fairness: one candidate per rank per pass
 *   (round-robin), so rank N is never starved while rank N+1 always runs.
 * - Waiting tasks stay scheduled nonterminally: a PENDING task blocked only by
 *   WAITING_* deps, and every WAITING task, is returned in the waiting closure
 *   with its wake conditions.
 */
export function computeReadySet(input: ReadySetInput): ReadySetResult {
  const nodes = new Map<string, ExecutionNode>();
  for (const node of input.graph.nodes) {
    if (nodes.has(node.id)) throw new Error(`computeReadySet: duplicate node ${node.id}`);
    nodes.set(node.id, node);
  }
  for (const id of Object.keys(input.state.status)) {
    if (!nodes.has(id)) throw new Error(`computeReadySet: state references unknown node ${id}`);
  }

  const status = input.state.status;
  const waiting = input.state.waiting ?? {};
  const ceilings = effectiveCeilings(input);
  const usage: PoolUsage = input.usage ?? usageFromRunning(input.running ?? [], nodes);
  const runningDomains: Array<{ id: string; domains: ConflictDomain[] }> = [];
  for (const id of input.running ?? []) {
    const node = nodes.get(id);
    if (!node) continue;
    runningDomains.push({ id, domains: leaseKey(node) });
  }
  for (const node of nodes.values()) {
    if (status[node.id] === 'RUNNING' && !runningDomains.some((r) => r.id === node.id)) {
      runningDomains.push({ id: node.id, domains: leaseKey(node) });
    }
  }

  const waitingClosure: WaitingClosureEntry[] = [];
  const candidates: ExecutionNode[] = [];

  for (const node of nodes.values()) {
    const st = status[node.id];
    if (st === 'CLOSED' || st === 'RUNNING') continue;

    if (st === 'WAITING') {
      const info = waiting[node.id];
      waitingClosure.push({
        taskId: node.id,
        wake: info ? [info.wake] : [],
        reason: info ? `task itself is ${info.state}` : 'task is waiting',
      });
      continue;
    }

    // st === 'PENDING'
    const unmet = blockingDepsUnmet(node, status);
    if (unmet.length > 0) {
      const waitingDeps = unmet.filter((d) => status[d] === 'WAITING');
      if (waitingDeps.length === unmet.length) {
        const wake = [...new Set(waitingDeps.flatMap((d) => waiting[d] ? [waiting[d].wake] : []))];
        waitingClosure.push({
          taskId: node.id,
          wake,
          reason: `blocked by waiting deps: ${waitingDeps.join(', ')}`,
        });
      }
      continue;
    }
    candidates.push(node);
  }

  // Deterministic candidate order: rank asc, critical first, then id.
  const rank = (n: ExecutionNode): number => n.rank ?? 0;
  candidates.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const aCrit = a.onCriticalPath ? 0 : 1;
    const bCrit = b.onCriticalPath ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Group by rank, preserving the within-rank order above.
  const rankGroups: ExecutionNode[][] = [];
  const groupByRank = new Map<number, number>();
  for (const node of candidates) {
    const r = rank(node);
    let idx = groupByRank.get(r);
    if (idx === undefined) {
      idx = rankGroups.length;
      groupByRank.set(r, idx);
      rankGroups.push([]);
    }
    rankGroups[idx].push(node);
  }
  rankGroups.sort((a, b) => rank(a[0]) - rank(b[0]));

  const ready: string[] = [];
  const rejectedConflicts: RejectedConflict[] = [];
  const deferredByPool: string[] = [];
  const selectedDomains: Array<{ id: string; domains: ConflictDomain[] }> = [];
  const selectedIds = new Set<string>();
  const cursor = new Map<number, number>();

  let progress = true;
  while (progress) {
    progress = false;
    for (let g = 0; g < rankGroups.length; g++) {
      const group = rankGroups[g];
      const start = cursor.get(g) ?? 0;
      let i = start;
      for (; i < group.length; i++) {
        const node = group[i];
        if (selectedIds.has(node.id)) continue;
        const domains = leaseKey(node);

        // Conflict check: running leases + already-selected antichain members.
        let conflict: { domain: ConflictDomain; against: string[] } | null = null;
        for (const held of runningDomains) {
          const overlap = leaseSetsOverlap(domains, held.domains);
          if (overlap) { conflict = { domain: overlap, against: [held.id] }; break; }
        }
        if (conflict === null) {
          for (const held of selectedDomains) {
            const overlap = leaseSetsOverlap(domains, held.domains);
            if (overlap) { conflict = { domain: overlap, against: [held.id] }; break; }
          }
        }
        if (conflict) {
          rejectedConflicts.push({ taskId: node.id, domain: conflict.domain.key, against: conflict.against });
          cursor.set(g, i + 1);
          progress = true;
          continue;
        }

        // Pool ceilings.
        const kind = kindOf(node);
        if (!totalFits(usage, ceilings) || !kindFits(usage, kind, ceilings)) {
          deferredByPool.push(node.id);
          cursor.set(g, i + 1);
          progress = true;
          continue;
        }

        // Dispatch.
        ready.push(node.id);
        selectedIds.add(node.id);
        selectedDomains.push({ id: node.id, domains });
        usage.total++;
        usage[USAGE_KEY[kind]]++;
        cursor.set(g, i + 1);
        progress = true;
        break;
      }
      cursor.set(g, i);
    }
  }

  return { ready, waitingClosure, usage, rejectedConflicts, deferredByPool };
}

/** Zero-copy graph helper for callers that hold flat records. */
export function buildGraphFromNodes(nodes: readonly ExecutionNode[]): ExecutionGraph {
  return { nodes };
}
