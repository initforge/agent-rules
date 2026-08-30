import { createHash } from 'node:crypto';
import type { EvidenceCategory, ProofStatus, SelectedProof } from '../../northstar/proof-testing.js';

export interface ExistingProofBinding {
  id: string;
  claim_id: string;
  category: EvidenceCategory;
  status: ProofStatus;
  source_hash: string;
  environment_hash: string;
  proof_contract_hash: string;
  evidence_ref: string;
  observed_at: string;
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
  /** A task gets exactly one focused verification recheck after repair. */
  attempt: 1;
}

export interface VerificationBudget {
  max_proofs?: number;
  max_wall_time_ms?: number;
  max_context_tokens?: number;
  max_tool_output_bytes?: number;
}

export interface ProofExecutionDecision {
  claim_id: string;
  proof_id: string;
  category: EvidenceCategory;
  action: 'RUN' | 'REUSE' | 'OMIT_RECHECK_UNAFFECTED' | 'OMIT_UNCHANGED_DUPLICATE';
  binding_key: string;
  reason: string;
  evidence_ref?: string;
}

export interface ProofExecutionPolicyResult {
  schema: 'agent-rules/proof-execution-policy/v1';
  proof_plan_key: string;
  decisions: ProofExecutionDecision[];
  selected_for_run: string[];
  reused: string[];
  omitted_recheck_unaffected: string[];
  omitted_unchanged_duplicate: string[];
  invalidated_existing_proofs: Array<{ proof_id: string; reason: string }>;
  full_suite_requested: boolean;
  full_suite_allowed: boolean;
  full_suite_reason: string;
  budget: VerificationBudget;
  budget_exceeded: boolean;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exactBinding(context: ProofBindingContext): context is Required<ProofBindingContext> {
  return [context.source_hash, context.environment_hash, context.proof_contract_hash]
    .every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}

export function proofBindingKey(input: {
  claim_id: string;
  proof_id: string;
  category: EvidenceCategory;
  source_hash: string;
  environment_hash: string;
  proof_contract_hash: string;
}): string {
  return hash(input);
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
  prior_proof_plan_keys?: string[];
  budget?: VerificationBudget;
}): ProofExecutionPolicyResult {
  if (input.repair_recheck && input.repair_recheck.attempt !== 1) {
    throw new Error('focused repair proof may be rechecked exactly once');
  }
  if (input.repair_recheck && input.repair_recheck.failed_proof_ids.length === 0) {
    throw new Error('focused repair recheck requires at least one failed proof id');
  }
  const existing = input.existing_proofs ?? [];
  const repairSet = input.repair_recheck
    ? new Set([...input.repair_recheck.failed_proof_ids, ...(input.repair_recheck.affected_direct_dependents ?? [])])
    : null;
  let decisions: ProofExecutionDecision[] = [];
  const invalidated = new Map<string, string>();
  const seenBindings = new Set<string>();

  for (const proof of input.selected) {
    const bindingKey = exactBinding(input.binding)
      ? proofBindingKey({
          claim_id: proof.claim_id,
          proof_id: proof.proof_id,
          category: proof.category,
          source_hash: input.binding.source_hash,
          environment_hash: input.binding.environment_hash,
          proof_contract_hash: input.binding.proof_contract_hash,
        })
      : hash({ task_id: input.task_id, claim_id: proof.claim_id, proof_id: proof.proof_id, category: proof.category, unbound: true });

    if (seenBindings.has(bindingKey)) continue;
    seenBindings.add(bindingKey);

    const reusable = existing.find((candidate) => isReusableProof(candidate, input.binding, proof.claim_id, proof.category));
    if (reusable) {
      decisions.push({
        claim_id: proof.claim_id,
        proof_id: proof.proof_id,
        category: proof.category,
        action: 'REUSE',
        binding_key: bindingKey,
        reason: 'fresh proof has identical claim, source, environment and proof-contract binding',
        evidence_ref: reusable.evidence_ref,
      });
      continue;
    }

    for (const stale of existing.filter((candidate) => candidate.claim_id === proof.claim_id && candidate.category === proof.category)) {
      invalidated.set(stale.id, 'source, environment, proof contract or PASS freshness binding changed');
    }

    if (repairSet && !repairSet.has(proof.proof_id)) {
      decisions.push({
        claim_id: proof.claim_id,
        proof_id: proof.proof_id,
        category: proof.category,
        action: 'OMIT_RECHECK_UNAFFECTED',
        binding_key: bindingKey,
        reason: 'focused repair recheck runs only failed proof and affected direct dependents',
      });
      continue;
    }

    decisions.push({
      claim_id: proof.claim_id,
      proof_id: proof.proof_id,
      category: proof.category,
      action: 'RUN',
      binding_key: bindingKey,
      reason: exactBinding(input.binding)
        ? 'no fresh exact-bound PASS evidence exists'
        : 'proof reuse is disabled because exact source/environment/proof-contract hashes are missing',
    });
  }

  const fullSuiteRequested = input.force_full_suite === true || input.selector_full_suite_required;
  const fullSuiteAllowed = fullSuiteRequested && (input.release_gate === true || input.material_risk_trigger === true);
  const proofPlanKey = hash({
    task_id: input.task_id,
    binding: input.binding,
    decisions: decisions.map(({ claim_id, proof_id, category, action, binding_key }) => ({ claim_id, proof_id, category, action, binding_key })),
    full_suite_allowed: fullSuiteAllowed,
    repair_recheck: input.repair_recheck ?? null,
  });
  if (new Set(input.prior_proof_plan_keys ?? []).has(proofPlanKey)) {
    decisions = decisions.map((decision) => decision.action === 'RUN'
      ? {
          ...decision,
          action: 'OMIT_UNCHANGED_DUPLICATE',
          reason: 'identical proof plan already executed for the unchanged task binding',
        }
      : decision);
  }
  const budget = input.budget ?? {};
  const selectedForRun = decisions.filter((decision) => decision.action === 'RUN').map((decision) => decision.proof_id);
  const budgetExceeded = typeof budget.max_proofs === 'number' && selectedForRun.length > budget.max_proofs;

  return {
    schema: 'agent-rules/proof-execution-policy/v1',
    proof_plan_key: proofPlanKey,
    decisions,
    selected_for_run: selectedForRun,
    reused: decisions.filter((decision) => decision.action === 'REUSE').map((decision) => decision.proof_id),
    omitted_recheck_unaffected: decisions.filter((decision) => decision.action === 'OMIT_RECHECK_UNAFFECTED').map((decision) => decision.proof_id),
    omitted_unchanged_duplicate: decisions.filter((decision) => decision.action === 'OMIT_UNCHANGED_DUPLICATE').map((decision) => decision.proof_id),
    invalidated_existing_proofs: [...invalidated].map(([proof_id, reason]) => ({ proof_id, reason })),
    full_suite_requested: fullSuiteRequested,
    full_suite_allowed: fullSuiteAllowed,
    full_suite_reason: fullSuiteAllowed
      ? input.full_suite_reason ?? (input.release_gate ? 'dependency-defined release gate' : 'explicit material-risk trigger')
      : fullSuiteRequested
        ? 'deferred: no dependency-defined release gate or explicit material-risk trigger'
        : 'not requested by the focused claim profile',
    budget,
    budget_exceeded: budgetExceeded,
  };
}
