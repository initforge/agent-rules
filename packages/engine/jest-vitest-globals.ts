/**
 * Vitest globals shim for Jest.
 * All 82 engine test files import from 'vitest'.
 * Imports jest from @jest/globals (available in module scope under ESM) and
 * re-exports Jest globals + vitest-specific `vi` API.
 */
import { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';

// `vi` — vitest's global mock/timer/spy utility.
// Maps to Jest's `jest` global for the subset actually used by engine tests.
// ponytail: hoisted/unstubGlobal not used in engine tests; add if needed.
const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: jest.mock,
  doMock: jest.doMock,
  unmock: jest.unmock,
  clearAllMocks: jest.clearAllMocks,
  resetAllMocks: jest.resetAllMocks,
  restoreAllMocks: jest.restoreAllMocks,
  useFakeTimers: jest.useFakeTimers,
  useRealTimers: jest.useRealTimers,
  // vitest exposes advanceTimersByTime as a global function;
  // Jest provides it on the timer handle returned by useFakeTimers.
  advanceTimersByTime(ms: number) {
    jest.advanceTimersByTime?.(ms);
  },
  advanceTimersByTimeAsync: async (ms: number) => {
    jest.advanceTimersByTime?.(ms);
  },
};

export { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, vi };
