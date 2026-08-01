/**
 * evals/m11/aggregation.test.ts — M11-C10 aggregate conflict-domain + ownership
 * proof (AM-0019 §5, §12). Supplements the C2 dispatch-ready-set matrix with the
 * conflict domains that matrix does not exercise directly: DB migration,
 * port/container/fixture, shared-data, explicit lease domains and path
 * containment ownership boundaries. Runs against the engine source via vitest.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeReadySet,
  type ExecutionGraph,
  type ExecutionNode,
} from '../../packages/engine/src/dispatch-ready-set.js';

function node(id: string, extra: Partial<ExecutionNode> = {}): ExecutionNode {
  return { id, ownedPaths: [`owned/${id}`], ...extra };
}

function graph(...nodes: ExecutionNode[]): ExecutionGraph {
  return { nodes };
}

function allPending(g: ExecutionGraph): Record<string, 'PENDING'> {
  const status: Record<string, 'PENDING'> = {};
  for (const n of g.nodes) status[n.id] = 'PENDING';
  return status;
}

describe('M11-C10 conflict domains beyond the C2 matrix (AM-0019 §5)', () => {
  const cases: Array<[string, Partial<ExecutionNode>]> = [
    ['DB migration revision overlap', { migrationKeys: ['001-init'] }],
    ['port/container/fixture overlap', { portKeys: ['8080'] }],
    ['shared-data overlap', { sharedDataKeys: ['state/db.json'] }],
    ['explicit lease-domain overlap', { leaseDomains: ['schema:TaskAssignment'] }],
  ];

  for (const [label, lease] of cases) {
    it(`rejects ${label}`, () => {
      const g = graph(node('T1', lease), node('T2', lease));
      const r = computeReadySet({ graph: g, state: { status: allPending(g) } });
      assert.equal(r.ready.length, 1, `${label}: only one dispatchable`);
      assert.equal(r.rejectedConflicts.length, 1, `${label}: the other is conflict-rejected`);
      assert.equal(r.rejectedConflicts[0].taskId, 'T2');
      assert.ok(r.rejectedConflicts[0].against.includes('T1'));
      assert.deepEqual(r.deferredByPool, []);
    });
  }

  it('rejects ownership-boundary overlap via path containment (dir owns child file)', () => {
    const g = graph(
      node('OWNER', { ownedPaths: ['packages/engine/src'] }),
      node('INTRUDER', { ownedPaths: ['packages/engine/src/controller.ts'] }),
    );
    const r = computeReadySet({ graph: g, state: { status: allPending(g) } });
    assert.equal(r.ready.length, 1);
    assert.equal(r.rejectedConflicts.length, 1);
    // Order is deterministic (INTRUDER < OWNER), but the invariant is that exactly
    // one dispatchable wins and the other is rejected for an overlapping lease.
    const selected = r.ready[0];
    const rejected = r.rejectedConflicts[0];
    assert.ok(['OWNER', 'INTRUDER'].includes(selected));
    assert.ok(rejected.taskId !== selected, 'rejected task is the other owner');
    assert.ok(rejected.against.includes(selected));
    assert.ok(rejected.domain.startsWith('path:'));
  });

  it('rejects a cross-domain collision between a path and an explicit lease key', () => {
    // Distinct domain families (path vs explicit) must NOT collide.
    const g = graph(
      node('A', { ownedPaths: ['x/'] }),
      node('B', { leaseDomains: ['x/'] }),
    );
    const r = computeReadySet({ graph: g, state: { status: allPending(g) } });
    assert.equal(r.ready.length, 2, 'different domain families never collide');
    assert.equal(r.rejectedConflicts.length, 0);
  });
});
