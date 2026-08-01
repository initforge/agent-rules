#!/usr/bin/env node
/**
 * evals/m11/performance.ts — M11-C10 performance gates (AM-0019 §12).
 *
 * Measures against the COMPILED engine artifact (packages/engine/dist):
 *  - READY-to-dispatch p95: computeReadySet latency over 50 runs on a 20-node graph.
 *  - safe-capacity utilization: fraction of the total pool ceiling filled by the
 *    ready set while runnable work exists (target >= 75%).
 *  - critical-path idle: fraction of scheduler samples where a runnable
 *    critical-path node was deferred while capacity existed (target < 5%).
 *
 * Throughput + e2e gates are measured by the controlled two-variant workload
 * harness in throughput.ts (identical 48-task graph driven sequential vs swarm);
 * see the `method` field on those gates for the work model.
 *
 * Honest boundary:
 *  - True wall-clock scheduler idle between dispatch turns is not instrumented;
 *    critical-path idle is reported at scheduler-sample granularity.
 *
 * Run: node evals/m11/performance.ts   (emits a M11REPORT: JSON line)
 */
import { createHash } from 'node:crypto';
import { computeReadySet, type ExecutionGraph, type ExecutionNode } from '../../packages/engine/dist/dispatch-ready-set.js';
import { runThroughputHarness } from './throughput.ts';

function buildGraph(): ExecutionGraph {
  const nodes: ExecutionNode[] = [];
  // Critical path chain (writers): rank i, HARD deps — only crit-0 is runnable.
  for (let i = 0; i < 8; i++) {
    nodes.push({
      id: `crit-${i}`,
      kind: 'writer',
      rank: i,
      onCriticalPath: true,
      ownedPaths: [`critical/${i}`],
      deps: i > 0 ? [{ to: `crit-${i - 1}`, type: 'HARD' as const }] : [],
    });
  }
  // Balanced pool mix so the ready set can fill the full AM-0019 §5 capacity
  // (8 writers + 5 reviewers + 1 browser = 14 total slots).
  for (let i = 0; i < 5; i++) {
    nodes.push({ id: `review-${i}`, kind: 'reviewer', rank: 0, ownedPaths: [`review/${i}`] });
  }
  nodes.push({ id: 'browser-0', kind: 'browser', rank: 0, ownedPaths: ['browser/0'] });
  // Independent writers: candidates beyond capacity (pool pressure).
  for (let i = 0; i < 20; i++) {
    nodes.push({ id: `indep-${i}`, kind: 'writer', rank: 0, ownedPaths: [`indep/${i}`] });
  }
  return { nodes };
}

