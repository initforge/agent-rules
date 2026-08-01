/**
 * evals/m11/calibration.test.ts — M11-R36 calibration aggregation eval
 * (AM-0020 §10). Deterministic proof that the calibration telemetry layer
 * aggregates dispositions honestly (UNAVAILABLE when no events) and routes
 * review strength by historical calibration — never by model reputation.
 * Runs against the engine source via vitest, like aggregation.test.ts.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  CalibrationStore,
  calibrationSummary,
  routeReviewStrength,
  UNAVAILABLE,
  type CalibrationEvent,
  type CalibrationGroupSummary,
} from '../../packages/engine/src/calibration.js';

function recordAll(store: CalibrationStore, events: CalibrationEvent[]): void {
  for (const e of events) store.record(e);
}

const clean: CalibrationGroupSummary = {
  model: 'm-clean', provider: 'p', domain: 'ALL',
  reviews: 50, falseAcceptCount: 1, falseRejectCount: 1, defectEscapeCount: 0,
  duplicateFindings: 0, repairLoopCount: 0, capabilityMismatchCount: 0, evidenceInvalidationCost: 0,
  falseAcceptRate: 0.02, falseRejectRate: 0.02, defectEscapeRate: 0,
  avgLatencyMs: 900, avgTokens: 800, avgCost: 0.05,
};

describe('M11-C10 case 12 — calibration aggregation eval (AM-0020 §10)', () => {
  it('honest UNAVAILABLE for an empty ledger — no fabricated zero quality', () => {
    const s = calibrationSummary(new CalibrationStore()).overall
    assert.equal(s.reviews, 0)
    assert.equal(s.falseAcceptRate, UNAVAILABLE)
    assert.equal(s.defectEscapeRate, UNAVAILABLE)
    assert.equal(s.avgLatencyMs, UNAVAILABLE)
  })

  it('defect-escape aggregation isolates the escaping model/domain', () => {
    const store = new CalibrationStore()
    recordAll(store, [
      { kind: 'REVIEW_LATENCY_MS', model: 'm-good', provider: 'p', latencyMs: 1000 },
      { kind: 'REVIEW_LATENCY_MS', model: 'm-good', provider: 'p', latencyMs: 1000 },
      { kind: 'REVIEW_LATENCY_MS', model: 'm-leaky', provider: 'p', latencyMs: 1000 },
      { kind: 'DEFECT_ESCAPE', model: 'm-leaky', provider: 'p', domain: 'finance', claimId: 'C1' },
    ])
    const good = calibrationSummary(store, { model: 'm-good' }).overall
    const leaky = calibrationSummary(store, { model: 'm-leaky' }).overall
    assert.equal(good.defectEscapeCount, 0)
    assert.equal(leaky.defectEscapeCount, 1)
    assert.equal(leaky.defectEscapeRate, 1)
  })

  it('routing prefers economical reviewer on clean calibration and escalates on bad', () => {
    assert.equal(routeReviewStrength('T1', clean).level, 'ECONOMICAL')
    const bad = { ...clean, falseAcceptRate: 0.5, falseAcceptCount: 25 }
    assert.equal(routeReviewStrength('T1', bad).differentProvider, true)
    assert.equal(routeReviewStrength('T3', bad).differentProvider, true)
    assert.equal(routeReviewStrength('T0', bad).level, 'NONE') // T0 never consumes an LLM
  })

  it('model reputation alone never authorizes a verdict', () => {
    // A strong-name model with a bad record gets the different-provider escalation.
    const famous = { ...clean, model: 'deepseek-pro', falseAcceptRate: 0.6, falseAcceptCount: 30, repairLoopCount: 3 }
    const d = routeReviewStrength('T2', famous)
    assert.equal(d.level, 'STRONG')
    assert.equal(d.differentProvider, true)
  })
})
