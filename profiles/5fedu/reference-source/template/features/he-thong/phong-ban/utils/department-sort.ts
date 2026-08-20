import type { Department } from '../core/types';

function parentName(dept: Department, all: Department[]): string {
  if (!dept.cha_id) return '';
  return all.find((p) => p.id === dept.cha_id)?.ten_phong_ban ?? '';
}

/**
 * So sánh hai phòng ban theo cột (dùng sau khi đã lọc, trước phân trang).
 */
export function compareDepartments(
  a: Department,
  b: Department,
  column: string,
  allDepartments: Department[],
): number {
  switch (column) {
    case 'thu_tu':
      return a.thu_tu - b.thu_tu;
    case 'ten_phong_ban':
      return a.ten_phong_ban.localeCompare(b.ten_phong_ban, 'vi');
    case 'ma_phong_ban':
      return a.ma_phong_ban.localeCompare(b.ma_phong_ban, 'vi');
    case 'ten_phong_cha':
      return parentName(a, allDepartments).localeCompare(parentName(b, allDepartments), 'vi');
    case 'mo_ta':
      return (a.mo_ta ?? '').localeCompare(b.mo_ta ?? '', 'vi');
    case 'cap_do':
      return a.cap_do - b.cap_do;
    case 'trang_thai':
      return a.trang_thai.localeCompare(b.trang_thai, 'vi');
    case 'tg_cap_nhat':
      return (a.tg_cap_nhat ?? '').localeCompare(b.tg_cap_nhat ?? '', 'vi');
    default:
      return 0;
  }
}
