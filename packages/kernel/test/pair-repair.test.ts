import { describe, expect, it } from 'vitest';
import { classifyFinding, openPairRepair } from '../src/northstar/pair-repair.js';

const HEAD = '6e9a554a164e3a7d26df3cdb296392284c8c3166';
const spec = {
  protocol_version: '2.0', spec_id: 'S-pr', revision: 4, work_id: 'W-pr', risk_class: 'S1',
  requirements: [
    { id: 'REQ-001', statement: 'a', mandatory: true, claims: ['C-001'] },
    { id: 'REQ-002', statement: 'b', mandatory: true, claims: ['C-002'] },
    { id: 'REQ-003', statement: 'c', mandatory: true, claims: ['C-003'] },
  ],
};
const claim_to_requirements = { 'C-001': ['REQ-001'], 'C-002': ['REQ-002'], 'C-003': ['REQ-003'] };
const accepted_claims = ['C-001', 'C-002', 'C-003'];
const plans = [{
  plan_id: 'harness-universal-reconciliation-v1', head_sha: HEAD, worktree_dirty: false,
  ledger_ref: '.agent/ledger/h.json', diff_ref: 'main..c', evidence_refs: [],
}];

describe('prompt-first pair repair', () => {
  it('classifies findings across the six classes', () => {
    expect(classifyFinding('Bug: the binder drops adapter identity')).toBe('implementation_defect');
    expect(classifyFinding('The owner now requires a different acceptance surface')).toBe('changed_owner_intent');
    expect(classifyFinding('The evidence file is stale')).toBe('evidence_defect');
    expect(classifyFinding('A provider timeout on an unavailable device')).toBe('environment_provider_issue');
    expect(classifyFinding('This is unrelated to the plan under execution')).toBe('unrelated');
    expect(classifyFinding('Missing requirement: resumable across hosts')).toBe('missing_requirement');
  });

  it('binds the raw finding verbatim to plan, head, and epoch', () => {
    const outcome = openPairRepair({
      raw_finding: 'Bug: the plan binder drops adapter identity',
      candidate_plans: plans, current_epoch: 2, spec, claim_to_requirements, accepted_claims,
    });
    const finding = outcome.finding;
    expect(finding.raw_text).toBe('Bug: the plan binder drops adapter identity');
    expect(finding.plan_id).toBe('harness-universal-reconciliation-v1');
    expect(finding.repository_state.head_sha).toBe(HEAD);
    expect(finding.candidate_epoch).toBe(2);
    expect(finding.binding.authority_facts_agree).toBe(true);
  });

  it('reopens only impacted claims in a new epoch and preserves history', () => {
    const outcome = openPairRepair({
      raw_finding: 'Bug: the WorkRequest compiler drops constraints on the command adapter',
      candidate_plans: plans, current_epoch: 1, spec, claim_to_requirements, accepted_claims,
    });
    expect(outcome.needs_user).toBe(false);
    const packet = outcome.packet!;
    expect(packet.candidate_epoch).toBe(2);
    expect(packet.reopened_claims.length).toBeGreaterThan(0);
    expect(packet.unaffected_claims.every((claim) => !packet.reopened_claims.includes(claim))).toBe(true);
    expect(packet.proof_requirements.fresh_proof_required).toBe(true);
    expect(packet.proof_requirements.historical_pass_preserved).toBe(true);
  });

  it('returns NEEDS_USER for changed owner intent and ambiguous plan authority', () => {
    const intentChange = openPairRepair({
      raw_finding: 'The owner now requires Control Plane work before closeout',
      candidate_plans: plans, current_epoch: 1, spec, claim_to_requirements, accepted_claims,
    });
    expect(intentChange.needs_user).toBe(true);
    expect(intentChange.finding.classification).toBe('changed_owner_intent');
    expect(intentChange.packet).toBeUndefined();

    const ambiguous = openPairRepair({
      raw_finding: 'Bug: the shared contract changed',
      candidate_plans: [
        ...plans,
        { plan_id: 'other-plan', head_sha: HEAD, worktree_dirty: false, ledger_ref: '.agent/ledger/o.json', diff_ref: 'main..o', evidence_refs: [] },
      ],
      current_epoch: 1, spec, claim_to_requirements, accepted_claims,
    });
    expect(ambiguous.needs_user).toBe(true);
    expect(ambiguous.finding.ambiguity?.several_plans_candidate).toBe(true);
  });

  it('never reopens claims for unrelated or environment findings', () => {
    for (const text of ['This is unrelated to the plan under execution.', 'A provider timeout on an unavailable device']) {
      const outcome = openPairRepair({ raw_finding: text, candidate_plans: plans, current_epoch: 1, spec, claim_to_requirements, accepted_claims });
      expect(outcome.packet).toBeUndefined();
      expect(outcome.impact?.affected_claims ?? []).toHaveLength(0);
    }
  });

  it('fails closed on empty findings and missing candidate plans', () => {
    expect(() => openPairRepair({ raw_finding: '', candidate_plans: plans })).toThrow(/non-empty/);
    expect(() => openPairRepair({ raw_finding: 'bug', candidate_plans: [] })).toThrow(/at least one candidate plan/);
  });
});
