import type { RiskClass, WorkSpec } from './protocol.js';

export type LogicalModelClass = 'utility' | 'economy' | 'standard' | 'expert';
export type ModelRole = 'worker' | 'planner' | 'reviewer' | 'verifier';

export interface ModelSignals {
  role: ModelRole;
  risk: RiskClass;
  unresolved?: number;
  repeatedFailures?: number;
  architectureAmbiguity?: boolean;
  sharedContractDependents?: number;
  securityOrDataRisk?: boolean;
  crossLayer?: boolean;
  proofDifficultyHigh?: boolean;
  userOverride?: LogicalModelClass;
}

export interface ModelDecision {
  logical_class: LogicalModelClass;
  reasons: string[];
  escalated: boolean;
}

const RANK: Record<LogicalModelClass, number> = { utility: 0, economy: 1, standard: 2, expert: 3 };
const BY_RANK: LogicalModelClass[] = ['utility', 'economy', 'standard', 'expert'];

function raise(current: LogicalModelClass, target: LogicalModelClass): LogicalModelClass {
  return BY_RANK[Math.max(RANK[current], RANK[target])];
}

/**
 * Provider-neutral model routing. It deliberately returns a logical class, never a
 * provider/model id. Hosts resolve the class at the edge and must attest what ran.
 */
export function governModel(signals: ModelSignals): ModelDecision {
  let logical: LogicalModelClass = signals.role === 'verifier' ? 'utility' : signals.role === 'worker' ? 'economy' : 'standard';
  const reasons = [`${signals.role} default=${logical}`];

  if ((signals.role === 'planner' || signals.role === 'reviewer') && signals.risk !== 'S0') {
    logical = raise(logical, 'expert');
    reasons.push(`${signals.role} is strong-mandatory for ${signals.risk} work`);
  }
  if (signals.role === 'worker' && (signals.risk === 'S2' || signals.risk === 'S3')) {
    logical = raise(logical, 'standard');
    reasons.push(`bounded worker raised for ${signals.risk}`);
  }
  if ((signals.unresolved ?? 0) > 0 || signals.architectureAmbiguity) {
    logical = raise(logical, signals.role === 'worker' ? 'standard' : 'expert');
    reasons.push('unresolved architecture/business ambiguity');
  }
  if ((signals.sharedContractDependents ?? 0) >= 3 || signals.securityOrDataRisk || signals.crossLayer || signals.proofDifficultyHigh) {
    logical = raise(logical, 'expert');
    reasons.push('material capability/risk boundary');
  }
  if ((signals.repeatedFailures ?? 0) >= 2) {
    logical = raise(logical, 'expert');
    reasons.push('repeated failure count >= 2');
  }
  if (signals.userOverride) {
    const before = logical;
    logical = raise(logical, signals.userOverride);
    reasons.push(before === logical && RANK[signals.userOverride] < RANK[before]
      ? `lower user override ${signals.userOverride} refused by safety floor`
      : `user override requests ${signals.userOverride}`);
  }

  return { logical_class: logical, reasons, escalated: logical !== (signals.role === 'verifier' ? 'utility' : signals.role === 'worker' ? 'economy' : 'standard') };
}

export function modelDecisionForSpec(spec: WorkSpec, role: ModelRole, extra: Omit<ModelSignals, 'role' | 'risk' | 'unresolved'> = {}): ModelDecision {
  return governModel({ role, risk: spec.risk_class ?? 'S1', unresolved: spec.unresolved?.length ?? 0, ...extra });
}

export interface ProviderPerformance {
  provider_id: string;
  logical_class: LogicalModelClass;
  task_class?: string;
  verified_success_rate: number;
  mean_cost_usd?: number;
  mean_latency_ms?: number;
  health?: number;
  sample_size: number;
}

export interface ProviderSelection {
  provider_id: string | null;
  score: number | null;
  reasons: string[];
}

/**
 * Empirical edge selector. The logical-class governor remains the safety floor;
 * this only ranks providers that satisfy it. Low-sample estimates are shrunk
 * toward 0.5 so one lucky run cannot dominate routing.
 */
export function selectProviderByEvidence(input: {
  decision: ModelDecision;
  candidates: readonly ProviderPerformance[];
  task_class?: string;
  max_cost_usd?: number;
  max_latency_ms?: number;
}): ProviderSelection {
  const floor = RANK[input.decision.logical_class];
  const eligible = input.candidates.filter((candidate) => {
    if (RANK[candidate.logical_class] < floor) return false;
    if (input.task_class && candidate.task_class && candidate.task_class !== input.task_class) return false;
    if (input.max_cost_usd !== undefined && candidate.mean_cost_usd !== undefined && candidate.mean_cost_usd > input.max_cost_usd) return false;
    if (input.max_latency_ms !== undefined && candidate.mean_latency_ms !== undefined && candidate.mean_latency_ms > input.max_latency_ms) return false;
    return candidate.verified_success_rate >= 0 && candidate.verified_success_rate <= 1 && Number.isInteger(candidate.sample_size) && candidate.sample_size >= 0;
  });
  if (!eligible.length) return { provider_id: null, score: null, reasons: ['no empirically eligible provider satisfies the logical-class safety floor and budgets'] };
  const scored = eligible.map((candidate) => {
    const n = candidate.sample_size;
    const success = (candidate.verified_success_rate * n + 2.5) / (n + 5); // beta(2.5,2.5) shrinkage
    const health = Math.max(0, Math.min(1, candidate.health ?? 1));
    const costDenom = Math.max(input.max_cost_usd ?? ((candidate.mean_cost_usd ?? 0) * 4), 0.000001);
    const latencyDenom = Math.max(input.max_latency_ms ?? ((candidate.mean_latency_ms ?? 0) * 4), 1);
    const costPenalty = candidate.mean_cost_usd === undefined ? 0 : Math.min(0.25, candidate.mean_cost_usd / costDenom * 0.25);
    const latencyPenalty = candidate.mean_latency_ms === undefined ? 0 : Math.min(0.15, candidate.mean_latency_ms / latencyDenom * 0.15);
    return { candidate, score: success * health - costPenalty - latencyPenalty, success, health };
  }).sort((a, b) => b.score - a.score || b.candidate.sample_size - a.candidate.sample_size || a.candidate.provider_id.localeCompare(b.candidate.provider_id));
  const best = scored[0]!;
  return { provider_id: best.candidate.provider_id, score: best.score, reasons: [`empirical success=${best.success.toFixed(3)}`, `health=${best.health.toFixed(3)}`, `samples=${best.candidate.sample_size}`, `logical floor=${input.decision.logical_class}`] };
}
