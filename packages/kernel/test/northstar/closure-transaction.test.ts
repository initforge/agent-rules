/**
 * REQ-020 — closure transaction: residue extraction, requirement promotion/
 * retirement, and terminal integrity gates (never bypass PASS, never purge
 * required evidence / referenced artifacts / unresolved work).
 */
import { describe, it, expect } from 'vitest';
import { assertClosureIntegrity, closureResidue, decideClosureRequirements } from '../../src/northstar/closure-transaction.js';

const BASE_INPUT = {
  plan_id: 'plan-x',
  purpose: 'ship the widget',
  outcome: 'implemented and verified',
  proof_result: 'PASS',
  final_baseline: 'abc123',
  durable_decisions: ['use sqlite'],
  durable_invariants: ['workers never author PASS'],
  changed_surfaces: ['src/widget'],
  remaining_issues: [],
  requirements: [
    { id: 'R-001', statement: 'widget supports login' },
    { id: 'R-002', statement: 'enforce row-level security on customer data' },
  ],
  historical_pointer: '.agent/plans/plan-x',
};

describe('REQ-020 — closure residue', () => {
  it('extracts a hash-bound residue receipt', () => {
    const residue = closureResidue({ ...BASE_INPUT, requirement_decisions: [
      { requirement_id: 'R-001', disposition: 'retire', reason: 'implementation-local' },
      { requirement_id: 'R-002', disposition: 'promote', promote_target: 'rules/', reason: 'durable security invariant' },
    ] });
    expect(residue.residue_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(residue.promoted_requirements.map((item) => item.requirement_id)).toEqual(['R-002']);
    expect(residue.retired_requirements.map((item) => item.requirement_id)).toEqual(['R-001']);
    expect(residue.historical_pointer).toBe('.agent/plans/plan-x');
  });

  it('promotes owner-marked durable requirements and retires the rest', () => {
    const decisions = decideClosureRequirements({ requirements: BASE_INPUT.requirements, durable_requirement_ids: ['R-002'] });
    const promote = decisions.find((decision) => decision.requirement_id === 'R-002')!;
    expect(promote.disposition).toBe('promote');
    expect(promote.promote_target).toBe('rules/');
    expect(decisions.find((decision) => decision.requirement_id === 'R-001')!.disposition).toBe('retire');
  });

  it('inferPromoteTarget routes security requirements to rules/ and test requirements to tests/', () => {
    const decisions = decideClosureRequirements({ requirements: [{ id: 'R-9', statement: 'add a regression test for checkout' }], durable_requirement_ids: ['R-9'] });
    expect(decisions[0]!.promote_target).toBe('tests/');
  });
});

describe('REQ-020 — terminal integrity gate', () => {
  it('PASS only when every gate holds', () => {
    const result = assertClosureIntegrity({
      evidence_derived_pass: true,
      intent_spec_implementation_reconciled: true,
      scope_and_verification_integrity: true,
      no_required_evidence_purged: true,
      no_referenced_artifact_purged: true,
      no_unresolved_work_purged: true,
    });
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('never bypasses PASS: a missing gate lists its failures', () => {
    const result = assertClosureIntegrity({
      evidence_derived_pass: false,
      intent_spec_implementation_reconciled: true,
      scope_and_verification_integrity: false,
      no_required_evidence_purged: true,
      no_referenced_artifact_purged: false,
      no_unresolved_work_purged: true,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining(['evidence_derived_pass', 'scope_and_verification_integrity', 'no_referenced_artifact_purged']));
  });

  it('explicit purging of required evidence is refused', () => {
    const result = assertClosureIntegrity({
      evidence_derived_pass: true,
      intent_spec_implementation_reconciled: true,
      scope_and_verification_integrity: true,
      no_required_evidence_purged: false,
      no_referenced_artifact_purged: true,
      no_unresolved_work_purged: true,
    });
    expect(result.pass).toBe(false);
    expect(result.failures).toContain('no_required_evidence_purged');
  });
});
