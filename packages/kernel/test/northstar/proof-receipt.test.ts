import { describe, expect, it } from 'vitest';
import { planProofRoute, routeProofs, type ProofRouteRequest } from '../../src/northstar/proof-router.js';

function request(over: Partial<ProofRouteRequest> = {}): ProofRouteRequest {
  return {
    task_id: 'changed-seam',
    repository: '/repo',
    trigger: { changed_files: ['src/api/route.ts'] },
    claims: [{ id: 'C-1', claim: 'API route validates input' }],
    risks: ['auth'],
    ...over,
  };
}

describe('focused proof policy', () => {
  it('reuses exact-bound PASS evidence', () => {
    const binding = { source_hash: 'a'.repeat(64), environment_hash: 'b'.repeat(64), proof_contract_hash: 'c'.repeat(64) };
    const baseline = planProofRoute(request({ binding }));
    const reused = planProofRoute(request({
      binding,
      existing_proofs: baseline.plan.selected.map((selected, index) => ({
        id: `cached-${index}`, claim_id: selected.claim_id, category: selected.category, status: 'PASS',
        ...binding, evidence_ref: `/repo/evidence/${index}.json`, observed_at: new Date().toISOString(),
      })),
    }));
    expect(reused.execution.selected_for_run).toHaveLength(0);
    expect(reused.execution.reused).toHaveLength(baseline.plan.selected.length);
  });

  it('prevents an unchanged proof plan across calls', () => {
    const binding = { source_hash: '1'.repeat(64), environment_hash: '2'.repeat(64), proof_contract_hash: '3'.repeat(64) };
    const first = planProofRoute(request({ binding }));
    const replay = planProofRoute(request({ binding, prior_proof_plan_keys: [first.execution.proof_plan_key] }));
    expect(replay.execution.selected_for_run).toHaveLength(0);
    expect(replay.execution.omitted_unchanged_duplicate).toEqual(first.execution.selected_for_run);
  });

  it('allows one focused repair recheck and rejects another', () => {
    const first = planProofRoute(request());
    const failed = first.execution.selected_for_run[0];
    expect(planProofRoute(request({ repair_recheck: { attempt: 1, failed_proof_ids: [failed] } })).execution.selected_for_run).toEqual([failed]);
    expect(() => planProofRoute(request({ repair_recheck: { attempt: 2 as 1, failed_proof_ids: [failed] } }))).toThrow(/exactly once/);
  });

  it('defers a broad suite until a release or material trigger', () => {
    expect(planProofRoute(request({ force_full_suite: true })).execution.full_suite_allowed).toBe(false);
    expect(planProofRoute(request({ force_full_suite: true, release_gate: true })).execution.full_suite_allowed).toBe(true);
  });

  it('derives terminal status from proof results', () => {
    const passed = routeProofs(request(), [{ proof_id: 'planned:0', status: 'PASS' }]);
    const blocked = routeProofs(request(), [{ proof_id: 'planned:0', status: 'BLOCKED' }]);
    expect(passed.receipt.final_status).toBe('PASS');
    expect(blocked.receipt.final_status).toBe('BLOCKED');
    expect(routeProofs(request({ claims: [] }), []).receipt.final_status).toBe('NEEDS_USER');
  });
});
