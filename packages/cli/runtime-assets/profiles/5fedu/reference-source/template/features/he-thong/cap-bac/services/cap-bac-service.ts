import type { JobLevel } from '../core/types';

const ts = () => new Date().toISOString();

const MOCK_LEVELS: JobLevel[] = [
  {
    id: 'lvl-1',
    ma_cap_bac: 'GD',
    ten_cap_bac: 'Giám đốc',
    mo_ta: 'Placeholder — module cấp bậc đã gỡ',
    thu_tu: 1,
    trang_thai: 'Đang hoạt động',
    tg_tao: ts(),
    tg_cap_nhat: ts(),
  },
  {
    id: 'lvl-4',
    ma_cap_bac: 'NV',
    ten_cap_bac: 'Nhân viên',
    mo_ta: null,
    thu_tu: 4,
    trang_thai: 'Đang hoạt động',
    tg_tao: ts(),
    tg_cap_nhat: ts(),
  },
];

export async function getJobLevels(): Promise<JobLevel[]> {
  return MOCK_LEVELS;
}
