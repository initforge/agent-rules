
import type { Employee, EmployeeFilters } from '../core/types';
import { createFilterCountsHook } from '@/lib/factories/createFilterCountsHook';
import { employeeMatchesColumnSearch } from '../utils/column-search';

/**
 * Tính count cho từng giá trị filter theo chiến lược "exclude-self":
 * - Khi đếm cho filter A, áp dụng TẤT CẢ filter khác NGOẠI TRỪ A.
 * - Nhờ vậy, khi user đã chọn "Phòng Kỹ thuật", các phòng ban khác
 *   vẫn hiện count chính xác (không bị = 0).
 */
export const useFilterCounts = createFilterCountsHook<
  Employee,
  EmployeeFilters,
  {
    deptCounts: Record<string, number>;
    posCounts: Record<string, number>;
    statusCounts: Record<string, number>;
    genderCounts: Record<string, number>;
  }
>({
  matchesSearch: (emp, searchTerm) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      !searchTerm ||
      emp.ho_ten.toLowerCase().includes(searchLower) ||
      (emp.ten_dang_nhap && emp.ten_dang_nhap.toLowerCase().includes(searchLower)) ||
      emp.email.toLowerCase().includes(searchLower) ||
      emp.so_dien_thoai.includes(searchLower) ||
      (emp.ten_chuc_vu && emp.ten_chuc_vu.toLowerCase().includes(searchLower)) ||
      (emp.ten_phong_ban && emp.ten_phong_ban.toLowerCase().includes(searchLower)) ||
      (emp.ten_bo_phan && emp.ten_bo_phan.toLowerCase().includes(searchLower))
    );
  },
  matchesColumnSearch: (emp, filters) => employeeMatchesColumnSearch(emp, filters.columnSearch),
  getDimensions: (_items, _searchTerm, filters) => {
    const matchesDept = (emp: Employee) =>
      filters.phong_ban_id.length === 0 ||
      (emp.phong_ban_id != null && filters.phong_ban_id.includes(emp.phong_ban_id));

    const matchesPosition = (emp: Employee) =>
      filters.position.length === 0 ||
      (emp.chuc_vu_id != null && filters.position.includes(emp.chuc_vu_id));

    const matchesStatus = (emp: Employee) =>
      filters.trang_thai.length === 0 ||
      filters.trang_thai.includes(String(emp.trang_thai));

    const matchesGender = (emp: Employee) =>
      filters.gender.length === 0 ||
      filters.gender.includes(emp.gioi_tinh);

    return [
      {
        passesOthers: (emp) => matchesPosition(emp) && matchesStatus(emp) && matchesGender(emp),
        getBucketKey: (emp) => emp.phong_ban_id,
      },
      {
        passesOthers: (emp) => matchesDept(emp) && matchesStatus(emp) && matchesGender(emp),
        getBucketKey: (emp) => emp.chuc_vu_id,
      },
      {
        passesOthers: (emp) => matchesDept(emp) && matchesPosition(emp) && matchesGender(emp),
        getBucketKey: (emp) => String(emp.trang_thai),
      },
      {
        passesOthers: (emp) => matchesDept(emp) && matchesPosition(emp) && matchesStatus(emp),
        getBucketKey: (emp) => emp.gioi_tinh,
      },
    ];
  },
  buildResult: (_items, _searchTerm, _filters, countMaps) => ({
    deptCounts: countMaps[0] ?? {},
    posCounts: countMaps[1] ?? {},
    statusCounts: countMaps[2] ?? {},
    genderCounts: countMaps[3] ?? {},
  }),
});
