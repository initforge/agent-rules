import { getSupabase } from '@/lib/supabase/client';
import { isMock } from '@/lib/data/config';
import { loginNameToSupabaseEmail } from '@/lib/auth-email';
import {
  buildAuthUserMetadata,
  type EmployeeAuthPayload,
  type EmployeeAuthResult,
} from '@/lib/employee-auth/session';
import { resolveAppRole, shouldDisableAuthForStatus } from '@/lib/employee-auth/constants';
import { normalizeLoginName } from '@/lib/validation/login-name';
import { txt } from '@/lib/text';
import type { Employee } from '@/features/he-thong/nhan-vien/core/types';
import { getErrorMessage } from '@/lib/utils';

/** Mock-only: lưu mật khẩu tạm theo ten_dang_nhap (dev/demo). */
const mockPasswords = new Map<string, string>();

const MOCK_AUTH_PREFIX = 'auth-';

function mockAuthUserId(employeeId: string): string {
  return `${MOCK_AUTH_PREFIX}${employeeId}`;
}

export function setMockPassword(loginName: string, password: string): void {
  mockPasswords.set(normalizeLoginName(loginName), password);
}

export function verifyMockPassword(loginName: string, password: string): boolean {
  const key = normalizeLoginName(loginName);
  const stored = mockPasswords.get(key);
  if (stored !== undefined) return stored === password;
  if (key === 'admin' && password.length >= 6) return true;
  return password.length >= 6;
}

function mapEmployeeAuthError(raw: string): string {
  const message = raw.trim();
  if (message === 'LOGIN_NAME_TAKEN' || message.includes('LOGIN_NAME_TAKEN')) {
    return txt('employee.validation.loginNameDuplicate');
  }
  if (message.includes('Auth email already registered')) {
    return txt('employee.validation.loginNameDuplicate');
  }
  return message;
}

export async function invokeEmployeeAuth(
  payload: EmployeeAuthPayload,
): Promise<EmployeeAuthResult> {
  if (isMock()) {
    return mockEmployeeAuth(payload);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase chưa được cấu hình');
  }

  const { data, error } = await supabase.functions.invoke('employee-auth', {
    body: payload,
  });

  if (error) {
    throw new Error(mapEmployeeAuthError(error.message));
  }

  const result = data as EmployeeAuthResult | { error?: string };
  if (result && 'error' in result && result.error) {
    throw new Error(mapEmployeeAuthError(String(result.error)));
  }

  return result as EmployeeAuthResult;
}

async function mockEmployeeAuth(payload: EmployeeAuthPayload): Promise<EmployeeAuthResult> {
  await new Promise((r) => setTimeout(r, 300));
  const authUserId = mockAuthUserId(payload.employee_id);

  switch (payload.action) {
    case 'create': {
      if (!payload.ten_dang_nhap || !payload.password) {
        throw new Error('Thiếu tên đăng nhập hoặc mật khẩu');
      }
      setMockPassword(payload.ten_dang_nhap, payload.password);
      return {
        auth_user_id: authUserId,
        must_change_password: true,
        tai_khoan_dang_hoat_dong: true,
      };
    }
    case 'change_login': {
      if (!payload.ten_dang_nhap || !payload.password) {
        throw new Error('Thiếu tên đăng nhập mới hoặc mật khẩu');
      }
      const newLogin = normalizeLoginName(payload.ten_dang_nhap);
      setMockPassword(newLogin, payload.password);
      return {
        auth_user_id: authUserId,
        must_change_password: true,
        tai_khoan_dang_hoat_dong: true,
        ten_dang_nhap: newLogin,
      };
    }
    case 'reset_password': {
      if (!payload.ten_dang_nhap || !payload.password) {
        throw new Error('Thiếu mật khẩu mới');
      }
      setMockPassword(payload.ten_dang_nhap, payload.password);
      return { auth_user_id: authUserId, must_change_password: true };
    }
    case 'sync_metadata':
      return { auth_user_id: authUserId };
    case 'disable':
      return { auth_user_id: authUserId, tai_khoan_dang_hoat_dong: false };
    case 'enable':
      return { auth_user_id: authUserId, tai_khoan_dang_hoat_dong: true };
    default:
      throw new Error('Hành động auth không hợp lệ');
  }
}

