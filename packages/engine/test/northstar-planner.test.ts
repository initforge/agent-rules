import { describe, expect, it } from 'vitest';
import { compilePlannerContract, createWorkRequest } from '../src/northstar/index.js';

const intent = 'Refactor runtime architecture across packages without weakening verification';
const request = createWorkRequest({ raw_intent: intent, source: 'cli', risk_hint: 'S2' });

function contract() {
  return {
    protocol_version: '2.0',
    raw_intent: intent,
    risk_class: 'S2',
    known: ['Production runner behavior must remain intact'],
    assumed: [],
    unresolved: [],
    requires_user: [],
    impact: {
      owning_modules: ['packages/engine'], dependency_breadth: 'cross-package', public_api: [], schema_data: [], security_boundaries: [],
      reference_dependencies: ['packages/engine/src/runner'], relevant_tests: ['packages/engine/test'], active_decisions: [],
    },
    requirements: [{
      id: 'R-001', statement: intent, mandatory: true,
      claims: [{ claim_id: 'C-001a', statement: 'Runtime architecture is refactored with behavior preserved', class: 'runtime', required_kinds: ['test', 'integration'] }],
    }],
    tasks: [{
      goal: intent,
      phase: 'implement',
      requirement_ids: ['R-001'], claim_ids: ['C-001a'], owned: ['packages/engine/src'], forbidden: ['packages/engine/test'],
      verifiers_by_claim: { 'C-001a': ['V-test', 'V-integration'] },
    }],
    verifiers: [
      { id: 'V-test', kind: 'test', argv: { executable: 'node', args: ['--version'] } },
      { id: 'V-integration', kind: 'integration', argv: { executable: 'node', args: ['--version'] } },
    ],
  };
}

describe('North-Star strong planner contract', () => {
  it('compiles S2 into bounded TaskPackets only after two independent verifier channels exist', () => {
    const result = compilePlannerContract(request, contract());
    expect(result.compiled.requires_planner).toBe(false);
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0].phase).toBe('implement');
    expect(result.packets[0].acceptance).toEqual([
      { claim_id: 'C-001a', verifier_id: 'V-test' },
      { claim_id: 'C-001a', verifier_id: 'V-integration' },
    ]);
  });

  it('rejects S2 contracts that can only prove a mandatory claim through one channel', () => {
    const value = contract();
    value.tasks[0].verifiers_by_claim['C-001a'] = ['V-test'];
    expect(() => compilePlannerContract(request, value)).toThrow(/1\/2 independent verifier channel/);
  });

  it('binds the contract to raw intent and refuses planner risk downgrades', () => {
    expect(() => compilePlannerContract(request, { ...contract(), raw_intent: 'different' })).toThrow(/raw_intent/);
    expect(() => compilePlannerContract(request, { ...contract(), risk_class: 'S1' })).toThrow(/may not lower risk/);
  });

  it('persists structured planner knowledge/impact and blocks hidden user decisions', () => {
    const result = compilePlannerContract(request, contract());
    expect(result.compiled.spec.known).toContain('Production runner behavior must remain intact');
    expect(result.compiled.spec.impact?.owning_modules).toEqual(['packages/engine']);
    const blocked: any = contract();
    blocked.requires_user = ['Which public API may change?'];
    expect(() => compilePlannerContract(request, blocked)).toThrow(/requires user input/);
  });

  it('rejects planner-generated destructive verifier commands and workspace escape', () => {
    const destructive: any = contract();
    destructive.verifiers[0].argv = { executable: 'rm', args: ['-rf', '.'] };
    expect(() => compilePlannerContract(request, destructive)).toThrow(/forbidden executable/);
    const escaping: any = contract();
    escaping.verifiers[0].argv.cwd = '../../outside';
    expect(() => compilePlannerContract(request, escaping)).toThrow(/cwd must remain relative/);
    const evalInjected: any = contract();
    evalInjected.verifiers[0].argv = { executable: 'node', args: ['-e', 'process.exit(0)'] };
    expect(() => compilePlannerContract(request, evalInjected)).toThrow(/Node eval/);
  });

  it('rejects shell-string verifier injection and unknown fields', () => {
    const value: any = contract();
    value.verifiers[0] = { id: 'V-test', kind: 'test', command: 'npm test && rm -rf /' };
    expect(() => compilePlannerContract(request, value)).toThrow(/unknown field|argv/);
  });
});
