export type ClosureGateStatus = 'PASS' | 'FAIL' | 'BLOCKED';

export interface ClosureGateEvidence {
  id: string;
  status: ClosureGateStatus;
  detail: string;
  evidence?: string[];
}

export interface NorthStarClosureInput {
  primary_outcome_achieved: boolean;
  contract_traceability: boolean;
  deterministic_acceptance: boolean;
  independent_semantic_review: boolean | null;
  convergence_audit: boolean;
  spec_revision_invalidation: boolean;
  proof_dag: boolean;
  context_feedback_loop: boolean;
  bounded_skill_capability_surface: boolean;
  empirical_model_routing: boolean | null;
  crash_resume: boolean;
  forbidden_scope_enforcement: boolean;
  evidence_integrity: boolean;
  false_green_rejection: boolean;
  resource_governance: boolean;
  platform_portability: boolean | null;
  browser_visual_live: boolean | null;
  mobile_live?: boolean | null;
  lower_tier_ablation: boolean | null;
  clean_host_full_suite: boolean | null;
}

export interface NorthStarClosureReport {
  release_ready: boolean;
  source_complete: boolean;
  gates: ClosureGateEvidence[];
  failures: string[];
  blockers: string[];
}

/**
 * Final fail-closed truth gate. `null` means the environment has not produced
 * proof; unknown evidence can never be silently promoted to PASS.
 */
export function evaluateNorthStarClosure(input: NorthStarClosureInput): NorthStarClosureReport {
  const entries: Array<[string, boolean | null | undefined, string]> = [
    // PRIMARY_OUTCOME is non-compensable (REQ-C21): secondary PASS never
    // compensates an unmet primary outcome, so it is never in sourceOnly.
    ['primary-outcome', input.primary_outcome_achieved, 'the single owner primary outcome is achieved; non-compensable by secondary gates'],
    ['contract-traceability', input.contract_traceability, 'intent/spec/task/claim traceability has no orphan truth anchors'],
    ['deterministic-acceptance', input.deterministic_acceptance, 'PASS is derived from verifier evidence, never worker self-report'],
    ['independent-semantic-review', input.independent_semantic_review, 'semantic correctness is independently reviewed for high-risk semantic work'],
    ['convergence-audit', input.convergence_audit, 'implementation is re-audited against original intent/spec until no bounded gaps remain'],
    ['spec-revision-invalidation', input.spec_revision_invalidation, 'changed requirements/claims invalidate stale tasks and evidence'],
    ['proof-dag', input.proof_dag, 'claim proof dependencies are explicit, acyclic and oracle-aware'],
    ['context-feedback-loop', input.context_feedback_loop, 'failed attempts generate bounded targeted retrieval without replaying whole context'],
    ['bounded-surface', input.bounded_skill_capability_surface, 'skills/capabilities are provenance checked and bounded'],
    ['empirical-model-routing', input.empirical_model_routing, 'provider ranking is telemetry/report only; execution authority is operator selection plus host-edge attestation'],
    ['crash-resume', input.crash_resume, 'restart preserves task truth, checkpoint integrity and idempotency'],
    ['forbidden-scope', input.forbidden_scope_enforcement, 'out-of-scope edits fail closed'],
    ['evidence-integrity', input.evidence_integrity, 'evidence is immutable/hash-bound and stale proof is not reused'],
    ['false-green', input.false_green_rejection, 'missing/skipped/wrong-command verification cannot become PASS'],
    ['resource-governance', input.resource_governance, 'CPU/memory/browser/concurrency/time/repair budgets are enforced'],
    ['platform-portability', input.platform_portability, 'canonical contracts materialize correctly across supported hosts'],
    ['browser-visual-live', input.browser_visual_live, 'real browser/visual claims are exercised on a live capable host'],
    ['mobile-live', input.mobile_live, 'mobile claims, when in release scope, are exercised on a real/simulator capable host'],
    ['lower-tier-ablation', input.lower_tier_ablation, 'cheap/default workers show material verified-task uplift versus raw baseline'],
    ['clean-host-full-suite', input.clean_host_full_suite, 'clean-host build/typecheck/test/certification passes with no hidden skip'],
  ];
  const gates = entries.filter(([, value]) => value !== undefined).map(([id, value, detail]): ClosureGateEvidence => ({
    id, status: value === true ? 'PASS' : value === false ? 'FAIL' : 'BLOCKED', detail,
  }));
  const failures = gates.filter((gate) => gate.status === 'FAIL').map((gate) => gate.id);
  const blockers = gates.filter((gate) => gate.status === 'BLOCKED').map((gate) => gate.id);
  const sourceOnly = new Set(['platform-portability', 'browser-visual-live', 'mobile-live', 'lower-tier-ablation', 'clean-host-full-suite', 'independent-semantic-review', 'empirical-model-routing']);
  const sourceComplete = gates.filter((gate) => !sourceOnly.has(gate.id)).every((gate) => gate.status === 'PASS');
  return { release_ready: failures.length === 0 && blockers.length === 0, source_complete: sourceComplete, gates, failures, blockers };
}
