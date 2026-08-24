import { describe, it, expect } from 'vitest';
import { compilePlan, verifiedRequirementCoverage, type RequirementProof } from '../src/services/plan-compiler.js';

const intent = {
  requestHash: 'a'.repeat(64),
  requirements: [{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }],
};

describe('REQ-C22 evidence-gated requirement coverage', () => {
  it('structural basis keeps legacy mapping behavior when no proofs are supplied', () => {
    const plan = compilePlan(intent);
    expect(plan.validation.coverage_basis).toBe('structural');
    expect(plan.validation.requirementCoverage.every((c) => c.covered)).toBe(true);
  });

  it('counts a requirement covered only with valid claim AND valid evidence', () => {
    const proofs: RequirementProof[] = [
      { id: 'R1', claim_valid: true, evidence_valid: true },
      { id: 'R2', claim_valid: true, evidence_valid: false },
      { id: 'R3', claim_valid: false, evidence_valid: true },
    ];
    const plan = compilePlan(intent, undefined, { requirementProofs: proofs });
    expect(plan.validation.coverage_basis).toBe('claim-evidence');
    const byId = new Map(plan.validation.requirementCoverage.map((c) => [c.id, c]));
    expect(byId.get('R1')?.covered).toBe(true);
    expect(byId.get('R2')?.covered).toBe(false);
    expect(byId.get('R3')?.covered).toBe(false);
  });

  it('coverage DROPS when evidence is removed or invalidated', () => {
    const allValid: RequirementProof[] = [
      { id: 'R1', claim_valid: true, evidence_valid: true },
      { id: 'R2', claim_valid: true, evidence_valid: true },
      { id: 'R3', claim_valid: true, evidence_valid: true },
    ];
    expect(verifiedRequirementCoverage(intent.requirements, allValid).every((c) => c.covered)).toBe(true);

    // evidence invalidated for R2
    const afterInvalidation = verifiedRequirementCoverage(intent.requirements, [
      ...allValid.filter((p) => p.id !== 'R2'),
      { id: 'R2', claim_valid: true, evidence_valid: false },
    ]);
    expect(afterInvalidation.find((c) => c.id === 'R2')?.covered).toBe(false);

    // evidence deleted entirely
    const afterDeletion = verifiedRequirementCoverage(
      intent.requirements,
      allValid.filter((p) => p.id !== 'R2'),
    );
    expect(afterDeletion.find((c) => c.id === 'R2')?.covered).toBe(false);
    const total = (list: { covered: boolean }[]) => list.filter((c) => c.covered).length;
    expect(total(afterDeletion)).toBeLessThan(total(verifiedRequirementCoverage(intent.requirements, allValid)));
  });

  it('never counts mere requirement existence as coverage', () => {
    expect(verifiedRequirementCoverage(intent.requirements, undefined).every((c) => !c.covered)).toBe(true);
  });
});
