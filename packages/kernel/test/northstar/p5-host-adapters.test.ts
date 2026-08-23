/**
 * Phase P5 — Host Registry, Adapters & Native Enforcement Test Suite
 * 
 * Verifies that host support policy and live certification state are separated,
 * stale certifications are selectively invalidated, capability-specific enforcement
 * is applied, and Antigravity native projections operate safely without kernel coupling.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  runHostCanary,
  REGISTRY_HOSTS,
  decideEnforcement,
  probeHostCapabilities,
  staleCertifications,
  type HostId,
} from '../../src/northstar/index.js';
import { createAntigravityLeaseGuard } from '../../../../platforms/antigravity/adapter.js';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('Phase P5 — Host Registry, Adapters & Native Enforcement', () => {
  it('Separates static host capability facts from live certification state', () => {
    // 8 declared registry hosts
    expect(REGISTRY_HOSTS).toContain('codex');
    expect(REGISTRY_HOSTS).toContain('claude');
    expect(REGISTRY_HOSTS).toContain('opencode');
    expect(REGISTRY_HOSTS).toContain('antigravity');
    expect(REGISTRY_HOSTS).toContain('grok');
    expect(REGISTRY_HOSTS).toContain('cursor');
    expect(REGISTRY_HOSTS).toContain('deepseek-harness');
    expect(REGISTRY_HOSTS).toContain('command-code');

    // Canary run with absent probe: static known facts preserved, but certification is NOT_LIVE_VERIFIED
    const unprobedCanary = runHostCanary({
      repoRoot,
      host: 'cursor',
      probe: { ok: false, error: 'binary not found' },
    });

    expect(unprobedCanary.state).toBe('NOT_LIVE_VERIFIED');
    expect(unprobedCanary.facts.certifications.every((c) => c.certification_state !== 'LIVE_CERTIFIED')).toBe(true);

    // Canary run with live probe confirming capabilities:
    const liveCanary = runHostCanary({
      repoRoot,
      host: 'opencode',
      probe: { ok: true, version: '1.0.0', confirmed: ['skill_surface', 'instruction_surface', 'hook_surface'] },
    });

    expect(liveCanary.state).toBe('LIVE_CERTIFIED');
    const skillCert = liveCanary.facts.certifications.find((c) => c.capability === 'skill_surface');
    expect(skillCert?.certification_state).toBe('LIVE_CERTIFIED');
  });

  it('Selective invalidation marks certifications STALE on projection hash mismatch', () => {
    const liveCanary = runHostCanary({
      repoRoot,
      host: 'opencode',
      probe: { ok: true, version: '1.0.0', confirmed: ['skill_surface'] },
      projection_hash: 'initial-hash-1111',
    });

    const evaluated = staleCertifications(liveCanary.facts.certifications, {
      host: 'opencode',
      projection_hash: 'new-hash-2222', // Modified projection hash
    });

    expect(evaluated.stale.length).toBeGreaterThan(0);
    expect(evaluated.stale.some((c) => c.capability === 'skill_surface')).toBe(true);
  });

  it('Capability-specific enforcement resolves native vs broker vs worktree vs blocked', () => {
    const attestation = probeHostCapabilities('opencode', { ok: true, confirmed: ['worktree_support', 'sandbox'] });
    const opencodeEnforcement = decideEnforcement({
      host: 'opencode',
      attestation,
      effects: ['read', 'filesystem_mutation'],
      broker_manages_effect: false,
      worktree_available: true,
    });
    expect(['native', 'broker', 'workspace_transaction']).toContain(opencodeEnforcement.layer);

    // Failing probe without fallback fails closed
    const unprobedAtt = probeHostCapabilities('codex', { ok: false, error: 'probe failed' });
    const blockedEnforcement = decideEnforcement({
      host: 'codex',
      attestation: unprobedAtt,
      effects: ['destructive_mutation'],
      broker_manages_effect: false,
      worktree_available: false,
    });
    expect(blockedEnforcement.layer).toBe('blocked');
  });

  it('Antigravity adapter enforces owned lease bounds and isolates mutations (H-12)', () => {
    const guard = createAntigravityLeaseGuard();

    // Check in-lease mutation within project root
    const ownedMutation = guard.checkMutation('src/feature.ts');
    expect(ownedMutation.allowed).toBe(true);

    // Validate diff touching only allowed paths
    const validDiff = guard.validateDiff(['src/feature.ts', 'src/utils.ts']);
    expect(validDiff.accepted).toBe(true);

    // Check out-of-lease mutation (e.g. canonical .agent mutation) fails closed
    const canonicalAgentMutation = guard.checkMutation('.agent/plans/hack.md');
    expect(canonicalAgentMutation.allowed).toBe(false);
    expect(canonicalAgentMutation.code).toBe('CANONICAL_AGENT');
  });
});
