import { loginNameToSupabaseEmail } from '@/lib/auth-email';
import { normalizeLoginName } from '@/lib/validation/login-name';
import { buildAppUserFromSession } from '@/lib/employee-auth/session';
import {
  validateEmployeeCanLogin,
  verifyMockPassword,
} from '@/lib/employee-auth/employee-auth-service';
import { checkLoginUsernameStatus } from '@/lib/employee-auth/check-login-username';
import {
  loginEmployeeNotLinkedMessage,
  loginWrongPasswordMessage,
  mapLoginUsernameStatus,
  mapSupabaseAuthError,
} from '@/lib/employee-auth/login-errors';
import { getAuthService } from '@/lib/supabase/auth';
import { isSupabase } from '@/lib/data/config';
import {
  getEmployeeByAuthEmail,
  getEmployeeByLoginName,
} from '@/features/he-thong/nhan-vien/services/nhan-vien-service';
import type { User } from '@/types';

const MOCK_AUTH_PREFIX = 'auth-';

export interface LoginWithUsernameInput {
  username: string;
  password: string;
}

export type LoginWithUsernameResult =
  | { ok: true; user: User; mustChangePassword: boolean }
  | { ok: false; error: string };

async function resolvePreLoginBlockReason(username: string): Promise<string | null> {
  const status = await checkLoginUsernameStatus(username);
  if (status === 'ok') return null;
  return mapLoginUsernameStatus(status);
}

/** Đăng nhập bằng tên đăng nhập + mật khẩu (mock hoặc Supabase). */
export async function loginWithUsername(
  input: LoginWithUsernameInput,
): Promise<LoginWithUsernameResult> {
  const username = normalizeLoginName(input.username);
  const authEmail = loginNameToSupabaseEmail(username);

  const preLoginBlock = await resolvePreLoginBlockReason(username);
  if (preLoginBlock) {
    return { ok: false, error: preLoginBlock };
  }

  if (!isSupabase()) {
    const employee = await getEmployeeByLoginName(username);
    if (!employee) {
      return { ok: false, error: mapLoginUsernameStatus('not_found') };
    }
    const blockReason = validateEmployeeCanLogin(employee);
    if (blockReason) return { ok: false, error: blockReason };
    if (!verifyMockPassword(username, input.password)) {
      return { ok: false, error: loginWrongPasswordMessage() };
    }

    const authUserId = `${MOCK_AUTH_PREFIX}${employee.id}`;
    const user: User = {
      id: authUserId,
      employee_id: employee.id,
      email: authEmail,
      ten_dang_nhap: employee.ten_dang_nhap ?? username,
      full_name: employee.ho_ten,
      avatar_url: employee.anh_dai_dien,
      role: 'user',
      created_at: employee.tg_tao ?? new Date().toISOString(),
      id_phong_ban: employee.phong_ban_id ?? undefined,
      id_chuc_vu: employee.chuc_vu_id ? [employee.chuc_vu_id] : undefined,
      must_change_password: employee.must_change_password ?? false,
      tai_khoan_dang_hoat_dong: employee.tai_khoan_dang_hoat_dong ?? true,
    };

    return {
      ok: true,
      user,
      mustChangePassword: user.must_change_password ?? false,
    };
  }

  const authResult = await getAuthService().signIn({
    email: authEmail,
    password: input.password,
  });

  if ('error' in authResult && authResult.error) {
    const raw = authResult.error;
    const lower = raw.toLowerCase();
    if (
      lower.includes('invalid login credentials') ||
      lower.includes('invalid email or password')
    ) {
      return { ok: false, error: loginWrongPasswordMessage() };
    }
    return { ok: false, error: mapSupabaseAuthError(raw) };
  }

  const authUser = authResult.user;
  const employee = await getEmployeeByAuthEmail(authUser.email ?? authEmail);
  if (!employee) {
    return { ok: false, error: loginEmployeeNotLinkedMessage() };
  }

  const blockReason = validateEmployeeCanLogin(employee);
  if (blockReason) return { ok: false, error: blockReason };

  const user = buildAppUserFromSession(authUser.id, authEmail, employee, {
    full_name: authUser.full_name,
  });

  return {
    ok: true,
    user,
    mustChangePassword: employee.must_change_password ?? false,
  };
}
