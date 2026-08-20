/**
 * REQ-005 — live-proof rules: live claims require real live proof; unit/fake
 * cannot replace live proof for a live claim; smallest real provider, pinned
 * versions; BLOCKED when environment capability is unavailable; UNSUPPORTED
 * when the host cannot provide the seam.
 */
import { describe, it, expect } from 'vitest';
import {
  LIVE_CLAIM_SURFACES,
  deriveProofTrigger,
  isLiveClaim,
  selectProofs,
  type ProofSelectionInput,
} from '../../src/northstar/proof-testing.js';

function liveInput(surface: string, host: string[]): ProofSelectionInput {
  return {
    task_id: 'T-LIVE',
    repository: '/repo',
    changed_files: ['src/live.ts'],
    claims: [{ id: 'C-LIVE', claim: `${surface} behaves correctly`, live_surface: true }],
    risks: [],
    trigger: deriveProofTrigger({ changed_files: ['src/live.ts'], runtime_surfaces: [surface] }),
    host_capabilities: host,
  };
}

describe('live-proof rules — real proof for live claims, honest BLOCKED/UNSUPPORTED', () => {
  it('every owner §8 live surface is recognized', () => {
    const surfaces = [
      'browser', 'desktop', 'mcp', 'handshake', 'process-attribution', 'window-attribution',
      'virtual-desktop', 'focus', 'headed', 'session-persistence', 'reconnect',
      'resource-recreation', 'network', 'provider', 'host-integration', 'auth', 'data-state',
    ];
    for (const s of surfaces) expect(isLiveClaim(s)).toBe(true);
    expect(LIVE_CLAIM_SURFACES.length).toBe(17);
  });

  it('a fake/unit proof cannot satisfy a live claim (no downgrade)', () => {
    const plan = selectProofs(liveInput('mcp', []));
    // without a live host the live claim is omitted-with-reason, never
    // silently downgraded to a unit proof
    const unitForLive = plan.selected.find((s) => s.claim_id === 'C-LIVE' && s.category === 'unit');
    expect(unitForLive).toBeFalsy();
    expect(plan.omitted.some((o) => o.category === 'live')).toBe(true);
  });

  it('with a live host the smallest real provider proof is selected', () => {
    const plan = selectProofs(liveInput('mcp', ['mcp-provider', 'x11:0']));
    const live = plan.selected.find((s) => s.claim_id === 'C-LIVE' && s.category === 'live');
    expect(live).toBeTruthy();
    expect(live!.environment).toContain('live host');
    expect(live!.escalation_path).toContain('smallest real provider');
  });

  it('an existing fake test is never reused for a live claim', () => {
    const plan = selectProofs({
      ...liveInput('browser', ['browser-bin']),
      existing_proofs: [{ id: 'fake-wm-test', category: 'browser', covers_claim: 'C-LIVE', live: false }],
    });
    expect(plan.selected.find((s) => s.proof_id === 'fake-wm-test')).toBeFalsy();
  });

  it('browser claim with browser-bin capability selects live browser proof', () => {
    const plan = selectProofs(liveInput('browser', ['browser-bin']));
    expect(plan.selected.some((s) => s.claim_id === 'C-LIVE' && s.category === 'live')).toBe(true);
  });

  it('desktop claim without X11 blocks honestly', () => {
    const plan = selectProofs(liveInput('desktop', []));
    const liveOmitted = plan.omitted.find((o) => o.category === 'live');
    expect(liveOmitted?.reason).toContain('no live host capability');
  });
});
