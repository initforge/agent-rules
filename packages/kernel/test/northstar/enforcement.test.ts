/**
 * REQ-014/REQ-015/REQ-016 — enforcement order, versioned host-capability
 * attestation, and the trajectory supervisor. Capabilities are never assumed
 * without a live probe; mutating work falls back to worktree transaction or
 * BLOCKED; the supervisor decides with a bounded reason receipt.
 */
import { describe, it, expect } from 'vitest';
import {
  decideEnforcement,
  hostCapabilityAttestationV2,
  probeHostCapabilities,
  unprobedAttestation,
  capabilityTtlDays,
  staleCertifications,
  capabilityIsLive,
  type CapabilityCertification,
  type CertificationState,
  type EnforcementDecision,
} from '../../src/northstar/host-capabilities.js';
import { LaneController } from '../../src/northstar/resource-governor.js';
import { admitArtifact, classifyArtifact } from '../../src/northstar/artifact-admission.js';
import { superviseTrajectory, type TrajectoryEvent } from '../../src/northstar/trajectory-supervisor.js';

function attestationFor(host: 'codex' | 'claude' | 'opencode', confirmed: Array<keyof ReturnType<typeof hostCapabilityAttestationV2>['capabilities']> = []): ReturnType<typeof hostCapabilityAttestationV2> {
  return probeHostCapabilities(host, { ok: true, confirmed });
}

describe('REQ-014 — versioned host-capability attestation', () => {
  it('never assumes capabilities without a live probe', () => {
    const att = unprobedAttestation('opencode');
    expect(att.capabilities.native_pre_effect_enforcement).toBe('UNVERIFIED');
    expect(att.capabilities.sandbox).toBe('UNVERIFIED');
    expect(att.probe.probe_failed).toBe(true);
  });

  it('a failed probe marks every capability UNVERIFIED (never assumed)', () => {
    const att = probeHostCapabilities('codex', { ok: false, error: 'CLI probe failed' });
    expect(att.capabilities.sandbox).toBe('UNVERIFIED');
    expect(att.probe.probe_error).toBe('CLI probe failed');
  });

  it('confirmed baseline capabilities are honored after a live probe', () => {
    const att = attestationFor('codex', ['sandbox', 'native_pre_effect_enforcement', 'mcp_lifecycle', 'worktree_support']);
    expect(att.capabilities.sandbox).toBe('HOST_NATIVE');
    expect(att.capabilities.native_pre_effect_enforcement).toBe('ADAPTER_ENFORCED');
    expect(att.capabilities.telemetry).toBe('UNVERIFIED'); // not confirmed
  });
});

describe('REQ-014 — enforcement order', () => {
  function decide(over: Partial<Parameters<typeof decideEnforcement>[0]>): EnforcementDecision {
    return decideEnforcement({
      host: 'opencode',
      attestation: attestationFor('opencode'),
      effects: ['read', 'filesystem_mutation'],
      broker_manages_effect: false,
      worktree_available: true,
      ...over,
    });
  }

  it('read-only with proven sandbox runs at the native layer', () => {
    const decision = decide({
      host: 'codex',
      attestation: attestationFor('codex', ['native_pre_effect_enforcement', 'sandbox']),
      effects: ['read'],
    });
    expect(decision.layer).toBe('native');
    expect(decision.can_control_mutation).toBe(true);
  });

  it('mutating work falls through to the broker layer when covered', () => {
    const decision = decide({
      host: 'opencode',
      attestation: attestationFor('opencode'), // no confirmed native capability
      effects: ['filesystem_mutation'],
      broker_manages_effect: true,
    });
    expect(decision.layer).toBe('broker');
  });

  it('falls back to a workspace transaction when no native proof and no broker coverage', () => {
    const decision = decide({
      attestation: attestationFor('opencode'), // everything UNVERIFIED
      broker_manages_effect: false,
    });
    expect(decision.layer).toBe('workspace_transaction');
    expect(decision.can_control_mutation).toBe(true);
  });

  it('BLOCKED when mutation cannot be controlled at all', () => {
    const decision = decide({
      attestation: attestationFor('cursor'), // cursor baseline mostly UNVERIFIED
      effects: ['filesystem_mutation', 'destructive'],
      broker_manages_effect: false,
      worktree_available: false,
    });
    expect(decision.layer).toBe('blocked');
    expect(decision.can_control_mutation).toBe(false);
  });

  it('never routes to native based on a baseline without proof', () => {
    const decision = decide({
      host: 'codex',
      attestation: attestationFor('codex'), // no probe confirmation
      effects: ['filesystem_mutation'],
    });
    expect(decision.layer).not.toBe('native');
  });
});

