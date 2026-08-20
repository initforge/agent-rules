import { describe, expect, it } from 'vitest';
import { createWorkRequest, compileWorkSpec, compileSpecRevision, compileTaskPackets } from '../src/northstar/compiler.js';
import { planRevisionInvalidation } from '../src/northstar/revision-invalidation.js';
import { deriveContextFeedback } from '../src/northstar/context-feedback.js';
import { assessConvergence, compileConvergenceDeltaPackets, convergenceFingerprint, detectConvergenceOscillation } from '../src/northstar/convergence.js';
import { auditIntentCoverage } from '../src/northstar/semantic-auditor.js';
import type { AcceptanceResult } from '../src/northstar/evidence-ledger.js';

describe('North-Star closure feedback loops', () => {
  it('propagates spec revision changes into stale task/evidence truth', () => {
    const request = createWorkRequest({ raw_intent: 'Add compatible API endpoint' });
    const first = compileWorkSpec(request, { requirements: [{ id:'R-001', statement:'API exists', claims:[{ claim_id:'C-001a', statement:'returns 200', class:'runtime', verifier_id:'V' }] }] });
    const packets = compileTaskPackets(first, [{ goal:'implement', requirement_ids:['R-001'], claim_ids:['C-001a'], owned:['src'], verifier_by_claim:{'C-001a':'V'} }]);
    const next = compileSpecRevision(first, { requirements: [{ id:'R-001', statement:'API keeps compatible shape', claims:[{ claim_id:'C-001a', statement:'returns compatible JSON', class:'runtime', verifier_id:'V' }] }] });
    const plan = planRevisionInvalidation({ impact: next.impact, packets, evidence:[{ protocol_version:'2.0', evidence_id:'E-1', claim_id:'C-001a', task_id:'T-001', kind:'integration', status:'pass' }] });
    expect(plan.tasks[0].disposition).toBe('INVALIDATED');
    expect(plan.stale_evidence_ids).toEqual(['E-1']);
  });

  it('derives bounded targeted context requests from failure text', () => {
    const feedback = deriveContextFeedback({ failure:'method PaymentService.create failed in src/payment/service.ts:88; check architecture contract', prior:{ task_id:'T', items:[], estimated_tokens:0, omitted:[], retrieval:{ semantic_queries:0, semantic_hits:0, lexical_queries:0 } } });
    expect(feedback.some((x) => x.kind === 'symbol' && x.query === 'PaymentService.create')).toBe(true);
    expect(feedback.some((x) => x.kind === 'path' && x.query === 'src/payment/service.ts')).toBe(true);
    expect(feedback.length).toBeLessThanOrEqual(6);
  });

  it('fails convergence when deterministic truth or independent audit still has gaps', () => {
    const request = createWorkRequest({ raw_intent:'Implement auth guard' });
    const compiled = compileWorkSpec(request, { requirements:[{ id:'R-001', statement:'Auth guard exists', claims:[{ claim_id:'C-001a', statement:'unauthenticated blocked', class:'runtime', verifier_id:'V' }] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'guard', requirement_ids:['R-001'], claim_ids:['C-001a'], owned:['src'], verifier_by_claim:{'C-001a':'V'} }]);
    const acceptance: AcceptanceResult = { outcome:'BLOCKED', accepted_claims:[], failed_claims:[], unresolved_claims:['C-001a'], reasons:[] };
    const result = assessConvergence({ spec:compiled.spec, packets, acceptance, audit:{ accepted:false, findings:['semantic gap'] } });
    expect(result.converged).toBe(false);
    expect(result.delta_tasks.length).toBeGreaterThan(0);
  });

  it('compiles only claim-grounded bounded delta packets and preserves verifier scope', () => {
    const request = createWorkRequest({ raw_intent:'Implement auth guard' });
    const compiled = compileWorkSpec(request, { requirements:[{ id:'R-001', statement:'Auth guard exists', claims:[{ claim_id:'C-001a', statement:'unauthenticated blocked', class:'runtime', verifier_id:'V' }] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'guard', requirement_ids:['R-001'], claim_ids:['C-001a'], owned:['src/auth'], forbidden:['src/generated'], verifier_by_claim:{'C-001a':'V'} }]);
    const result = assessConvergence({
      spec:compiled.spec,
      packets,
      acceptance:{ outcome:'BLOCKED', accepted_claims:[], failed_claims:[], unresolved_claims:['C-001a'], reasons:[] },
      audit:{ accepted:false, findings:['semantic gap'] },
    });
    const delta = compileConvergenceDeltaPackets({ spec:compiled.spec, packets, result, pass:1, maxTasks:1 });
    expect(delta.packets).toHaveLength(1);
    expect(delta.packets[0]).toMatchObject({
      task_id:'T-DELTA-1-1-001',
      requirements:['R-001'],
      acceptance:[{ claim_id:'C-001a', verifier_id:'V' }],
      scope:{ owned:['src/auth'], forbidden:['src/generated'] },
    });
    expect(delta.packets[0]?.repair?.previous_failure).toContain('unresolved');

    const nonClaim = compileConvergenceDeltaPackets({ spec:compiled.spec, packets, result:{ ...result, gaps:[{ id:'AUDIT:1', severity:'critical', reason:'owner truth missing' }] }, pass:2 });
    expect(nonClaim.packets).toHaveLength(0);
    expect(nonClaim.skipped[0]?.reason).toContain('no claim anchor');
  });

  it('detects a repeated convergence gap without treating it as PASS', () => {
    const first = { converged: false, gaps: [{ id:'UNRESOLVED:C-1', severity:'critical' as const, reason:'missing oracle', claim_id:'C-1' }], delta_tasks: [] };
    const changed = { ...first, gaps: [{ ...first.gaps[0]!, reason:'different repair result' }] };
    expect(convergenceFingerprint(first)).not.toBe(convergenceFingerprint(changed));
    expect(detectConvergenceOscillation([first, changed]).detected).toBe(false);
    expect(detectConvergenceOscillation([first, changed, first]).detected).toBe(true);
    expect(detectConvergenceOscillation([first, changed, first]).repeat_index).toBe(2);
  });

  it('rejects obvious intent/spec drift and dropped explicit constraints', () => {
    const request = createWorkRequest({ raw_intent:'Implement browser visual parity for employee department permissions matrix', explicit_constraints:['do not change API'] });
    const compiled = compileWorkSpec(request, { requirements:[{ statement:'Update README', claims:[{ statement:'docs render', class:'mechanical', verifier_id:'V' }] }] });
    const corrupted = { ...compiled.spec, constraints: undefined };
    const result = auditIntentCoverage(request, corrupted);
    expect(result.verdict).toBe('REJECT');
    expect(result.findings.some((f) => f.code === 'CONSTRAINT_DROPPED')).toBe(true);
  });
});

describe('proof DAG and empirical compute routing', () => {
  it('honors explicit claim dependencies and oracle groups', async () => {
    const { buildVerificationGraph } = await import('../src/northstar/verification-graph.js');
    const request = createWorkRequest({ raw_intent:'Implement runtime and semantic behavior' });
    const compiled = compileWorkSpec(request, { requirements:[{ statement:'feature', claims:[
      { claim_id:'C-001a', statement:'unit', class:'mechanical', verifier_id:'V1' },
      { claim_id:'C-001b', statement:'runtime', class:'runtime', verifier_id:'V2', depends_on:['C-001a'], oracle_group:'runtime' },
      { claim_id:'C-001c', statement:'semantic', class:'semantic', verifier_id:'V3', depends_on:['C-001b'], oracle_group:'independent-review' },
    ] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'feature', requirement_ids:['R-001'], claim_ids:['C-001a','C-001b','C-001c'], owned:['src'], verifier_by_claim:{'C-001a':'V1','C-001b':'V2','C-001c':'V3'} }]);
    const graph = buildVerificationGraph(packets, compiled.manifest);
    expect(graph.find((node) => node.claim_id === 'C-001c')?.depends_on).toEqual(['C-001b']);
    expect(graph.find((node) => node.claim_id === 'C-001c')?.oracle_group).toBe('independent-review');
  });

  it('selects provider by verified evidence without violating the logical model floor', async () => {
    const { selectProviderByEvidence } = await import('../src/northstar/model-governor.js');
    const selected = selectProviderByEvidence({ decision:{ logical_class:'standard', reasons:[], escalated:true }, candidates:[
      { provider_id:'cheap', logical_class:'economy', verified_success_rate:0.99, sample_size:100 },
      { provider_id:'steady', logical_class:'standard', verified_success_rate:0.9, sample_size:50, health:1, mean_cost_usd:0.2 },
      { provider_id:'lucky', logical_class:'standard', verified_success_rate:1, sample_size:1, health:1, mean_cost_usd:0.1 },
    ] });
    expect(selected.provider_id).toBe('steady');
  });
});

describe('final fail-closed closure gate', () => {
  it('distinguishes source-complete from fully certified when host/live proof is unavailable', async () => {
    const { evaluateNorthStarClosure } = await import('../src/northstar/closure-gates.js');
    const report = evaluateNorthStarClosure({
      contract_traceability:true, deterministic_acceptance:true, independent_semantic_review:null, convergence_audit:true,
      spec_revision_invalidation:true, proof_dag:true, context_feedback_loop:true, bounded_skill_capability_surface:true,
      empirical_model_routing:null, crash_resume:true, forbidden_scope_enforcement:true, evidence_integrity:true,
      false_green_rejection:true, resource_governance:true, platform_portability:null, browser_visual_live:null,
      lower_tier_ablation:null, clean_host_full_suite:null,
    });
    expect(report.source_complete).toBe(true);
    expect(report.release_ready).toBe(false);
    expect(report.blockers).toContain('lower-tier-ablation');
  });

  it('requires every applicable gate for final certification', async () => {
    const { evaluateNorthStarClosure } = await import('../src/northstar/closure-gates.js');
    const report = evaluateNorthStarClosure({
      contract_traceability:true, deterministic_acceptance:true, independent_semantic_review:true, convergence_audit:true,
      spec_revision_invalidation:true, proof_dag:true, context_feedback_loop:true, bounded_skill_capability_surface:true,
      empirical_model_routing:true, crash_resume:true, forbidden_scope_enforcement:true, evidence_integrity:true,
      false_green_rejection:true, resource_governance:true, platform_portability:true, browser_visual_live:true,
      mobile_live:true, lower_tier_ablation:true, clean_host_full_suite:true,
    });
    expect(report.release_ready).toBe(true);
  });
});

describe('proof ordering and oracle independence hardening', () => {
  it('topologically orders explicit same-cost dependencies', async () => {
    const { buildVerificationGraph } = await import('../src/northstar/verification-graph.js');
    const request = createWorkRequest({ raw_intent:'prove dependent static claims' });
    const compiled = compileWorkSpec(request, { requirements:[{ statement:'feature', claims:[
      { claim_id:'C-001a', statement:'base', class:'mechanical', verifier_id:'V1' },
      { claim_id:'C-001b', statement:'dependent', class:'mechanical', verifier_id:'V2', depends_on:['C-001a'] },
    ] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'feature', requirement_ids:['R-001'], claim_ids:['C-001b','C-001a'], owned:['src'], verifier_by_claim:{'C-001a':'V1','C-001b':'V2'} }]);
    const graph = buildVerificationGraph(packets, compiled.manifest);
    expect(graph.map((node) => node.claim_id)).toEqual(['C-001a','C-001b']);
  });

  it('topologically orders cross-task proof even when the prerequisite packet was listed later', async () => {
    const { buildVerificationGraph } = await import('../src/northstar/verification-graph.js');
    const request = createWorkRequest({ raw_intent:'prove ordered tasks' });
    const compiled = compileWorkSpec(request, { requirements:[
      { id:'R-001', statement:'first', claims:[{ claim_id:'C-001a', statement:'first depends later', class:'mechanical', verifier_id:'V1', depends_on:['C-002a'] }] },
      { id:'R-002', statement:'second', claims:[{ claim_id:'C-002a', statement:'second proof', class:'mechanical', verifier_id:'V2' }] },
    ] });
    const packets = compileTaskPackets(compiled, [
      { goal:'dependent', requirement_ids:['R-001'], claim_ids:['C-001a'], owned:['src/a'], verifier_by_claim:{'C-001a':'V1'} },
      { goal:'prerequisite', requirement_ids:['R-002'], claim_ids:['C-002a'], owned:['src/b'], verifier_by_claim:{'C-002a':'V2'} },
    ]);
    const graph = buildVerificationGraph(packets, compiled.manifest);
    expect(graph.map((node) => node.claim_id)).toEqual(['C-002a','C-001a']);
  });

  it('counts independent oracle lineages, not merely evidence kinds', async () => {
    const { deriveAcceptance } = await import('../src/northstar/evidence-ledger.js');
    const request = createWorkRequest({ raw_intent:'high risk proof', risk_hint:'S2' });
    const compiled = compileWorkSpec(request, { risk_class:'S2', requirements:[{ statement:'feature', claims:[
      { claim_id:'C-001a', statement:'works', class:'runtime', verifier_id:'V1', required_kinds:['test','integration'] },
    ] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'feature', requirement_ids:['R-001'], claim_ids:['C-001a'], owned:['src'], verifier_by_claim:{'C-001a':'V1'} }]);
    const envelope = (record:any, seq:number) => ({ seq, origin:'verifier' as const, previous_hash:'x', record, envelope_hash:'x' });
    const base = { protocol_version:'2.0', claim_id:'C-001a', task_id:'T-001', status:'pass' as const };
    const correlated = deriveAcceptance({ spec:compiled.spec, packets, manifest:compiled.manifest, evidence:[
      envelope({...base,evidence_id:'E-1',kind:'test',verifier_id:'V1',oracle_group:'same'},1),
      envelope({...base,evidence_id:'E-2',kind:'integration',verifier_id:'V2',oracle_group:'same'},2),
    ] });
    expect(correlated.outcome).toBe('PARTIAL');
    const independent = deriveAcceptance({ spec:compiled.spec, packets, manifest:compiled.manifest, evidence:[
      envelope({...base,evidence_id:'E-1',kind:'test',verifier_id:'V1',oracle_group:'unit'},1),
      envelope({...base,evidence_id:'E-2',kind:'integration',verifier_id:'V2',oracle_group:'runtime'},2),
    ] });
    expect(independent.outcome).toBe('PASS');
  });
});

describe('proof dependency completeness', () => {
  it('rejects dependencies whose claim exists in the manifest but has no executable proof node', async () => {
    const { buildVerificationGraph } = await import('../src/northstar/verification-graph.js');
    const request = createWorkRequest({ raw_intent:'prove routed dependency completeness' });
    const compiled = compileWorkSpec(request, { requirements:[{ statement:'feature', claims:[
      { claim_id:'C-001a', statement:'base but unrouted', class:'mechanical', verifier_id:'V1' },
      { claim_id:'C-001b', statement:'dependent', class:'mechanical', verifier_id:'V2', depends_on:['C-001a'] },
    ] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'partial route', requirement_ids:['R-001'], claim_ids:['C-001b'], owned:['src'], verifier_by_claim:{'C-001b':'V2'} }]);
    expect(() => buildVerificationGraph(packets, compiled.manifest)).toThrow(/depends on unrouted claim/);
  });
});

describe('multi-oracle proof node identity', () => {
  it('keeps multiple verifier nodes for one claim and expands dependent claims to all prerequisite proof nodes', async () => {
    const { buildVerificationGraph } = await import('../src/northstar/verification-graph.js');
    const request = createWorkRequest({ raw_intent:'multi oracle proof' });
    const compiled = compileWorkSpec(request, { requirements:[{ statement:'feature', claims:[
      { claim_id:'C-001a', statement:'base', class:'runtime', verifier_id:'V1' },
      { claim_id:'C-001b', statement:'semantic dependent', class:'semantic', verifier_id:'V3', depends_on:['C-001a'] },
    ] }] });
    const packets = compileTaskPackets(compiled, [{ goal:'feature', requirement_ids:['R-001'], claim_ids:['C-001a','C-001b'], owned:['src'], verifiers_by_claim:{'C-001a':['V1','V2'],'C-001b':['V3']} }]);
    const graph = buildVerificationGraph(packets, compiled.manifest, { V1:'runtime-a', V2:'runtime-b', V3:'semantic' });
    const base = graph.filter((node) => node.claim_id === 'C-001a');
    const dependent = graph.find((node) => node.claim_id === 'C-001b')!;
    expect(base).toHaveLength(2);
    expect(new Set(base.map((node) => node.node_id)).size).toBe(2);
    expect(new Set(dependent.depends_on_nodes)).toEqual(new Set(base.map((node) => node.node_id)));
    expect(graph.indexOf(dependent)).toBeGreaterThan(Math.max(...base.map((node) => graph.indexOf(node))));
  });
});
