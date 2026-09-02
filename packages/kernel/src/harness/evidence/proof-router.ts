import {
  buildProofReceipt,
  deriveProofTrigger,
  selectProofs,
  type EvidenceCategory,
  type AcceptanceCoverage,
  type ProofReceipt,
  type ProofReceiptInput,
  type ProofSelectionInput,
  type ProofStatus,
  type ProofTriggerInput,
  type ProofTriggerResult,
} from '../../northstar/proof-testing.js';
import {
  applyProofExecutionPolicy,
  type ExistingProofBinding,
  type FocusedRepairRecheck,
  type ProofBindingContext,
  type ProofExecutionPolicyResult,
} from './proof-policy.js';

export interface ProofRouteRequest {
  task_id: string;
  repository: string;
  trigger: ProofTriggerInput;
  claims: ProofSelectionInput['claims'];
  risks: string[];
  host_capabilities?: string[];
  existing_proofs?: ExistingProofBinding[];
  failure_history?: string[];
  force_full_suite?: boolean;
  full_suite_reason?: string;
  release_gate?: boolean;
  material_risk_trigger?: boolean;
  repair_recheck?: FocusedRepairRecheck;
  binding?: ProofBindingContext;
  environment?: string;
  acceptance_coverage?: AcceptanceCoverage;
}

export interface ProofRouteReceipt {
  schema: 'agent-rules/proof-route-receipt/v2';
  version: 2;
  task_id: string;
  trigger: ProofTriggerResult;
  plan: ReturnType<typeof selectProofs>;
  execution: ProofExecutionPolicyResult;
  receipt: ProofReceipt;
  route_trace: string[];
}

export interface ProofRoutePlan {
  trigger: ProofTriggerResult;
  plan: ReturnType<typeof selectProofs>;
  execution: ProofExecutionPolicyResult;
}

export function planProofRoute(request: ProofRouteRequest): ProofRoutePlan {
  const trigger = deriveProofTrigger(request.trigger);
  const binding = request.binding ?? {};
  const selectedPlan = selectProofs({
    task_id: request.task_id,
    repository: request.repository,
    changed_files: request.trigger.changed_files,
    claims: request.claims,
    risks: request.risks,
    host_capabilities: request.host_capabilities,
    // Selection considers every available candidate so it can choose the
    // cheapest claim-matched proof. Execution reuse remains stricter below:
    // only an exact-bound fresh PASS may be reused without running.
    existing_proofs: (request.existing_proofs ?? []).map((proof) => ({
      id: proof.id,
      category: proof.category,
      covers_claim: proof.claim_id,
      live: proof.live,
    })),
    failure_history: request.failure_history,
    trigger,
    // A caller's force request is a policy concern, not proof-selector
    // evidence that the changed seam is materially broad.
    force_full_suite: false,
  });
  const execution = applyProofExecutionPolicy({
    task_id: request.task_id,
    selected: selectedPlan.selected,
    existing_proofs: request.existing_proofs,
    binding,
    selector_full_suite_required: selectedPlan.full_suite_required,
    force_full_suite: request.force_full_suite,
    release_gate: request.release_gate,
    material_risk_trigger: request.material_risk_trigger,
    full_suite_reason: request.full_suite_reason,
    repair_recheck: request.repair_recheck,
  });
  const plan = execution.full_suite_allowed === selectedPlan.full_suite_required
    ? selectedPlan
    : {
        ...selectedPlan,
        full_suite_required: execution.full_suite_allowed,
        full_suite_reason: execution.full_suite_reason,
        omitted: [
          ...selectedPlan.omitted,
          {
            category: 'other' as const,
            reason: execution.full_suite_reason,
            why_safe: 'focused claim-required proof remains selected',
            escalation_condition: 'enter the dependency-defined release gate or record a material-risk trigger',
          },
        ],
      };
  return { trigger, plan, execution };
}

export function completeProofRoute(
  request: ProofRouteRequest,
  routePlan: ProofRoutePlan,
  results: ProofReceiptInput['results'],
  opts: { evidence_refs?: string[]; escalation_decisions?: string[] } = {},
): ProofRouteReceipt {
  const reusedResults = routePlan.execution.decisions
    .filter((decision) => decision.action === 'REUSE')
    .map((decision) => ({ proof_id: decision.proof_id, status: 'PASS' as const, notes: decision.reason }));
  const actualIds = new Set(results.map((result) => result.proof_id));
  const receipt = buildProofReceipt({
    plan: routePlan.plan,
    results: [...reusedResults.filter((result) => !actualIds.has(result.proof_id)), ...results],
    escalation_decisions: opts.escalation_decisions ?? [],
    environment: request.environment ?? 'deterministic',
    evidence_refs: [
      ...routePlan.execution.decisions.flatMap((decision) => decision.evidence_ref ? [decision.evidence_ref] : []),
      ...(opts.evidence_refs ?? []),
    ],
    acceptance_coverage: request.acceptance_coverage,
  });
  return {
    schema: 'agent-rules/proof-route-receipt/v2',
    version: 2,
    task_id: request.task_id,
    trigger: routePlan.trigger,
    plan: routePlan.plan,
    execution: routePlan.execution,
    receipt,
    route_trace: [
      `trigger: ${routePlan.trigger.surfaces.join(',')} (${routePlan.trigger.reasons.length} reason(s))`,
      `profile: ${routePlan.plan.profile}`,
      `fidelity: ${routePlan.plan.required_fidelity}`,
      `selected: ${routePlan.execution.selected_for_run.length}, reused: ${routePlan.execution.reused.length}, omitted: ${routePlan.plan.omitted.length}`,
      `full_suite: ${routePlan.execution.full_suite_allowed} (${routePlan.execution.full_suite_reason})`,
      `final_status: ${receipt.final_status}`,
    ],
  };
}

export function routeProofs(request: ProofRouteRequest, results: ProofReceiptInput['results'], opts: { evidence_refs?: string[]; escalation_decisions?: string[] } = {}): ProofRouteReceipt {
  const routePlan = planProofRoute(request);
  return completeProofRoute(request, routePlan, results, opts);
}

export type { AcceptanceCoverage, EvidenceCategory, ExistingProofBinding, ProofReceipt, ProofStatus };
