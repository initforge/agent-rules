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
  // A required check that never ran is not neutral. It must remain visible as
  // an owner/host limitation rather than being silently ignored by `usable`.
  const required = input.checks.filter((check) => !check.reason || check.reason === 'blocked');
  const usable = required.length > 0
    && required.every((check) => check.ran && check.observed && check.passed === true);
  return { active: input.active, complete: input.outcome === 'PASS', usable, ship_ready: usable && input.shipReady, checks: input.checks, owner_checks: input.ownerChecks ?? [] };
}
