import { describe, it, expect } from 'vitest';
import {
  failClosedOutcome,
  isTerminalPass,
  terminalVerb,
  TERMINAL_FAIL_CLOSED_ORDER,
  type TrustedTerminalOutcome,
  type TrustedTerminalDecision,
} from '../src/contracts.js';

const binding = {
  harness_release: 'h',
  installed_projection: 'i',
  consumer_repository: 'r',
  consumer_candidate: 'c',
  host_runtime: 't',
};

function decision(over: Partial<TrustedTerminalDecision>): TrustedTerminalDecision {
  return {
    outcome: 'PASS',
    unresolved_requirements: [],
    reason_codes: [],
    bound_evidence: binding,
    release_eligible: true,
    closure_eligible: true,
    attestation_eligible: true,
    deactivation_eligible: true,
    compaction_eligible: true,
    ...over,
  };
}

describe('canonical terminal authority', () => {
  it('fail-closed order is FAILED > NEEDS_USER > BLOCKED > UNSUPPORTED > PARTIAL > PASS', () => {
    expect(TERMINAL_FAIL_CLOSED_ORDER).toEqual([
      'FAILED', 'NEEDS_USER', 'BLOCKED', 'UNSUPPORTED', 'PARTIAL', 'PASS',
    ]);
  });

  it('returns the most fail-closed outcome present', () => {
    const candidates: TrustedTerminalOutcome[] = ['PARTIAL', 'PASS', 'BLOCKED'];
    expect(failClosedOutcome(candidates)).toBe('BLOCKED');
  });

  it('PARTIAL is not PASS and must not be treated as terminal success', () => {
    const d = decision({ outcome: 'PARTIAL', attestation_eligible: false });
    expect(isTerminalPass(d)).toBe(false);
  });

  it('FAILED wins over PASS even if listed later', () => {
    expect(failClosedOutcome(['PASS', 'FAILED'])).toBe('FAILED');
  });

  it('PASS requires no unresolved requirements and release+closure eligibility', () => {
    const withUnresolved = decision({ unresolved_requirements: ['REQ-001'] });
    const noRelease = decision({ release_eligible: false });
    expect(isTerminalPass(withUnresolved)).toBe(false);
    expect(isTerminalPass(noRelease)).toBe(false);
    expect(isTerminalPass(decision({}))).toBe(true);
  });

  it('adversarial: only a terminal PASS renders DONE; PARTIAL/FAILED/BLOCKED/NEEDS_USER never do', () => {
    expect(terminalVerb(decision({}))).toBe('DONE');
    expect(terminalVerb(decision({ outcome: 'PARTIAL', attestation_eligible: false }))).toBe('PARTIAL');
    expect(terminalVerb(decision({ outcome: 'FAILED' }))).toBe('FAILED');
    expect(terminalVerb(decision({ outcome: 'BLOCKED' }))).toBe('BLOCKED');
    expect(terminalVerb(decision({ outcome: 'NEEDS_USER' }))).toBe('NEEDS_USER');
    expect(terminalVerb(decision({ outcome: 'UNSUPPORTED' }))).toBe('UNSUPPORTED');
    // Non-PASS outcomes must never be rendered as DONE / "completed".
    for (const o of ['PARTIAL', 'FAILED', 'BLOCKED', 'NEEDS_USER', 'UNSUPPORTED'] as TrustedTerminalOutcome[]) {
      expect(terminalVerb(decision({ outcome: o }))).not.toBe('DONE');
    }
  });
});
