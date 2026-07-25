import { pickCoercedIds } from '@/lib/supabase/map-entity-row';
import type { Position } from './types';

export function mapPositionFromDb(row: Record<string, unknown>): Position {
  const phongBan = row.var_phong_ban as { ten_phong_ban?: string } | null | undefined;
  const creator = row.creator as { ho_ten?: string } | null | undefined;
  const rest = pickCoercedIds(row, { nullable: ['phong_ban_id', 'nguoi_tao'] });
  delete rest.var_phong_ban;
  delete rest.creator;
  return {
    ...rest,
    ten_phong_ban: phongBan?.ten_phong_ban,
    ten_nguoi_tao: creator?.ho_ten ?? null,
  } as Position;
}
