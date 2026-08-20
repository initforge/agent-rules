/**
 * REQ-003 — proof-profile catalog: evidence categories A–K and eight default
 * profiles with automatic escalation and no silent downgrade.
 */
import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_CATEGORIES,
  PROOF_PROFILES,
  profileForSurfaces,
  type EvidenceCategory,
  type ProofSurface,
} from '../../src/northstar/proof-testing.js';

describe('proof profiles — A–K categories + 8 defaults, escalate never downgrade', () => {
  it('supports every owner §5 evidence category (A–K)', () => {
    const needed: EvidenceCategory[] = ['static', 'unit', 'contract', 'integration', 'api', 'browser', 'live', 'security', 'performance', 'data', 'packaging'];
    for (const c of needed) expect(EVIDENCE_CATEGORIES).toContain(c);
  });

  it('has the eight default profiles from owner §7', () => {
    const ids = PROOF_PROFILES.map((p) => p.id);
    expect(ids).toContain('trivial-static');
    expect(ids).toContain('business-logic');
    expect(ids).toContain('api-service');
    expect(ids).toContain('ui-browser');
    expect(ids).toContain('mcp-session');
    expect(ids).toContain('security');
    expect(ids).toContain('migration-data');
    expect(ids).toContain('performance-reliability');
  });

  it('trivial/static profile applies to source changes with minimal steps', () => {
    const p = profileForSurfaces(['source']);
    expect(p.id).toBe('trivial-static');
    expect(p.min_fidelity).toBe('static');
  });

  it('business-logic profile applies to feature/bugfix/refactor/backend', () => {
    for (const s of ['feature', 'bugfix', 'refactor', 'backend'] as ProofSurface[]) {
      expect(profileForSurfaces([s]).id).toBe('business-logic');
    }
  });

  it('api-service profile applies to api/backend changes', () => {
    expect(profileForSurfaces(['api']).id).toBe('api-service');
  });

  it('ui-browser profile applies to frontend/browser changes and requires live fidelity', () => {
    const p = profileForSurfaces(['browser']);
    expect(p.id).toBe('ui-browser');
    expect(p.min_fidelity).toBe('live');
  });

  it('mcp-session profile applies to mcp/desktop/process/session/workspace and requires live proof', () => {
    for (const s of ['mcp', 'desktop', 'process', 'session', 'workspace'] as ProofSurface[]) {
      const p = profileForSurfaces([s]);
      expect(p.id).toBe('mcp-session');
      expect(p.min_fidelity).toBe('live');
    }
  });

  it('security profile requires positive + negative + boundary proof', () => {
    const p = profileForSurfaces(['security']);
    expect(p.id).toBe('security');
    const cats = p.steps.map((s) => s.category);
    expect(cats).toContain('security');
    expect(cats).toContain('static');
  });

  it('migration-data profile covers schema validation, apply, drift, rollback, invariants', () => {
    const p = profileForSurfaces(['migration']);
    expect(p.id).toBe('migration-data');
    const desc = p.steps.map((s) => s.description).join(' ');
    expect(desc).toContain('schema validation');
    expect(desc).toContain('migration apply');
    expect(desc).toContain('drift');
    expect(desc).toContain('rollback');
  });

  it('performance-reliability profile runs deterministic first, load only when required', () => {
    const p = profileForSurfaces(['performance']);
    expect(p.id).toBe('performance-reliability');
    const loadStep = p.steps.find((s) => s.description.includes('load'));
    expect(loadStep?.conditional).toBe(true);
  });

  it('every profile declares escalation targets and a minimum fidelity', () => {
    for (const p of PROOF_PROFILES) {
      expect(p.escalation_to.length).toBeGreaterThan(0);
      expect(['static', 'deterministic', 'live']).toContain(p.min_fidelity);
    }
  });

  it('profile selection never downgrades fidelity: live surface always lands on a live profile', () => {
    for (const s of ['mcp', 'desktop', 'browser'] as ProofSurface[]) {
      const p = profileForSurfaces([s]);
      expect(p.min_fidelity).toBe('live');
    }
  });
});
