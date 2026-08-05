/**
 * vitest-shim.js — re-export jest globals as `vi` for vitest→jest compatibility.
 *
 * Vitest's `vi` API maps 1:1 to Jest's `jest` global:
 *   vi.fn()      → jest.fn()
 *   vi.spyOn()   → jest.spyOn()
 *   vi.mock()    → jest.mock()
 *   vi.restoreAllMocks() → jest.restoreAllMocks()
 *   vi.resetModules() → jest.resetModules()
 *
 * All other vitest exports (describe, it, expect, beforeAll, afterAll,
 * beforeEach, afterEach) are sourced from @jest/globals. A few vitest-only
 * modifiers that Jest does not provide are polyfilled below so the same
 * source compiles and runs in both runners.
 */
import { describe, it as baseIt, expect, beforeAll, afterAll, beforeEach, afterEach, test, jest } from '@jest/globals';
import * as jest_runtime from 'jest';

// `it.skipIf(condition)` is a vitest convenience for "skip this case when the
// runtime cannot satisfy it" (e.g. symlink tests on Windows). Jest has no
// equivalent at the suite level, so emulate it via jest's own conditional skip.
function makeConditionalIt(condition, base) {
  return (...args) => {
    if (condition) return base.skip(...args);
    return base(...args);
  };
}
const it = Object.assign(
  (...args) => baseIt(...args),
  {
    skipIf: (condition) => makeConditionalIt(condition, baseIt),
    runIf: (condition) => makeConditionalIt(!condition, baseIt),
    skip: (...args) => baseIt.skip(...args),
    todo: (...args) => baseIt.todo(...args),
    each: baseIt.each ? baseIt.each.bind(baseIt) : undefined,
  },
);

export const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: jest.mock,
  unmock: jest.unmock,
  doMock: jest.doMock,
  dontMock: jest.dontMock,
  requireActual: jest.requireActual,
  requireMock: jest.requireMock,
  resetModules: jest.resetModules,
  isolateModules: jest.isolateModules,
  restoreAllMocks: jest.restoreAllMocks ?? (() => {}),
  resetAllMocks: jest.resetAllMocks ?? (() => {}),
  clearAllMocks: jest.clearAllMocks ?? (() => {}),
  useFakeTimers: jest.useFakeTimers ?? (() => {}),
  useRealTimers: jest.useRealTimers ?? (() => {}),
  advanceTimersByTime: jest.advanceTimersByTime ?? (() => {}),
  runAllTimers: jest.runAllTimers ?? (() => {}),
  runOnlyPendingTimers: jest.runOnlyPendingTimers ?? (() => {}),
  getTimerCount: jest.getTimerCount ?? (() => 0),
};

export { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, test };
