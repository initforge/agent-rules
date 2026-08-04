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
 * beforeEach, afterEach) are sourced from @jest/globals.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, test } from '@jest/globals';
import * as jest_globals from 'jest';

export const vi = jest_globals;

export { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, test };
