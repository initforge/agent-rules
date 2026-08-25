import { describe, it, expect } from 'vitest';
import {
  buildContextCapsule,
  assertCapsuleComplete,
  classifyPromptRelation,
  compactCapsulePreservingProof,
  type ContextCapsule,
} from '../../src/northstar/context-capsule.js';

const spec = {
  spec_id: 'S-1',
  revision: 1,
  requirements: [{ id: 'R-1', statement: 'do x', mandatory: true, claims: [] }],
  decisions: ['DEC-01'],
} as never;

const request = { work_id: 'W-1', raw_intent: 'Implement deterministic status output', source: 'cli' } as never;

function capsule(): ContextCapsule {
  return buildContextCapsule({
    request,
    spec,
    planId: 'P-1',
    taskId: 'T-1',
    owned: ['src'],
    forbidden: ['src/secrets'],
    skillRoute: { context_generation: 1, selected: ['quality'], resolved_by: 'skill-resolver', facts_hash: 'abc123' },
    capabilityPlan: [{ capability: 'code.verify', provider: null, mcp: false }],
    evidenceRefs: [{ path: '.agent/evidence/e1.json', sha256: 'abc' }],
    remainingWork: ['task 2'],
    nextAction: 'run verifier',
    contextGeneration: 1,
  });
}

describe('context-capsule (REQ-108)', () => {
  it('builds a complete capsule with all required fields', () => {
    const c = capsule();
    expect(c.schema).toBe('agent-rules/context-capsule/v1');
    expect(c.raw_request_ref).toBe('W-1');
    expect(c.raw_intent).toBe('Implement deterministic status output');
    expect(c.effective_requirements).toEqual(['R-1']);
    expect(c.plan_id).toBe('P-1');
    expect(c.task_id).toBe('T-1');
    expect(c.owned_scope).toEqual(['src']);
    expect(c.forbidden_scope).toEqual(['src/secrets']);
    expect(c.skill_route?.selected).toEqual(['quality']);
    expect(c.capability_plan).toHaveLength(1);
    expect(c.evidence_refs).toHaveLength(1);
    expect(c.next_action).toBe('run verifier');
    expect(assertCapsuleComplete(c)).toEqual([]);
  });

  it('rejects a capsule missing proof-critical fields', () => {
    const c = capsule();
    const broken = buildContextCapsule({
      request: { work_id: 'W-1', raw_intent: '   ', source: 'cli' } as never,
      spec,
      planId: 'P-1',
      taskId: 'T-1',
      owned: [],
      forbidden: [],
      nextAction: '',
      contextGeneration: -1,
    });
    const problems = assertCapsuleComplete(broken);
    expect(problems).toContain('raw intent missing');
    expect(problems).toContain('next action missing');
    expect(problems).toContain('context_generation invalid');
    expect(problems.length).toBeGreaterThan(0);
  });

  it('classifies prompts into the five relations', () => {
    const c = capsule();
    expect(classifyPromptRelation(c, 'Implement deterministic status output now').relation).toBe('compatible');
    expect(classifyPromptRelation(c, 'Refine the status output format to JSON').relation).toBe('refinement');
    expect(classifyPromptRelation(c, 'This supersedes the previous plan entirely').relation).toBe('supersedes');
    expect(classifyPromptRelation(c, 'This conflicts with what we agreed').relation).toBe('conflict');
    expect(classifyPromptRelation(c, 'Unrelated: fix the login page styling').relation).toBe('unrelated');
  });

  it('compaction preserves proof-critical fields', () => {
    const c = capsule();
    const compacted = compactCapsulePreservingProof(c, { remainingWork: ['task 3'], nextAction: 'verify task 3' });
    expect(compacted.raw_intent).toBe(c.raw_intent);
    expect(compacted.effective_requirements).toEqual(c.effective_requirements);
    expect(compacted.skill_route).toEqual(c.skill_route);
    expect(compacted.evidence_refs).toEqual(c.evidence_refs);
    expect(compacted.remaining_work).toEqual(['task 3']);
    // A compaction that would break the capsule must throw.
    expect(() => compactCapsulePreservingProof(c, { nextAction: '' })).toThrow(/compaction would break capsule/);
  });

  it('skill resolver runs once per context_generation (receipt recorded)', () => {
    const c = capsule();
    expect(c.skill_route?.context_generation).toBe(1);
    expect(c.skill_route?.resolved_by).toBe('skill-resolver');
    const second = buildContextCapsule({
      request, spec, planId: 'P-1', taskId: 'T-1', owned: ['src'], forbidden: [],
      skillRoute: { context_generation: 2, selected: [], resolved_by: 'skill-resolver', facts_hash: 'def' },
      nextAction: 'x', contextGeneration: 2,
    });
    expect(second.skill_route?.context_generation).toBe(2);
  });
});