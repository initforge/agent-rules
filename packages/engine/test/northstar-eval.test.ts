import { describe, expect, it } from 'vitest';
import { compareConfigurations, evaluateReleaseGates, summarizeTrials } from '../src/northstar/eval-lab.js';

describe('North-Star eval lab', () => {
  it('summarizes verified throughput metrics without inventing missing token/cost data', () => {
    const result = summarizeTrials([
      { task_id: 'T-1', configuration: 'baseline', outcome: 'PASS', duration_ms: 100, human_interventions: 0, first_pass: true, repairs: 0, unnecessary_files_touched: 0, regressions: 0, recovery_success: true, requirement_coverage: 1, tokens: 1000, cost_usd: 0.1 },
      { task_id: 'T-2', configuration: 'baseline', outcome: 'FAILED', duration_ms: 300, human_interventions: 1, first_pass: false, repairs: 1, unnecessary_files_touched: 2, regressions: 1, recovery_success: false, requirement_coverage: 0.5, acceptance_audit_disagreement: true },
    ]);
    expect(result.verified_success_rate).toBe(0.5);
    expect(result.p50_time_ms).toBe(100);
    expect(result.p95_time_ms).toBe(300);
    expect(result.recovery_success_rate).toBe(0.5);
    expect(result.tokens_per_verified_task).toBe(1000);
    expect(result.cost_per_verified_task_usd).toBe(0.1);
    expect(result.acceptance_audit_disagreement_rate).toBe(0.5);
  });

  it('fails release gates instead of converting unknown empirical evidence into PASS', () => {
    const result = evaluateReleaseGates({ orphan_requirements: 0, mandatory_unverified_claims: 1, silent_forbidden_scope_edits: 0, crash_resume_truth_preserved: true, spec_revision_impact_reproducible: true });
    expect(result.pass).toBe(false);
    expect(result.blockers).toContain('1 mandatory unverified claim(s)');
    expect(result.blockers).toContain('lower-tier worker improvement is unknown; benchmark evidence is required');
  });

  it('cannot release when lower-tier improvement has never been benchmarked', () => {
    const result = evaluateReleaseGates({ orphan_requirements: 0, mandatory_unverified_claims: 0, silent_forbidden_scope_edits: 0, crash_resume_truth_preserved: true, spec_revision_impact_reproducible: true });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(['lower-tier worker improvement is unknown; benchmark evidence is required']);
  });

  it('allows the empirical gate only when material improvement is positively measured', () => {
    const result = evaluateReleaseGates({ orphan_requirements: 0, mandatory_unverified_claims: 0, silent_forbidden_scope_edits: 0, crash_resume_truth_preserved: true, spec_revision_impact_reproducible: true, lower_tier_material_improvement: true });
    expect(result).toEqual({ pass: true, blockers: [] });
  });
});

describe('North-Star eval economy and ablation metrics', () => {
  it('measures routing precision, context waste, trajectory waste and trustworthy throughput', () => {
    const summary = summarizeTrials([
      {
        task_id: 'T-1', configuration: 'candidate', outcome: 'PASS', duration_ms: 1_000, human_interventions: 0,
        first_pass: true, repairs: 0, unnecessary_files_touched: 0, regressions: 0, requirement_coverage: 1,
        tokens: 2_000, cost_usd: 0.02, skill_activation: { tp: 2, fp: 0, fn: 1 }, capability_activation: { tp: 3, fp: 1, fn: 0 },
        context_tokens: 1_000, context_waste_tokens: 100, repeated_reads: 1, repeated_tool_calls: 2, trajectory_deviations: 0,
        active_skills: 2, active_capabilities: 5, evidence_integrity: 1, scope_correct: true,
      },
    ]);
    expect(summary.skill_activation_precision).toBe(1);
    expect(summary.skill_activation_recall).toBeCloseTo(2 / 3);
    expect(summary.capability_activation_precision).toBe(0.75);
    expect(summary.capability_activation_recall).toBe(1);
    expect(summary.context_waste_ratio).toBe(0.1);
    expect(summary.repeated_reads_per_task).toBe(1);
    expect(summary.trustworthy_verified_throughput_per_hour).toBe(summary.verified_throughput_per_hour);
  });

  it('compares optional harness layers against a baseline instead of assuming they help', () => {
    const trials = [
      { task_id: 'T-1', configuration: 'baseline', outcome: 'PASS' as const, duration_ms: 2_000, human_interventions: 0, first_pass: true, repairs: 0, unnecessary_files_touched: 0, regressions: 0, tokens: 2_000, context_tokens: 1_000, context_waste_tokens: 200, trajectory_deviations: 1, evidence_integrity: 1, scope_correct: true },
      { task_id: 'T-1', configuration: 'semantic', outcome: 'PASS' as const, duration_ms: 1_500, human_interventions: 0, first_pass: true, repairs: 0, unnecessary_files_touched: 0, regressions: 0, tokens: 1_500, context_tokens: 800, context_waste_tokens: 40, trajectory_deviations: 0, evidence_integrity: 1, scope_correct: true },
    ];
    const comparison = compareConfigurations(trials, 'baseline', 'semantic');
    expect(comparison.verified_success_delta).toBe(0);
    expect(comparison.duration_delta_ms).toBe(-500);
    expect(comparison.tokens_per_verified_task_delta).toBe(-500);
    expect(comparison.context_waste_delta).toBeCloseTo(-0.15);
    expect(comparison.trajectory_deviation_delta).toBe(-1);
  });
});
