/** Supabase bigint FK/id có thể trả về number — chuẩn hóa sang string cho form/Zod. */
export function coerceEntityId(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  return String(value);
}

export function coerceNullableEntityId(
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === '') return null;
  return String(value);
}
