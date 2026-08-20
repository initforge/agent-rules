export type EvalOutcome = 'PASS' | 'PARTIAL' | 'FAILED' | 'BLOCKED';

export interface ActivationCounts { tp: number; fp: number; fn: number }

export interface EvalTrial {
  task_id: string;
  configuration: string;
  outcome: EvalOutcome;
  duration_ms: number;
  human_interventions: number;
  first_pass: boolean;
  repairs: number;
  unnecessary_files_touched: number;
  regressions: number;
  recovery_success?: boolean;
  requirement_coverage?: number;
  acceptance_audit_disagreement?: boolean;
  tokens?: number;
  cost_usd?: number;
  skill_activation?: ActivationCounts;
  capability_activation?: ActivationCounts;
  context_tokens?: number;
  context_waste_tokens?: number;
  repeated_reads?: number;
  repeated_tool_calls?: number;
  trajectory_deviations?: number;
  active_skills?: number;
  active_capabilities?: number;
  evidence_integrity?: number;
  scope_correct?: boolean;
}

export interface EvalSummary {
  trials: number;
  verified_success_rate: number;
  first_pass_rate: number;
  p50_time_ms: number;
  p95_time_ms: number;
  interventions_per_task: number;
  repairs_per_task: number;
  unnecessary_files_per_task: number;
  regression_rate: number;
  recovery_success_rate: number | null;
  mean_requirement_coverage: number | null;
  acceptance_audit_disagreement_rate: number;
  tokens_per_verified_task: number | null;
  cost_per_verified_task_usd: number | null;
  verified_throughput_per_hour: number;
  trustworthy_verified_throughput_per_hour: number | null;
  skill_activation_precision: number | null;
  skill_activation_recall: number | null;
  capability_activation_precision: number | null;
  capability_activation_recall: number | null;
  context_waste_ratio: number | null;
  repeated_reads_per_task: number;
  repeated_tool_calls_per_task: number;
  trajectory_deviations_per_task: number;
  mean_active_skills: number | null;
  mean_active_capabilities: number | null;
}

export interface AblationComparison {
  baseline: string;
  candidate: string;
  verified_success_delta: number;
  first_pass_delta: number;
  duration_delta_ms: number;
  tokens_per_verified_task_delta: number | null;
  cost_per_verified_task_delta_usd: number | null;
  context_waste_delta: number | null;
  trajectory_deviation_delta: number;
  trustworthy_throughput_delta: number | null;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[index]!;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function activationMetric(trials: readonly EvalTrial[], key: 'skill_activation' | 'capability_activation'): { precision: number | null; recall: number | null } {
  const values = trials.flatMap((trial) => trial[key] ? [trial[key]!] : []);
  if (!values.length) return { precision: null, recall: null };
  const tp = values.reduce((sum, value) => sum + value.tp, 0);
  const fp = values.reduce((sum, value) => sum + value.fp, 0);
  const fn = values.reduce((sum, value) => sum + value.fn, 0);
  return {
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
  };
}

function validateCount(value: number | undefined, name: string, task: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`eval trial ${task} ${name} must be non-negative`);
}