const TOTAL_CEILING = 14;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main(): Promise<void> {
  const graph = buildGraph();
  const status: Record<string, 'PENDING'> = {};
  for (const n of graph.nodes) status[n.id] = 'PENDING';

  const runs = 50;
  const latencies: number[] = [];
  let utilizationSum = 0;
  let utilizationMin = 1;
  let criticalIdleSamples = 0;
  let runnableCriticalSamples = 0;

  for (let i = 0; i < runs; i++) {
    const started = process.hrtime.bigint();
    const result = computeReadySet({ graph, state: { status } });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    latencies.push(elapsedMs);

    const utilization = result.usage.total / TOTAL_CEILING;
    utilizationSum += utilization;
    utilizationMin = Math.min(utilizationMin, utilization);

    // Critical-path idle sample: was the runnable critical-path node dispatched?
    if (status['crit-0'] === 'PENDING') {
      runnableCriticalSamples++;
      if (!result.ready.includes('crit-0')) criticalIdleSamples++;
    }
  }

  latencies.sort((a, b) => a - b);
  const p95 = percentile(latencies, 95);
  const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const utilization = utilizationSum / runs;
  const criticalIdle = runnableCriticalSamples > 0 ? criticalIdleSamples / runnableCriticalSamples : 0;

  const t = await runThroughputHarness();

  const report = {
    case_id: 'M11-C10-PERF',
    status: p95 < 2000 && utilization >= 0.75 && criticalIdle < 0.05 && t.throughput_pass && t.e2e_pass
      && t.defect_escape_equal && t.review_rejection_equal && t.evidence_equal ? 'PASS' : 'FAIL',
    gates: {
      dispatch_latency_p95_ms: { value: Number(p95.toFixed(3)), target: '< 2000', pass: p95 < 2000 },
      dispatch_latency_mean_ms: Number(meanLatency.toFixed(3)),
      safe_capacity_utilization: { value: Number(utilization.toFixed(4)), target: '>= 0.75', pass: utilization >= 0.75 },
      safe_capacity_utilization_min_sample: Number(utilizationMin.toFixed(4)),
      critical_path_idle: {
        value: Number(criticalIdle.toFixed(4)),
        target: '< 0.05',
        pass: criticalIdle < 0.05,
        method: 'scheduler-sample granularity: fraction of computeReadySet calls where a runnable critical-path node was deferred while capacity existed; wall-clock idle between dispatch turns is not instrumented by the engine',
      },
      implementation_throughput_3x: {
        value: t.throughput_ratio,
        target: '>= 3.0',
        pass: t.throughput_pass,
        sequential_ms: t.sequential_dispatch_ms,
        swarm_ms: t.swarm_dispatch_ms,
        sequential_rounds: t.sequential_rounds,
        swarm_rounds: t.swarm_rounds,
        method: t.method,
      },
      e2e_workload_2x: {
        value: t.e2e_ratio,
        target: '>= 2.0',
        pass: t.e2e_pass,
        sequential_ms: t.sequential_e2e_ms,
        swarm_ms: t.swarm_e2e_ms,
        defect_escape_equal: t.defect_escape_equal,
        review_rejection_equal: t.review_rejection_equal,
        evidence_equal: t.evidence_equal,
        accepted: t.accepted,
        rejected: t.rejected,
        method: t.method,
      },
    },
    samples: runs,
    graph: { nodes: graph.nodes.length, critical_chain: 8, reviewers: 5, browser: 1, independent_writers: 20 },
    throughput_workload: t.workload,
    engine_artifact: 'packages/engine/dist/dispatch-ready-set.js',
    measured_at: new Date().toISOString(),
  };

  const sha = createHash('sha256').update(JSON.stringify(report.gates)).digest('hex');
  report['report_sha256'] = sha;

  // Human-readable table.
  console.log('M11-C10 performance gates (AM-0019 §12):');
  console.log(`  dispatch latency p95      : ${report.gates.dispatch_latency_p95_ms.value.toFixed(3)} ms (target < 2000)`);
  console.log(`  dispatch latency mean     : ${report.gates.dispatch_latency_mean_ms.toFixed(3)} ms`);
  console.log(`  safe-capacity utilization : ${(report.gates.safe_capacity_utilization.value * 100).toFixed(2)}% (target >= 75%)`);
  console.log(`  critical-path idle        : ${(report.gates.critical_path_idle.value * 100).toFixed(3)}% (target < 5%)`);
  console.log(`  throughput 3x sequential  : ${report.gates.implementation_throughput_3x.value.toFixed(2)}x (target >= 3x) ${report.gates.implementation_throughput_3x.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  e2e 2x baseline           : ${report.gates.e2e_workload_2x.value.toFixed(2)}x (target >= 2x) ${report.gates.e2e_workload_2x.pass ? 'PASS' : 'FAIL'}`);
  console.log(`M11REPORT:${JSON.stringify(report)}`);

  // Gate exit code: structural failure only if a measured gate missed its target.
  process.exitCode = report.status === 'PASS' ? 0 : 2;
}

main().catch((e) => {
  console.error('performance eval error:', e);
  process.exitCode = 2;
});
