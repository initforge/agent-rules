import { loginNameToSupabaseEmail } from '@/lib/auth-email';
import type { EmployeeAuthAction } from '@/lib/employee-auth/constants';
import { normalizeLoginName } from '@/lib/validation/login-name';
import type { Employee } from '@/features/he-thong/nhan-vien/core/types';
import type { User } from '@/types';

export interface EmployeeAuthPayload {
  action: EmployeeAuthAction;
  employee_id: string;
  ten_dang_nhap?: string;
  password?: string;
  ho_ten?: string;
  phong_ban_id?: string | null;
  chuc_vu_id?: string | null;
  trang_thai?: string;
}

export interface EmployeeAuthResult {
  auth_user_id?: string;
  must_change_password?: boolean;
  tai_khoan_dang_hoat_dong?: boolean;
  ten_dang_nhap?: string;
}

/** Map Supabase Auth session + employee row → app User. */
export function buildAppUserFromSession(
  authUserId: string,
  authEmail: string,
  employee: Employee,
  meta?: Record<string, unknown>,
): User {
  return {
    id: authUserId,
    employee_id: employee.id,
    email: authEmail,
    ten_dang_nhap: employee.ten_dang_nhap ?? normalizeLoginName(authEmail),
    full_name: (meta?.full_name as string | undefined) ?? employee.ho_ten,
    avatar_url: employee.anh_dai_dien,
    role: 'user',
    created_at: employee.tg_tao ?? new Date().toISOString(),
    id_phong_ban: employee.phong_ban_id ?? undefined,
    id_chuc_vu: employee.chuc_vu_id ? [employee.chuc_vu_id] : undefined,
    must_change_password: employee.must_change_password ?? false,
    tai_khoan_dang_hoat_dong: employee.tai_khoan_dang_hoat_dong ?? true,
  };
}

export function buildAuthEmailPreview(tenDangNhap: string): string {
  return loginNameToSupabaseEmail(normalizeLoginName(tenDangNhap));
}

export function buildAuthUserMetadata(employee: Employee): Record<string, unknown> {
  return {
    employee_id: employee.id,
    full_name: employee.ho_ten,
    id_phong_ban: employee.phong_ban_id,
    id_chuc_vu: employee.chuc_vu_id ? [employee.chuc_vu_id] : [],
  };
}