export async function provisionEmployeeAuthAccount(
  employee: Employee,
  tenDangNhap: string,
  password: string,
): Promise<EmployeeAuthResult> {
  return invokeEmployeeAuth({
    action: 'create',
    employee_id: employee.id,
    ten_dang_nhap: normalizeLoginName(tenDangNhap),
    password,
    ho_ten: employee.ho_ten,
    phong_ban_id: employee.phong_ban_id,
    chuc_vu_id: employee.chuc_vu_id,
    trang_thai: employee.trang_thai,
  });
}

export async function resetEmployeeAuthPassword(
  employee: Employee,
  password: string,
): Promise<EmployeeAuthResult> {
  if (!employee.ten_dang_nhap) {
    throw new Error('Nhân viên chưa có tên đăng nhập');
  }
  return invokeEmployeeAuth({
    action: 'reset_password',
    employee_id: employee.id,
    ten_dang_nhap: employee.ten_dang_nhap,
    password,
  });
}

export async function changeEmployeeLoginName(
  employee: Employee,
  newTenDangNhap: string,
  password: string,
): Promise<EmployeeAuthResult> {
  if (!employee.ten_dang_nhap) {
    throw new Error('Nhân viên chưa có tài khoản đăng nhập');
  }
  const newLogin = normalizeLoginName(newTenDangNhap);
  if (normalizeLoginName(employee.ten_dang_nhap) === newLogin) {
    throw new Error('Tên đăng nhập mới phải khác tên hiện tại');
  }
  return invokeEmployeeAuth({
    action: 'change_login',
    employee_id: employee.id,
    ten_dang_nhap: newLogin,
    password,
    ho_ten: employee.ho_ten,
    phong_ban_id: employee.phong_ban_id,
    chuc_vu_id: employee.chuc_vu_id,
    trang_thai: employee.trang_thai,
  });
}

export async function syncEmployeeAuthMetadata(employee: Employee): Promise<void> {
  if (!employee.ten_dang_nhap) return;
  await invokeEmployeeAuth({
    action: 'sync_metadata',
    employee_id: employee.id,
    ho_ten: employee.ho_ten,
    phong_ban_id: employee.phong_ban_id,
    chuc_vu_id: employee.chuc_vu_id,
    trang_thai: employee.trang_thai,
  });
}

export async function setEmployeeAuthActive(
  employee: Employee,
  active: boolean,
): Promise<void> {
  if (!employee.ten_dang_nhap) return;
  await invokeEmployeeAuth({
    action: active ? 'enable' : 'disable',
    employee_id: employee.id,
    trang_thai: employee.trang_thai,
  });
}

export async function clearMustChangePasswordFlag(): Promise<void> {
  if (isMock()) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc('clear_must_change_password');
  if (error) throw new Error(error.message);
}

export function validateEmployeeCanLogin(employee: Employee): string | null {
  if (!employee.tai_khoan_dang_hoat_dong && employee.tai_khoan_dang_hoat_dong !== undefined) {
    return txt('page.login.accountDisabled');
  }
  if (shouldDisableAuthForStatus(employee.trang_thai)) {
    return txt('page.login.employeeResigned');
  }
  if (!employee.ten_dang_nhap && !isMock()) {
    return txt('page.login.noAuthAccount');
  }
  return null;
}

export { buildAuthUserMetadata, loginNameToSupabaseEmail, resolveAppRole, getErrorMessage };

/** Mock demo: admin / 123456 */
setMockPassword('admin', '123456');
