import { createHash } from 'node:crypto';

/**
 * REQ-020 — closure transaction.
 *
 * Close succeeds only after evidence-derived PASS, intent/spec/implementation
 * reconciliation and scope/verification integrity PASS. The transaction
 * extracts durable semantic residue, promotes long-lived requirements into
 * project truth, retires implementation-local requirements, moves the pointer
 * ACTIVE -> RETIRED, archives history to a cold content-addressed store, and
 * marks regenerable/temp artifacts PURGE_ELIGIBLE — without purging required
 * evidence, referenced artifacts or unresolved work.
 */

export type ClosureRequirementDisposition = 'promote' | 'retire';

export interface ClosureRequirementDecision {
  requirement_id: string;
  disposition: ClosureRequirementDisposition;
  /** Where to promote long-lived requirements (rules/contracts/tests/docs). */
  promote_target?: string;
  reason: string;
}

export interface ClosureResidue {
  schema: 'agent-rules/closure-residue';
  version: 1;
  plan_id: string;
  purpose: string;
  outcome: string;
  proof_result: string;
  final_baseline: string;
  durable_decisions: string[];
  durable_invariants: string[];
  changed_surfaces: string[];
  remaining_issues: string[];
  promoted_requirements: ClosureRequirementDecision[];
  retired_requirements: ClosureRequirementDecision[];
  historical_pointer: string;
  residue_sha256: string;
}

export interface ClosureTransactionInput {
  plan_id: string;
  purpose: string;
  outcome: string;
  proof_result: string;
  final_baseline: string;
  durable_decisions: string[];
  durable_invariants: string[];
  changed_surfaces: string[];
  remaining_issues: string[];
  requirements: Array<{ id: string; statement: string }>;
  /** Explicit promote/retire decisions (e.g. operator or rule contract). */
  requirement_decisions?: ClosureRequirementDecision[];
}

/** Decide requirement disposition. Default is retire (implementation-local). */
export function decideClosureRequirements(input: Pick<ClosureTransactionInput, 'requirements'> & { durable_requirement_ids?: string[] }): ClosureRequirementDecision[] {
  const durable = new Set(input.durable_requirement_ids ?? []);
  return input.requirements.map((requirement) => {
    if (durable.has(requirement.id)) {
      return {
        requirement_id: requirement.id,
        disposition: 'promote',
        promote_target: inferPromoteTarget(requirement.statement),
        reason: 'owner-marked durable requirement; promote to project truth before retirement',
      };
    }
    return {
      requirement_id: requirement.id,
      disposition: 'retire',
      reason: 'implementation-local requirement; retired after closure',
    };
  });
}

function inferPromoteTarget(statement: string): string {
  const lower = statement.toLowerCase();
  if (/\b(security|permission|authorization|data integrity)\b/.test(lower)) return 'rules/';
  if (/\b(contract|schema|api)\b/.test(lower)) return 'schemas/';
  if (/\btest\b/.test(lower)) return 'tests/';
  if (/\bdocumentation|guide|doc\b/.test(lower)) return 'docs/';
  return 'rules/';
}

/** Compute the closure residue receipt (hash-bound durable residue). */
export function closureResidue(input: ClosureTransactionInput & { requirement_decisions?: ClosureRequirementDecision[]; historical_pointer: string }): ClosureResidue {
  const decisions = input.requirement_decisions ?? decideClosureRequirements({ requirements: input.requirements });
  const promoted = decisions.filter((decision) => decision.disposition === 'promote');
  const retired = decisions.filter((decision) => decision.disposition === 'retire');
  const body = {
    schema: 'agent-rules/closure-residue' as const,
    version: 1 as const,
    plan_id: input.plan_id,
    purpose: input.purpose,
    outcome: input.outcome,
    proof_result: input.proof_result,
    final_baseline: input.final_baseline,
    durable_decisions: [...input.durable_decisions],
    durable_invariants: [...input.durable_invariants],
    changed_surfaces: [...input.changed_surfaces],
    remaining_issues: [...input.remaining_issues],
    promoted_requirements: promoted,
    retired_requirements: retired,
    historical_pointer: input.historical_pointer,
  };
  return { ...body, residue_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

export interface ClosureIntegrityGate {
  evidence_derived_pass: boolean;
  intent_spec_implementation_reconciled: boolean;
  scope_and_verification_integrity: boolean;
  /** Required evidence / referenced artifacts / unresolved work must never be purged. */
  no_required_evidence_purged: boolean;
  no_referenced_artifact_purged: boolean;
  no_unresolved_work_purged: boolean;
}

/**
 * Terminal gate: close only succeeds when every integrity condition holds.
 * Returns 'PASS' or the list of failed gates (never silently bypasses PASS).
 */
export function assertClosureIntegrity(input: ClosureIntegrityGate): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!input.evidence_derived_pass) failures.push('evidence_derived_pass');
  if (!input.intent_spec_implementation_reconciled) failures.push('intent_spec_implementation_reconciled');
  if (!input.scope_and_verification_integrity) failures.push('scope_and_verification_integrity');
  if (!input.no_required_evidence_purged) failures.push('no_required_evidence_purged');
  if (!input.no_referenced_artifact_purged) failures.push('no_referenced_artifact_purged');
  if (!input.no_unresolved_work_purged) failures.push('no_unresolved_work_purged');
  return { pass: failures.length === 0, failures };
}
