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
  type EnforcementDecision,
} from '../../src/northstar/host-capabilities.js';
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
