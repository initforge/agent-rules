/**
 * Phase 2 + 3 — intent corrections, disposition/DoD, causal maps.
 */
import { describe, it, expect } from 'vitest';
import { createWorkRequest, compileWorkSpec } from '../../src/northstar/compiler.js';
import { appendIntentEvent, applyIntentEventsToSpec, classifyProtocolPlanRelation } from '../../src/northstar/protocol.js';
import { compileDoD, compileFrozenContract } from '../../src/northstar/portable-plan.js';
import { requiresCausalMap, validateCausalMapForWork } from '../../src/northstar/causal-map.js';
import { assertWorkRequest } from '../../src/northstar/protocol.js';
import { createWorkRequest as createWR } from '../../src/northstar/compiler.js';

describe('Phase 2 — intent correction wiring', () => {
  it('REJECT event marks the subject as REJECTED in the spec', () => {
    const request = createWR({ raw_intent: 'build widget' });
    const spec = compileWorkSpec(request, { requirements: [{ statement: 'ship widget', mandatory: true }] }).spec;
    const corrected = appendIntentEvent(request, { kind: 'REJECT', subject: 'R-001', provenance: 'operator', rationale: 'not needed' });
    const effective = applyIntentEventsToSpec(spec, corrected);
    expect(effective.items?.some((i) => i.id === 'R-001' && i.status === 'REJECTED')).toBe(true);
  });

  it('SUPERSEDE event supersedes the replaced item and adds the new one', () => {
    const request = createWR({ raw_intent: 'build widget' });
    const spec = compileWorkSpec(request, { requirements: [{ id: 'R-001', statement: 'old widget', mandatory: true }] }).spec;
    const corrected = appendIntentEvent(request, { kind: 'SUPERSEDE', subject: 'R-002', replaces: 'R-001', provenance: 'operator' });
    const effective = applyIntentEventsToSpec(spec, corrected);
    expect(effective.items?.some((i) => i.id === 'R-001' && i.status === 'SUPERSEDED')).toBe(true);
    expect(effective.items?.some((i) => i.id === 'R-002' && i.status === 'ACTIVE')).toBe(true);
  });

  it('classifies plan relations correctly', () => {
    expect(classifyProtocolPlanRelation({
      activeObjectives: ['build widget'], incomingObjective: 'build widget v2',
      activeRequirementIds: ['R-001'], incomingRequirementIds: ['R-001'],
      activeConstraints: [], incomingConstraints: [],
    })).toBe('CONTINUATION');
    expect(classifyProtocolPlanRelation({
      activeObjectives: ['build widget'], incomingObjective: 'completely different',
      activeRequirementIds: ['R-001'], incomingRequirementIds: ['R-999'],
      activeConstraints: [], incomingConstraints: [],
    })).toBe('SUPERSESSION');
  });
});

describe('Phase 2 — compiled DoD / disposition', () => {
  it('PLAN_ONLY requires only CODE', () => {
    const dod = compileDoD({ disposition: 'PLAN_ONLY' });
    expect(dod.required).toEqual(['CODE']);
  });

  it('EXPORT_HANDOFF keeps the full self-contained DoD', () => {
    const dod = compileDoD({ disposition: 'EXPORT_HANDOFF', obligations: { requires_release: true } });
    expect(dod.required).toEqual(['CODE', 'BEHAVIOR', 'RELEASE', 'TERMINAL']);
  });

  it('EXPORT_HANDOFF without release obligations is not over-deepened (REQ-008)', () => {
    const dod = compileDoD({ disposition: 'EXPORT_HANDOFF' });
    expect(dod.required).toEqual(['CODE', 'BEHAVIOR', 'TERMINAL']);
  });

  it('PLAN_ONLY with a release obligation still carries RELEASE (REQ-008)', () => {
    const dod = compileDoD({ disposition: 'PLAN_ONLY', obligations: { requires_release: true } });
    expect(dod.required).toContain('RELEASE');
    expect(dod.required).toContain('CODE');
  });

  it('LOCAL_EXECUTE with S2 risk requires CODE+BEHAVIOR+RELEASE+TERMINAL', () => {
    const dod = compileDoD({ disposition: 'LOCAL_EXECUTE', riskClass: 'S2' });
    expect(dod.required).toContain('RELEASE');
    expect(dod.required).toContain('TERMINAL');
  });

  it('LOCAL_EXECUTE S0 without release scope is CODE+BEHAVIOR+TERMINAL', () => {
    const dod = compileDoD({ disposition: 'LOCAL_EXECUTE', riskClass: 'S0' });
    expect(dod.required).toEqual(['CODE', 'BEHAVIOR', 'TERMINAL']);
  });
});

describe('Phase 3 — causal maps', () => {
  it('S0 work does not require a causal map', () => {
    expect(requiresCausalMap('S0', false)).toBe(false);
  });

  it('S2/S3/cross-cutting work requires a causal map', () => {
    expect(requiresCausalMap('S2', false)).toBe(true);
    expect(requiresCausalMap('S3', false)).toBe(true);
    expect(requiresCausalMap('S0', true)).toBe(true);
  });

  it('validates causal map for S2 work', () => {
    const valid = validateCausalMapForWork({
      riskClass: 'S2', isCrossCutting: false,
      causalMap: {
        schema: 'agent-rules/causal-map/v1', version: 1,
        symptom: 'widget fails', root_layer: 'canonical_source',
        nodes: [{ layer: 'canonical_source', producer: 'global_harness', description: 'bug in routing.ts' }],
        edges: [], fix_layer: 'canonical_source', fix_path: 'packages/kernel/src/northstar/routing.ts',
      },
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects S2 work without a causal map', () => {
    const result = validateCausalMapForWork({ riskClass: 'S2', isCrossCutting: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('requires a causal map');
  });

  it('rejects a causal map whose fix terminates at consumer_behavior', () => {
    const result = validateCausalMapForWork({
      riskClass: 'S2', isCrossCutting: false,
      causalMap: {
        schema: 'agent-rules/causal-map/v1', version: 1,
        symptom: 'widget fails', root_layer: 'consumer_behavior',
        nodes: [{ layer: 'consumer_behavior', producer: 'project_local', description: 'fix in consumer repo' }],
        edges: [], fix_layer: 'consumer_behavior',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('canonical source');
  });
});
