import type { Department } from '@/features/he-thong/phong-ban/core/types';

export interface EmployeeOrgUnits {
  ten_phong_ban?: string;
  ten_bo_phan?: string | null;
}

/** Tách phòng ban cấp 1 và bộ phận (nhóm cấp 2) từ phong_ban_id của NV. */
export function resolveEmployeeOrgUnits(
  phongBanId: string | number | null | undefined,
  departments: Department[],
): EmployeeOrgUnits {
  const normalizedId = phongBanId == null || phongBanId === '' ? null : String(phongBanId);
  if (!normalizedId) return {};

  const dept = departments.find((d) => String(d.id) === normalizedId);
  if (!dept) return {};

  if (dept.cap_do >= 2 && dept.cha_id) {
    const parent = departments.find((d) => String(d.id) === String(dept.cha_id));
    return {
      ten_phong_ban: parent?.ten_phong_ban,
      ten_bo_phan: dept.ten_phong_ban,
    };
  }

  return {
    ten_phong_ban: dept.ten_phong_ban,
    ten_bo_phan: null,
  };
}
