import type { EvidenceCategory, ProofStatus, SelectedProof } from '../../northstar/proof-testing.js';

export interface ExistingProofBinding {
  id: string;
  claim_id: string;
  category: EvidenceCategory;
  status: ProofStatus;
  source_hash: string;
  environment_hash: string;
  proof_contract_hash: string;
  evidence_ref?: string;
  live?: boolean;
}

export interface ProofBindingContext {
  source_hash?: string;
  environment_hash?: string;
  proof_contract_hash?: string;
}

export interface FocusedRepairRecheck {
  failed_proof_ids: string[];
  affected_direct_dependents?: string[];
  /** Binding observed before the repair; current binding belongs to the request. */
  prior_binding: ProofBindingContext;
}

export interface ProofExecutionDecision {
  claim_id: string;
  proof_id: string;
  category: EvidenceCategory;
  action: 'RUN' | 'REUSE' | 'OMIT_RECHECK_UNAFFECTED' | 'OMIT_RECHECK_UNCHANGED';
  reason: string;
  evidence_ref?: string;
}

export interface ProofExecutionPolicyResult {
  schema: 'agent-rules/proof-execution-policy/v2';
  decisions: ProofExecutionDecision[];
  selected_for_run: string[];
  reused: string[];
  omitted_recheck_unaffected: string[];
  omitted_recheck_unchanged: string[];
  full_suite_requested: boolean;
  full_suite_allowed: boolean;
  full_suite_reason: string;
}

function exactBinding(context: ProofBindingContext): context is Required<ProofBindingContext> {
  return [context.source_hash, context.environment_hash, context.proof_contract_hash]
    .every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}

function bindingsDiffer(left: Required<ProofBindingContext>, right: Required<ProofBindingContext>): boolean {
  return left.source_hash !== right.source_hash
    || left.environment_hash !== right.environment_hash
    || left.proof_contract_hash !== right.proof_contract_hash;
}

export function isReusableProof(
  proof: ExistingProofBinding,
  context: ProofBindingContext,
  claimId?: string,
  category?: EvidenceCategory,
): boolean {
  return proof.status === 'PASS'
    && exactBinding(context)
    && proof.source_hash === context.source_hash
    && proof.environment_hash === context.environment_hash
    && proof.proof_contract_hash === context.proof_contract_hash
    && (claimId === undefined || proof.claim_id === claimId)
    && (category === undefined || proof.category === category);
}

export function applyProofExecutionPolicy(input: {
  task_id: string;
  selected: SelectedProof[];
  existing_proofs?: ExistingProofBinding[];
  binding: ProofBindingContext;
  selector_full_suite_required: boolean;
  force_full_suite?: boolean;
  release_gate?: boolean;
  material_risk_trigger?: boolean;
  full_suite_reason?: string;
  repair_recheck?: FocusedRepairRecheck;
}): ProofExecutionPolicyResult {
  if (input.repair_recheck && input.repair_recheck.failed_proof_ids.length === 0) {
    throw new Error('focused repair recheck requires at least one failed proof id');
  }
  if (input.repair_recheck && (!exactBinding(input.binding) || !exactBinding(input.repair_recheck.prior_binding))) {
    throw new Error('focused repair recheck requires exact prior and current source/environment/proof-contract bindings');
  }
  const existing = input.existing_proofs ?? [];
  const repairSet = input.repair_recheck
    ? new Set([...input.repair_recheck.failed_proof_ids, ...(input.repair_recheck.affected_direct_dependents ?? [])])
    : null;
  const repairChanged = input.repair_recheck
    ? bindingsDiffer(input.repair_recheck.prior_binding as Required<ProofBindingContext>, input.binding as Required<ProofBindingContext>)
    : true;
  const decisions: ProofExecutionDecision[] = [];
  const seenProofs = new Set<string>();

  for (const proof of input.selected) {
    const proofIdentity = `${proof.claim_id}\u0000${proof.proof_id}\u0000${proof.category}`;
    if (seenProofs.has(proofIdentity)) continue;
    seenProofs.add(proofIdentity);

    const reusable = existing.find((candidate) => isReusableProof(candidate, input.binding, proof.claim_id, proof.category));
    if (reusable) {
      decisions.push({
        claim_id: proof.claim_id,
        proof_id: proof.proof_id,
        category: proof.category,
        action: 'REUSE',
        reason: 'fresh proof has identical claim, source, environment and proof-contract binding',
        evidence_ref: reusable.evidence_ref,
      });
      continue;
    }

    if (repairSet && !repairSet.has(proof.proof_id)) {
      decisions.push({
        claim_id: proof.claim_id,
        proof_id: proof.proof_id,
        category: proof.category,
        action: 'OMIT_RECHECK_UNAFFECTED',
        reason: 'focused repair recheck runs only failed proof and affected direct dependents',
      });
      continue;
    }

    if (repairSet && !repairChanged) {
      decisions.push({
        claim_id: proof.claim_id,
        proof_id: proof.proof_id,
        category: proof.category,
        action: 'OMIT_RECHECK_UNCHANGED',
        reason: 'focused repair recheck has the same exact binding as before the repair',
      });
      continue;
    }

    decisions.push({
      claim_id: proof.claim_id,
      proof_id: proof.proof_id,
      category: proof.category,
      action: 'RUN',
      reason: exactBinding(input.binding)
        ? 'no fresh exact-bound PASS evidence exists'
        : 'proof reuse is disabled because exact source/environment/proof-contract hashes are missing',
    });
  }

  const fullSuiteRequested = input.force_full_suite === true || input.selector_full_suite_required;
  const fullSuiteAllowed = input.selector_full_suite_required || (input.force_full_suite === true && (input.release_gate === true || input.material_risk_trigger === true));
  const selectedForRun = decisions.filter((decision) => decision.action === 'RUN').map((decision) => decision.proof_id);

  return {
    schema: 'agent-rules/proof-execution-policy/v2',
    decisions,
    selected_for_run: selectedForRun,
    reused: decisions.filter((decision) => decision.action === 'REUSE').map((decision) => decision.proof_id),
    omitted_recheck_unaffected: decisions.filter((decision) => decision.action === 'OMIT_RECHECK_UNAFFECTED').map((decision) => decision.proof_id),
    omitted_recheck_unchanged: decisions.filter((decision) => decision.action === 'OMIT_RECHECK_UNCHANGED').map((decision) => decision.proof_id),
    full_suite_requested: fullSuiteRequested,
    full_suite_allowed: fullSuiteAllowed,
    full_suite_reason: fullSuiteAllowed
      ? input.full_suite_reason ?? (input.release_gate ? 'dependency-defined release gate' : input.material_risk_trigger ? 'explicit material-risk trigger' : 'proof selector identified a material risk')
      : fullSuiteRequested
        ? 'deferred: no dependency-defined release gate or explicit material-risk trigger'
        : 'not requested by the focused claim profile',
  };
}
