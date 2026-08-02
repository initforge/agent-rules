/**
 * plan-anchor-index.test.ts — Tests for C5 M11R37/R38/R42 PlanAnchor chunk index.
 */
import { describe, expect, it } from 'vitest';
import { computePlanAnchorChunkIndex, buildPlanAnchorChunkIndex, type IndexablePlanAnchor } from '../src/plan-anchor-index.js';

const sha256 = (v: string) => `a${'0'.repeat(63)}`; // Simplified for testing

function anchor(overrides: Partial<IndexablePlanAnchor> = {}): IndexablePlanAnchor {
  return {
    planSha256: sha256('plan'),
    sectionHeading: 'Test',
    lineStart: 1,
    lineEnd: 2,
    anchorTextSha256: sha256('text'),
    requirementId: 'REQ-001',
    ...overrides,
  };
}

describe('computePlanAnchorChunkIndex', () => {
  it('returns correct chunk index for single anchor', () => {
    const a = anchor();
    const result = computePlanAnchorChunkIndex(a, [a]);
    expect(result.chunkIndex).toBe(0);
    expect(result.chunkCount).toBe(1);
    expect(result.chunkSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns correct chunk index for multiple anchors sorted by position', () => {
    const anchors = [
      anchor({ lineStart: 3, lineEnd: 4, requirementId: 'REQ-002' }),
      anchor({ lineStart: 1, lineEnd: 2, requirementId: 'REQ-001' }),
      anchor({ lineStart: 5, lineEnd: 6, requirementId: 'REQ-003' }),
    ];
    const second = anchors[1]; // lineStart: 1
    const result = computePlanAnchorChunkIndex(second, anchors);
    expect(result.chunkIndex).toBe(0); // First in sorted order
    expect(result.chunkCount).toBe(3);
  });

  it('throws when anchor not found in allAnchors', () => {
    const a = anchor({ requirementId: 'REQ-001' });
    const b = anchor({ requirementId: 'REQ-002' });
    expect(() => computePlanAnchorChunkIndex(a, [b])).toThrow('not found');
  });

  it('throws for invalid lineStart', () => {
    const a = anchor({ lineStart: 0 });
    expect(() => computePlanAnchorChunkIndex(a, [a])).toThrow('lineStart');
  });

  it('throws for lineEnd < lineStart', () => {
    const a = anchor({ lineStart: 5, lineEnd: 3 });
    expect(() => computePlanAnchorChunkIndex(a, [a])).toThrow('lineEnd');
  });

  it('throws for empty sectionHeading', () => {
    const a = anchor({ sectionHeading: '' });
    expect(() => computePlanAnchorChunkIndex(a, [a])).toThrow('sectionHeading');
  });

  it('throws for empty requirementId', () => {
    const a = anchor({ requirementId: '' });
    expect(() => computePlanAnchorChunkIndex(a, [a])).toThrow('requirementId');
  });

  it('throws for invalid planSha256', () => {
    const a = anchor({ planSha256: 'invalid' as any });
    expect(() => computePlanAnchorChunkIndex(a, [a])).toThrow('SHA-256');
  });

  it('produces consistent chunkSha256 for same anchor', () => {
    const a = anchor();
    const r1 = computePlanAnchorChunkIndex(a, [a]);
    const r2 = computePlanAnchorChunkIndex(a, [a]);
    expect(r1.chunkSha256).toBe(r2.chunkSha256);
  });

  it('sorts by lineStart first, then lineEnd, then requirementId, then sectionHeading', () => {
    const anchors = [
      anchor({ lineStart: 1, lineEnd: 2, requirementId: 'REQ-B', sectionHeading: 'B' }),
      anchor({ lineStart: 1, lineEnd: 1, requirementId: 'REQ-A', sectionHeading: 'A' }),
      anchor({ lineStart: 2, lineEnd: 3, requirementId: 'REQ-C', sectionHeading: 'C' }),
    ];
    // Expected order: REQ-A (lineStart=1, lineEnd=1), REQ-B (lineStart=1, lineEnd=2), REQ-C (lineStart=2)
    const a = anchors[1]; // REQ-A should be index 0
    expect(computePlanAnchorChunkIndex(a, anchors).chunkIndex).toBe(0);

    const b = anchors[0]; // REQ-B should be index 1
    expect(computePlanAnchorChunkIndex(b, anchors).chunkIndex).toBe(1);

    const c = anchors[2]; // REQ-C should be index 2
    expect(computePlanAnchorChunkIndex(c, anchors).chunkIndex).toBe(2);
  });
});

describe('buildPlanAnchorChunkIndex', () => {
  it('builds index for all anchors', () => {
    const anchors = [
      anchor({ lineStart: 1, lineEnd: 2, requirementId: 'REQ-001' }),
      anchor({ lineStart: 3, lineEnd: 4, requirementId: 'REQ-002' }),
    ];
    const index = buildPlanAnchorChunkIndex(anchors);
    expect(index.size).toBe(2);
    expect(index.get(`${sha256('plan')}:Test:1:2:${sha256('text')}:REQ-001`)?.chunkIndex).toBe(0);
    expect(index.get(`${sha256('plan')}:Test:3:4:${sha256('text')}:REQ-002`)?.chunkIndex).toBe(1);
  });

  it('handles duplicate anchor keys (second overwrites first)', () => {
    const a = anchor({ requirementId: 'REQ-001' });
    const b = anchor({ requirementId: 'REQ-001' }); // Same key
    const index = buildPlanAnchorChunkIndex([a, b]);
    // Both anchors have same key, second overwrites first
    expect(index.size).toBe(1);
  });
});
