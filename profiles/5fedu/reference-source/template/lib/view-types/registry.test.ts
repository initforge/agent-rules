import { describe, expect, it } from 'vitest';
import { VIEW_TYPE_IDS } from './types';
import { VIEW_TYPE_REGISTRY } from './registry';

describe('VIEW_TYPE_REGISTRY', () => {
  it('mỗi VIEW_TYPE_ID có định nghĩa đầy đủ', () => {
    for (const id of VIEW_TYPE_IDS) {
      expect(VIEW_TYPE_REGISTRY[id]).toBeDefined();
      expect(VIEW_TYPE_REGISTRY[id].id).toBe(id);
      expect(VIEW_TYPE_REGISTRY[id].labelVi.length).toBeGreaterThan(0);
      expect(VIEW_TYPE_REGISTRY[id].implementationStatus).toMatch(/^(ready|partial|planned)$/);
    }
  });

  it('số khóa registry khớp số VIEW_TYPE_IDS', () => {
    expect(Object.keys(VIEW_TYPE_REGISTRY).length).toBe(VIEW_TYPE_IDS.length);
  });
});
