import { loginNameToSupabaseEmail } from '@/lib/auth-email';
import { isMock, isSupabase } from '@/lib/data/config';
import { getSupabase } from '@/lib/supabase/client';
import { normalizeLoginName } from '@/lib/validation/login-name';
import {
  clearMustChangePasswordFlag,
  setMockPassword,
  verifyMockPassword,
} from '@/lib/employee-auth/employee-auth-service';
import { mapSupabaseAuthError, loginSupabaseNotConfiguredMessage } from '@/lib/employee-auth/login-errors';
import { txt } from '@/lib/text';

export type ChangePasswordInput = {
  loginName: string;
  currentPassword: string;
  newPassword: string;
  /** Auth email; defaults to loginNameToSupabaseEmail(loginName). */
  authEmail?: string;
};

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/** Voluntary change: verify current password, then set new password. */
export async function changePassword(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const loginName = normalizeLoginName(input.loginName);
  if (!loginName) {
    return { ok: false, error: txt('page.profile.noLoginName') };
  }

  const authEmail = input.authEmail?.trim() || loginNameToSupabaseEmail(loginName);

  if (isMock()) {
    if (!verifyMockPassword(loginName, input.currentPassword)) {
      return { ok: false, error: txt('page.profile.wrongCurrentPassword') };
    }
    setMockPassword(loginName, input.newPassword);
    return { ok: true };
  }

  if (!isSupabase()) {
    return { ok: false, error: txt('page.profile.dataSourceUnsupported') };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: loginSupabaseNotConfiguredMessage() };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: input.currentPassword,
  });
  if (signInError) {
    return { ok: false, error: txt('page.profile.wrongCurrentPassword') };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (updateError) {
    return { ok: false, error: mapSupabaseAuthError(updateError.message) };
  }

  try {
    await clearMustChangePasswordFlag();
  } catch {
    // Flag may already be false — password change still succeeded.
  }

  return { ok: true };
}

/** First-login / HR reset: set new password without verifying the old one. */
export async function setNewPasswordWithoutCurrent(
  newPassword: string,
  loginName?: string,
): Promise<ChangePasswordResult> {
  if (isMock()) {
    const name = loginName ? normalizeLoginName(loginName) : '';
    if (name) setMockPassword(name, newPassword);
    return { ok: true };
  }

  if (!isSupabase()) {
    return { ok: false, error: txt('page.profile.dataSourceUnsupported') };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: loginSupabaseNotConfiguredMessage() };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  try {
    await clearMustChangePasswordFlag();
  } catch {
    // non-fatal
  }

  return { ok: true };
}

/** Resolve auth email from session user fields. */
export function resolveUserAuthEmail(user: {
  email?: string | null;
  ten_dang_nhap?: string | null;
}): string {
  if (user.ten_dang_nhap?.trim()) {
    return loginNameToSupabaseEmail(user.ten_dang_nhap);
  }
  return user.email?.trim() ?? '';
}

export function resolveUserLoginName(user: {
  email?: string | null;
  ten_dang_nhap?: string | null;
}): string {
  if (user.ten_dang_nhap?.trim()) {
    return normalizeLoginName(user.ten_dang_nhap);
  }
  const email = user.email?.trim() ?? '';
  if (!email) return '';
  return normalizeLoginName(email.split('@')[0] ?? '');
}
