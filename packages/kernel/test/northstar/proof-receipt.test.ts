/**
 * REQ-007 — the verification router emits a proof receipt with task identity,
 * repository, changed scope, claims, risks, profile, selected tests, omitted
 * tests, omission reasons, escalation decisions, environment, results,
 * evidence references and final status.
 */
import { describe, it, expect } from 'vitest';
import { routeProofs, type ProofRouteRequest } from '../../src/northstar/proof-router.js';

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
