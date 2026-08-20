/**
 * calibration.test.ts — M11-R36 claim calibration telemetry (AM-0020 §10).
 * vitest + node:assert, no new deps.
 */
import { describe, it, expect } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CalibrationStore,
  calibrationEventId,
  calibrationSummary,
  routeReviewStrength,
  routeAndRecord,
  FALSE_ACCEPT_RATE_THRESHOLD,
  REPEATED_ROOT_CAUSE_LOOPS,
  UNAVAILABLE,
  type CalibrationEvent,
} from '../src/calibration.js';

function tmpStore(): { store: CalibrationStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibration-test-'));
  return { store: new CalibrationStore(path.join(dir, 'calibration.jsonl')), dir };
}

const base = { model: 'deepseek-v4-flash', provider: 'deepseek', domain: 'auth' };

describe('M11-R36 calibration telemetry', () => {
  describe('record — every event kind with required fields', () => {
    it('records each §10 event type with required fields', () => {
      const { store } = tmpStore();
      const events: CalibrationEvent[] = [
        { kind: 'WORKER_SELF_PASS_REJECTED', ...base, claimId: 'C1' },
        { kind: 'REVIEWER_ACCEPT_REJECTED_BY_CHALLENGER', ...base, claimId: 'C1' },
        { kind: 'FALSE_REJECTION_OVERTURNED', ...base, claimId: 'C2' },
        { kind: 'DEFECT_ESCAPE', ...base, claimId: 'C3', domain: 'finance' },
        { kind: 'DUPLICATE_FINDINGS', ...base, claimId: 'C4', count: 2 },
        { kind: 'REPAIR_LOOP_COUNT', ...base, claimId: 'C5', count: 3 },
        { kind: 'REVIEW_LATENCY_MS', ...base, latencyMs: 1200, tier: 'T2' },
        { kind: 'REVIEW_TOKENS', ...base, tokens: 5000 },
        { kind: 'REVIEW_COST', ...base, cost: 0.42 },
        { kind: 'CAPABILITY_MISMATCH', ...base, claimId: 'C6', requiredCapability: 'vision' },
        { kind: 'EVIDENCE_INVALIDATION_COST', ...base, claimId: 'C7', cost: 1.1 },
      ];
      for (const ev of events) {
        const result = store.record(ev, { epoch: 'epoch-hash-1' });
        assert.equal(result.recorded, true, `${ev.kind} must record`);
        assert.match(result.eventId, /^[0-9a-f]{64}$/);
      }
      assert.equal(store.allEvents().length, events.length);
      for (const ev of store.allEvents()) {
        assert.equal((ev as { epoch?: string }).epoch, 'epoch-hash-1', `${ev.kind} binds the candidate epoch when available`);
      }
    });

    it('content-addresses events — identical payload yields identical id', () => {
      const a: CalibrationEvent = { kind: 'DEFECT_ESCAPE', ...base, claimId: 'C1', domain: 'auth' };
      const b: CalibrationEvent = { kind: 'DEFECT_ESCAPE', ...base, claimId: 'C1', domain: 'auth' };
      assert.equal(calibrationEventId(a), calibrationEventId(b));
    });
  });

  describe('append-only + content-addressed store', () => {
    it('dedupes an identical event when dedupe defaults to true', () => {
      const { store } = tmpStore();
      const ev: CalibrationEvent = { kind: 'DEFECT_ESCAPE', ...base, claimId: 'C1', domain: 'auth' };
      assert.equal(store.record(ev).recorded, true);
      assert.equal(store.record(ev).recorded, false);
      assert.equal(store.allEvents().length, 1);
    });

    it('records both copies when dedupe is disabled', () => {
      const { store } = tmpStore();
      const ev: CalibrationEvent = { kind: 'DEFECT_ESCAPE', ...base, claimId: 'C1', domain: 'auth' };
      store.record(ev, { dedupe: false });
      store.record(ev, { dedupe: false });
      assert.equal(store.allEvents().length, 2);
    });

    it('dedupes against previously flushed (persisted) events', async () => {
      const { store } = tmpStore();
      const ev: CalibrationEvent = { kind: 'REVIEW_COST', ...base, cost: 0.1 };
      store.record(ev);
      await store.flush();
      const again = new CalibrationStore(store.path);
      assert.equal(again.record(ev).recorded, false, 'persisted event id must dedupe on reload');
      assert.equal(again.allEvents().length, 1);
    });
  });

  describe('calibrationSummary — aggregation math', () => {
    it('computes false-accept rate, defect-escape by domain, avg latency/tokens/cost', () => {
      const { store } = tmpStore();
      const evs: CalibrationEvent[] = [
        // model-a, provider-p, domain auth — 2 reviews, 1 false accept, 1 false reject
        { kind: 'REVIEW_LATENCY_MS', model: 'm-a', provider: 'p', domain: 'auth', latencyMs: 1000 },
        { kind: 'REVIEW_TOKENS', model: 'm-a', provider: 'p', domain: 'auth', tokens: 1000 },
        { kind: 'REVIEW_COST', model: 'm-a', provider: 'p', domain: 'auth', cost: 0.1 },
        { kind: 'WORKER_SELF_PASS_REJECTED', model: 'm-a', provider: 'p', domain: 'auth', claimId: 'C1' },
        { kind: 'REVIEW_LATENCY_MS', model: 'm-a', provider: 'p', domain: 'auth', latencyMs: 3000 },
        { kind: 'FALSE_REJECTION_OVERTURNED', model: 'm-a', provider: 'p', domain: 'auth', claimId: 'C2' },
        // model-a, provider-p, domain finance — 1 review, 1 defect escape
        { kind: 'REVIEW_LATENCY_MS', model: 'm-a', provider: 'p', domain: 'finance', latencyMs: 2000 },
        { kind: 'DEFECT_ESCAPE', model: 'm-a', provider: 'p', domain: 'finance', claimId: 'C3' },
      ];
      for (const e of evs) store.record(e);

      const auth = calibrationSummary(store, { model: 'm-a', provider: 'p', domain: 'auth' }).overall;
      assert.equal(auth.reviews, 2);
      assert.equal(auth.falseAcceptCount, 1);
      assert.equal(auth.falseRejectCount, 1);
      assert.equal(auth.defectEscapeCount, 0);
      assert.equal(auth.falseAcceptRate, 0.5);
      assert.equal(auth.falseRejectRate, 0.5);
      assert.equal(auth.avgLatencyMs, 2000);
      assert.equal(auth.avgTokens, 1000);
      assert.equal(auth.avgCost, 0.1);

      const finance = calibrationSummary(store, { model: 'm-a', provider: 'p', domain: 'finance' }).overall;
      assert.equal(finance.defectEscapeCount, 1);
      assert.equal(finance.defectEscapeRate, 1);
      assert.equal(finance.falseAcceptRate, 0);
      assert.equal(finance.avgLatencyMs, 2000);

      // unfiltered summary groups by model/provider/domain
      const all = calibrationSummary(store);
      assert.equal(all.groups.length, 2);
      const overall = all.overall;
      assert.equal(overall.reviews, 3);
      assert.equal(overall.falseAcceptRate, 1 / 3);
      assert.equal(overall.defectEscapeRate, 1 / 3);
    });

    it('aggregates duplicate findings, repair loops, capability mismatch, evidence invalidation cost', () => {
      const { store } = tmpStore();
      store.record({ kind: 'DUPLICATE_FINDINGS', ...base, count: 3 });
      store.record({ kind: 'DUPLICATE_FINDINGS', ...base, count: 2 });
      store.record({ kind: 'REPAIR_LOOP_COUNT', ...base, claimId: 'R1', count: 4 });
      store.record({ kind: 'REPAIR_LOOP_COUNT', ...base, claimId: 'R2', count: 1 });
      store.record({ kind: 'CAPABILITY_MISMATCH', ...base, claimId: 'C1', requiredCapability: 'vision' });
      store.record({ kind: 'CAPABILITY_MISMATCH', ...base, claimId: 'C2', requiredCapability: 'cdp' });
      store.record({ kind: 'EVIDENCE_INVALIDATION_COST', ...base, claimId: 'C3', cost: 1.5 });
      store.record({ kind: 'EVIDENCE_INVALIDATION_COST', ...base, claimId: 'C4', cost: 0.5 });
      const s = calibrationSummary(store).overall;
      assert.equal(s.duplicateFindings, 5);
      assert.equal(s.repairLoopCount, 5);
      assert.equal(s.capabilityMismatchCount, 2);
      assert.equal(s.evidenceInvalidationCost, 2.0);
    });
  });

  describe('UNAVAILABLE honesty', () => {
    it('reports UNAVAILABLE — never 0 — for metrics with no events', () => {
      const { store } = tmpStore();
      const s = calibrationSummary(store).overall;
      assert.equal(s.reviews, 0);
      assert.equal(s.falseAcceptRate, UNAVAILABLE);
      assert.equal(s.falseRejectRate, UNAVAILABLE);
      assert.equal(s.defectEscapeRate, UNAVAILABLE);
      assert.equal(s.avgLatencyMs, UNAVAILABLE);
      assert.equal(s.avgTokens, UNAVAILABLE);
      assert.equal(s.avgCost, UNAVAILABLE);
      // counts of events are still zero, but rates must not be reported as 0-as-quality
      assert.equal(s.falseAcceptCount, 0);
    });

    it('latency reviews is zero ⇒ avg latency UNAVAILABLE even when other events exist', () => {
      const { store } = tmpStore();
      store.record({ kind: 'REVIEW_COST', ...base, cost: 0.1 });
      const s = calibrationSummary(store).overall;
      assert.equal(s.reviews, 0);
      assert.equal(s.avgLatencyMs, UNAVAILABLE);
      assert.equal(s.falseAcceptRate, UNAVAILABLE);
    });
  });

  describe('routeReviewStrength', () => {
    const clean: Parameters<typeof routeReviewStrength>[1] = {
      model: 'm', provider: 'p', domain: 'ALL',
      reviews: 20, falseAcceptCount: 1, falseRejectCount: 1, defectEscapeCount: 0,
      duplicateFindings: 0, repairLoopCount: 0, capabilityMismatchCount: 0, evidenceInvalidationCost: 0,
      falseAcceptRate: 0.05, falseRejectRate: 0.05, defectEscapeRate: 0,
      avgLatencyMs: 1000, avgTokens: 1000, avgCost: 0.1,
    };

    it('T0 routes to no LLM', () => {
      assert.deepEqual(routeReviewStrength('T0', null), {
        tier: 'T0', level: 'NONE', differentProvider: false, reason: 'T0 mechanical: deterministic verifier, no LLM reviewer',
      });
    });

    it('clean T1 calibration routes to an economical reviewer', () => {
      const d = routeReviewStrength('T1', clean);
      assert.equal(d.level, 'ECONOMICAL');
      assert.equal(d.differentProvider, false);
    });

    it('high false-accept model routes T2/T3 to a different-provider reviewer', () => {
      const bad = { ...clean, falseAcceptRate: FALSE_ACCEPT_RATE_THRESHOLD + 0.1, falseAcceptCount: 10 };
      for (const tier of ['T2', 'T3', 'T-Visual', 'T-Global'] as const) {
        const d = routeReviewStrength(tier, bad);
        assert.equal(d.level, 'STRONG');
        assert.equal(d.differentProvider, true, `${tier} must escalate to different provider`);
        assert.match(d.reason, /false-accept rate above threshold/);
      }
    });

    it('repeated root-cause failure escalates T1 to strong/different-provider', () => {
      const looped = { ...clean, repairLoopCount: REPEATED_ROOT_CAUSE_LOOPS };
      const d = routeReviewStrength('T1', looped);
      assert.equal(d.level, 'STRONG');
      assert.equal(d.differentProvider, true);
      assert.match(d.reason, /repair loop/);
    });

    it('clean T2/T3 keeps a strong reviewer without provider switch', () => {
      const d = routeReviewStrength('T3', clean);
      assert.equal(d.level, 'STRONG');
      assert.equal(d.differentProvider, false);
    });

    it('unhealthy T1 with high false-accept also escalates', () => {
      const bad = { ...clean, falseAcceptRate: 0.5, falseAcceptCount: 10 };
      const d = routeReviewStrength('T1', bad);
      assert.equal(d.level, 'STRONG');
      assert.equal(d.differentProvider, true);
    });

    it('records the routing decision when a store is supplied', () => {
      const { store } = tmpStore();
      const d = routeAndRecord('T3', clean, store);
      assert.equal(d.level, 'STRONG');
      const events = store.allEvents();
      assert.equal(events.length, 1);
      assert.equal(events[0].kind, 'ROUTING_DECISION');
    });
  });
});
