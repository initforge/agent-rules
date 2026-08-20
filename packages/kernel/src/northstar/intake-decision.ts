/**
 * REQ-013 — plannerless intake classification.
 *
 * Every incoming task is classified EXPLICIT, DISCOVERABLE or
 * SEMANTICALLY_AMBIGUOUS before any planner runs:
 *   - EXPLICIT: deterministic compiler can build the contract from the raw
 *     intent plus explicit scope/acceptance — no planner.
 *   - DISCOVERABLE: existing RepoFacts/project audit can resolve the gap with
 *     at most one failing verifier probe and bounded referenced
 *     schema/version discovery — then compile the contract deterministically.
 *   - SEMANTICALLY_AMBIGUOUS: only an explicitly configured strong planner may
 *     compile/freeze the contract; without one the task is
 *     NEEDS_USER/PLANNER_REQUIRED.
 *
 * A weak worker never self-lowers risk, never switches model/provider, and
 * never invents product behavior. The operator owns model/provider choice.
 */

export type IntakeDeterminacy = 'EXPLICIT' | 'DISCOVERABLE' | 'SEMANTICALLY_AMBIGUOUS';

export type PlannerAuthority = 'REQUIRED' | 'OPTIONAL' | 'FORBIDDEN';

export interface IntakeDecision {
  determinacy: IntakeDeterminacy;
  planner_authority: PlannerAuthority;
  risk_class: 'S0' | 'S1' | 'S2' | 'S3';
  explicit_scope: boolean;
  explicit_acceptance: boolean;
  repo_facts_available: boolean;
  /** Why this classification was chosen (cites scope/claims/facts, never keywords). */
  reasons: string[];
  /** When determinacy is not EXPLICIT, the specific gap that must be closed. */
  gap?: string;
  /** When SEMANTICALLY_AMBIGUOUS and no planner is configured, this must be true. */
  planner_required_without_planner?: boolean;
}

export interface IntakeInput {
  raw_intent: string;
  risk_class: 'S0' | 'S1' | 'S2' | 'S3';
  explicit_scope: boolean;
  explicit_acceptance: boolean;
  repo_facts_available: boolean;
  /** True when the project has a deterministic test/proof surface already. */
  has_verifiable_surface: boolean;
  /** True when a strong planner is explicitly configured. */
  planner_configured: boolean;
  /** Signals that the intent is semantically ambiguous (multi-architecture, vague). */
  semantic_ambiguity_hints?: string[];
}

const AMBIGUITY_HINTS = [
  'refactor the architecture',
  'migrate across multiple services',
  'change architecture',
  'redesign the system',
  'not sure',
  'figure out what',
  'decide between',
  'what should',
  'design a solution',
];

export function classifyIntake(input: IntakeInput): IntakeDecision {
  const reasons: string[] = [];
  const semanticAmbiguity = (input.semantic_ambiguity_hints ?? []).length > 0
    || AMBIGUITY_HINTS.some((hint) => input.raw_intent.toLowerCase().includes(hint));

  if (semanticAmbiguity) {
    reasons.push('intent contains semantic ambiguity that a deterministic compiler cannot resolve');
    return {
      determinacy: 'SEMANTICALLY_AMBIGUOUS',
      planner_authority: 'REQUIRED',
      risk_class: input.risk_class,
      explicit_scope: input.explicit_scope,
      explicit_acceptance: input.explicit_acceptance,
      repo_facts_available: input.repo_facts_available,
      reasons,
      gap: 'semantic ambiguity requires a strong planner to compile/freeze the contract',
      planner_required_without_planner: !input.planner_configured,
    };
  }

  if (input.explicit_scope && input.explicit_acceptance && input.has_verifiable_surface) {
    reasons.push('explicit scope + explicit acceptance + verifiable surface: deterministic compiler can build the contract');
    return {
      determinacy: 'EXPLICIT',
      planner_authority: 'FORBIDDEN',
      risk_class: input.risk_class,
      explicit_scope: true,
      explicit_acceptance: true,
      repo_facts_available: input.repo_facts_available,
      reasons,
    };
  }

  if (input.repo_facts_available || (input.explicit_scope || input.explicit_acceptance)) {
    reasons.push('repo facts / partial explicit input available: bounded discovery can close the gap');
    return {
      determinacy: 'DISCOVERABLE',
      planner_authority: 'OPTIONAL',
      risk_class: input.risk_class,
      explicit_scope: input.explicit_scope,
      explicit_acceptance: input.explicit_acceptance,
      repo_facts_available: input.repo_facts_available,
      reasons,
      gap: input.repo_facts_available
        ? 'complete scope/acceptance from repo facts with bounded discovery'
        : 'missing explicit scope or acceptance; at most one failing verifier probe may be used',
    };
  }

  reasons.push('no explicit scope, no explicit acceptance, no repo facts: cannot compile deterministically');
  return {
    determinacy: 'SEMANTICALLY_AMBIGUOUS',
    planner_authority: 'REQUIRED',
    risk_class: input.risk_class,
    explicit_scope: input.explicit_scope,
    explicit_acceptance: input.explicit_acceptance,
    repo_facts_available: input.repo_facts_available,
    reasons,
    gap: 'insufficient explicit input for a deterministic compiler; a strong planner is required',
    planner_required_without_planner: !input.planner_configured,
  };
}

/** A weak worker may only execute EXPLICIT or DISCOVERABLE tasks after the contract is frozen. */
export function weakWorkerMayExecute(decision: IntakeDecision): boolean {
  return decision.determinacy === 'EXPLICIT' || decision.determinacy === 'DISCOVERABLE';
}

/** Without a configured planner, SEMANTICALLY_AMBIGUOUS must stop with NEEDS_USER/PLANNER_REQUIRED. */
export function requiresPlannerButNone(decision: IntakeDecision): boolean {
  return decision.determinacy === 'SEMANTICALLY_AMBIGUOUS' && decision.planner_required_without_planner === true;
}
