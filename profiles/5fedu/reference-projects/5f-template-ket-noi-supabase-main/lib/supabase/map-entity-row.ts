import { coerceEntityId, coerceNullableEntityId } from '@/lib/coerce-entity-id';

export { coerceEntityId, coerceNullableEntityId };

export interface PickCoercedIdsOptions {
  /** Required id column (defaults to `id`). */
  id?: string;
  /** Nullable FK columns coerced to string | null. */
  nullable?: readonly string[];
}

/**
 * Coerce bigint / mixed Supabase id columns on a raw PostgREST row.
 * Embed objects and other fields are left unchanged.
 */
export function pickCoercedIds(
  row: Record<string, unknown>,
  options: PickCoercedIdsOptions = {},
): Record<string, unknown> {
  const idKey = options.id ?? 'id';
  const nullableKeys = options.nullable ?? [];

  const out: Record<string, unknown> = { ...row };
  if (idKey in row) {
    out[idKey] = coerceEntityId(row[idKey] as string | number | null | undefined);
  }
  for (const key of nullableKeys) {
    if (key in row) {
      out[key] = coerceNullableEntityId(row[key] as string | number | null | undefined);
    }
  }
  return out;
}

/** Parse domain string ids to numbers for PostgREST `.in()` / insert on bigint FK columns. */
export function parseEntityIdsForDb(ids: string[]): number[] {
  return ids
    .map((id) => Number(id))
    .filter((id) => !Number.isNaN(id));
}
