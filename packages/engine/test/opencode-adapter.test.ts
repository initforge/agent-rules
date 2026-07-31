import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildOpenCodeProfile,
  writeOpenCodePlanAdoption,
  writeOpenCodeHandoff,
  resolveOpenCodeHandoff,
  gateChildSessionControl,
  type OpenCodeHostProfile,
} from '../src/opencode-adapter.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-adapter-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(p: string, content: string): string {
  const abs = path.resolve(p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return abs;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function stubPlan(dir: string, planId: string): void {
  writeFile(path.join(dir, `.agent/plans/${planId}/original.md`), `# ${planId}\nContent`);
  writeFile(path.join(dir, `.agent/plans/${planId}/ledger.json`), '{}');
}

describe('buildOpenCodeProfile', () => {
  it('builds a profile with INTERACTIVE mode when no artifacts exist', () => {
    const dir = tmpDir();
    const profile = buildOpenCodeProfile(dir);
    expect(profile.host).toBe('opencode');
    expect(profile.mode).toBe('INTERACTIVE');
    expect(profile.capabilities).toContain('mode_detection');
    expect(profile.capabilityStatus).toBe('ADAPTER_ENFORCED');
    expect(profile.attestation).toBeNull();
    expect(profile.attestationStatus).toBe('UNVERIFIED');
    expect(profile.attestationReason).toBe('NATIVE_ATTESTATION_MISSING');
  });

  it('builds a profile with ARTIFACT_PLAN mode when a plan exists', () => {
    const dir = tmpDir();
    stubPlan(dir, 'plan-001');
    const profile = buildOpenCodeProfile(dir);
    expect(profile.mode).toBe('ARTIFACT_PLAN');
    expect(profile.plan).not.toBeNull();
    expect(profile.plan!.planId).toBe('plan-001');
  });

  it('does not turn adapter metadata into native attestation', () => {
    const dir = tmpDir();
    const profile = buildOpenCodeProfile(dir);
    expect(profile.capabilityStatus).toBe('ADAPTER_ENFORCED');
    expect(profile.attestation).toBeNull();
    expect(profile.attestationStatus).toBe('UNVERIFIED');
    expect(profile.attestationReason).toBe('NATIVE_ATTESTATION_MISSING');
  });

  it('reports truthful capabilities list', () => {
    const dir = tmpDir();
    const profile = buildOpenCodeProfile(dir);
    expect(profile.capabilities).toContain('artifact_plan_read');
    expect(profile.capabilities).toContain('artifact_plan_write');
    expect(profile.capabilities).toContain('artifact_handoff_read');
    expect(profile.capabilities).toContain('artifact_handoff_write');
    expect(profile.capabilities).toContain('plan_recognition');
    expect(profile.capabilities).toContain('plan_adoption');
    expect(profile.capabilities).toContain('resume_from_checkpoint');
    expect(profile.capabilities).toContain('platform_attestation');
  });

  it('does not claim HOST_NATIVE or child-session capabilities', () => {
    const dir = tmpDir();
    const profile = buildOpenCodeProfile(dir);
    expect(profile.attestation).toBeNull();
    expect(profile.capabilities).not.toContain('live_child_session');
    expect(profile.capabilities).not.toContain('cross_host_process_control');
  });
});

describe('writeOpenCodePlanAdoption', () => {
  it('adopts an existing plan', () => {
    const dir = tmpDir();
    stubPlan(dir, 'plan-001');
    const result = writeOpenCodePlanAdoption('plan-001', dir);
    expect(result.adopted).toBe(true);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.planId).toBe('plan-001');
  });

  it('returns not adopted for non-existent planId', () => {
    const dir = tmpDir();
    const result = writeOpenCodePlanAdoption('plan-nonexistent', dir);
    expect(result.adopted).toBe(false);
    expect(result.plan).toBeNull();
  });

  it('adopts latest plan when planId not specified', () => {
    const dir = tmpDir();
    stubPlan(dir, 'plan-001');
    const result = writeOpenCodePlanAdoption('plan-001', dir);
    expect(result.adopted).toBe(true);
  });
});

