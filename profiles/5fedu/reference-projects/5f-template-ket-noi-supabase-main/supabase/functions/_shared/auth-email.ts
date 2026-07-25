/** Shared auth email helper for Edge Functions (Deno). Keep in sync with lib/auth-email.ts and lib/employee-auth/constants.ts */
export const SUPABASE_AUTH_EMAIL_SUFFIX = Deno.env.get('AUTH_EMAIL_SUFFIX') ?? '@gmail.com';

export function normalizeLoginName(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return t;
  return t.includes('@') ? t.split('@')[0]!.trim() : t;
}

export function loginNameToSupabaseEmail(loginName: string): string {
  const local = normalizeLoginName(loginName);
  if (!local) return local;
  return `${local}${SUPABASE_AUTH_EMAIL_SUFFIX}`;
}

export const ADMIN_POSITION_IDS = ['pos-1', '1'];

export const ADMIN_POSITION_MA =
  (Deno.env.get('ADMIN_POSITION_MA') ?? 'CEO').trim().toUpperCase();

export function resolveAppRole(
  chucVuId: string | null | undefined,
  maChucVu?: string | null | undefined,
): 'admin' | 'user' {
  if (chucVuId && ADMIN_POSITION_IDS.includes(chucVuId)) return 'admin';
  if (maChucVu && maChucVu.trim().toUpperCase() === ADMIN_POSITION_MA) return 'admin';
  return 'user';
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
