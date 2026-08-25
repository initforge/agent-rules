import { describe, it, expect } from 'vitest';
import {
  SINGLE_FLOW,
  OWNER_MODULES,
  TASK_STATES,
  CLAIM_OUTCOMES,
  HOST_STATES,
  PROVIDER_STATES,
  validateBehaviorRuntimeContract,
  isTaskState,
  isClaimOutcome,
  isHostState,
  isProviderState,
} from '../../src/northstar/behavior-runtime.js';
import { reduceOutcome, assertClaimOutcome, outcomeToAcceptanceShape } from '../../src/northstar/outcome-reducer.js';
import type { AcceptanceResult } from '../../src/northstar/evidence-ledger.js';
import type { AcceptanceAudit } from '../../src/northstar/acceptance-audit.js';

function acceptance(outcome: AcceptanceResult['outcome'], extra?: Partial<AcceptanceResult>): AcceptanceResult {
  return {
    outcome,
    accepted_claims: outcome === 'PASS' ? ['C-1'] : [],
    unresolved_claims: outcome === 'BLOCKED' ? ['C-1'] : [],
    failed_claims: outcome === 'FAILED' ? ['C-1'] : [],
    reasons: [],
    ...extra,
  };
}

const auditPass: AcceptanceAudit = { accepted: true, findings: [] };
const auditFail: AcceptanceAudit = { accepted: false, findings: ['semantic review required'] };

describe('behavior-runtime canonical contract (REQ-103/105/115)', () => {
  it('declares the single flow in canonical order', () => {
    expect(SINGLE_FLOW).toEqual([
      'RequestIntake', 'PlanCompiler', 'ContextRuntime', 'SkillResolver',
      'CapabilityBroker', 'ExecutionCoordinator', 'ProofRouter', 'RunStore', 'OutcomeReducer',
    ]);
  });

  it('declares exactly 11 owner modules', () => {
    expect(OWNER_MODULES).toHaveLength(11);
    expect(OWNER_MODULES).toContain('BehaviorRuntime');
    expect(OWNER_MODULES).toContain('HostAdapter');
  });

  it('enforces the state vocabulary without ambiguous synonyms', () => {
    expect(TASK_STATES).toEqual(['DISCUSSING', 'PLANNED', 'EXECUTING', 'VERIFYING', 'COMPLETE', 'BLOCKED', 'NEEDS_USER']);
    expect(CLAIM_OUTCOMES).toEqual(['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER']);
    expect(HOST_STATES).toEqual(['NOT_DETECTED', 'DETECTED', 'INSTALLED', 'OFFLINE_VERIFIED', 'LIVE_VERIFIED', 'FAILED']);
    expect(PROVIDER_STATES).toEqual(['UNAVAILABLE', 'AVAILABLE', 'AUTHORIZED', 'ACTIVE', 'FAILED']);
    for (const synonym of ['Ready', 'Completed', 'Observed', 'Effective', 'Live pass', 'Host usable pass']) {
      expect(TASK_STATES.map((s) => s.toLowerCase())).not.toContain(synonym.toLowerCase());
      expect(CLAIM_OUTCOMES.map((s) => s.toLowerCase())).not.toContain(synonym.toLowerCase());
      expect(HOST_STATES.map((s) => s.toLowerCase())).not.toContain(synonym.toLowerCase());
      expect(PROVIDER_STATES.map((s) => s.toLowerCase())).not.toContain(synonym.toLowerCase());
    }
  });

  it('validates the runtime contract fail-closed', () => {
    const ok = validateBehaviorRuntimeContract(
      { repoRoot: '/repo', request: { raw_intent: 'do x' } as never, spec: { spec_id: 'S-1' } as never, contextGeneration: 3 },
      { status: 'complete' },
    );
    expect(ok.valid).toBe(true);
    expect(ok.flow).toHaveLength(9);
    const bad = validateBehaviorRuntimeContract(
      { repoRoot: '/repo', request: {} as never, spec: {} as never, contextGeneration: -1 },
      { status: 'ready' as never },
    );
    expect(bad.valid).toBe(false);
    expect(bad.violations.length).toBeGreaterThan(0);
  });

  it('type guards reject unknown vocabulary', () => {
    expect(isTaskState('COMPLETE')).toBe(true);
    expect(isTaskState('Ready')).toBe(false);
    expect(isClaimOutcome('PASS')).toBe(true);
    expect(isClaimOutcome('Live pass')).toBe(false);
    expect(isHostState('OFFLINE_VERIFIED')).toBe(true);
    expect(isHostState('Ready')).toBe(false);
    expect(isProviderState('AUTHORIZED')).toBe(true);
    expect(isProviderState('Active')).toBe(false);
  });
});

describe('outcome-reducer single truth (REQ-112)', () => {
  const base = {
    run_id: 'run-1', spec_id: 'S-1', spec_revision: 1, candidate_epoch: 0, platform: 'win32',
  };

  it('rejects non-canonical claim outcomes', () => {
    expect(() => assertClaimOutcome('PASS')).not.toThrow();
    expect(() => assertClaimOutcome('Live pass')).toThrow(/canonical claim_outcome/);
  });

  it('PASS requires acceptance PASS + audit accepted + convergence', () => {
    const r = reduceOutcome({ acceptance: acceptance('PASS'), audit: auditPass, convergence: { converged: true }, ...base });
    expect(r.claim_outcome).toBe('PASS');
    const downgraded = reduceOutcome({ acceptance: acceptance('PASS'), audit: auditFail, convergence: { converged: true }, ...base });
    expect(downgraded.claim_outcome).toBe('PARTIAL');
  });

  it('hard blocks produce BLOCKED', () => {
    const r = reduceOutcome({ acceptance: acceptance('PASS'), audit: auditPass, hardBlockReasons: ['semantic state invalid'], ...base });
    expect(r.claim_outcome).toBe('BLOCKED');
  });

  it('acceptance FAILED with forbidden-scope violation maps to BLOCKED', () => {
    const r = reduceOutcome({ acceptance: acceptance('FAILED', { reasons: ['forbidden-scope violation'] }), audit: auditPass, ...base });
    expect(r.claim_outcome).toBe('BLOCKED');
  });

  it('maps back to the run-level outcome shape preserving FAILED for hard evidence failures', () => {
    const acc = acceptance('FAILED', { reasons: ['policy: disabled test bypass'] });
    const r = reduceOutcome({ acceptance: acc, audit: auditPass, ...base });
    expect(outcomeToAcceptanceShape(r.claim_outcome, acc)).toBe('FAILED');
    expect(outcomeToAcceptanceShape('PASS' as never)).toBe('PASS');
    expect(outcomeToAcceptanceShape('BLOCKED' as never, acceptance('BLOCKED'))).toBe('BLOCKED');
  });
});