export function summarizeTrials(trials: readonly EvalTrial[]): EvalSummary {
  if (trials.length === 0) throw new Error('eval summary requires at least one trial');
  for (const trial of trials) {
    if (!trial.task_id || !trial.configuration) throw new Error('eval trial requires task_id and configuration');
    for (const [name, value] of Object.entries({
      duration_ms: trial.duration_ms, human_interventions: trial.human_interventions, repairs: trial.repairs,
      unnecessary_files_touched: trial.unnecessary_files_touched, regressions: trial.regressions,
      tokens: trial.tokens, cost_usd: trial.cost_usd, context_tokens: trial.context_tokens,
      context_waste_tokens: trial.context_waste_tokens, repeated_reads: trial.repeated_reads,
      repeated_tool_calls: trial.repeated_tool_calls, trajectory_deviations: trial.trajectory_deviations,
      active_skills: trial.active_skills, active_capabilities: trial.active_capabilities,
    })) validateCount(value, name, trial.task_id);
    if (trial.requirement_coverage !== undefined && (trial.requirement_coverage < 0 || trial.requirement_coverage > 1)) throw new Error(`eval trial ${trial.task_id} requirement_coverage must be in [0,1]`);
    if (trial.evidence_integrity !== undefined && (trial.evidence_integrity < 0 || trial.evidence_integrity > 1)) throw new Error(`eval trial ${trial.task_id} evidence_integrity must be in [0,1]`);
    if (trial.context_waste_tokens !== undefined && trial.context_tokens !== undefined && trial.context_waste_tokens > trial.context_tokens) throw new Error(`eval trial ${trial.task_id} context_waste_tokens exceeds context_tokens`);
  }
  const pass = trials.filter((trial) => trial.outcome === 'PASS');
  const withRecovery = trials.filter((trial) => trial.recovery_success !== undefined);
  const withCoverage = trials.filter((trial) => trial.requirement_coverage !== undefined);
  const tokenPasses = pass.filter((trial) => trial.tokens !== undefined);
  const costPasses = pass.filter((trial) => trial.cost_usd !== undefined);
  const totalDurationMs = trials.reduce((sum, trial) => sum + trial.duration_ms, 0);
  const trustedPassWeights = pass
    .filter((trial) => trial.evidence_integrity !== undefined && trial.scope_correct !== undefined)
    .map((trial) => trial.evidence_integrity! * (trial.scope_correct ? 1 : 0));
  const skill = activationMetric(trials, 'skill_activation');
  const capability = activationMetric(trials, 'capability_activation');
  const totalContext = trials.reduce((sum, trial) => sum + (trial.context_tokens ?? 0), 0);
  const totalWaste = trials.reduce((sum, trial) => sum + (trial.context_waste_tokens ?? 0), 0);
  const contextObserved = trials.some((trial) => trial.context_tokens !== undefined && trial.context_waste_tokens !== undefined);
  return {
    trials: trials.length,
    verified_success_rate: pass.length / trials.length,
    first_pass_rate: trials.filter((trial) => trial.first_pass).length / trials.length,
    p50_time_ms: quantile(trials.map((trial) => trial.duration_ms), 0.5),
    p95_time_ms: quantile(trials.map((trial) => trial.duration_ms), 0.95),
    interventions_per_task: trials.reduce((sum, trial) => sum + trial.human_interventions, 0) / trials.length,
    repairs_per_task: trials.reduce((sum, trial) => sum + trial.repairs, 0) / trials.length,
    unnecessary_files_per_task: trials.reduce((sum, trial) => sum + trial.unnecessary_files_touched, 0) / trials.length,
    regression_rate: trials.reduce((sum, trial) => sum + trial.regressions, 0) / trials.length,
    recovery_success_rate: withRecovery.length ? withRecovery.filter((trial) => trial.recovery_success).length / withRecovery.length : null,
    mean_requirement_coverage: withCoverage.length ? withCoverage.reduce((sum, trial) => sum + trial.requirement_coverage!, 0) / withCoverage.length : null,
    acceptance_audit_disagreement_rate: trials.filter((trial) => trial.acceptance_audit_disagreement).length / trials.length,
    tokens_per_verified_task: tokenPasses.length ? tokenPasses.reduce((sum, trial) => sum + trial.tokens!, 0) / tokenPasses.length : null,
    cost_per_verified_task_usd: costPasses.length ? costPasses.reduce((sum, trial) => sum + trial.cost_usd!, 0) / costPasses.length : null,
    verified_throughput_per_hour: totalDurationMs > 0 ? pass.length / (totalDurationMs / 3_600_000) : 0,
    trustworthy_verified_throughput_per_hour: trustedPassWeights.length && totalDurationMs > 0 ? trustedPassWeights.reduce((a, b) => a + b, 0) / (totalDurationMs / 3_600_000) : null,
    skill_activation_precision: skill.precision,
    skill_activation_recall: skill.recall,
    capability_activation_precision: capability.precision,
    capability_activation_recall: capability.recall,
    context_waste_ratio: contextObserved && totalContext > 0 ? totalWaste / totalContext : null,
    repeated_reads_per_task: trials.reduce((sum, trial) => sum + (trial.repeated_reads ?? 0), 0) / trials.length,
    repeated_tool_calls_per_task: trials.reduce((sum, trial) => sum + (trial.repeated_tool_calls ?? 0), 0) / trials.length,
    trajectory_deviations_per_task: trials.reduce((sum, trial) => sum + (trial.trajectory_deviations ?? 0), 0) / trials.length,
    mean_active_skills: mean(trials.flatMap((trial) => trial.active_skills === undefined ? [] : [trial.active_skills])),
    mean_active_capabilities: mean(trials.flatMap((trial) => trial.active_capabilities === undefined ? [] : [trial.active_capabilities])),
  };
}

