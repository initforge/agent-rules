/**
 * REQ-007 — the verification router emits a proof receipt with task identity,
 * repository, changed scope, claims, risks, profile, selected tests, omitted
 * tests, omission reasons, escalation decisions, environment, results,
 * evidence references and final status.
 */
import { describe, it, expect } from 'vitest';
import { routeProofs, planProofRoute, type ProofRouteRequest } from '../../src/northstar/proof-router.js';
import { filterVerifiersByProofRoute, type VerifierDefinition } from '../../src/northstar/runtime.js';

function request(over: Partial<ProofRouteRequest> = {}): ProofRouteRequest {
  return {
    task_id: 'T-ROUTE',
    repository: '/repo',
    trigger: { changed_files: ['src/api/route.ts'] },
    claims: [{ id: 'C-1', claim: 'API route validates input' }],
    risks: ['auth'],
    ...over,
  };
}

function verifier(id: string): VerifierDefinition {
  return { id, kind: 'test', argv: { executable: 'node', args: ['-e', 'process.exit(0)'] } };
}

describe('F04/REQ-004 — filterVerifiersByProofRoute on the production path', () => {
  it('keeps verifiers for claims whose proof the route plan selected', () => {
    const plan = planProofRoute({
      ...request({ claims: [{ id: 'C-1', claim: 'API route validates input' }] }),
      claims: [{ id: 'C-1', claim: 'API route validates input' }],
    });
    const packet = {
      task_id: 'T-1', goal: 'g', requirements: [], acceptance: [{ claim_id: 'C-1', verifier_id: 'V-1' }],
      scope: { owned: [], forbidden: [] }, work_id: 'W-1', execution_generation: 0, spec_revision: 1,
    } as any;
    const { selected, omitted } = filterVerifiersByProofRoute(packet, { risk_class: 'S1' }, [{ claim_id: 'C-1', verifier: verifier('V-1') }], plan);
    expect(selected.map((e) => e.verifier.id)).toContain('V-1');
    // The route plan selected proof for C-1, so nothing is silently dropped.
    expect(omitted.filter((o) => o.claim_id === 'C-1' && o.verifier_id === 'V-1')).toHaveLength(0);
  });

  it('keeps ALL verifiers for a claim with no selected proof (never silently skips required proof)', () => {
    const plan = planProofRoute({ ...request(), claims: [{ id: 'C-UNROUTED', claim: 'unrouted claim' }] });
    // Plan has no selection for C-UNROUTED.
    const packet = {
      task_id: 'T-1', goal: 'g', requirements: [], acceptance: [{ claim_id: 'C-UNROUTED', verifier_id: 'V-1' }],
      scope: { owned: [], forbidden: [] }, work_id: 'W-1', execution_generation: 0, spec_revision: 1,
    } as any;
    const { selected } = filterVerifiersByProofRoute(packet, { risk_class: 'S1' }, [{ claim_id: 'C-UNROUTED', verifier: verifier('V-1') }], plan);
    expect(selected.map((e) => e.verifier.id)).toContain('V-1');
  });
});

describe('proof router — receipt completeness', () => {
  it('emits a complete receipt with every owner §12 field', () => {
    const route = routeProofs(request(), [{ proof_id: 'planned:0', status: 'PASS' }], {
      evidence_refs: ['/repo/evidence/api-contract.json'],
      escalation_decisions: ['escalated auth check to live handshake'],
    });
    const r = route.receipt;
    expect(r.schema).toBe('agent-rules/proof-receipt/v1');
    expect(r.task_id).toBe('T-ROUTE');
    expect(r.repository).toBe('/repo');
    expect(r.changed_scope).toEqual(['src/api/route.ts']);
    expect(r.claims.length).toBe(1);
    expect(r.risks).toContain('auth');
    expect(r.selected_profile).toBeTruthy();
    expect(r.results.length).toBe(1);
    expect(r.evidence_refs).toContain('/repo/evidence/api-contract.json');
    expect(r.escalation_decisions).toContain('escalated auth check to live handshake');
    expect(r.final_status).toBe('PASS');
    expect(r.generated_at).toBeTruthy();
  });

  it('route trace records trigger/profile/fidelity/selected/omitted/final', () => {
    const route = routeProofs(request(), [{ proof_id: 'planned:0', status: 'PASS' }]);
    expect(route.route_trace.length).toBeGreaterThanOrEqual(6);
    expect(route.route_trace[0]).toContain('trigger:');
    expect(route.route_trace[1]).toContain('profile:');
    expect(route.route_trace.some((t) => t.startsWith('final_status:'))).toBe(true);
  });

  it('keeps the receipt honest when a required proof is blocked', () => {
    const route = routeProofs(
      request({
        trigger: { changed_files: ['src/mcp.ts'], runtime_surfaces: ['mcp'] },
        claims: [{ id: 'C-MCP', claim: 'mcp handshake', live_surface: true }],
      }),
      [{ proof_id: 'x', status: 'BLOCKED' }],
    );
    expect(route.receipt.final_status).toBe('BLOCKED');
    expect(route.receipt.omitted.some((o) => o.category === 'live')).toBe(true);
  });

  it('empty claim set yields NEEDS_USER, not PASS', () => {
    const route = routeProofs(request({ claims: [] }), []);
    expect(route.receipt.final_status).toBe('NEEDS_USER');
  });
});
