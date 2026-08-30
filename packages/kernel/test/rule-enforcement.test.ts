import { describe, expect, it } from 'vitest';
import { checkRuntimeGuard } from '../src/northstar/rule-enforcement.js';

describe('runtime guard', () => {
  it('blocks direct generated mirror edits', () => {
    expect(checkRuntimeGuard({ changedPaths: ['generated/runtime-build/codex/manifest.json'] })).toEqual({
      allowed: false,
      reason: 'edit canonical source and regenerate; generated mirrors are read-only',
    });
  });

  it('blocks an unproved completion claim', () => {
    expect(checkRuntimeGuard({ completionClaimed: true, requiredProofPassed: false }).allowed).toBe(false);
  });

  it('allows canonical edits and proved completion', () => {
    expect(checkRuntimeGuard({ changedPaths: ['rules/20-proof-outcome.md'], completionClaimed: true, requiredProofPassed: true })).toEqual({ allowed: true, reason: null });
  });
});
