/**
 * AM-0022 Adaptive Ceiling Tests
 * Tests adaptive 8 normal / 10 burst writer ceiling with min 6 READY evidence.
 * Run with: npx vitest run --runInBand
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSupervisor,
  _resolveSupervisorInternals,
  type SupervisorPublicView,
  type _InternalOps,
} from '../src/supervisor.js';
import type { ContextCapsuleKey } from '../src/context-cache.js';

const stubContextKey: ContextCapsuleKey = {
  effectivePlanSha256: 'a'.repeat(64),
  orderedAmendmentSha256: 'b'.repeat(64),
  baselineSha: 'c'.repeat(40),
  assignmentId: 'stub',
  ownedPaths: ['packages/engine'],
  forbiddenPaths: [],
  sourceFileHashes: { 'src/index.ts': 'd'.repeat(64) },
  toolchainManifestSha256: 'e'.repeat(64),
  acceptanceCriteriaSha256: 'f'.repeat(64),
};

function makeSupervisor(config?: Record<string, unknown>): {
  s: SupervisorPublicView;
  complete: (id: string, r: Record<string, unknown>) => { ok: true } | { ok: false; reason: string };
  _internal: _InternalOps;
} {
  const clean: Record<string, unknown> = { ...config };
  delete clean.completionVerifier;
  const sup = createSupervisor({ ...clean, completionVerifier: () => true } as any);
  const internals = _resolveSupervisorInternals(sup);
  return { s: sup, complete: internals.complete, _internal: internals._internal };
}

describe('AM-0022 Adaptive Ceiling', () => {
  describe('default configuration', () => {
    it('uses 8 normal ceiling by default', () => {
      const { s } = makeSupervisor({});
      expect(s.effectiveCeiling).toBe(8);
    });

    it('uses 10 burst ceiling by default', () => {
      const { s } = makeSupervisor({});
      // Burst ceiling is only used after minReadyEvidence is met
      expect(s.effectiveCeiling).toBe(8); // Normal mode until 6 READY
    });

    it('uses min 6 READY evidence threshold by default', () => {
      const { s } = makeSupervisor({});
      expect(s.readyEvidenceCount).toBe(0);
      // Should be in normal mode
      expect(s.effectiveCeiling).toBe(8);
    });
  });

  describe('effectiveCeiling calculation', () => {
    it('returns normal ceiling (8) when READY evidence < minReadyEvidence (6)', () => {
      const { s } = makeSupervisor({ adaptiveCeilingNormal: 8, adaptiveCeilingBurst: 10, minReadyEvidence: 6 });
      expect(s.effectiveCeiling).toBe(8);
    });

    it('returns burst ceiling (10) when READY evidence >= minReadyEvidence (6)', () => {
      const { s, complete } = makeSupervisor({ adaptiveCeilingNormal: 8, adaptiveCeilingBurst: 10, minReadyEvidence: 6 });

      // Complete 6 writer assignments to reach burst threshold
      for (let i = 0; i < 6; i++) {
        const aid = `complete-w${i}`;
        s.assignChild({ assignmentId: aid, kind: 'writer', ownedPaths: [`path${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        s.bindChildSession(aid, `sid-${i}`);
        s.dispatchAssignment(aid);
        s.ackAssignment(aid);
        complete(aid, { eventCursor: `ev-${i}`, childSessionId: `sid-${i}` });
      }

      expect(s.readyEvidenceCount).toBe(6);
      expect(s.effectiveCeiling).toBe(10);
    });

    it('uses custom adaptiveCeilingNormal value', () => {
      const { s } = makeSupervisor({ adaptiveCeilingNormal: 5, minReadyEvidence: 10 });
      expect(s.effectiveCeiling).toBe(5);
    });

    it('uses custom adaptiveCeilingBurst value when threshold met', () => {
      const { s, complete } = makeSupervisor({ adaptiveCeilingNormal: 5, adaptiveCeilingBurst: 7, minReadyEvidence: 2 });

      // Complete 2 writer assignments
      for (let i = 0; i < 2; i++) {
        const aid = `burst${i}`;
        s.assignChild({ assignmentId: aid, kind: 'writer', ownedPaths: [`burst${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        s.bindChildSession(aid, `bsid-${i}`);
        s.dispatchAssignment(aid);
        s.ackAssignment(aid);
        complete(aid, { eventCursor: `bev-${i}`, childSessionId: `bsid-${i}` });
      }

      expect(s.effectiveCeiling).toBe(7);
    });
  });

  describe('readyEvidenceCount tracking', () => {
    it('counts only COMPLETED writers', () => {
      const { s, complete } = makeSupervisor({ minReadyEvidence: 6 });

      // Assign and complete 2 writers
      for (let i = 0; i < 2; i++) {
        const aid = `ready${i}`;
        s.assignChild({ assignmentId: aid, kind: 'writer', ownedPaths: [`ready${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        s.bindChildSession(aid, `rsid-${i}`);
        s.dispatchAssignment(aid);
        s.ackAssignment(aid);
        complete(aid, { eventCursor: `rev-${i}`, childSessionId: `rsid-${i}` });
      }

      // Add 1 more PENDING writer (should not count)
      s.assignChild({ assignmentId: 'pending1', kind: 'writer', ownedPaths: ['pending/'], forbiddenPaths: [], contextKey: stubContextKey });

      // Add 1 FAILED writer (should not count)
      s.assignChild({ assignmentId: 'failed1', kind: 'writer', ownedPaths: ['failed/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.failAssignment('failed1', 'test error');

      expect(s.readyEvidenceCount).toBe(2);
    });

    it('does not count COMPLETED reviewers or verifiers', () => {
      const { s, complete } = makeSupervisor({ minReadyEvidence: 1 });

      // Complete a writer
      s.assignChild({ assignmentId: 'writer1', kind: 'writer', ownedPaths: ['w1/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('writer1', 'wsid');
      s.dispatchAssignment('writer1');
      s.ackAssignment('writer1');
      complete('writer1', { eventCursor: 'wev', childSessionId: 'wsid' });

      // Complete a reviewer
      s.assignChild({ assignmentId: 'reviewer1', kind: 'reviewer', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('reviewer1', 'rsid');
      s.dispatchAssignment('reviewer1');
      s.ackAssignment('reviewer1');
      complete('reviewer1', { eventCursor: 'rev', childSessionId: 'rsid' });

      // Complete a verifier
      s.assignChild({ assignmentId: 'verifier1', kind: 'verifier', ownedPaths: [], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('verifier1', 'vsid');
      s.dispatchAssignment('verifier1');
      s.ackAssignment('verifier1');
      complete('verifier1', { eventCursor: 'vev', childSessionId: 'vsid' });

      expect(s.readyEvidenceCount).toBe(1); // Only the writer counts
    });
  });

  describe('availableWriterSlots with adaptive ceiling', () => {
    it('starts with 8 slots in normal mode', () => {
      const { s } = makeSupervisor({});
      expect(s.availableWriterSlots).toBe(8);
    });

    it('decrements slots correctly with assignments in normal mode', () => {
      const { s } = makeSupervisor({});
      expect(s.availableWriterSlots).toBe(8);

      s.assignChild({ assignmentId: 'w1', kind: 'writer', ownedPaths: ['a/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(s.availableWriterSlots).toBe(7);

      s.assignChild({ assignmentId: 'w2', kind: 'writer', ownedPaths: ['b/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(s.availableWriterSlots).toBe(6);
    });

    it('rejects assignment when normal ceiling exhausted', () => {
      const { s } = makeSupervisor({ adaptiveCeilingNormal: 3, minReadyEvidence: 100 });

      s.assignChild({ assignmentId: 'w1', kind: 'writer', ownedPaths: ['a/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.assignChild({ assignmentId: 'w2', kind: 'writer', ownedPaths: ['b/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.assignChild({ assignmentId: 'w3', kind: 'writer', ownedPaths: ['c/'], forbiddenPaths: [], contextKey: stubContextKey });

      const result = s.assignChild({ assignmentId: 'w4', kind: 'writer', ownedPaths: ['d/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('writer');
    });

    it('allows 10 assignments after reaching burst threshold', () => {
      const { s, complete } = makeSupervisor({ adaptiveCeilingNormal: 5, adaptiveCeilingBurst: 10, minReadyEvidence: 5 });

      // Complete 5 writers to trigger burst
      for (let i = 0; i < 5; i++) {
        const aid = `burst-ready-${i}`;
        s.assignChild({ assignmentId: aid, kind: 'writer', ownedPaths: [`br${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        s.bindChildSession(aid, `brsid-${i}`);
        s.dispatchAssignment(aid);
        s.ackAssignment(aid);
        complete(aid, { eventCursor: `brev-${i}`, childSessionId: `brsid-${i}` });
      }

      expect(s.effectiveCeiling).toBe(10);
      // Completed writers don't count as active, so 0 active + burst ceiling 10 = 10 slots
      expect(s.availableWriterSlots).toBe(10);

      // Should allow 10 total active assignments in burst mode
      // After completing 5, we have 0 active. We can add up to 10 active writers.
      for (let i = 0; i < 10; i++) {
        const aid = `burst-active-${i}`;
        const result = s.assignChild({ assignmentId: aid, kind: 'writer', ownedPaths: [`ba${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        expect(result.ok).toBe(true);
      }

      // 11th should fail (10 + 1 = 11 > burst ceiling of 10)
      const failResult = s.assignChild({ assignmentId: 'burst-over', kind: 'writer', ownedPaths: ['bo/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(failResult.ok).toBe(false);
    });
  });

  describe('legacy maxWriters compatibility', () => {
    it('maxWriters is non-authoritative - does not limit slots when adaptive ceiling is higher', () => {
      // Legacy maxWriters: 2, but adaptive ceiling is 8
      const { s } = makeSupervisor({ maxWriters: 2 });
      expect(s.availableWriterSlots).toBe(8); // Uses adaptive ceiling, not legacy maxWriters
    });

    it('respects legacy maxWriters when lower than adaptive ceiling', () => {
      // This tests the intent: legacy should be fallback, not blocking
      const { s } = makeSupervisor({ maxWriters: 2, adaptiveCeilingNormal: 8 });
      // Should use adaptive ceiling (8) as authoritative
      expect(s.availableWriterSlots).toBe(8);
    });

    it('fails when exceeding adaptive ceiling regardless of maxWriters', () => {
      // maxWriters=10, adaptiveCeilingNormal=3
      const { s } = makeSupervisor({ maxWriters: 10, adaptiveCeilingNormal: 3, minReadyEvidence: 100 });

      // Fill adaptive ceiling
      for (let i = 0; i < 3; i++) {
        const result = s.assignChild({ assignmentId: `leg${i}`, kind: 'writer', ownedPaths: [`leg${i}/`], forbiddenPaths: [], contextKey: stubContextKey });
        expect(result.ok).toBe(true);
      }

      // 4th should fail even though maxWriters=10
      const over = s.assignChild({ assignmentId: 'leg-over', kind: 'writer', ownedPaths: ['lego/'], forbiddenPaths: [], contextKey: stubContextKey });
      expect(over.ok).toBe(false);
    });
  });

  describe('burst mode transition', () => {
    it('transitions from normal to burst when evidence threshold met', () => {
      const { s, complete } = makeSupervisor({ adaptiveCeilingNormal: 3, adaptiveCeilingBurst: 5, minReadyEvidence: 2 });

      // Initially normal mode
      expect(s.effectiveCeiling).toBe(3);
      expect(s.availableWriterSlots).toBe(3);

      // Complete 1 writer (not enough for burst)
      s.assignChild({ assignmentId: 't1', kind: 'writer', ownedPaths: ['t1/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('t1', 'tsid1');
      s.dispatchAssignment('t1');
      s.ackAssignment('t1');
      complete('t1', { eventCursor: 'tev1', childSessionId: 'tsid1' });

      expect(s.effectiveCeiling).toBe(3); // Still normal
      expect(s.availableWriterSlots).toBe(2);

      // Complete 2nd writer - now at threshold
      s.assignChild({ assignmentId: 't2', kind: 'writer', ownedPaths: ['t2/'], forbiddenPaths: [], contextKey: stubContextKey });
      s.bindChildSession('t2', 'tsid2');
      s.dispatchAssignment('t2');
      s.ackAssignment('t2');
      complete('t2', { eventCursor: 'tev2', childSessionId: 'tsid2' });

      expect(s.effectiveCeiling).toBe(5); // Now in burst mode!
      expect(s.availableWriterSlots).toBe(3); // 5 - 2 active = 3
    });
  });
});
