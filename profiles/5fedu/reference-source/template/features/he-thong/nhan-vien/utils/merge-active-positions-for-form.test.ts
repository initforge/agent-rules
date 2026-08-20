import { describe, it, expect } from 'vitest';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import type { Employee } from '../core/types';
import { mergeActivePositionsForEmployeeForm } from './merge-active-positions-for-form';

const activePositions: Position[] = [
  {
    id: 'p1',
    ma_chuc_vu: 'CV-HR',
    ten_chuc_vu: 'Chuyên viên HR',
    cap_bac: 4,
    phong_ban_id: 'd1',
    ten_phong_ban: 'Nhân sự',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '',
    tg_cap_nhat: '',
  },
];

const employeeWithInactivePosition: Employee = {
  id: 'e1',
  ho_ten: 'Nguyễn A',
  email: 'a@test.com',
  so_dien_thoai: '0901234567',
  chuc_vu_id: 'p-old',
  ten_chuc_vu: 'Chức vụ cũ',
  cap_bac: 3,
  phong_ban_id: 'd1',
  trang_thai: 'Đang làm việc',
  gioi_tinh: 'Nam',
  tg_tao: '2024-01-01T00:00:00.000Z',
};

describe('mergeActivePositionsForEmployeeForm', () => {
  it('returns active list unchanged when no employee', () => {
    expect(mergeActivePositionsForEmployeeForm(activePositions, null)).toBe(activePositions);
  });

  it('returns active list when current position is still active', () => {
    const employee: Employee = { ...employeeWithInactivePosition, chuc_vu_id: 'p1' };
    expect(mergeActivePositionsForEmployeeForm(activePositions, employee)).toBe(activePositions);
  });

  it('appends stub for inactive current position on edit', () => {
    const merged = mergeActivePositionsForEmployeeForm(activePositions, employeeWithInactivePosition);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.id).toBe('p-old');
    expect(merged[1]?.ten_chuc_vu).toBe('Chức vụ cũ');
    expect(merged[1]?.trang_thai).toBe('Ngừng hoạt động');
  });

  it('treats numeric active position id as match for string employee chuc_vu_id', () => {
    const numericActive: Position[] = [{ ...activePositions[0]!, id: 42 as unknown as string }];
    const employee: Employee = { ...employeeWithInactivePosition, chuc_vu_id: '42' };
    expect(mergeActivePositionsForEmployeeForm(numericActive, employee)).toBe(numericActive);
  });
});
