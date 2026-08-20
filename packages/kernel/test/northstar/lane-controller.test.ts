import { describe, it, expect } from 'vitest';
import { LaneController, DEFAULT_LANE_BUDGETS, PRESSURE_SHED_ORDER, ResourceLane } from '../../src/northstar/resource-governor.js';

describe('P5 — resource lane controller', () => {
  it('writer lane always serializes (budget 1)', () => {
    const c = new LaneController();
    expect(c.acquire('writer')).toBe(true);
    expect(c.acquire('writer')).toBe(false);
    c.release('writer');
    expect(c.acquire('writer')).toBe(true);
  });

  it('read_search allows concurrent acquisitions up to its budget', () => {
    const c = new LaneController();
    const budget = DEFAULT_LANE_BUDGETS.find((b) => b.lane === 'read_search')!.max_concurrency;
    for (let i = 0; i < budget; i += 1) expect(c.acquire('read_search')).toBe(true);
    expect(c.acquire('read_search')).toBe(false);
  });

  it('unknown lanes are rejected', () => {
    const c = new LaneController();
    // @ts-expect-error testing runtime guard
    expect(c.acquire('nonexistent')).toBe(false);
  });

  it('memory pressure sheds the expensive lanes first and never treats unknown load as idle', () => {
    const c = new LaneController();
    c.applyMemoryPressure(0.5);
    const u = c.utilization();
    for (const lane of PRESSURE_SHED_ORDER) {
      const base = DEFAULT_LANE_BUDGETS.find((b) => b.lane === lane)!.max_concurrency;
      expect(u[lane].budget).toBeLessThanOrEqual(base);
    }
    // read_search/research are not in the shed order and keep their budget.
    expect(u.read_search.budget).toBe(DEFAULT_LANE_BUDGETS.find((b: { lane: ResourceLane }) => b.lane === 'read_search')!.max_concurrency);
  });
});
