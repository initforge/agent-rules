import { describe, it, expect } from 'vitest';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '../core/types';
import { buildPositionTreeRows } from './build-position-tree-rows';

const baseDept: Omit<Department, 'id'> = {
  ma_phong_ban: 'PB-KT',
  ten_phong_ban: 'Phòng Kỹ thuật',
  cha_id: null,
  cap_do: 1,
  duong_dan: '/5',
  trang_thai: 'Đang hoạt động',
  thu_tu: 1,
  tg_tao: '2024-01-01T00:00:00.000Z',
  tg_cap_nhat: '2024-01-01T00:00:00.000Z',
};

const basePosition: Omit<Position, 'id' | 'phong_ban_id'> = {
  ma_chuc_vu: 'TP-KT',
  ten_chuc_vu: 'Trưởng Phòng Kỹ thuật',
  cap_bac: 2,
  ten_phong_ban: 'Phòng Kỹ thuật',
  trang_thai: 'Đang hoạt động',
  thu_tu: 1,
  tg_tao: '2024-01-01T00:00:00.000Z',
  tg_cap_nhat: '2024-01-01T00:00:00.000Z',
};

describe('buildPositionTreeRows', () => {
  it('nests positions under department when both ids are strings', () => {
    const departments: Department[] = [{ ...baseDept, id: '5' }];
    const positions: Position[] = [
      { ...basePosition, id: 'pos-1', phong_ban_id: '5' },
    ];

    const rows = buildPositionTreeRows(departments, positions);
    const deptRow = rows.find((r) => r.kind === 'department');
    const positionRows = rows.filter((r) => r.kind === 'position');

    expect(deptRow?.kind === 'department' && deptRow.positionCount).toBe(1);
    expect(positionRows).toHaveLength(1);
    expect(positionRows[0]?.kind === 'position' && positionRows[0].position.id).toBe('pos-1');
  });

  it('joins numeric department id with string phong_ban_id', () => {
    const departments: Department[] = [{ ...baseDept, id: 5 as unknown as string }];
    const positions: Position[] = [
      { ...basePosition, id: 'pos-1', phong_ban_id: '5' },
    ];

    const rows = buildPositionTreeRows(departments, positions);
    const deptRow = rows.find((r) => r.kind === 'department');
    const positionRows = rows.filter((r) => r.kind === 'position');

    expect(deptRow?.kind === 'department' && deptRow.positionCount).toBe(1);
    expect(positionRows).toHaveLength(1);
  });
});
