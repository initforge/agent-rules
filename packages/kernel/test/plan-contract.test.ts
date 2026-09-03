import { describe, expect, it } from 'vitest';
import { validatePlanContract, type PlanContractInput } from '../src/harness/planning/plan-contract.js';

const base: PlanContractInput = {
  outcome: 'ship the slice',
  locked_contract: 'preserve public behavior',
  requirements: [{ id: 'R1', change_kind: 'MODIFY', statement: 'change internals', acceptance: ['A1'] }],
  acceptance: [{ id: 'A1', claim: 'behavior preserved', proof: 'run focused test' }],
  slices: [{ id: 'S1', change: 'modify internals', change_kind: 'MODIFY', requirements: ['R1'], acceptance: ['A1'], source_proof: ['inspect diff'], runtime_proof: ['npm test'] }],
  escalation_boundary: ['stop before changing public contract'],
};

describe('transient plan contract validator', () => {
  it('accepts a valid plan contract', () => {
    const result = validatePlanContract(base);
    expect(result.ok).toBe(true);
    expect(result.unrunnable).toBe(false);
    expect(result.blocked_slices).toEqual([]);
  });

  it('rejects duplicate ids', () => {
    const dup = validatePlanContract({ ...base, requirements: [...base.requirements, { ...base.requirements[0] }] });
    expect(dup.ok).toBe(false);
    expect(dup.issues.some((i) => /duplicate requirement id/.test(i.message))).toBe(true);
  });

  it('rejects a dependency graph that is not closed or is cyclic', () => {
    const open = validatePlanContract({ ...base, slices: [{ ...base.slices[0], depends_on: ['missing'] }] });
    expect(open.ok).toBe(false);
    expect(open.issues.some((i) => /unknown dependency/.test(i.message))).toBe(true);

    const cyclic = validatePlanContract({
      ...base,
      slices: [
        { ...base.slices[0], id: 'S1', depends_on: ['S2'] },
        { ...base.slices[0], id: 'S2', depends_on: ['S1'] },
      ],
    });
    expect(cyclic.ok).toBe(false);
    expect(cyclic.issues.some((i) => /dependency cycle/.test(i.message))).toBe(true);
  });

  it('requires every requirement to map to an existing acceptance', () => {
    const broken = validatePlanContract({ ...base, requirements: [{ ...base.requirements[0], acceptance: ['GHOST'] }] });
    expect(broken.ok).toBe(false);
    expect(broken.issues.some((i) => /unknown acceptance/.test(i.message))).toBe(true);
  });
  it('requires every slice requirement to reference a known requirement', () => {
    const ghost = validatePlanContract({ ...base, slices: [{ ...base.slices[0], requirements: ['GHOST'] }] });
    expect(ghost.ok).toBe(false);
    expect(ghost.issues.some((i) => /unknown requirement GHOST/.test(i.message))).toBe(true);
  });

  it('requires every requirement to map to at least one slice', () => {
    const unmapped = validatePlanContract({
      ...base,
      requirements: [
        ...base.requirements,
        { id: 'R2', change_kind: 'MODIFY', statement: 'unmapped', acceptance: ['A1'] },
      ],
    });
    expect(unmapped.ok).toBe(false);
    expect(unmapped.issues.some((i) => /requirement R2 is not mapped to any slice/.test(i.message))).toBe(true);
  });

  it('requires every acceptance to map to a slice with proof', () => {
    const noProof = validatePlanContract({ ...base, slices: [{ ...base.slices[0], source_proof: [], runtime_proof: [] }] });
    expect(noProof.ok).toBe(false);
    expect(noProof.issues.some((i) => /no source or runtime proof/.test(i.message))).toBe(true);
  });

  it('REPLACE|RETIRE|MIGRATE and refactor/redesign require preservation covering all five dimensions', () => {
    const replaceInput: PlanContractInput = {
      ...base,
      requirements: [{ id: 'R2', change_kind: 'REPLACE', statement: 'replace', acceptance: ['A1'] }],
      slices: [{ ...base.slices[0], change_kind: 'REPLACE', requirements: ['R2'] }],
    };
    const replace = validatePlanContract(replaceInput);
    expect(replace.ok).toBe(false);
    expect(replace.issues.some((i) => /preservation contract/.test(i.message))).toBe(true);

    const full = validatePlanContract({
      ...replaceInput,
      preservation: [
        { dimension: 'behavior', detail: 'x' }, { dimension: 'contracts_data', detail: 'x' },
        { dimension: 'consumers', detail: 'x' }, { dimension: 'operational_capability', detail: 'x' },
        { dimension: 'user_visible_states', detail: 'x' },
      ],
      alternatives_considered: [
        { id: 'O1', approach: 'incremental', tradeoff: 'smaller change', reversible: true },
        { id: 'O2', approach: 'replace', tradeoff: 'larger change', reversible: false },
      ],
      counterexamples: ['a hidden consumer still uses the old path'],
      impact_map: { code: [], behavior: [], data: [], operational: [], user_visible: [] },
    });
    expect(full.ok).toBe(true);
  });

  it('does not burden a FAST modify-only plan with solution ceremony', () => {
    expect(validatePlanContract({ ...base, planning_depth: 'FAST' }).ok).toBe(true);
  });

  it('OWNER_DECISION makes the plan unrunnable', () => {
    const result = validatePlanContract({ ...base, unknowns: [{ id: 'U1', class: 'OWNER_DECISION', detail: 'ask', affected_slices: ['S1'] }] });
    expect(result.ok).toBe(false);
    expect(result.unrunnable).toBe(true);
  });

  it('EXTERNAL_BLOCKER blocks only its dependency closure', () => {
    const result = validatePlanContract({
      ...base,
      slices: [
        { ...base.slices[0], id: 'S1' },
        { ...base.slices[0], id: 'S2', depends_on: ['S1'] },
      ],
      unknowns: [{ id: 'U1', class: 'EXTERNAL_BLOCKER', detail: 'dep missing', affected_slices: ['S1'] }],
    });
    expect(result.ok).toBe(true);
    expect(result.blocked_slices).toEqual(['S1', 'S2']);
  });

  it('IMPLEMENTATION_LOCAL is never a blocker', () => {
    const result = validatePlanContract({ ...base, unknowns: [{ id: 'U1', class: 'IMPLEMENTATION_LOCAL', detail: 'local', affected_slices: ['S1'] }] });
    expect(result.ok).toBe(true);
    expect(result.unrunnable).toBe(false);
    expect(result.blocked_slices).toEqual([]);
  });

  it('escalation boundary is required', () => {
    const result = validatePlanContract({ ...base, escalation_boundary: [] });
    expect(result.ok).toBe(false);
  });
});
