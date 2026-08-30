import type { Department } from '../core/types';
import { createColumnSearchMatcher } from '@/lib/factories/createColumnSearchMatcher';

/** Cột đã có MultiSelect ở header — không áp dụng thêm `columnSearch` cho cùng id cột. */
export const DEPARTMENT_COLUMN_IDS_WITH_MULTISELECT = ['trang_thai', 'ten_phong_ban'] as const;

function columnIdToValue(
  colId: string,
  item: Department,
  parentName: string,
): string {
  switch (colId) {
    case 'thu_tu':
      return String(item.thu_tu);
    case 'ma_phong_ban':
      return item.ma_phong_ban;
    case 'mo_ta':
      return item.mo_ta ?? '';
    case 'cap_do':
      return String(item.cap_do);
    case 'ten_phong_cha':
      return parentName;
    case 'tg_cap_nhat':
      return item.tg_cap_nhat ?? '';
    default:
      return '';
  }
}

const matcher = createColumnSearchMatcher<Department, string>({
  skipColumnIds: DEPARTMENT_COLUMN_IDS_WITH_MULTISELECT,
  getFieldValue: (item, colId, parentName) => columnIdToValue(colId, item, parentName),
});

export const countDepartmentColumnSearchActive = matcher.countActive;

/**
 * AND theo từng ô columnSearch (không phân biệt hoa thường).
 * `parentName` = tên phòng cha hiển thị (cột ten_phong_cha).
 */
export const departmentMatchesColumnSearch = (
  item: Department,
  columnSearch: Record<string, string> | undefined,
  parentName: string,
) => matcher.matches(item, columnSearch, parentName);
