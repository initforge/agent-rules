import { describe, expect, it } from 'vitest';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import { getPositionsForDepartment } from './department-positions';

const basePosition: Omit<Position, 'id' | 'phong_ban_id' | 'thu_tu'> = {
  ma_chuc_vu: 'DEV',
  ten_chuc_vu: 'Developer',
  mo_ta: null,
  trang_thai: 'Đang hoạt động',
  tg_tao: '2026-01-01T00:00:00Z',
  tg_cap_nhat: '2026-01-02T00:00:00Z',
};

describe('getPositionsForDepartment', () => {
  it('returns positions matching department id as string', () => {
    const positions: Position[] = [
      { ...basePosition, id: 'p1', phong_ban_id: '5', thu_tu: 2 },
      { ...basePosition, id: 'p2', phong_ban_id: '6', thu_tu: 1 },
    ];
    expect(getPositionsForDepartment(positions, '5').map((p) => p.id)).toEqual(['p1']);
  });

  it('matches numeric phong_ban_id with string department id', () => {
    const positions: Position[] = [
      { ...basePosition, id: 'p1', phong_ban_id: 5 as unknown as string, thu_tu: 1 },
    ];
    expect(getPositionsForDepartment(positions, '5')).toHaveLength(1);
  });

  it('sorts by thu_tu ascending', () => {
    const positions: Position[] = [
      { ...basePosition, id: 'p2', phong_ban_id: '5', thu_tu: 5 },
      { ...basePosition, id: 'p1', phong_ban_id: '5', thu_tu: 1 },
    ];
    expect(getPositionsForDepartment(positions, '5').map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
