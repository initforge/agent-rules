/**
 * Normalize Supabase / PostgREST errors for consistent app handling.
 * Use in SupabaseRepository and any direct Supabase calls.
 */

export interface NormalizedSupabaseError {
  message: string;
  code?: string;
  /** True for network/timeout errors where retry may help */
  retryable?: boolean;
}

/**
 * PostgrestError shape: { code, details, hint, message }
 * Auth errors may have different shape; we handle both.
 */
function isPostgrestError(err: unknown): err is { code?: string; message: string; details?: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}

/** PostgreSQL error codes that are often retryable (e.g. connection) */
const RETRYABLE_CODES = new Set([
  '08000', '08003', '08006', '08001', '08004', '08007', '08P01', '08P02', '08P03',
  'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003',
]);

export function handleSupabaseError(error: unknown): never {
  if (!isPostgrestError(error)) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(msg || 'Supabase request failed');
  }

  const code = error.code ?? '';
  const message = error.message || 'Lỗi kết nối dữ liệu';
  const retryable = RETRYABLE_CODES.has(code) || /timeout|network|ECONNREFUSED|ETIMEDOUT/i.test(message);

  const normalized: NormalizedSupabaseError = { message, code: code || undefined, retryable };
  throw new Error(normalized.message);
}

/**
 * Use in try/catch when you want to get a normalized error without throwing:
 * try { ... } catch (e) { const err = normalizeSupabaseError(e); toast(err.message); }
 */
export function normalizeSupabaseError(error: unknown): NormalizedSupabaseError {
  if (isPostgrestError(error)) {
    const code = error.code ?? '';
    const message = error.message || 'Lỗi kết nối dữ liệu';
    const retryable = RETRYABLE_CODES.has(code) || /timeout|network|ECONNREFUSED|ETIMEDOUT/i.test(message);
    return { message, code: code || undefined, retryable };
  }
  const msg = error instanceof Error ? error.message : String(error);
  return { message: msg || 'Lỗi không xác định' };
}
