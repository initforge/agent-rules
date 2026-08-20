/**
 * REQ-004 — proof-selection engine: smallest sufficient proof set; deterministic
 * first; fidelity escalation only when the claim requires it; selected proof
 * records sufficiency/environment/escalation; omitted proof records
 * reason/why-safe/escalation condition; never silently skips required proof.
 */
import { describe, it, expect } from 'vitest';
import { deriveProofTrigger, selectProofs, type ProofSelectionInput } from '../../src/northstar/proof-testing.js';

function input(over: Partial<ProofSelectionInput> = {}): ProofSelectionInput {
  const changed_files = ['src/business/logic.ts'];
  return {
    task_id: 'T-1',
    repository: '/repo',
    changed_files,
    claims: [{ id: 'C-1', claim: 'business logic returns correct totals' }],
    risks: [],
    trigger: deriveProofTrigger({ changed_files }),
    ...over,
  };
}

describe('proof selection — minimal sufficient, deterministic first, escalate on demand', () => {
  it('selects the profile steps that cover the claims', () => {
    const plan = selectProofs(input());
    expect(plan.profile).toBe('business-logic');
    expect(plan.selected.length).toBeGreaterThan(0);
    for (const s of plan.selected) {
      expect(s.claim_id).toBe('C-1');
      expect(s.sufficiency.length).toBeGreaterThan(0);
      expect(s.escalation_path.length).toBeGreaterThan(0);
    }
  });

  it('reuses an existing proof only when it covers the claim directly', () => {
    const plan = selectProofs(input({
      existing_proofs: [
        { id: 'test-totals', category: 'unit', covers_claim: 'C-1' },
        { id: 'test-unrelated', category: 'unit', covers_claim: 'C-OTHER' },
      ],
    }));
    const reused = plan.selected.find((s) => s.proof_id === 'test-totals');
    expect(reused).toBeTruthy();
    // a passing test that does not exercise the changed behavior is NOT reused
    expect(plan.selected.find((s) => s.proof_id === 'test-unrelated')).toBeFalsy();
  });

  it('escalates to live proof when a claim is live, and BLOCKs without a live host', () => {
    const plan = selectProofs(input({
      claims: [{ id: 'C-LIVE', claim: 'browser window placement', live_surface: true }],
      trigger: deriveProofTrigger({ changed_files: ['src/browser.ts'], runtime_surfaces: ['browser'] }),
      host_capabilities: [],
    }));
    const liveOmitted = plan.omitted.find((o) => o.category === 'live');
    expect(liveOmitted).toBeTruthy();
    expect(liveOmitted!.reason).toContain('requires live proof');
    expect(liveOmitted!.escalation_condition).toContain('live host');
  });

  it('selects live proof when the host capability exists', () => {
    const plan = selectProofs(input({
      claims: [{ id: 'C-LIVE', claim: 'mcp handshake succeeds', live_surface: true }],
      trigger: deriveProofTrigger({ changed_files: ['src/mcp.ts'], runtime_surfaces: ['mcp'] }),
      host_capabilities: ['x11:0', 'mcp-provider'],
    }));
    const liveSelected = plan.selected.find((s) => s.category === 'live');
    expect(liveSelected).toBeTruthy();
    expect(liveSelected!.environment).toContain('live host');
  });

  it('records omissions for conditional profile steps no claim requires', () => {
    const plan = selectProofs(input());
    for (const o of plan.omitted) {
      expect(o.reason.length).toBeGreaterThan(0);
      expect(o.why_safe.length).toBeGreaterThan(0);
      expect(o.escalation_condition.length).toBeGreaterThan(0);
    }
  });

  it('prior failure history escalates regression proof', () => {
    const plan = selectProofs(input({ failure_history: ['regression: totals overflow (fixed twice)'] }));
    expect(plan.selected.some((s) => s.proof_id === 'regression-history')).toBe(true);
  });

  it('full-suite run is required only when scope/dependency/architecture/release risk justifies it', () => {
    const small = selectProofs(input());
    expect(small.full_suite_required).toBe(false);

    const release = selectProofs(input({
      changed_files: ['src/api.ts'],
      trigger: deriveProofTrigger({ changed_files: ['src/api.ts'], runtime_surfaces: ['release'] }),
    }));
    expect(release.full_suite_required).toBe(true);

    const wide = selectProofs(input({
      changed_files: Array.from({ length: 25 }, (_, i) => `src/api/module-${i}.ts`),
      trigger: deriveProofTrigger({ changed_files: Array.from({ length: 25 }, (_, i) => `src/api/module-${i}.ts`) }),
    }));
    expect(wide.full_suite_required).toBe(true);
  });

  it('never silently skips required proof: every live claim either selects or omits with a reason', () => {
    const plan = selectProofs(input({
      claims: [
        { id: 'C-LIVE', claim: 'desktop window focus', live_surface: true },
        { id: 'C-2', claim: 'unit behavior' },
      ],
      trigger: deriveProofTrigger({ changed_files: ['src/desktop.ts'], runtime_surfaces: ['desktop'] }),
      host_capabilities: [],
    }));
    const liveClaim = plan.claims.find((c) => c.claim_id === 'C-LIVE')!;
    expect(liveClaim.required_fidelity).toBe('live');
    // either selected or omitted-with-reason — never silently absent
    const hasLive = plan.selected.some((s) => s.claim_id === 'C-LIVE');
    const hasOmission = plan.omitted.some((o) => o.category === 'live');
    expect(hasLive || hasOmission).toBe(true);
  });
});
