import type { Branch } from '../core/types';

const ts = () => new Date().toISOString();

const MOCK_BRANCHES: Branch[] = [
  {
    id: 'branch-hn',
    ma_chi_nhanh: 'HN',
    ten_chi_nhanh: 'Hà Nội',
    dia_chi: 'Placeholder — module chi nhánh đã gỡ',
    trang_thai: 'Đang hoạt động',
    tg_tao: ts(),
    tg_cap_nhat: ts(),
  },
];

export async function getBranches(): Promise<Branch[]> {
  return MOCK_BRANCHES;
}
