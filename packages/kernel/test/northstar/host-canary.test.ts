/**
 * REQ-011/REQ-018 — per-host capability certification canary. LIVE_CERTIFIED
 * only from live probe confirmation; absent/unprobed hosts stay
 * NOT_LIVE_VERIFIED/STATIC_KNOWN; broken primitives are never masked.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHostCanary, REGISTRY_HOSTS, certificationStateFor } from '../../src/northstar/host-canary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');

describe('REQ-011/REQ-018 — host canary certification', () => {
  it('covers exactly the nine registry hosts', () => {
    expect(REGISTRY_HOSTS).toEqual(['codex', 'claude', 'grok', 'opencode', 'antigravity', 'cursor', 'deepseek-harness', 'command-code', 'omp']);
  });

  it('a live-probe-confirmed capability is LIVE_CERTIFIED', () => {
    const { facts, state } = runHostCanary({
      repoRoot: root,
      host: 'claude',
      probe: { ok: true, binary_path: '/usr/bin/claude', version: '2.1.237', confirmed: ['permission_surface', 'session_surface', 'worktree_surface'] },
    });
    expect(state).toBe('LIVE_CERTIFIED');
    const perm = facts.certifications.find((c) => c.capability === 'permission_surface')!;
    expect(perm.certification_state).toBe('LIVE_CERTIFIED');
    expect(facts.permission_surface.pre_effect_deny).toBe(true);
  });

  it('an absent/unprobed host stays NOT_LIVE_VERIFIED or STATIC_KNOWN, never live', () => {
    const unprobed = runHostCanary({ repoRoot: root, host: 'grok' });
    expect(['STATIC_KNOWN', 'NOT_LIVE_VERIFIED', 'UNSUPPORTED']).toContain(unprobed.state);
    expect(unprobed.state).not.toBe('LIVE_CERTIFIED');
    expect(unprobed.facts.certifications.every((c) => c.certification_state !== 'LIVE_CERTIFIED')).toBe(true);
  });

  it('a failed live probe is NOT_LIVE_VERIFIED (a broken primitive is never masked)', () => {
    const failed = runHostCanary({
      repoRoot: root,
      host: 'claude',
      probe: { ok: false, error: 'binary crashes on --version' },
    });
    expect(failed.state).toBe('NOT_LIVE_VERIFIED');
    expect(failed.facts.certifications.every((c) => c.certification_state === 'NOT_LIVE_VERIFIED')).toBe(true);
  });

  it('new hosts (deepseek-harness/command-code) with a live probe can be LIVE_CERTIFIED once confirmed', () => {
    const dsh = runHostCanary({
      repoRoot: root,
      host: 'deepseek-harness',
      probe: { ok: true, version: '0.1.0-rc.7', confirmed: ['permission_surface', 'mcp_surface'] },
    });
    expect(dsh.state).toBe('LIVE_CERTIFIED');
    const cc = runHostCanary({
      repoRoot: root,
      host: 'command-code',
      probe: { ok: true, version: '1.28.4', confirmed: ['permission_surface', 'headless_surface', 'structured_event_surface'] },
    });
    expect(cc.state).toBe('LIVE_CERTIFIED');
    expect(cc.facts.permission_surface.mode).toBe('NATIVE_ALLOW_ASK_DENY');
    expect(cc.facts.headless_surface.high_trust_mutation_denied).toBe(true);
  });

  it('certificationStateFor is fail-closed', () => {
    expect(certificationStateFor({ probed: true, probeOk: true, projectionPresent: true, capabilityConfirmed: true })).toBe('LIVE_CERTIFIED');
    expect(certificationStateFor({ probed: true, probeOk: true, projectionPresent: true, capabilityConfirmed: false })).toBe('STATIC_CONFORMED');
    expect(certificationStateFor({ probed: true, probeOk: false, projectionPresent: true })).toBe('NOT_LIVE_VERIFIED');
    expect(certificationStateFor({ probed: false, projectionPresent: true })).toBe('STATIC_KNOWN');
    expect(certificationStateFor({ probed: false, projectionPresent: false })).toBe('UNSUPPORTED');
  });
});
