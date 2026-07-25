import { describe, it, expect } from 'vitest';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import { resolveEmployeeOrgUnits } from './resolve-employee-org-units';

const departments: Department[] = [
  {
    id: 'd-tech',
    ma_phong_ban: 'PB-TECH',
    ten_phong_ban: 'Phòng Kỹ thuật',
    cha_id: null,
    cap_do: 1,
    duong_dan: '/PB-TECH',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '',
    tg_cap_nhat: '',
  },
  {
    id: 'd-dev',
    ma_phong_ban: 'PB-DEV',
    ten_phong_ban: 'Nhóm Phát triển phần mềm',
    cha_id: 'd-tech',
    cap_do: 2,
    duong_dan: '/PB-TECH/PB-DEV',
    trang_thai: 'Đang hoạt động',
    thu_tu: 1,
    tg_tao: '',
    tg_cap_nhat: '',
  },
];

describe('resolveEmployeeOrgUnits', () => {
  it('returns parent as phong ban and child as bo phan for level-2 dept', () => {
    expect(resolveEmployeeOrgUnits('d-dev', departments)).toEqual({
      ten_phong_ban: 'Phòng Kỹ thuật',
      ten_bo_phan: 'Nhóm Phát triển phần mềm',
    });
  });

  it('returns only phong ban for level-1 dept', () => {
    expect(resolveEmployeeOrgUnits('d-tech', departments)).toEqual({
      ten_phong_ban: 'Phòng Kỹ thuật',
      ten_bo_phan: null,
    });
  });

  it('returns empty for missing id', () => {
    expect(resolveEmployeeOrgUnits(null, departments)).toEqual({});
    expect(resolveEmployeeOrgUnits('unknown', departments)).toEqual({});
  });
});
