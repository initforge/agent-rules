/**
 * Supabase Auth yêu cầu email. Người dùng chỉ nhập "tên đăng nhập" (local part);
 * chuỗi gửi lên Auth = local + hậu tố cố định.
 */
import { normalizeLoginName } from '@/lib/validation/login-name';

export const SUPABASE_AUTH_EMAIL_SUFFIX =
  (import.meta.env.VITE_AUTH_EMAIL_SUFFIX as string | undefined)?.trim() || '@gmail.com';

/**
 * Chuyển tên đăng nhập thành email dùng cho `signInWithPassword` / `signUp`.
 * Nếu người dùng dán cả địa chỉ, chỉ lấy phần trước @ rồi gắn hậu tố.
 */
export function loginNameToSupabaseEmail(loginName: string): string {
  const t = loginName.trim();
  if (!t) return t;
  const local = t.includes('@') ? t.split('@')[0]!.trim() : t;
  return `${local}${SUPABASE_AUTH_EMAIL_SUFFIX}`;
}

/** Lấy ten_dang_nhap từ email Auth (local part, chuẩn hóa). */
export function authEmailToLoginName(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  return normalizeLoginName(local);
}
