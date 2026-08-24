import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadCanonicalOperatorProfile,
  installOperatorProfile,
  setSessionOverride,
  resolveEffectiveProfile,
  deactivateOperatorProfile,
  renderProfileForHost,
  computeProjectionStatus,
  assertProfileShape,
  detectOwnerInstruction,
  DEFAULT_TECHNICAL_TRIGGERS,
} from '../src/northstar/operator-profile.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function tempRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-profile-'));
  // materialize the canonical profile source into the temp repo
  fs.mkdirSync(path.join(root, 'operator-profiles', 'vibe-product'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'operator-profiles', 'vibe-product', 'profile.json'),
    path.join(root, 'operator-profiles', 'vibe-product', 'profile.json'),
  );
  return root;
}

describe('operator communication profile (vibe-product)', () => {
  it('loads the canonical source with a stable hash and full contract shape', () => {
    const { profile, sourceSha256 } = loadCanonicalOperatorProfile(REPO_ROOT, 'vibe-product');
    expect(profile.profile_id).toBe('vibe-product');
    expect(profile.language).toBe('vi');
    expect(profile.outcome_first).toBe(true);
    expect(profile.default_owner_mode).toBe('vibe-coder');
    expect(profile.technical_mode.revert).toBe('after-task-or-topic');
    expect(sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    const again = loadCanonicalOperatorProfile(REPO_ROOT, 'vibe-product');
    expect(again.sourceSha256).toBe(sourceSha256);
  });

  it('never weakens verification/security/scope/pass semantics (canary)', () => {
    const { profile } = loadCanonicalOperatorProfile(REPO_ROOT, 'vibe-product');
    for (const floor of ['verification', 'security', 'scope', 'pass-semantics'] as const) {
      expect(profile.security_floor.never_weaken).toContain(floor);
    }
    // A profile attempting to weaken the security floor fails closed.
    expect(() => assertProfileShape({
      ...profile,
      profile_id: 'rogue',
      security_floor: { never_weaken: ['verification'] },
    })).toThrow(/never_weaken/);
  });

  it('respects the precedence chain owner > session override > installed > host default', () => {
    const root = tempRepo();
    try {
      // host default
      let r = resolveEffectiveProfile({ repoRoot: root });
      expect(r.precedence_chain[0]).toBe('host-default:normal');
      // installed default = vibe mode (not technical)
      installOperatorProfile(root, 'vibe-product');
      r = resolveEffectiveProfile({ repoRoot: root });
      expect(r.installed).toBe(true);
      expect(r.active).toBe(true);
      expect(r.effective_technical_mode).toBe(false);
      // session override wins over installed default
      setSessionOverride(root, { technical_mode: true });
      r = resolveEffectiveProfile({ repoRoot: root });
      expect(r.effective_technical_mode).toBe(true);
      expect(r.session_override_active).toBe(true);
      // owner instruction wins over everything
      r = resolveEffectiveProfile({ repoRoot: root, ownerInstructionTechnical: false });
      expect(r.effective_technical_mode).toBe(false);
      // deactivate returns to host default
      setSessionOverride(root, null);
      deactivateOperatorProfile(root);
      r = resolveEffectiveProfile({ repoRoot: root });
      expect(r.precedence_chain[0]).toBe('host-default:normal');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('technical-mode triggers escalate temporarily with auto-revert phrases', () => {
    expect(detectOwnerInstruction('giải thích kỹ thuật cho mình kiến trúc này')).toBe(true);
    expect(detectOwnerInstruction('đào sâu phần handoff giúp tôi')).toBe(true);
    expect(detectOwnerInstruction('bình thường thôi vibe')).toBe(false);
    expect(detectOwnerInstruction('làm đi')).toBeUndefined();
    expect(DEFAULT_TECHNICAL_TRIGGERS.length).toBeGreaterThan(0);
  });

  it('renders one deterministic projection per host and classifies status honestly', () => {
    const { profile } = loadCanonicalOperatorProfile(REPO_ROOT, 'vibe-product');
    const a = renderProfileForHost(profile, 'claude');
    const b = renderProfileForHost(profile, 'claude');
    expect(a).toBe(b);
    expect(a).toContain('profile_id: vibe-product');
    expect(a).toContain('host: claude');
    expect(renderProfileForHost(profile, 'cursor')).toContain('host: cursor');
    expect(computeProjectionStatus({ expectedContent: a, actualContent: a, surfaceSupported: true })).toBe('SYNCED');
    expect(computeProjectionStatus({ expectedContent: a, actualContent: `${a}\n`, surfaceSupported: true })).toBe('DRIFTED');
    expect(computeProjectionStatus({ expectedContent: a, actualContent: null, surfaceSupported: false })).toBe('MANUAL_PROJECTION');
    expect(computeProjectionStatus({ expectedContent: null, actualContent: null, surfaceSupported: true })).toBe('UNSUPPORTED');
    expect(computeProjectionStatus({ expectedContent: a, actualContent: null, surfaceSupported: true })).toBe('NEEDS_USER');
  });
});
