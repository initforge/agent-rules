import { describe, expect, it } from 'vitest';
import { evaluateCertificationEvidence } from '../src/commands/certify.js';

describe('certify reducer', () => {
  it('does not infer completion when closure evidence is absent', () => {
    const report = evaluateCertificationEvidence(null, true);
    expect(report.source_complete).toBe(false);
    expect(report.release_ready).toBe(false);
    expect(report.blockers).toContain('independent-semantic-review');
    expect(report.blockers).toContain('lower-tier-ablation');
  });

  it('reduces a complete evidence set without human interpretation', () => {
    const gates = {
      primary_outcome_achieved: true,
      deterministic_acceptance: true,
      independent_semantic_review: true,
      convergence_audit: true,
      spec_revision_invalidation: true,
      proof_dag: true,
      context_feedback_loop: true,
      bounded_skill_capability_surface: true,
      empirical_model_routing: true,
      crash_resume: true,
      forbidden_scope_enforcement: true,
      evidence_integrity: true,
      false_green_rejection: true,
      resource_governance: true,
      platform_portability: true,
      browser_visual_live: true,
      mobile_live: true,
      lower_tier_ablation: true,
      clean_host_full_suite: true,
    } as const;
    const report = evaluateCertificationEvidence({ schema: 'harness/closure-evidence/v1', plan_id: 'p', gates }, true);
    expect(report.source_complete).toBe(true);
    expect(report.release_ready).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.blockers).toEqual([]);
  });

  it('keeps a missing live capability as a blocker instead of inferring PASS', () => {
    const report = evaluateCertificationEvidence({
      schema: 'harness/closure-evidence/v1',
      gates: {
        primary_outcome_achieved: true,
        deterministic_acceptance: true,
        convergence_audit: true,
        spec_revision_invalidation: true,
        proof_dag: true,
        context_feedback_loop: true,
        bounded_skill_capability_surface: true,
        crash_resume: true,
        forbidden_scope_enforcement: true,
        evidence_integrity: true,
        false_green_rejection: true,
        resource_governance: true,
        lower_tier_ablation: null,
      },
    }, true);
    expect(report.source_complete).toBe(true);
    expect(report.release_ready).toBe(false);
    expect(report.blockers).toContain('lower-tier-ablation');
  });
});
