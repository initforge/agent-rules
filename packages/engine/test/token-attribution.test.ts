import { describe, expect, it } from 'vitest';
import {
  createAttributionBuilder,
  recordTokenEvent,
  computeAttributionSummary,
  computeEventSha256,
  isAttributionComplete,
  type TokenEvent,
  type ActorRole,
  type TokenSource,
} from '../src/token-attribution.js';

function makeEvent(overrides?: Partial<Omit<TokenEvent, 'attributionId'>>): Omit<TokenEvent, 'attributionId'> {
  return {
    actorRole: 'main',
    planId: 'plan-001',
    inputTokens: 100,
    outputTokens: 50,
    cacheHitTokens: 20,
    costUsd: 0.001,
    source: 'provider',
    turnStartedAt: '2026-08-01T00:00:00.000Z',
    turnCompletedAt: '2026-08-01T00:00:01.000Z',
    providerModel: 'deepseek-v4-flash',
    ...overrides,
  };
}

describe('token-attribution', () => {
  describe('createAttributionBuilder', () => {
    it('initializes with zero events', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      expect(builder.runId).toBe('run-001');
      expect(builder.planId).toBe('plan-001');
      expect(builder.events).toHaveLength(0);
      expect(builder.turnIndex).toBe(0);
    });
  });

  describe('recordTokenEvent', () => {
    it('appends event and increments turnIndex', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      const event = makeEvent();
      recordTokenEvent(builder, event);
      expect(builder.events).toHaveLength(1);
      expect(builder.turnIndex).toBe(1);
      expect(builder.events[0].attributionId.runId).toBe('run-001');
    });

    it('assigns unique attributionId per event', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent());
      recordTokenEvent(builder, makeEvent());
      expect(builder.events[0].attributionId.turnIndex).toBe(0);
      expect(builder.events[1].attributionId.turnIndex).toBe(1);
    });

    it('freezes events immutably', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent());
      expect(() => { (builder.events[0] as TokenEvent).inputTokens = 999; }).toThrow();
    });
  });

  describe('computeAttributionSummary', () => {
    it('aggregates single main event', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ actorRole: 'main', inputTokens: 100, outputTokens: 50 }));
      const summary = computeAttributionSummary(builder);
      expect(summary.runId).toBe('run-001');
      expect(summary.planId).toBe('plan-001');
      expect(summary.totalInputTokens).toBe(100);
      expect(summary.totalOutputTokens).toBe(50);
      expect(summary.totalCostUsd).toBe(0.001);
      expect(summary.turnCount).toBe(1);
    });

    it('aggregates by actor role', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ actorRole: 'main', inputTokens: 100 }));
      recordTokenEvent(builder, makeEvent({ actorRole: 'worker', inputTokens: 200 }));
      recordTokenEvent(builder, makeEvent({ actorRole: 'main', inputTokens: 150 }));
      const summary = computeAttributionSummary(builder);
      expect(summary.byActor.main.inputTokens).toBe(250);
      expect(summary.byActor.main.turnCount).toBe(2);
      expect(summary.byActor.worker.inputTokens).toBe(200);
      expect(summary.byActor.worker.turnCount).toBe(1);
    });

    it('aggregates by source', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ source: 'cache', inputTokens: 50, cacheHitTokens: 50 }));
      recordTokenEvent(builder, makeEvent({ source: 'provider', inputTokens: 100, cacheHitTokens: 0 }));
      recordTokenEvent(builder, makeEvent({ source: 'cache', inputTokens: 30, cacheHitTokens: 30 }));
      const summary = computeAttributionSummary(builder);
      expect(summary.bySource.cache.inputTokens).toBe(80);
      expect(summary.bySource.provider.inputTokens).toBe(100);
      expect(summary.totalCacheHitTokens).toBe(80); // 50 + 30 from cache events
    });

    it('computes summarySha256 deterministically', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent());
      const s1 = computeAttributionSummary(builder);
      const s2 = computeAttributionSummary(builder);
      expect(s1.summarySha256).toBe(s2.summarySha256);
    });

    it('tracks cost correctly', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ costUsd: 0.01 }));
      recordTokenEvent(builder, makeEvent({ costUsd: 0.02 }));
      const summary = computeAttributionSummary(builder);
      expect(summary.totalCostUsd).toBe(0.03);
    });

    it('handles empty builder', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      const summary = computeAttributionSummary(builder);
      expect(summary.turnCount).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
    });
  });

  describe('computeEventSha256', () => {
    it('returns deterministic SHA for same event', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      const e1 = recordTokenEvent(builder, makeEvent({ inputTokens: 100 }));
      // Same content, same attributionId
      const h1 = computeEventSha256(e1);
      const h2 = computeEventSha256(e1);
      expect(h1).toBe(h2);
    });

    it('returns different SHA for different events', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      const e1 = recordTokenEvent(builder, makeEvent({ inputTokens: 100 }));
      const e2 = recordTokenEvent(builder, makeEvent({ inputTokens: 200 }));
      expect(computeEventSha256(e1)).not.toBe(computeEventSha256(e2));
    });
  });

  describe('isAttributionComplete', () => {
    it('detects missing actors', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ actorRole: 'main' }));
      const summary = computeAttributionSummary(builder);
      const result = isAttributionComplete(summary, ['main', 'worker']);
      expect(result.complete).toBe(false);
      expect(result.missingActors).toContain('worker');
    });

    it('detects complete attribution', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ actorRole: 'main' }));
      recordTokenEvent(builder, makeEvent({ actorRole: 'worker' }));
      const summary = computeAttributionSummary(builder);
      const result = isAttributionComplete(summary, ['main', 'worker']);
      expect(result.complete).toBe(true);
      expect(result.missingActors).toHaveLength(0);
    });

    it('detects missing sources', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      recordTokenEvent(builder, makeEvent({ source: 'cache' }));
      const summary = computeAttributionSummary(builder);
      const result = isAttributionComplete(summary);
      expect(result.missingSources.length).toBeGreaterThan(0);
    });
  });

  describe('attribution aggregation properties', () => {
    it('sum of byActor equals total', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      for (const role of ['main', 'worker', 'verifier'] as ActorRole[]) {
        recordTokenEvent(builder, makeEvent({ actorRole: role, inputTokens: 100, outputTokens: 50 }));
      }
      const summary = computeAttributionSummary(builder);
      const sumByActor = Object.values(summary.byActor).reduce((acc, v) => ({
        input: acc.input + v.inputTokens,
        output: acc.output + v.outputTokens,
      }), { input: 0, output: 0 });
      expect(sumByActor.input).toBe(summary.totalInputTokens);
      expect(sumByActor.output).toBe(summary.totalOutputTokens);
    });

    it('sum of bySource equals total', () => {
      const builder = createAttributionBuilder('run-001', 'plan-001');
      for (const source of ['cache', 'provider', 'artifact'] as TokenSource[]) {
        recordTokenEvent(builder, makeEvent({ source, inputTokens: 100 }));
      }
      const summary = computeAttributionSummary(builder);
      const sumBySource = Object.values(summary.bySource).reduce((acc, v) => acc + v.inputTokens, 0);
      expect(sumBySource).toBe(summary.totalInputTokens);
    });
  });
});
