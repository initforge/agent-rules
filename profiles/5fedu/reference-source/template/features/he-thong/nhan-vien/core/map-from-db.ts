import { pickCoercedIds } from '@/lib/supabase/map-entity-row';
import type { Employee } from './types';

export function mapEmployeeFromDb(row: Record<string, unknown>): Employee {
  const phongBan = row.var_phong_ban as { ten_phong_ban?: string } | null | undefined;
  const chucVu = row.var_chuc_vu as { ten_chuc_vu?: string; cap_bac?: number | null } | null | undefined;
  const creator = row.creator as { ho_ten?: string } | null | undefined;
  const rest = pickCoercedIds(row, { nullable: ['phong_ban_id', 'chuc_vu_id', 'nguoi_tao'] });
  delete rest.var_phong_ban;
  delete rest.var_chuc_vu;
  delete rest.creator;
  return {
    ...rest,
    ten_phong_ban: phongBan?.ten_phong_ban,
    ten_chuc_vu: chucVu?.ten_chuc_vu,
    cap_bac: chucVu?.cap_bac ?? null,
    ten_nguoi_tao: creator?.ho_ten ?? null,
  } as Employee;
}
