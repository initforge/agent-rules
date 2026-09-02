import { describe, expect, it } from 'vitest';
import { planProofRoute, routeProofs, type AcceptanceCoverage, type ProofRouteRequest } from '../../src/northstar/proof-router.js';

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
        ...binding, evidence_ref: `/repo/evidence/${index}.json`,
      })),
    }));
    expect(reused.execution.selected_for_run).toHaveLength(0);
    expect(reused.execution.reused).toHaveLength(baseline.plan.selected.length);
  });

  it('reruns when exact proof evidence is stale', () => {
    const binding = { source_hash: '1'.repeat(64), environment_hash: '2'.repeat(64), proof_contract_hash: '3'.repeat(64) };
    const baseline = planProofRoute(request({ binding }));
    const stale = planProofRoute(request({
      binding: { ...binding, source_hash: '4'.repeat(64) },
      existing_proofs: baseline.plan.selected.map((selected, index) => ({
        id: `cached-${index}`, claim_id: selected.claim_id, category: selected.category, status: 'PASS', ...binding,
      })),
    }));
    expect(stale.execution.reused).toHaveLength(0);
    expect(stale.execution.selected_for_run).toHaveLength(baseline.execution.selected_for_run.length);
  });

  it('runs repeated repair scopes only after a material binding change', () => {
    const before = { source_hash: 'a'.repeat(64), environment_hash: 'b'.repeat(64), proof_contract_hash: 'c'.repeat(64) };
    const afterFirstRepair = { ...before, source_hash: 'd'.repeat(64) };
    const afterSecondRepair = { ...before, source_hash: 'e'.repeat(64) };
    const first = planProofRoute(request({ binding: before }));
    expect(first.execution.selected_for_run.length).toBeGreaterThanOrEqual(3);
    const [failed, affected, unaffected] = first.execution.selected_for_run;
    const scope = {
      failed_proof_ids: [failed!],
      affected_direct_dependents: [affected!],
      prior_binding: before,
    };

    const unchanged = planProofRoute(request({ binding: before, repair_recheck: scope }));
    expect(unchanged.execution.selected_for_run).toEqual([]);
    expect(unchanged.execution.omitted_recheck_unchanged).toEqual([failed, affected]);
    expect(unchanged.execution.omitted_recheck_unaffected).toContain(unaffected);

    const repaired = planProofRoute(request({ binding: afterFirstRepair, repair_recheck: scope }));
    expect(repaired.execution.selected_for_run).toEqual([failed, affected]);
    expect(repaired.execution.omitted_recheck_unaffected).toContain(unaffected);

    const repairedAgain = planProofRoute(request({
      binding: afterSecondRepair,
      repair_recheck: { ...scope, prior_binding: afterFirstRepair },
    }));
    expect(repairedAgain.execution.selected_for_run).toEqual([failed, affected]);
    expect(repairedAgain.execution).not.toHaveProperty('proof_plan_key');
    expect(repairedAgain.execution).not.toHaveProperty('budget_exceeded');
    expect(repairedAgain.execution.decisions.every((decision) => !('binding_key' in decision))).toBe(true);
  });

  it('rejects an empty focused repair scope', () => {
    expect(() => planProofRoute(request({ repair_recheck: { failed_proof_ids: [], prior_binding: {} } }))).toThrow(/requires at least one failed proof id/);
  });

  it('fails closed when a focused repair recheck lacks exact bindings', () => {
    expect(() => planProofRoute(request({
      binding: {},
      repair_recheck: { failed_proof_ids: ['planned:0'], prior_binding: {} },
    }))).toThrow(/requires exact prior and current source\/environment\/proof-contract bindings/);
  });

  it('defers a broad suite until a release or material trigger', () => {
    expect(planProofRoute(request({ risks: [], force_full_suite: true })).execution.full_suite_allowed).toBe(false);
    expect(planProofRoute(request({ force_full_suite: true, release_gate: true })).execution.full_suite_allowed).toBe(true);
    expect(planProofRoute(request({ force_full_suite: true, material_risk_trigger: true })).execution.full_suite_allowed).toBe(true);
    expect(planProofRoute(request({ risks: ['security'] })).execution.full_suite_allowed).toBe(true);
  });

  it('derives terminal status from proof results', () => {
    const passed = routeProofs(request(), [{ proof_id: 'planned:0', status: 'PASS' }]);
    const blocked = routeProofs(request(), [{ proof_id: 'planned:0', status: 'BLOCKED' }]);
    expect(passed.schema).toBe('agent-rules/proof-route-receipt/v2');
    expect(passed.version).toBe(2);
    expect(passed.execution.schema).toBe('agent-rules/proof-execution-policy/v2');
    expect(passed.receipt.final_status).toBe('PASS');
    expect(blocked.receipt.final_status).toBe('BLOCKED');
    expect(routeProofs(request({ claims: [] }), []).receipt.final_status).toBe('NEEDS_USER');
  });

  it('reduces transient acceptance coverage without optimistic completion', () => {
    const pass = [{ proof_id: 'planned:0', status: 'PASS' as const }];
    const status = (entries: AcceptanceCoverage['entries'], results = pass) => routeProofs(request({ acceptance_coverage: { entries } }), results).receipt.final_status;

    expect(status([
      { acceptance_id: 'retired-authority', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'preserved-operation', implementation: 'COMPLETE' },
    ])).toBe('PARTIAL');

    expect(status([
      { acceptance_id: 'canonical-source', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'active-adoption', implementation: 'PENDING' },
    ])).toBe('PARTIAL');
    expect(status([
      { acceptance_id: 'canonical-source', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'active-adoption', implementation: 'COMPLETE', proof_status: 'PASS' },
    ])).toBe('PASS');

    expect(status([
      { acceptance_id: 'source-work', implementation: 'PENDING' },
      { acceptance_id: 'runtime-proof', implementation: 'BLOCKED', blocker: 'Docker unavailable' },
    ])).toBe('PARTIAL');
    expect(status([
      { acceptance_id: 'source-work', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'runtime-proof', implementation: 'BLOCKED', blocker: 'Docker unavailable' },
    ])).toBe('BLOCKED');

    expect(status([{ acceptance_id: 'owner-choice', implementation: 'NEEDS_USER' }])).toBe('NEEDS_USER');
    expect(status([
      { acceptance_id: 'changed-work', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'legacy-failure', implementation: 'PRE_EXISTING' },
    ])).toBe('PRE-EXISTING');
    expect(status([{ acceptance_id: 'done', implementation: 'COMPLETE', proof_status: 'PASS' }], [{ proof_id: 'planned:0', status: 'BLOCKED' }])).toBe('BLOCKED');
  });

  it('validates transient acceptance coverage fail closed', () => {
    expect(() => routeProofs(request({ acceptance_coverage: { entries: [
      { acceptance_id: 'duplicate', implementation: 'COMPLETE', proof_status: 'PASS' },
      { acceptance_id: 'duplicate', implementation: 'COMPLETE', proof_status: 'PASS' },
    ] } }), [])).toThrow(/duplicate or invalid id/);
    expect(() => routeProofs(request({ acceptance_coverage: { entries: [
      { acceptance_id: 'runtime', implementation: 'BLOCKED' },
    ] } }), [])).toThrow(/requires a blocker reason/);
    expect(routeProofs(request({ acceptance_coverage: { entries: [] } }), []).receipt.final_status).toBe('NEEDS_USER');
  });
});
