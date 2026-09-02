import { describe, expect, it } from 'vitest';
import { classifyReviewMateriality } from '../src/harness/review/materiality.js';

describe('review materiality', () => {
  it('blocks acceptance-bound P2 findings on generalized change-risk dimensions', () => {
    for (const dimension of ['subtractive_preservation', 'canonical_runtime_adoption', 'blocker_scope_completion', 'ui_geometry_behavior']) {
      expect(classifyReviewMateriality({ severity: 'P2', acceptance_id: 'AC-1', dimension, message: 'required behavior is not proven', user_impact: 'acceptance may be false' }, { relevant_acceptance_ids: ['AC-1'] }).blocking).toBe(true);
    }
  });

  it('keeps an unbound P2 advisory', () => {
    expect(classifyReviewMateriality({ severity: 'P2', dimension: 'subtractive_preservation', message: 'unbound observation', user_impact: 'none established' }, { relevant_acceptance_ids: [] }).blocking).toBe(false);
  });
});
