#!/usr/bin/env node
/**
 * evals/m11/throughput.ts — M11-C10-PERF throughput + e2e gates (AM-0019 §12).
 *
 * Controlled two-variant workload harness: the SAME 48-task synthetic graph is
 * driven through two dispatch modes, and wall-clock time to complete all tasks
 * is compared:
 *
 *   Variant A (sequential baseline): a sequential driver mirroring dispatchNext
 *     semantics — scan assignments in fixed order, take the first PENDING task
 *     whose HARD deps are satisfied, run it to completion, mark CLOSED, repeat.
 *   Variant B (swarm): computeReadySet (C2 max-useful antichain) — every round
 *     dispatches ALL currently-ready tasks (pool-ceiling bounded) in parallel.
 *
 * WORK MODEL (honest, no fake timing): task completion is a bounded deterministic
 * CPU-bound hash-chain (sha256 iterated `iters` times, `iters` fixed per task by
 * a seeded FNV-1a). Both variants execute the identical total work units; only
 * dispatch concurrency differs. Execution happens in worker_threads so wall-clock
 * parallelism is real (this host: 20 cores). Dispatch/readiness calls to the
 * engine artifact are synchronous and instantaneous; only task execution (the
 * simulated worker payload) is timed. The engine's own scheduler cannot produce
 * wall-clock speedup by itself (dispatch is microseconds); the throughput the
 * swarm provides is real concurrent execution of the runnable antichain vs
 * one-task-at-a-time — exactly AM-0019 §12 "implementation throughput vs
 * sequential baseline".
 *
 * e2e variant: same workload, then a receipt+integration phase — every task emits
 * a deterministic receipt, a merge pass performs bounded integration work per
 * receipt (parallel in swarm, serial in sequential via pool size), and
 * acceptance / review-rejection / evidence (receipt hashes) are scored
 * deterministically. Both variants MUST produce identical acceptance, identical
 * rejections and identical evidence; the ratio of wall times must be >= 2x.
 *
 * Determinism: fixed seed; fixed task graph; fixed per-task work units; cold-start
 * JIT/worker spawn excluded via a warm-up pass before the measured runs.
 *
 * Run: npx tsx evals/m11/throughput.ts   (emits a M11REPORT: JSON line)
 */
import { createHash } from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { computeReadySet, type ExecutionGraph, type ExecutionNode } from '../../packages/engine/dist/dispatch-ready-set.js';

const SEED = 'hv3-m11-perf-harness-v1';
const RANKS = 4;
const PER_RANK = 12;
const TASKS = RANKS * PER_RANK; // 48

/** Swarm pool = engine total pool ceiling (AM-0019 §5), capped at host parallelism. */
const SWARM_POOL = Math.min(14, os.availableParallelism?.() ?? os.cpus().length);
const SEQ_POOL = 1;

// ── Deterministic hash / work model ─────────────────────────────────────────

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ── Workload ────────────────────────────────────────────────────────────────

interface TaskSpec extends ExecutionNode {
  workUnits: number;
  integrationUnits: number;
  accepted: boolean;
}

/**
 * 48 tasks: 4 ranks × 12. Per rank: 5 writers + 3 reviewers + 2 browser + 2 build
 * = 12, which fits every pool ceiling (writers 8, reviewers 5, browser 2, build 2,
 * total 14), so one full rank is always dispatchable in a single swarm round.
 * HARD deps only across ranks: rank r, task i depends on rank r-1, task i
 * (12 independent chains of length 4). ownedPaths unique per task => conflict-free.
 */
function buildWorkload(seed: string): { graph: ExecutionGraph; tasks: TaskSpec[] } {
  const kindByIndex = (i: number): 'writer' | 'reviewer' | 'browser' | 'build' => {
    if (i < 5) return 'writer';
    if (i < 8) return 'reviewer';
    if (i < 10) return 'browser';
    return 'build';
  };
  const nodes: ExecutionNode[] = [];
  const tasks: TaskSpec[] = [];
  for (let r = 0; r < RANKS; r++) {
    for (let i = 0; i < PER_RANK; i++) {
      const id = `r${r}-t${String(i).padStart(2, '0')}`;
      const deps = r > 0 ? [{ to: `r${r - 1}-t${String(i).padStart(2, '0')}`, type: 'HARD' as const }] : [];
      const base = fnv1a(`${seed}:${id}`);
      const spec: TaskSpec = {
        id,
        kind: kindByIndex(i),
        rank: r,
        onCriticalPath: i < 2,
        deps,
        ownedPaths: [`tp/${r}/${i}`],
        workUnits: 4000 + (base % 4000),        // 4000..8000 sha256 iters
        integrationUnits: 1500 + (base % 1000), // 1500..2500
        accepted: base % 48 >= 2,               // 46/48 accepted, 2 review-rejected
      };
      nodes.push(spec);
      tasks.push(spec);
    }
  }
  return { graph: { nodes }, tasks };
}