/** Compare one optional scaffold against a baseline. Use this for ablation, not framework accumulation. */
export function compareConfigurations(trials: readonly EvalTrial[], baseline: string, candidate: string): AblationComparison {
  const base = summarizeTrials(trials.filter((trial) => trial.configuration === baseline));
  const next = summarizeTrials(trials.filter((trial) => trial.configuration === candidate));
  const nullableDelta = (a: number | null, b: number | null): number | null => a === null || b === null ? null : b - a;
  return {
    baseline,
    candidate,
    verified_success_delta: next.verified_success_rate - base.verified_success_rate,
    first_pass_delta: next.first_pass_rate - base.first_pass_rate,
    duration_delta_ms: next.p50_time_ms - base.p50_time_ms,
    tokens_per_verified_task_delta: nullableDelta(base.tokens_per_verified_task, next.tokens_per_verified_task),
    cost_per_verified_task_delta_usd: nullableDelta(base.cost_per_verified_task_usd, next.cost_per_verified_task_usd),
    context_waste_delta: nullableDelta(base.context_waste_ratio, next.context_waste_ratio),
    trajectory_deviation_delta: next.trajectory_deviations_per_task - base.trajectory_deviations_per_task,
    trustworthy_throughput_delta: nullableDelta(base.trustworthy_verified_throughput_per_hour, next.trustworthy_verified_throughput_per_hour),
  };
}

export interface ReleaseGateInput {
  orphan_requirements: number;
  mandatory_unverified_claims: number;
  silent_forbidden_scope_edits: number;
  crash_resume_truth_preserved: boolean;
  spec_revision_impact_reproducible: boolean;
  lower_tier_material_improvement?: boolean;
}

export function evaluateReleaseGates(input: ReleaseGateInput): { pass: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (input.orphan_requirements !== 0) blockers.push(`${input.orphan_requirements} orphan requirement(s)`);
  if (input.mandatory_unverified_claims !== 0) blockers.push(`${input.mandatory_unverified_claims} mandatory unverified claim(s)`);
  if (input.silent_forbidden_scope_edits !== 0) blockers.push(`${input.silent_forbidden_scope_edits} silent forbidden-scope edit(s)`);
  if (!input.crash_resume_truth_preserved) blockers.push('crash/resume task truth is not proven');
  if (!input.spec_revision_impact_reproducible) blockers.push('spec revision impact is not reproducible');
  if (input.lower_tier_material_improvement === undefined) blockers.push('lower-tier worker improvement is unknown; benchmark evidence is required');
  else if (input.lower_tier_material_improvement === false) blockers.push('lower-tier worker does not materially improve over baseline');
  return { pass: blockers.length === 0, blockers };
}
