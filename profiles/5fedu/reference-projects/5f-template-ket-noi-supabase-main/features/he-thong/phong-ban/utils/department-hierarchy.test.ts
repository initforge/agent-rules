import { describe, expect, it } from 'vitest';
import type { Department } from '../core/types';
import {
  canAddChildDepartment,
  getEligibleParentDepartments,
  validateDepartmentParentChange,
} from './department-hierarchy';

const root: Department = {
  id: 'root',
  ma_phong_ban: 'ROOT',
  ten_phong_ban: 'Phòng gốc',
  cha_id: null,
  cap_do: 1,
  duong_dan: '/root',
  trang_thai: 'Đang hoạt động',
  thu_tu: 1,
  tg_tao: '',
  tg_cap_nhat: '',
};

const child: Department = {
  id: 'child',
  ma_phong_ban: 'CHILD',
  ten_phong_ban: 'Nhóm con',
  cha_id: 'root',
  cap_do: 2,
  duong_dan: '/root/child',
  trang_thai: 'Đang hoạt động',
  thu_tu: 1,
  tg_tao: '',
  tg_cap_nhat: '',
};

describe('department-hierarchy', () => {
  it('allows root departments as eligible parents only', () => {
    const eligible = getEligibleParentDepartments([root, child]);
    expect(eligible.map((d) => d.id)).toEqual(['root']);
  });

  it('blocks creating a third level under a child department', () => {
    const error = validateDepartmentParentChange(null, 'child', [root, child]);
    expect(error).toBe('parentMustBeRoot');
  });

  it('blocks assigning parent when department has children', () => {
    const error = validateDepartmentParentChange(root, 'other-root', [root, child]);
    expect(error).toBe('cannotMoveParentWithChildren');
  });

  it('does not allow add-child on level-2 departments', () => {
    expect(canAddChildDepartment(root)).toBe(true);
    expect(canAddChildDepartment(child)).toBe(false);
  });
});
