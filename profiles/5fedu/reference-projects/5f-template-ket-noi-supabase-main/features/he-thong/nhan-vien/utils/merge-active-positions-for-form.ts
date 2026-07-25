import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import type { Employee } from '../core/types';
import { coerceEntityId, coerceNullableEntityId } from '@/lib/coerce-entity-id';

function positionIdsMatch(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  if (a == null || a === '' || b == null || b === '') return false;
  return String(a) === String(b);
}

/** Giữ chức vụ hiện tại (kể cả ngừng HĐ) khi sửa NV — options vẫn lấy từ query active. */
export function mergeActivePositionsForEmployeeForm(
  activePositions: Position[],
  employee?: Employee | null,
): Position[] {
  const currentId = employee?.chuc_vu_id;
  if (!currentId || activePositions.some((p) => positionIdsMatch(p.id, currentId))) {
    return activePositions;
  }
  const stub: Position = {
    id: coerceEntityId(currentId),
    ma_chuc_vu: coerceEntityId(currentId),
    ten_chuc_vu: employee.ten_chuc_vu ?? coerceEntityId(currentId),
    cap_bac: employee.cap_bac ?? null,
    phong_ban_id: coerceNullableEntityId(employee.phong_ban_id),
    ten_phong_ban: employee.ten_phong_ban,
    mo_ta: null,
    thu_tu: 9999,
    trang_thai: 'Ngừng hoạt động',
    tg_tao: '',
    tg_cap_nhat: '',
  };
  return [...activePositions, stub];
}
