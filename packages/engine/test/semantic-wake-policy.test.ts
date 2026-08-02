import { describe, expect, it } from 'vitest';
import {
  evaluateWakeSignal,
  isClosedWakeReason,
  listClosedWakeReasons,
  computeCapsuleSnapshotSha,
  type WakeSignal,
  type WakeCapsuleSnapshot,
  type WakeDecision,
} from '../src/semantic-wake-policy.js';

function makeSnapshot(overrides?: Partial<WakeCapsuleSnapshot>): WakeCapsuleSnapshot {
  return {
    planId: 'plan-001',
    runId: 'run-001',
    epoch: 1,
    decisions: [],
    pendingClaims: [],
    pendingEvidence: [],
    activeWorkers: [],
    metadata: {},
    ...overrides,
  };
}

function makeSignal(overrides?: Partial<WakeSignal>): WakeSignal {
  return {
    reason: 'PLAN_ADOPTED',
    planId: 'plan-001',
    runId: 'run-001',
    actor: 'main',
    epoch: 1,
    ...overrides,
  };
}

describe('semantic-wake-policy', () => {
  describe('evaluateWakeSignal', () => {
    it('returns authoritative decision for MANUAL_WAKE', () => {
      const signal = makeSignal({ reason: 'MANUAL_WAKE' });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.shouldWake).toBe(true);
      expect(decision.confidence).toBe(1.0);
      expect(decision.reason).toBe('MANUAL_WAKE');
      expect(decision.decisionSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns authoritative decision for WORKER_FAILED', () => {
      const signal = makeSignal({ reason: 'WORKER_FAILED' });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.shouldWake).toBe(true);
      expect(decision.confidence).toBe(1.0);
    });

    it('returns advisory decision for PLAN_ADOPTED', () => {
      const signal = makeSignal({ reason: 'PLAN_ADOPTED' });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.shouldWake).toBe(true);
      expect(decision.confidence).toBe(0.7);
    });

    it('rejects unknown wake reasons with zero confidence', () => {
      const signal = makeSignal({ reason: 'UNKNOWN_REASON' as never });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.shouldWake).toBe(false);
      expect(decision.confidence).toBe(0);
      expect(decision.idempotencyKey).toBe('REJECTED_UNKNOWN_REASON');
    });

    it('generates idempotent decisions for same signal', () => {
      const signal = makeSignal({ reason: 'WORKER_COMPLETE' });
      const snapshot = makeSnapshot();
      const d1 = evaluateWakeSignal(signal, snapshot);
      const d2 = evaluateWakeSignal(signal, snapshot);
      expect(d1.idempotencyKey).toBe(d2.idempotencyKey);
      expect(d1.decisionSha256).toBe(d2.decisionSha256);
    });

    it('captures capsule snapshot in decision', () => {
      const snapshot = makeSnapshot({ planId: 'plan-002' });
      const signal = makeSignal();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.capsuleSnapshot.planId).toBe('plan-002');
    });

    it('includes decidedAt timestamp', () => {
      const signal = makeSignal();
      const snapshot = makeSnapshot();
      const before = new Date().toISOString();
      const decision = evaluateWakeSignal(signal, snapshot);
      const after = new Date().toISOString();
      expect(decision.decidedAt >= before).toBe(true);
      expect(decision.decidedAt <= after).toBe(true);
    });

    it.each(['PLAN_ADOPTED', 'AMENDMENT_APPLIED', 'WORKER_COMPLETE', 'WORKER_FAILED',
      'EVIDENCE_RECEIVED', 'CLAIM_UPDATED', 'CANDIDATE_EPOCH', 'LEDGER_REVISION',
      'DRILL_DOWN', 'MANUAL_WAKE'] as const)('accepts closed reason %s', (reason) => {
      const signal = makeSignal({ reason });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision.shouldWake).toBe(true);
      expect(decision.confidence).toBeGreaterThan(0);
    });
  });

  describe('isClosedWakeReason', () => {
    it('returns true for closed reasons', () => {
      expect(isClosedWakeReason('MANUAL_WAKE')).toBe(true);
      expect(isClosedWakeReason('WORKER_COMPLETE')).toBe(true);
    });

    it('returns false for unknown reasons', () => {
      expect(isClosedWakeReason('RANDOM_SIGNAL')).toBe(false);
      expect(isClosedWakeReason('')).toBe(false);
    });
  });

  describe('listClosedWakeReasons', () => {
    it('returns all 10 closed reasons', () => {
      const reasons = listClosedWakeReasons();
      expect(reasons).toHaveLength(10);
      expect(reasons).toContain('MANUAL_WAKE');
      expect(reasons).toContain('WORKER_FAILED');
    });
  });

  describe('computeCapsuleSnapshotSha', () => {
    it('returns deterministic SHA for same snapshot', () => {
      const s1 = makeSnapshot({ decisions: ['d1', 'd2'] });
      const s2 = makeSnapshot({ decisions: ['d1', 'd2'] });
      expect(computeCapsuleSnapshotSha(s1)).toBe(computeCapsuleSnapshotSha(s2));
    });

    it('returns different SHA for different snapshots', () => {
      const s1 = makeSnapshot({ planId: 'plan-001' });
      const s2 = makeSnapshot({ planId: 'plan-002' });
      expect(computeCapsuleSnapshotSha(s1)).not.toBe(computeCapsuleSnapshotSha(s2));
    });
  });

  describe('WakeDecision integrity', () => {
    it('decision includes all required fields', () => {
      const signal = makeSignal({ reason: 'MANUAL_WAKE' });
      const snapshot = makeSnapshot();
      const decision = evaluateWakeSignal(signal, snapshot);
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('shouldWake');
      expect(decision).toHaveProperty('capsuleSnapshot');
      expect(decision).toHaveProperty('decisionSha256');
      expect(decision).toHaveProperty('decidedAt');
      expect(decision).toHaveProperty('idempotencyKey');
    });
  });
});