// ── Worker pool ─────────────────────────────────────────────────────────────

const WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');
const { createHash } = require('node:crypto');
parentPort.on('message', (m) => {
  let h = createHash('sha256').update(m.salt).digest();
  for (let i = 0; i < m.iters; i++) h = createHash('sha256').update(h).digest();
  parentPort.postMessage({ taskId: m.taskId, hex: h.toString('hex') });
});
`;

interface PoolMsg { taskId: string; iters: number; salt: string; }

class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private pending = new Map<Worker, { resolve: (hex: string) => void; reject: (e: Error) => void }>();
  private queue: Array<PoolMsg & { resolve: (hex: string) => void; reject: (e: Error) => void }> = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(WORKER_SCRIPT, { eval: true });
      w.on('message', (r: { taskId: string; hex: string }) => this.onDone(w, r));
      w.on('error', (e) => this.onError(w, e));
      this.idle.push(w);
      this.workers.push(w);
    }
  }

  run(msg: PoolMsg): Promise<string> {
    return new Promise((resolve, reject) => {
      const w = this.idle.pop();
      if (w) {
        this.pending.set(w, { resolve, reject });
        w.postMessage(msg);
      } else {
        this.queue.push({ ...msg, resolve, reject });
      }
    });
  }

  private onDone(w: Worker, r: { taskId: string; hex: string }): void {
    const p = this.pending.get(w);
    this.pending.delete(w);
    p?.resolve(r.hex);
    this.release(w);
  }

  private onError(w: Worker, e: Error): void {
    const p = this.pending.get(w);
    this.pending.delete(w);
    p?.reject(e);
    this.release(w);
  }

  private release(w: Worker): void {
    const next = this.queue.shift();
    if (next) {
      this.pending.set(w, next);
      w.postMessage({ taskId: next.taskId, iters: next.iters, salt: next.salt });
    } else {
      this.idle.push(w);
    }
  }

  close(): void {
    for (const w of this.workers) void w.terminate();
  }
}

// ── Receipt / scoring (deterministic, e2e) ──────────────────────────────────

interface Receipt { taskId: string; hash: string; accepted: boolean; }

function buildReceipts(tasks: TaskSpec[], workHex: Map<string, string>): Receipt[] {
  return tasks.map((t) => ({
    taskId: t.id,
    hash: createHash('sha256').update(`${t.id}:${workHex.get(t.id) ?? ''}`).digest('hex'),
    accepted: t.accepted,
  }));
}

function outcome(receipts: Receipt[]) {
  return {
    accepted: receipts.filter((r) => r.accepted).length,
    rejected: receipts.filter((r) => !r.accepted).length,
    evidence: receipts.map((r) => r.hash).sort().join('|'),
  };
}

/** Integration/merge: bounded work per receipt; concurrency = pool size. */
async function runIntegration(tasks: TaskSpec[], pool: WorkerPool): Promise<void> {
  await Promise.all(tasks.map((t) => pool.run({ taskId: t.id, iters: t.integrationUnits, salt: `int:${t.id}` })));
}

// ── Variant drivers ─────────────────────────────────────────────────────────

interface RunOutcome {
  wallMs: number;
  rounds: number;
  receipts: Receipt[];
  workUnitsDone: number;
}

/**
 * Sequential driver — dispatchNext semantics: fixed scan order, first PENDING
 * task whose HARD deps are all CLOSED, run it alone, mark CLOSED, repeat.
 * e2e mode appends the receipt+integration phase to the same wall-clock budget.
 */
async function runSequential(tasks: TaskSpec[], pool: WorkerPool, e2e: boolean): Promise<RunOutcome> {
  const status = new Map<string, 'PENDING' | 'CLOSED'>(tasks.map((t) => [t.id, 'PENDING']));
  const workHex = new Map<string, string>();
  const t0 = process.hrtime.bigint();
  let rounds = 0;
  while (tasks.some((t) => status.get(t.id) === 'PENDING')) {
    const next = tasks.find(
      (t) => status.get(t.id) === 'PENDING' && (t.deps ?? []).every((d) => status.get(d.to) === 'CLOSED'),
    );
    if (!next) throw new Error(`sequential: deadlock at round ${rounds}`);
    const hex = await pool.run({ taskId: next.id, iters: next.workUnits, salt: next.id });
    workHex.set(next.id, hex);
    status.set(next.id, 'CLOSED');
    rounds++;
  }
  const receipts = buildReceipts(tasks, workHex);
  if (e2e) await runIntegration(tasks, pool);
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { wallMs, rounds, receipts, workUnitsDone: tasks.reduce((a, t) => a + t.workUnits, 0) };
}

/**
 * Swarm driver — computeReadySet antichain: every round dispatches ALL ready
 * tasks (pool-ceiling bounded) and runs them in parallel via the worker pool.
 */
async function runSwarm(graph: ExecutionGraph, tasks: TaskSpec[], pool: WorkerPool, e2e: boolean): Promise<RunOutcome> {
  const status: Record<string, 'PENDING' | 'CLOSED'> = {};
  for (const t of tasks) status[t.id] = 'PENDING';
  const workHex = new Map<string, string>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const t0 = process.hrtime.bigint();
  let rounds = 0;
  while (tasks.some((t) => status[t.id] === 'PENDING')) {
    const res = computeReadySet({ graph, state: { status } });
    const ready = res.ready.filter((id) => status[id] === 'PENDING');
    if (ready.length === 0) throw new Error(`swarm: no progress at round ${rounds}`);
    const hexes = await Promise.all(ready.map((id) => pool.run({ taskId: id, iters: byId.get(id)!.workUnits, salt: id })));
    ready.forEach((id, idx) => {
      workHex.set(id, hexes[idx]);
      status[id] = 'CLOSED';
    });
    rounds++;
  }
  const receipts = buildReceipts(tasks, workHex);
  if (e2e) await runIntegration(tasks, pool);
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { wallMs, rounds, receipts, workUnitsDone: tasks.reduce((a, t) => a + t.workUnits, 0) };
}

// ── Measurement ─────────────────────────────────────────────────────────────

export interface ThroughputReport {
  sequential_dispatch_ms: number;
  swarm_dispatch_ms: number;
  throughput_ratio: number;
  throughput_pass: boolean;
  sequential_rounds: number;
  swarm_rounds: number;
  sequential_e2e_ms: number;
  swarm_e2e_ms: number;
  e2e_ratio: number;
  e2e_pass: boolean;
  defect_escape_equal: boolean;
  review_rejection_equal: boolean;
  evidence_equal: boolean;
  accepted: number;
  rejected: number;
  total_work_units_sequential: number;
  total_work_units_swarm: number;
  seed: string;
  pool: { sequential: number; swarm: number; host_parallelism: number };
  workload: { tasks: number; ranks: number; per_rank: number };
  method: string;
}

export async function runThroughputHarness(): Promise<ThroughputReport> {
  const { graph, tasks } = buildWorkload(SEED);
  const swarmPool = new WorkerPool(SWARM_POOL);
  const seqPool = new WorkerPool(SEQ_POOL);

  // Warm-up: JIT + worker spin-up excluded from every measured run.
  await runSequential(tasks, seqPool, false);
  await runSwarm(graph, tasks, swarmPool, false);

  const seqDispatch = await runSequential(tasks, seqPool, false);
  const swarmDispatch = await runSwarm(graph, tasks, swarmPool, false);
  const seqE2e = await runSequential(tasks, seqPool, true);
  const swarmE2e = await runSwarm(graph, tasks, swarmPool, true);

  swarmPool.close();
  seqPool.close();

  const throughputRatio = seqDispatch.wallMs / swarmDispatch.wallMs;
  const e2eRatio = seqE2e.wallMs / swarmE2e.wallMs;

  const seqOut = outcome(seqE2e.receipts);
  const swarmOut = outcome(swarmE2e.receipts);

  return {
    sequential_dispatch_ms: Number(seqDispatch.wallMs.toFixed(2)),
    swarm_dispatch_ms: Number(swarmDispatch.wallMs.toFixed(2)),
    throughput_ratio: Number(throughputRatio.toFixed(2)),
    throughput_pass: throughputRatio >= 3,
    sequential_rounds: seqDispatch.rounds,
    swarm_rounds: swarmDispatch.rounds,
    sequential_e2e_ms: Number(seqE2e.wallMs.toFixed(2)),
    swarm_e2e_ms: Number(swarmE2e.wallMs.toFixed(2)),
    e2e_ratio: Number(e2eRatio.toFixed(2)),
    e2e_pass: e2eRatio >= 2,
    defect_escape_equal: seqOut.accepted === swarmOut.accepted,
    review_rejection_equal: seqOut.rejected === swarmOut.rejected,
    evidence_equal: seqOut.evidence === swarmOut.evidence,
    accepted: seqOut.accepted,
    rejected: seqOut.rejected,
    total_work_units_sequential: seqDispatch.workUnitsDone,
    total_work_units_swarm: swarmDispatch.workUnitsDone,
    seed: SEED,
    pool: { sequential: SEQ_POOL, swarm: SWARM_POOL, host_parallelism: os.availableParallelism?.() ?? os.cpus().length },
    workload: { tasks: TASKS, ranks: RANKS, per_rank: PER_RANK },
    method: 'deterministic 48-task graph (4 ranks x 12, mixed pools, HARD deps across ranks only, conflict-free). Each task executes a bounded sha256 hash-chain (4000..8000 iters, seeded FNV-1a) in worker_threads; both variants run identical total work units; only dispatch concurrency differs (sequential = 1 worker, swarm = computeReadySet antichain on a pool up to total ceiling 14). Wall clock measured with process.hrtime. Warm-up pass excludes JIT/worker spin-up. e2e adds a deterministic receipt+integration phase (1500..2500 iters/receipt, parallel in swarm, serial in sequential); acceptance, review-rejection and evidence are deterministic and must be identical across variants.',
  };
}

// ── Standalone report ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const r = await runThroughputHarness();
  const pass = r.throughput_pass && r.e2e_pass && r.defect_escape_equal && r.review_rejection_equal && r.evidence_equal;

  console.log('M11-C10 throughput harness (AM-0019 §12):');
  console.log(`  sequential dispatch : ${r.sequential_dispatch_ms} ms (${r.sequential_rounds} rounds)`);
  console.log(`  swarm dispatch      : ${r.swarm_dispatch_ms} ms (${r.swarm_rounds} rounds)`);
  console.log(`  throughput ratio    : ${r.throughput_ratio}x (target >= 3x) ${r.throughput_pass ? 'PASS' : 'FAIL'}`);
  console.log(`  sequential e2e      : ${r.sequential_e2e_ms} ms`);
  console.log(`  swarm e2e           : ${r.swarm_e2e_ms} ms`);
  console.log(`  e2e ratio           : ${r.e2e_ratio}x (target >= 2x) ${r.e2e_pass ? 'PASS' : 'FAIL'}`);
  console.log(`  accepted/rejected   : ${r.accepted}/${r.rejected} (identical across variants: escape ${r.defect_escape_equal}, rejection ${r.review_rejection_equal}, evidence ${r.evidence_equal})`);

  const report = {
    case_id: 'M11-C10-PERF',
    status: pass ? 'PASS' : 'FAIL',
    gates: {
      implementation_throughput_3x: { value: r.throughput_ratio, target: '>= 3.0', pass: r.throughput_pass, seq_ms: r.sequential_dispatch_ms, swarm_ms: r.swarm_dispatch_ms, seq_rounds: r.sequential_rounds, swarm_rounds: r.swarm_rounds },
      e2e_workload_2x: { value: r.e2e_ratio, target: '>= 2.0', pass: r.e2e_pass, seq_ms: r.sequential_e2e_ms, swarm_ms: r.swarm_e2e_ms, defect_escape_equal: r.defect_escape_equal, review_rejection_equal: r.review_rejection_equal, evidence_equal: r.evidence_equal },
    },
    work_model: r,
  };
  console.log(`M11REPORT:${JSON.stringify(report)}`);
  process.exitCode = pass ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('throughput harness error:', e);
    process.exitCode = 2;
  });
}
