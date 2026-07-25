import { describe, it, expect } from 'vitest';
import { parseEntityIdsForDb, pickCoercedIds } from './map-entity-row';

describe('pickCoercedIds', () => {
  it('coerces numeric bigint id and nullable FK to string', () => {
    const row = {
      id: 42,
      cha_id: 5,
      phong_ban_id: null,
      ten_phong_ban: 'Kỹ thuật',
      var_phong_ban: { ten_phong_ban: 'Kỹ thuật' },
    };

    const mapped = pickCoercedIds(row, {
      nullable: ['cha_id', 'phong_ban_id'],
    });

    expect(mapped.id).toBe('42');
    expect(mapped.cha_id).toBe('5');
    expect(mapped.phong_ban_id).toBeNull();
    expect(mapped.var_phong_ban).toEqual({ ten_phong_ban: 'Kỹ thuật' });
  });

  it('preserves string ids', () => {
    const mapped = pickCoercedIds(
      { id: 'dep-1', cha_id: 'dep-0' },
      { nullable: ['cha_id'] },
    );
    expect(mapped.id).toBe('dep-1');
    expect(mapped.cha_id).toBe('dep-0');
  });
});

describe('parseEntityIdsForDb', () => {
  it('parses string ids to numbers and drops invalid', () => {
    expect(parseEntityIdsForDb(['1', '42', 'bad'])).toEqual([1, 42]);
  });
});
