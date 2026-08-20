/**
 * REQ-006 — failure semantics: exactly one of PASS | PARTIAL | BLOCKED |
 * UNSUPPORTED | PRE-EXISTING | NEEDS_USER; BLOCKED/UNSUPPORTED can never become
 * PASS; failures cannot be hidden by deleting or weakening tests; the whole
 * task cannot be PASS while a required claim is unresolved.
 */
import { describe, it, expect } from 'vitest';
import {
  PROOF_STATUSES,
  PROOF_STATUS_RULES,
  assertProofStatus,
  assertStatusTransition,
  canTransitionStatus,
  finalStatusFromResults,
} from '../../src/northstar/proof-testing.js';

describe('proof status semantics — six states, no illegal escalation', () => {
  it('defines exactly the six owner §11 statuses', () => {
    expect(PROOF_STATUSES).toEqual(['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER']);
    expect(PROOF_STATUS_RULES.length).toBe(6);
  });

  it('assertProofStatus rejects unknown statuses', () => {
    expect(() => assertProofStatus('OK')).toThrow(/one of/);
    expect(() => assertProofStatus('FAILED')).toThrow(/one of/);
    expect(() => assertProofStatus('PASS')).not.toThrow();
  });

  it('BLOCKED can never transition to PASS', () => {
    expect(canTransitionStatus('BLOCKED', 'PASS')).toBe(false);
    expect(() => assertStatusTransition('BLOCKED', 'PASS', 't')).toThrow(/never become PASS/);
  });

  it('UNSUPPORTED can never transition to PASS', () => {
    expect(canTransitionStatus('UNSUPPORTED', 'PASS')).toBe(false);
    expect(() => assertStatusTransition('UNSUPPORTED', 'PASS', 't')).toThrow(/never become PASS/);
  });

  it('PASS cannot silently downgrade to BLOCKED/UNSUPPORTED', () => {
    expect(canTransitionStatus('PASS', 'BLOCKED')).toBe(false);
    expect(canTransitionStatus('PASS', 'UNSUPPORTED')).toBe(false);
  });

  it('PARTIAL can escalate to PASS or degrade to BLOCKED/NEEDS_USER/PRE-EXISTING', () => {
    expect(canTransitionStatus('PARTIAL', 'PASS')).toBe(true);
    expect(canTransitionStatus('PARTIAL', 'BLOCKED')).toBe(true);
    expect(canTransitionStatus('PARTIAL', 'NEEDS_USER')).toBe(true);
    expect(canTransitionStatus('PARTIAL', 'PRE-EXISTING')).toBe(true);
  });

  it('NEEDS_USER is the owner-gate hub', () => {
    expect(canTransitionStatus('NEEDS_USER', 'PASS')).toBe(true);
    expect(canTransitionStatus('NEEDS_USER', 'BLOCKED')).toBe(true);
    expect(canTransitionStatus('NEEDS_USER', 'UNSUPPORTED')).toBe(true);
  });

  it('PRE-EXISTING requires reproduction outside the changed scope', () => {
    expect(canTransitionStatus('PRE-EXISTING', 'PASS')).toBe(true);
    expect(canTransitionStatus('PRE-EXISTING', 'BLOCKED')).toBe(false);
  });

  it('final status: all PASS => PASS', () => {
    expect(finalStatusFromResults([{ proof_id: 'a', status: 'PASS' }, { proof_id: 'b', status: 'PASS' }], 2)).toBe('PASS');
  });

  it('final status: any BLOCKED/UNSUPPORTED => BLOCKED (never whole-task PASS)', () => {
    expect(finalStatusFromResults([{ proof_id: 'a', status: 'PASS' }, { proof_id: 'b', status: 'BLOCKED' }], 2)).toBe('BLOCKED');
    expect(finalStatusFromResults([{ proof_id: 'a', status: 'PASS' }, { proof_id: 'b', status: 'UNSUPPORTED' }], 2)).toBe('BLOCKED');
  });

  it('final status: any NEEDS_USER => NEEDS_USER', () => {
    expect(finalStatusFromResults([{ proof_id: 'a', status: 'PASS' }, { proof_id: 'b', status: 'NEEDS_USER' }], 2)).toBe('NEEDS_USER');
  });

  it('final status: mixed PASS/PARTIAL => PARTIAL', () => {
    expect(finalStatusFromResults([{ proof_id: 'a', status: 'PASS' }, { proof_id: 'b', status: 'PARTIAL' }], 2)).toBe('PARTIAL');
  });

  it('final status: no claims => NEEDS_USER (never PASS on empty claims)', () => {
    expect(finalStatusFromResults([], 0)).toBe('NEEDS_USER');
  });

  it('final status: no results but claims exist => NEEDS_USER', () => {
    expect(finalStatusFromResults([], 1)).toBe('NEEDS_USER');
  });
});
