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
 * Honest boundaries:
 *  - Throughput gates (>=3x sequential / >=2x end-to-end) require a controlled
 *    two-variant workload harness against the full engine pipeline; that harness
 *    does not exist yet -> HONEST UNAVAILABLE with method.
 *  - True wall-clock scheduler idle between dispatch turns is not instrumented;
 *    critical-path idle is reported at scheduler-sample granularity.
 *
 * Run: node evals/m11/performance.ts   (emits a M11REPORT: JSON line)
 */
import { createHash } from 'node:crypto';
import { computeReadySet, type ExecutionGraph, type ExecutionNode } from '../../packages/engine/dist/dispatch-ready-set.js';

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

function main(): void {
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

  const report = {
    case_id: 'M11-C10-PERF',
    status: p95 < 2000 && utilization >= 0.75 && criticalIdle < 0.05 ? 'PASS' : 'FAIL',
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
        value: null,
        status: 'HONEST_UNAVAILABLE',
        method: 'requires a controlled two-variant (swarm vs sequential) workload harness driving the full engine pipeline (dispatch+journal+receipt+merge) on identical tasks; harness not present',
      },
      e2e_workload_2x: {
        value: null,
        status: 'HONEST_UNAVAILABLE',
        method: 'requires the same controlled harness plus defect-escape/review-rejection scoring; harness not present',
      },
    },
    samples: runs,
    graph: { nodes: graph.nodes.length, critical_chain: 8, reviewers: 5, browser: 1, independent_writers: 20 },
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
  console.log(`  throughput 3x sequential  : HONEST_UNAVAILABLE (no two-variant workload harness)`);
  console.log(`  e2e 2x baseline           : HONEST_UNAVAILABLE (no two-variant workload harness)`);
  console.log(`M11REPORT:${JSON.stringify(report)}`);

  // Gate exit code: structural failure only if a measured gate missed its target.
  process.exitCode = report.status === 'PASS' ? 0 : 2;
}

main();