describe('REQ-011 — typed HostCapabilityFacts ABI: TTL, staleness, selective invalidation', () => {
  function cert(over: Partial<CapabilityCertification>): CapabilityCertification {
    return {
      capability: 'permission_surface',
      certification_state: 'LIVE_CERTIFIED',
      evidence_refs: ['ev-1'],
      certified_at: '2026-08-20T00:00:00.000Z',
      expires_at: '2026-10-19T00:00:00.000Z',
      host: 'opencode',
      adapter_revision: 'a1',
      projection_hash: 'p1',
      ...over,
    };
  }

  it('developer-preview hosts get a shorter TTL (14 days)', () => {
    expect(capabilityTtlDays('permission_surface')).toBe(30);
    expect(capabilityTtlDays('permission_surface', 'deepseek-harness')).toBe(14);
    expect(capabilityTtlDays('permission_surface', 'command-code')).toBe(14);
    expect(capabilityTtlDays('context_injection', 'claude')).toBe(90);
  });

  it('stales only certifications whose declared components changed (selective invalidation)', () => {
    const list = [
      cert({ capability: 'permission_surface', projection_hash: 'p1' }),
      cert({ capability: 'skill_surface', projection_hash: 'p2' }),
    ];
    const { stale, fresh } = staleCertifications(list, { projection_hash: 'p2', now: new Date('2026-09-01T00:00:00.000Z') });
    expect(stale.map((c) => c.capability)).toEqual(['permission_surface']);
    expect(fresh.map((c) => c.capability)).toEqual(['skill_surface']);
  });

  it('a host-version change stales only the affected host certifications', () => {
    const list = [
      cert({ host: 'claude', host_version: '2.1.237', projection_hash: 'p1' }),
      cert({ host: 'opencode', host_version: '1.18.18', projection_hash: 'p1' }),
    ];
    const { stale, fresh } = staleCertifications(list, { host: 'claude', host_version: '2.2.0', now: new Date('2026-09-01T00:00:00.000Z') });
    expect(stale.map((c) => c.host)).toEqual(['claude']);
    expect(fresh.map((c) => c.host)).toEqual(['opencode']);
  });

  it('an expired certification is staled regardless of components', () => {
    const expired = cert({ expires_at: '2026-08-01T00:00:00.000Z' });
    const { stale, fresh } = staleCertifications([expired], { now: new Date('2026-09-01T00:00:00.000Z') });
    expect(stale).toHaveLength(1);
    expect(fresh).toHaveLength(0);
  });

  it('a config-fingerprint change stales certifications bound to that config', () => {
    const list = [
      cert({ config_fingerprint: 'cfg-a' }),
      cert({ config_fingerprint: 'cfg-b' }),
    ];
    const { stale, fresh } = staleCertifications(list, { config_fingerprint: 'cfg-b', now: new Date('2026-09-01T00:00:00.000Z') });
    expect(stale.map((c) => c.config_fingerprint)).toEqual(['cfg-a']);
    expect(fresh.map((c) => c.config_fingerprint)).toEqual(['cfg-b']);
  });

  it('only LIVE_CERTIFIED and non-expired certifications are usable as live proof', () => {
    expect(capabilityIsLive(cert({}), new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
    expect(capabilityIsLive(cert({ certification_state: 'STATIC_CONFORMED' as CertificationState }), new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
    expect(capabilityIsLive(cert({ expires_at: '2026-08-01T00:00:00.000Z' }), new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
    expect(capabilityIsLive(undefined)).toBe(false);
  });
});

describe('F07/REQ-007 — LaneController and Artifact Admission production wiring', () => {
  it('the writer lane always serializes and the verifier lane gates capacity', () => {
    const lanes = new LaneController();
    // Writer budget is 1: a second writer cannot acquire while one is active.
    expect(lanes.acquire('writer')).toBe(true);
    expect(lanes.acquire('writer')).toBe(false);
    lanes.release('writer');
    expect(lanes.acquire('writer')).toBe(true);
    // Verifier lane supports its budget and releases in finally.
    expect(lanes.acquire('verifier')).toBe(true);
    expect(lanes.acquire('verifier')).toBe(true);
    lanes.release('verifier');
    lanes.release('verifier');
  });

  it('memory pressure sheds the expensive lanes first', () => {
    const lanes = new LaneController();
    lanes.acquire('browser');
    lanes.acquire('heavy_process');
    lanes.applyMemoryPressure(0.5);
    const usage = lanes.utilization();
    expect(usage.browser.budget).toBe(0);
    expect(usage.heavy_process.budget).toBe(0);
    expect(usage.writer.budget).toBe(1);
  });

  it('Artifact Admission gates evidence persistence (evidence is admitted; bare ephemeral is not)', () => {
    expect(admitArtifact({ class: 'EPHEMERAL', reasons: ['evidence'] }).persist).toBe(true);
    expect(admitArtifact({ class: 'EPHEMERAL', reasons: [] }).persist).toBe(false);
    expect(admitArtifact({ class: 'AUDITED', reasons: ['audit_replay'] }).persist).toBe(true);
  });

  it('classifyArtifact maps evidence-required high-risk work to AUDITED (never dropped)', () => {
    expect(classifyArtifact({ risk: 'high', evidence_required: true })).toBe('AUDITED');
    expect(classifyArtifact({ risk: 'low' })).toBe('EPHEMERAL');
  });
});

describe('REQ-016 — trajectory supervisor', () => {
  function event(seq: number, kind: string, signature: string, failed = false): TrajectoryEvent {
    return { seq, kind, signature, ...(failed ? { failed: true } : {}), at: new Date(seq).toISOString() };
  }

  it('continues on a healthy trajectory', () => {
    const events = [
      event(1, 'read', 'src/a.ts'), event(2, 'tool_call', 'edit:a'), event(3, 'write', 'src/a.ts'),
      event(4, 'verify', 'npm:test'), event(5, 'progress', 'done'),
    ];
    const decision = superviseTrajectory({ events });
    expect(decision.action).toBe('continue');
    expect(decision.detected).toHaveLength(0);
  });

  it('stops on budget exhaustion with a reason receipt', () => {
    const events = Array.from({ length: 10 }, (_, i) => event(i + 1, 'tool_call', `tool:${i % 2}`));
    const decision = superviseTrajectory({ events, budgets: { max_steps: 10 } });
    expect(decision.action).toBe('stop');
    expect(decision.detected.some((item) => item.signal === 'budget_exhaustion')).toBe(true);
    expect(decision.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.decision_id).toMatch(/^sup-/);
  });

  it('stops on a retry storm', () => {
    const events = [1, 2, 3, 4, 5].map((i) => event(i, 'tool_call', 'edit:same', true));
    const decision = superviseTrajectory({ events, budgets: { max_retries: 4 } });
    expect(decision.action).toBe('stop');
    expect(decision.detected.some((item) => item.signal === 'retry_storm')).toBe(true);
  });

  it('repairs on a repeated tool/read sequence loop', () => {
    const events = [
      event(1, 'tool_call', 'grep:x'), event(2, 'read', 'src/x.ts'), event(3, 'tool_call', 'grep:x'), event(4, 'read', 'src/x.ts'),
    ];
    const decision = superviseTrajectory({ events });
    expect(decision.action).toBe('repair');
    expect(decision.detected.some((item) => item.signal === 'repeated_sequence')).toBe(true);
  });

  it('pauses on no-progress trajectories', () => {
    const events = [1, 2, 3, 4, 5, 6, 7].map((i) => event(i, 'read', `file:${i}`));
    const decision = superviseTrajectory({ events });
    expect(decision.action).toBe('pause');
    expect(decision.detected.some((item) => item.signal === 'no_progress')).toBe(true);
  });

  it('stops on orphan-process signals', () => {
    const decision = superviseTrajectory({ events: [event(1, 'orphan_process', 'pid:42')] });
    expect(decision.action).toBe('stop');
    expect(decision.detected.some((item) => item.signal === 'orphan_process')).toBe(true);
  });

  it('is deterministic for the same event stream (action, reason, detected, receipt hash)', () => {
    const events = [1, 2, 3].map((i) => event(i, 'read', `file:${i}`));
    const a = superviseTrajectory({ events });
    const b = superviseTrajectory({ events });
    expect(a.action).toBe(b.action);
    expect(a.reason).toBe(b.reason);
    expect(a.detected).toEqual(b.detected);
    expect(a.decision_id).toBe(b.decision_id);
    expect(a.receipt_sha256).toBe(b.receipt_sha256);
  });
});
