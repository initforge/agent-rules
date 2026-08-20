import { pickCoercedIds } from '@/lib/supabase/map-entity-row';
import type { Department } from './types';

export function mapDepartmentFromDb(row: Record<string, unknown>): Department {
  const creator = row.creator as { ho_ten?: string } | null | undefined;
  const rest = pickCoercedIds(row, { nullable: ['cha_id', 'nguoi_tao'] });
  delete rest.creator;
  return {
    ...rest,
    ten_nguoi_tao: creator?.ho_ten ?? null,
  } as Department;
}
