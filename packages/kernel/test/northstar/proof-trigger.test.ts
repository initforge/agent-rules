/**
 * REQ-002 — the trigger model derives activation from changed scope, affected
 * claims, affected dependencies, risk class, runtime surface, project test
 * architecture, host capability and required evidence fidelity — never from
 * keywords alone.
 */
import { describe, it, expect } from 'vitest';
import { deriveProofTrigger, isLiveClaim, LIVE_CLAIM_SURFACES, type ProofTriggerInput } from '../../src/northstar/proof-testing.js';

function base(over: Partial<ProofTriggerInput> = {}): ProofTriggerInput {
  return { changed_files: ['src/index.ts'], ...over };
}

describe('proof trigger — scope/claim/risk based, never keyword-only', () => {
  it('activates from changed scope alone (no keywords needed)', () => {
    const t = deriveProofTrigger(base({ changed_files: ['packages/kernel/src/northstar/proof-testing.ts'] }));
    expect(t.activated).toBe(true);
    expect(t.surfaces).toContain('source');
    expect(t.reasons.some((r) => r.startsWith('changed scope'))).toBe(true);
  });

  it('maps a test-file change to the test surface', () => {
    const t = deriveProofTrigger(base({ changed_files: ['src/foo.test.ts'] }));
    expect(t.surfaces).toContain('test');
  });

  it('maps a schema/migration change to contract+data categories', () => {
    const t = deriveProofTrigger(base({ changed_files: ['src/schemas/user.schema.json', 'src/migrations/003.sql'] }));
    expect(t.surfaces).toContain('schema');
    expect(t.surfaces).toContain('migration');
    expect(t.candidate_categories).toContain('contract');
    expect(t.candidate_categories).toContain('data');
  });

  it('maps frontend/UI files to browser categories', () => {
    const t = deriveProofTrigger(base({ changed_files: ['src/components/Button.tsx'] }));
    expect(t.surfaces).toContain('frontend');
    expect(t.candidate_categories).toContain('browser');
  });

  it('affected claims always activate', () => {
    const t = deriveProofTrigger(base({ affected_claims: ['C-001'] }));
    expect(t.surfaces).toContain('claim-evidence');
  });

  it('affected dependencies activate packaging/contract proof', () => {
    const t = deriveProofTrigger(base({ affected_dependencies: ['@playwright/mcp'] }));
    expect(t.surfaces).toContain('dependency');
    expect(t.candidate_categories).toContain('packaging');
  });

  it('S2/S3 risk escalates security/isolation proof', () => {
    const t = deriveProofTrigger(base({ risk_hint: 'S3' }));
    expect(t.surfaces).toContain('security');
  });

  it('live runtime surfaces demand live fidelity', () => {
    const t = deriveProofTrigger(base({ runtime_surfaces: ['browser', 'mcp'] }));
    expect(t.required_fidelity).toBe('live');
  });

  it('desktop/process/session surfaces map to live+security categories', () => {
    const t = deriveProofTrigger(base({ runtime_surfaces: ['desktop', 'session-persistence', 'reconnect'] }));
    expect(t.candidate_categories).toContain('live');
    expect(t.candidate_categories).toContain('security');
    expect(t.required_fidelity).toBe('live');
  });

  it('project test architecture and host capabilities inform the candidate set', () => {
    const t = deriveProofTrigger(base({
      project_test_architecture: ['playwright browser suite'],
      host_capabilities: ['x11:0', 'browser-bin'],
    }));
    expect(t.surfaces).toContain('browser');
    expect(t.surfaces).toContain('desktop');
  });

  it('user wording alone (no scope) still activates honestly as a verification request', () => {
    const t = deriveProofTrigger(base({ changed_files: [], user_wording: 'please test the login flow' }));
    expect(t.activated).toBe(true);
    expect(t.surfaces).toContain('verification');
    expect(t.reasons.some((r) => r.includes('wording hint'))).toBe(true);
  });

  it('wording is a hint only: it cannot suppress scope-derived activation', () => {
    const t = deriveProofTrigger(base({ changed_files: ['src/schemas/api.schema.json'], user_wording: 'just a doc tweak' }));
    expect(t.surfaces).toContain('schema');
  });

  it('isLiveClaim covers every owner §8 live surface', () => {
    for (const s of LIVE_CLAIM_SURFACES) expect(isLiveClaim(s)).toBe(true);
    expect(isLiveClaim('browser')).toBe(true);
    expect(isLiveClaim('mcp')).toBe(true);
    expect(isLiveClaim('auth')).toBe(true);
    expect(isLiveClaim('data-state')).toBe(true);
    expect(isLiveClaim('reconnect')).toBe(true);
    expect(isLiveClaim('not-a-live-surface')).toBe(false);
  });
});
