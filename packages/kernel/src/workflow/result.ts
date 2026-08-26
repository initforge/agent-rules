import { reduceOutcome, type OutcomeReducerInput, type ReducedOutcome } from '../northstar/outcome-reducer.js';
import type { RunSummary } from './contract.js';

/** Canonical v3 name; legacy reducer remains the evidence implementation. */
export function reduceRunResult(input: OutcomeReducerInput): ReducedOutcome {
  return reduceOutcome(input);
}

export function summarizeRunResult(input: {
  active: boolean;
  outcome: ReducedOutcome['claim_outcome'];
  checks: RunSummary['checks'];
  ownerChecks?: RunSummary['owner_checks'];
  shipReady: boolean;
}): RunSummary {
  const deterministic = input.checks.filter((check) => check.observed);
  const usable = deterministic.length > 0 && deterministic.every((check) => check.passed === true);
  return { active: input.active, complete: input.outcome === 'PASS', usable, ship_ready: usable && input.shipReady, checks: input.checks, owner_checks: input.ownerChecks ?? [] };
}
