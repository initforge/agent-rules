/**
 * REQ-013 — plannerless intake classification. EXPLICIT/DISCOVERABLE compile
 * deterministically; only SEMANTICALLY_AMBIGUOUS may call a strong planner;
 * without one the task is NEEDS_USER/PLANNER_REQUIRED.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyIntake,
  weakWorkerMayExecute,
  requiresPlannerButNone,
  type IntakeInput,
} from '../../src/northstar/intake-decision.js';

function input(over: Partial<IntakeInput> = {}): IntakeInput {
  return {
    raw_intent: 'Add a checked behavior to src',
    risk_class: 'S1',
    explicit_scope: true,
    explicit_acceptance: true,
    repo_facts_available: true,
    has_verifiable_surface: true,
    planner_configured: false,
    ...over,
  };
}

describe('REQ-013 — plannerless intake', () => {
  it('EXPLICIT tasks compile deterministically and forbid a planner', () => {
    const decision = classifyIntake(input());
    expect(decision.determinacy).toBe('EXPLICIT');
    expect(decision.planner_authority).toBe('FORBIDDEN');
    expect(weakWorkerMayExecute(decision)).toBe(true);
  });

  it('DISCOVERABLE tasks use repo facts with bounded discovery and may skip the planner', () => {
    const decision = classifyIntake(input({ explicit_acceptance: false }));
    expect(decision.determinacy).toBe('DISCOVERABLE');
    expect(decision.planner_authority).toBe('OPTIONAL');
    expect(weakWorkerMayExecute(decision)).toBe(true);
  });

  it('semantic ambiguity forces a strong planner; without one it is NEEDS_USER/PLANNER_REQUIRED', () => {
    const decision = classifyIntake(input({
      raw_intent: 'Refactor the architecture across multiple services and decide between approaches',
      semantic_ambiguity_hints: ['refactor the architecture'],
    }));
    expect(decision.determinacy).toBe('SEMANTICALLY_AMBIGUOUS');
    expect(decision.planner_authority).toBe('REQUIRED');
    expect(weakWorkerMayExecute(decision)).toBe(false);
    expect(requiresPlannerButNone(decision)).toBe(true);
  });

  it('semantic ambiguity WITH a configured planner is not a NEEDS_USER stop (planner may run)', () => {
    const decision = classifyIntake(input({
      raw_intent: 'Decide between two architectures',
      planner_configured: true,
      semantic_ambiguity_hints: ['decide between'],
    }));
    expect(decision.determinacy).toBe('SEMANTICALLY_AMBIGUOUS');
    expect(decision.planner_authority).toBe('REQUIRED');
    expect(requiresPlannerButNone(decision)).toBe(false);
  });

  it('no explicit scope/acceptance/facts cannot compile deterministically (must stop, never invent)', () => {
    const decision = classifyIntake(input({
      explicit_scope: false,
      explicit_acceptance: false,
      repo_facts_available: false,
      has_verifiable_surface: false,
    }));
    expect(decision.determinacy).toBe('SEMANTICALLY_AMBIGUOUS');
    expect(decision.planner_authority).toBe('REQUIRED');
    expect(requiresPlannerButNone(decision)).toBe(true);
    expect(decision.gap).toContain('strong planner');
  });

  it('a weak worker never executes ambiguous work even if a planner exists', () => {
    const decision = classifyIntake(input({
      raw_intent: 'Design a solution for an unclear problem',
      planner_configured: true,
      semantic_ambiguity_hints: ['design a solution'],
    }));
    expect(weakWorkerMayExecute(decision)).toBe(false);
  });
});