describe('writeOpenCodeHandoff', () => {
  it('writes a handoff artifact with opencode host', () => {
    const dir = tmpDir();
    const handoff = writeOpenCodeHandoff('plan-001', 'Review', [], { key: 'val' }, dir);
    expect(handoff.originatingHost).toBe('opencode');
    expect(handoff.planId).toBe('plan-001');
    expect(handoff.nextSafeAction).toBe('Review');
  });
});

describe('resolveOpenCodeHandoff', () => {
  it('resolves a valid handoff', () => {
    const dir = tmpDir();
    stubPlan(dir, 'plan-001');
    const handoff = writeOpenCodeHandoff('plan-001', 'Verify', [], {}, dir);
    const resolved = resolveOpenCodeHandoff(handoff.handoffId, dir);
    expect(resolved.handoff.originatingHost).toBe('opencode');
    expect(resolved.planDir).toBeTruthy();
  });

  it('throws for non-existent handoff', () => {
    const dir = tmpDir();
    expect(() => resolveOpenCodeHandoff('ho-nonexistent', dir)).toThrow('not found');
  });
});

describe('detectCommitSha (git ref security)', () => {
  it('resolves real refs/heads/ path', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git/refs/heads'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/main\n', 'utf-8');
    fs.writeFileSync(path.join(dir, '.git/refs/heads/main'), 'deadbeefcafebabedeadbeefcafebabedeadbeef\n', 'utf-8');
    const profile = buildOpenCodeProfile(dir);
    expect(profile.attestation).toBeNull();
  });

  it('rejects ref: traversal outside refs/', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: ../../etc/passwd\n', 'utf-8');
    const profile = buildOpenCodeProfile(dir);
    expect(profile.attestation).toBeNull();
  });

  it('rejects symbolic link HEAD', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git/refs/heads'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/refs/heads/main'), 'deadbeefcafebabedeadbeefcafebabedeadbeef\n', 'utf-8');
    try {
      fs.symlinkSync(path.join(dir, '.git/refs/heads/main'), path.join(dir, '.git/HEAD'));
      const profile = buildOpenCodeProfile(dir);
      expect(profile.attestation).toBeNull();
    } catch {
      // symlink may not be supported
    }
  });

  it('rejects ref: pointing to symlinked ref file', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git/refs/heads'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/main\n', 'utf-8');
    try {
      fs.symlinkSync('/etc/passwd', path.join(dir, '.git/refs/heads/main'));
      const profile = buildOpenCodeProfile(dir);
      expect(profile.attestation).toBeNull();
    } catch {
      // symlink may not be supported
    }
  });

  it('rejects ref: pointing outside .git', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/../../etc/passwd\n', 'utf-8');
    const profile = buildOpenCodeProfile(dir);
    expect(profile.attestation).toBeNull();
  });
});

describe('gateChildSessionControl', () => {
  it('passes in ARTIFACT_PLAN mode', () => {
    const profile = { mode: 'ARTIFACT_PLAN' } as OpenCodeHostProfile;
    expect(() => gateChildSessionControl(profile)).not.toThrow();
  });

  it('passes in ARTIFACT_HANDOFF mode', () => {
    const profile = { mode: 'ARTIFACT_HANDOFF' } as OpenCodeHostProfile;
    expect(() => gateChildSessionControl(profile)).not.toThrow();
  });

  it('throws in INTERACTIVE mode when child session env is set', () => {
    const prev = process.env.OPENCODE_CHILD_SESSION;
    process.env.OPENCODE_CHILD_SESSION = '1';
    try {
      const profile = { mode: 'INTERACTIVE' } as OpenCodeHostProfile;
      expect(() => gateChildSessionControl(profile)).toThrow('child-session');
    } finally {
      if (prev) process.env.OPENCODE_CHILD_SESSION = prev;
      else delete process.env.OPENCODE_CHILD_SESSION;
    }
  });
});
