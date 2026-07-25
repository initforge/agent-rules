import type { ActionType } from '@/features/he-thong/phan-quyen/core/types';
import { getPhanQuyenGrantsByVaiTro } from '@/features/he-thong/phan-quyen/services/phan-quyen-service';

/**
 * Lấy map `module_key → actions` theo id chức vụ (`chuc_vu_id` trong bảng `var_phan_quyen`).
 */
export async function fetchPositionPermissionGrants(
  id_chuc_vu: string,
): Promise<Record<string, ActionType[]>> {
  if (!id_chuc_vu) return {};
  return getPhanQuyenGrantsByVaiTro(id_chuc_vu);
}
