import { coerceEntityId, pickCoercedIds } from '@/lib/supabase/map-entity-row';
import type { VarPhanQuyenRow } from './types';

export function mapVarPhanQuyenFromDb(row: Record<string, unknown>): VarPhanQuyenRow {
  const rest = pickCoercedIds(row);
  return {
    ...rest,
    chuc_vu_id: coerceEntityId(row.chuc_vu_id as string | number),
  } as VarPhanQuyenRow;
}

/** Outbound: domain string FK → bigint column for PostgREST insert/filter. */
export function chucVuIdToDb(chucVuId: string): number {
  const numeric = Number(chucVuId);
  if (Number.isNaN(numeric)) {
    throw new Error(`Invalid chuc_vu_id for database: ${chucVuId}`);
  }
  return numeric;
}

export function chucVuIdsToDb(ids: string[]): number[] {
  return ids.map(chucVuIdToDb);
}
