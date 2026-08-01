/**
 * dispatch-ready-set.test.ts — C2 max-useful antichain scheduler (AM-0019 §4–5, §12)
 *
 * Required §12 cases:
 *  - 14 conflict-free synthetic tasks dispatch without wave barriers.
 *  - Ownership / API-schema / lockfile / generated / browser-lease conflicts rejected.
 *  - Pool ceilings enforced (writers, browser, build, total).
 *  - Critical-path priority without starving independent tasks.
 *  - WAITING_* is nonterminal: an independent sibling still dispatches.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeReadySet, leaseKey, leaseSetsOverlap,
  type ExecutionGraph, type ExecutionNode,
} from '../src/dispatch-ready-set.js';

function node(id: string, extra: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id, ownedPaths: [`owned/${id}`], ...extra };
}

function graph(...nodes: ExecutionNode[]): ExecutionGraph {
  return { nodes };
}

function allPending(graph: ExecutionGraph): Record<string, 'PENDING'> {
  const status: Record<string, 'PENDING'> = {};
  for (const n of graph.nodes) status[n.id] = 'PENDING';
  return status;
}

const ids = (result: { ready: string[] }): Set<string> => new Set(result.ready);

// ── AM-0019 §12: 14 conflict-free tasks, no wave barrier ────────────────────

describe('14-task antichain (AM-0019 §12)', () => {
  it('dispatches all 14 in one call across two logical waves (SOFT/VERIFY_AFTER only)', () => {
    const nodes: ExecutionNode[] = [];
    const wave1: ExecutionNode[] = [];
    const wave2: ExecutionNode[] = [];
    for (let i = 1; i <= 7; i++) {
      wave1.push(node(`A${i}`, { rank: 0, onCriticalPath: true, kind: 'writer' }));
      // Cross-stage edge is SOFT or VERIFY_AFTER — never a readiness blocker.
      wave2.push(node(`B${i}`, { rank: 1, deps: [{ to: `A${i}`, type: i % 2 === 0 ? 'VERIFY_AFTER' : 'SOFT' }] }));
    }
    // Pool distribution must admit all 14 under AM-0019 §5 ceilings:
    // 8 writers + 5 reviewers + 1 browser = 14.
    wave2[0] = { ...wave2[0], kind: 'writer' };           // 8th writer
    for (let i = 1; i <= 5; i++) {
      wave2[i] = { ...wave2[i], kind: 'reviewer' };       // 5 reviewers
    }
    wave2[6] = { ...wave2[6], kind: 'browser' };          // 1 browser
    nodes.push(...wave1, ...wave2);

    const g = graph(...nodes);
    const result = computeReadySet({ graph: g, state: { status: allPending(g) } });

    assert.equal(result.ready.length, 14, 'all 14 conflict-free tasks dispatch in one call');
    assert.equal(ids(result).size, 14);
    assert.equal(result.usage.total, 14);
    assert.equal(result.usage.writers, 8);
    assert.equal(result.usage.reviewers, 5);
    assert.equal(result.usage.browser, 1);
    assert.deepEqual(result.deferredByPool, []);
    assert.deepEqual(result.rejectedConflicts, []);
    // No wave barrier: later-stage B tasks dispatch in the SAME call as wave-1 A tasks.
    for (let i = 1; i <= 7; i++) assert.ok(ids(result).has(`B${i}`), `B${i} ready without wave barrier`);
  });

  it('later-stage work starts when its HARD deps are met, unrelated clusters ignored', () => {
    const g = graph(
      node('A', { rank: 0, deps: [], ownedPaths: ['a/'] }),
      node('C', { rank: 0, deps: [], ownedPaths: ['c/'] }), // unrelated mid-stage cluster
      node('B', { rank: 1, deps: [{ to: 'A', type: 'HARD' }], ownedPaths: ['b/'] }),
    );
    const status = allPending(g);
    status.A = 'CLOSED'; // A done; B may start even though graph elsewhere is incomplete

    const result = computeReadySet({ graph: g, state: { status } });

    assert.ok(ids(result).has('B'), 'successor with satisfied HARD dep dispatches');
    assert.ok(ids(result).has('C'), 'unrelated cluster keeps dispatching');
    assert.equal(result.ready.length, 2);
  });
});

// ── Conflict rejection per AM-0019 §5 ───────────────────────────────────────

describe('conflict rejection', () => {
  const cases: Array<[string, Partial<ExecutionNode>]> = [
    ['path overlap', { ownedPaths: ['packages/engine/src/controller.ts'] }],
    ['schema surface overlap', { apiSurfaceKeys: ['contracts.ts:TaskAssignment'] }],
    ['lockfile overlap', { lockfileKeys: ['package-lock.json'] }],
    ['generated manifest overlap', { generatedKeys: ['generated/manifest.json'] }],
    ['browser-page lease overlap', { browserPages: ['REF:pair-1'] }],
  ];

  for (const [label, lease] of cases) {
    it(`rejects ${label}`, () => {
      const g = graph(
        node('T1', lease),
        node('T2', lease),
      );
      const result = computeReadySet({ graph: g, state: { status: allPending(g) } });

      assert.equal(result.ready.length, 1, `${label}: only one dispatchable`);
      assert.equal(result.rejectedConflicts.length, 1, `${label}: the other is conflict-rejected`);
      assert.equal(result.rejectedConflicts[0].taskId, 'T2');
      assert.ok(result.rejectedConflicts[0].against.includes('T1'));
      assert.deepEqual(result.deferredByPool, [], 'rejection reason is conflict, not pool');
    });
  }

  it('rejects transitive conflicts between two already-selected antichain members', () => {
    const g = graph(
      node('T1', { apiSurfaceKeys: ['schema/v1.json'] }),
      node('T2', { apiSurfaceKeys: ['schema/v1.json'] }),
      node('T3', { apiSurfaceKeys: ['schema/v1.json'] }),
    );
    const result = computeReadySet({ graph: g, state: { status: allPending(g) } });

    assert.equal(result.ready.length, 1);
    assert.equal(result.rejectedConflicts.length, 2);
  });

  it('leaseKey honors path containment (parent dir vs child file) and globs', () => {
    const parent = node('P', { ownedPaths: ['packages/engine/src'] });
    const child = node('C', { ownedPaths: ['packages/engine/src/foo.ts'] });
    assert.ok(leaseSetsOverlap(leaseKey(parent), leaseKey(child)), 'parent dir contains child file');

    const glob = node('G', { ownedPaths: ['packages/engine/src/*.ts'] });
    assert.ok(leaseSetsOverlap(leaseKey(glob), leaseKey(child)), 'glob matches child file');
    assert.ok(!leaseSetsOverlap(leaseKey(glob), leaseKey(node('X', { ownedPaths: ['packages/engine/test/x.ts'] }))));
  });
});

// ── Pool ceilings (AM-0019 §5) ──────────────────────────────────────────────

describe('pool ceiling enforcement', () => {
  it('caps writers at 8', () => {
    const g = graph(...Array.from({ length: 10 }, (_, i) => node(`W${i}`, { kind: 'writer' })));
    const result = computeReadySet({ graph: g, state: { status: allPending(g) } });

    assert.equal(result.ready.length, 8);
    assert.equal(result.usage.writers, 8);
    assert.equal(result.deferredByPool.length, 2);
  });

  it('caps browser at 2 by default, 4 under burst', () => {
    const g = graph(
      node('B1', { kind: 'browser' }), node('B2', { kind: 'browser' }),
      node('B3', { kind: 'browser' }), node('B4', { kind: 'browser' }),
      node('B5', { kind: 'browser' }),
    );
    const defaultResult = computeReadySet({ graph: g, state: { status: allPending(g) } });
    assert.equal(defaultResult.ready.length, 2);

    const burstResult = computeReadySet({ graph: g, state: { status: allPending(g) }, browserBurst: true });
    assert.equal(burstResult.ready.length, 4);
  });

  it('caps full build/test at 2 and full compose at 1', () => {
    const g = graph(
      node('BU1', { kind: 'build' }), node('BU2', { kind: 'build' }), node('BU3', { kind: 'build' }),
      node('CO1', { kind: 'compose' }), node('CO2', { kind: 'compose' }),
    );
    const result = computeReadySet({ graph: g, state: { status: allPending(g) } });

    assert.equal(result.usage.build, 2);
    assert.equal(result.usage.compose, 1);
    assert.equal(result.ready.length, 3);
    assert.deepEqual(result.deferredByPool.sort(), ['BU3', 'CO2'].sort());
  });

  it('caps integration owner at 1', () => {
    const g = graph(
      node('I1', { kind: 'integration' }), node('I2', { kind: 'integration' }),
    );
    const result = computeReadySet({ graph: g, state: { status: allPending(g) } });
    assert.equal(result.ready.length, 1);
  });

  it('honors custom total ceiling (tests, small pools)', () => {
    const g = graph(node('T1'), node('T2'), node('T3'));
    const result = computeReadySet({ graph: g, state: { status: allPending(g) }, ceilings: { total: 2 } });
    assert.equal(result.ready.length, 2);
    assert.deepEqual(result.deferredByPool, ['T3']);
  });
});

// ── Critical-path priority + fairness ───────────────────────────────────────

describe('critical-path priority with fairness', () => {
  it('dispatches critical work first when capacity is scarce', () => {
    const g = graph(
      node('C0', { rank: 0, onCriticalPath: true, ownedPaths: ['c0/'] }),
      node('I1', { rank: 0, ownedPaths: ['i1/'] }),
    );
    const result = computeReadySet({ graph: g, state: { status: allPending(g) }, ceilings: { total: 1 } });

    assert.deepEqual(result.ready, ['C0'], 'critical-path task wins the single slot');
    assert.deepEqual(result.deferredByPool, ['I1']);
  });

  it('never starves independent rank-N work while rank N+1 runs (round-robin fairness)', () => {
    // Two critical tasks at rank 0 compete with one independent task at rank 1.
    const g = graph(
      node('C0a', { rank: 0, onCriticalPath: true }),
      node('C0b', { rank: 0, onCriticalPath: true }),
      node('I1', { rank: 1, deps: [], onCriticalPath: false }),
    );
    const status = allPending(g);

    const round1 = computeReadySet({ graph: g, state: { status }, ceilings: { total: 2 } });
    assert.deepEqual(round1.ready, ['C0a', 'I1'],
      'rank0 critical and rank1 independent interleave; the independent is not starved');
    assert.deepEqual(round1.deferredByPool, ['C0b']);

    // Close C0a and I1; the remaining critical path task dispatches next.
    status.C0a = 'CLOSED';
    status.I1 = 'CLOSED';
    const round2 = computeReadySet({ graph: g, state: { status }, ceilings: { total: 2 } });
    assert.deepEqual(round2.ready, ['C0b']);
  });

  it('prioritizes lower rank, then critical within a rank, deterministically', () => {
    const g = graph(
      node('I2', { rank: 1 }),
      node('C1', { rank: 1, onCriticalPath: true }),
      node('C0', { rank: 0, onCriticalPath: true }),
    );
    const result = computeReadySet({ graph: g, state: { status: allPending(g) }, ceilings: { total: 3 } });

    assert.deepEqual(result.ready, ['C0', 'C1', 'I2']);
  });
});

// ── Waiting states are nonterminal ──────────────────────────────────────────

describe('recoverable waiting states (AM-0019 §4)', () => {
  it('a WAITING_EXTERNAL task never blocks its independent siblings', () => {
    const g = graph(
      node('W1', { deps: [], ownedPaths: ['w1/'] }),
      node('S1', { deps: [], ownedPaths: ['s1/'] }),           // independent sibling
      node('X1', { deps: [{ to: 'W1', type: 'HARD' }], ownedPaths: ['x1/'] }), // successor of W1
    );
    const status = allPending(g) as Record<string, 'PENDING' | 'CLOSED' | 'RUNNING' | 'WAITING'>;
    status.W1 = 'WAITING';
    const result = computeReadySet({
      graph: g,
      state: {
        status,
        waiting: { W1: { state: 'WAITING_EXTERNAL', wake: 'CI watcher', since: '2026-08-01T00:00:00.000Z' } },
      },
    });

    assert.ok(ids(result).has('S1'), 'independent sibling dispatches');
    assert.ok(!ids(result).has('W1'), 'waiting task is not dispatched');
    assert.ok(!ids(result).has('X1'), 'successor of waiting task is not dispatched');

    const closure = new Map(result.waitingClosure.map((e) => [e.taskId, e]));
    assert.ok(closure.has('W1'), 'waiting task stays scheduled nonterminally');
    assert.deepEqual(closure.get('W1')?.wake, ['CI watcher']);
    assert.ok(closure.has('X1'), 'successor stays scheduled nonterminally with wake conditions');
    assert.deepEqual(closure.get('X1')?.wake, ['CI watcher']);
    assert.equal(result.ready.length, 1, 'only S1 dispatches');
  });

  it('every recoverable state is nonterminal, BLOCKED is not produced by the scheduler', () => {
    const g = graph(
      node('W2', { deps: [], ownedPaths: ['w2/'] }),
      node('W3', { deps: [], ownedPaths: ['w3/'] }),
      node('W4', { deps: [], ownedPaths: ['w4/'] }),
    );
    const status = allPending(g) as Record<string, 'PENDING' | 'CLOSED' | 'RUNNING' | 'WAITING'>;
    const waiting: NonNullable<Parameters<typeof computeReadySet>[0]['state']>['waiting'] = {
      W2: { state: 'WAITING_AUTHORITY', wake: 'owner decision batch', since: '2026-08-01T00:00:00.000Z' },
      W3: { state: 'WAITING_RESOURCE', wake: 'governor hysteresis', since: '2026-08-01T00:00:00.000Z' },
      W4: { state: 'RETRY_SCHEDULED', wake: 'retry/backoff policy', since: '2026-08-01T00:00:00.000Z' },
    };
    status.W2 = 'WAITING'; status.W3 = 'WAITING'; status.W4 = 'WAITING';

    const result = computeReadySet({ graph: g, state: { status, waiting } });

    assert.deepEqual(result.ready, []);
    assert.equal(result.waitingClosure.length, 3);
    for (const e of result.waitingClosure) {
      assert.ok(e.wake.length > 0, `${e.taskId} carries a wake condition`);
    }
  });
});
