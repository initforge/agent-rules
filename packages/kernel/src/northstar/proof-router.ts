/**
 * northstar/proof-router.ts — canonical verification router for
 * adaptive-minimal-proof-testing (owner §12).
 *
 * The router wires the trigger model, proof profiles, selection engine,
 * status semantics and receipt emission into one deterministic pipeline that
 * every host surface (CLI, North-Star runtime, plan/review/implementation,
 * handoff/resume, MCP/provider flows, platform adapters) calls.
 *
 * The router NEVER:
 * - triggers from keywords alone (scope/claims/risk must fire);
 * - runs every test mechanically;
 * - silently skips required proof;
 * - converts BLOCKED/UNSUPPORTED into PASS;
 * - claims PASS while a required claim is unresolved.
 */
import {
  buildProofReceipt,
  deriveProofTrigger,
  selectProofs,
  type EvidenceCategory,
  type ProofReceipt,
  type ProofReceiptInput,
  type ProofSelectionInput,
  type ProofStatus,
  type ProofTriggerInput,
  type ProofTriggerResult,
} from './proof-testing.js';

export interface ProofRouteRequest {
  task_id: string;
  repository: string;
  trigger: ProofTriggerInput;
  claims: ProofSelectionInput['claims'];
  risks: string[];
  host_capabilities?: string[];
  existing_proofs?: ProofSelectionInput['existing_proofs'];
  failure_history?: string[];
  force_full_suite?: boolean;
  full_suite_reason?: string;
  environment?: string;
}

export interface ProofRouteReceipt {
  schema: 'agent-rules/proof-route-receipt/v1';
  version: 1;
  task_id: string;
  trigger: ProofTriggerResult;
  plan: ReturnType<typeof selectProofs>;
  receipt: ProofReceipt;
  route_trace: string[];
}

/** Result of planning a proof route before execution. */
export interface ProofRoutePlan {
  trigger: ProofTriggerResult;
  plan: ReturnType<typeof selectProofs>;
}

/**
 * PLAN the proof route BEFORE execution: derive the trigger and select the
 * minimal-sufficient proof set (including omitted-with-reason). Every host
 * surface (CLI, runtime, resume, handoff, proof-plan, MCP/provider flows)
 * calls this first to decide WHICH proofs to run — only the selected verifiers
 * are executed.
 */
export function planProofRoute(request: ProofRouteRequest): ProofRoutePlan {
  const trigger = deriveProofTrigger(request.trigger);
  const plan = selectProofs({
    task_id: request.task_id,
    repository: request.repository,
    changed_files: request.trigger.changed_files,
    claims: request.claims,
    risks: request.risks,
    host_capabilities: request.host_capabilities,
    existing_proofs: request.existing_proofs,
    failure_history: request.failure_history,
    trigger,
    force_full_suite: request.force_full_suite,
    full_suite_reason: request.full_suite_reason,
  });
  return { trigger, plan };
}

/**
 * COMPLETE the proof route AFTER execution: build the receipt from actual
 * results against the planned route. Only the proofs selected by
 * `planProofRoute` are honored; omitted proofs carry their reason and
 * invalidation condition.
 */
export function completeProofRoute(
  request: ProofRouteRequest,
  routePlan: ProofRoutePlan,
  results: ProofReceiptInput['results'],
  opts: { evidence_refs?: string[]; escalation_decisions?: string[] } = {},
): ProofRouteReceipt {
  const receipt = buildProofReceipt({
    plan: routePlan.plan,
    results,
    escalation_decisions: opts.escalation_decisions ?? [],
    environment: request.environment ?? 'deterministic',
    evidence_refs: opts.evidence_refs ?? [],
  });
  return {
    schema: 'agent-rules/proof-route-receipt/v1',
    version: 1,
    task_id: request.task_id,
    trigger: routePlan.trigger,
    plan: routePlan.plan,
    receipt,
    route_trace: [
      `trigger: ${routePlan.trigger.surfaces.join(',')} (${routePlan.trigger.reasons.length} reason(s))`,
      `profile: ${routePlan.plan.profile}`,
      `fidelity: ${routePlan.plan.required_fidelity}`,
      `selected: ${routePlan.plan.selected.length}, omitted: ${routePlan.plan.omitted.length}`,
      `full_suite: ${routePlan.plan.full_suite_required}`,
      `final_status: ${receipt.final_status}`,
    ],
  };
}

/**
 * The always-on router pipeline (composition helper): plan then complete in one
 * call. Runtime/resume/handoff/provider flows that do not need to interleave
 * execution may call this directly; surfaces that gate execution on the plan
 * call `planProofRoute` first.
 */
export function routeProofs(request: ProofRouteRequest, results: ProofReceiptInput['results'], opts: { evidence_refs?: string[]; escalation_decisions?: string[] } = {}): ProofRouteReceipt {
  const routePlan = planProofRoute(request);
  return completeProofRoute(request, routePlan, results, opts);
}

export type { EvidenceCategory, ProofReceipt, ProofStatus };
