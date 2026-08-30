import { describe, it, expect } from 'vitest';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import {
  buildEmployeePositionComboboxOptions,
  getDepartmentIdForPosition,
  getDepartmentNameForPosition,
  getDivisionNameForPosition,
  getPositionNameById,
  getCapBacForPosition,
  formatEmployeeCapBacLabel,
} from './build-employee-position-options';

const departments: Department[] = [
  {
    id: 'd1',
    ma_phong_ban: 'PB-HC',
    ten_phong_ban: 'Hành chính',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/PB-HC',
    thu_tu: 1,
    trang_thai: 'Đang hoạt động',
    tg_tao: '',
    tg_cap_nhat: '',
  },
  {
    id: 'd2',
    ma_phong_ban: 'PB-HC-NS',
    ten_phong_ban: 'Nhân sự',
    cha_id: 'd1',
    cap_do: 2,
    duong_dan: '/PB-HC/PB-HC-NS',
    thu_tu: 1,
    trang_thai: 'Đang hoạt động',
    tg_tao: '',
    tg_cap_nhat: '',
  },
];

const positions: Position[] = [
  {
    id: 'p1',
    ma_chuc_vu: 'CV-GD',
    ten_chuc_vu: 'Giám đốc',
    cap_bac: 1,
    phong_ban_id: 'd1',
    ten_phong_ban: 'Hành chính',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '',
    tg_cap_nhat: '',
  },
  {
    id: 'p2',
    ma_chuc_vu: 'CV-HR',
    ten_chuc_vu: 'Chuyên viên HR',
    cap_bac: 4,
    phong_ban_id: 'd2',
    ten_phong_ban: 'Nhân sự',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '',
    tg_cap_nhat: '',
  },
  {
    id: 'p3',
    ma_chuc_vu: 'CV-OLD',
    ten_chuc_vu: 'Chức vụ ngưng',
    phong_ban_id: 'd1',
    ten_phong_ban: 'Hành chính',
    trang_thai: 'Ngưng hoạt động',
    thu_tu: 2,
    tg_tao: '',
    tg_cap_nhat: '',
  },
];

describe('buildEmployeePositionComboboxOptions', () => {
  it('groups positions under department headers (disabled)', () => {
    const options = buildEmployeePositionComboboxOptions(departments, positions);
    const headers = options.filter((o) => o.disabled);
    const selectable = options.filter((o) => !o.disabled);

    expect(headers.map((h) => h.label)).toEqual(['Hành chính', 'Nhân sự']);
    expect(selectable.map((o) => o.value)).toEqual(['p1', 'p2']);
    expect(selectable.some((o) => o.value === 'p3')).toBe(false);
  });
});

describe('getDepartmentIdForPosition', () => {
  it('returns phong_ban_id for active position', () => {
    expect(getDepartmentIdForPosition(positions, 'p2')).toBe('d2');
  });

  it('returns null when position missing', () => {
    expect(getDepartmentIdForPosition(positions, 'unknown')).toBeNull();
  });
});

describe('getDepartmentNameForPosition', () => {
  it('returns level-1 phong ban for position on cap 1 dept', () => {
    expect(getDepartmentNameForPosition(departments, positions, 'p1')).toBe('Hành chính');
  });

  it('returns parent phong ban for position on cap 2 dept', () => {
    expect(getDepartmentNameForPosition(departments, positions, 'p2')).toBe('Hành chính');
  });
});

describe('getDivisionNameForPosition', () => {
  it('returns bo phan for cap 2 dept', () => {
    expect(getDivisionNameForPosition(departments, positions, 'p2')).toBe('Nhân sự');
  });

  it('returns empty for cap 1 dept', () => {
    expect(getDivisionNameForPosition(departments, positions, 'p1')).toBe('');
  });
});

describe('getPositionNameById', () => {
  it('returns full ten_chuc_vu without tree formatting', () => {
    expect(getPositionNameById(positions, 'p2')).toBe('Chuyên viên HR');
  });
});

describe('getCapBacForPosition', () => {
  it('returns cap_bac number from position', () => {
    expect(getCapBacForPosition(positions, 'p1')).toBe(1);
    expect(getCapBacForPosition(positions, 'p2')).toBe(4);
  });
});

describe('formatEmployeeCapBacLabel', () => {
  it('formats level like position module', () => {
    expect(formatEmployeeCapBacLabel(2)).toBe('Cấp 2');
  });
});
