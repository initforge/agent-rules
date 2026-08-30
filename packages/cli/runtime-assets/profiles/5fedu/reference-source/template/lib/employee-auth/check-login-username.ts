import { shouldDisableAuthForStatus } from '@/lib/employee-auth/constants';
import type { LoginUsernameStatus } from '@/lib/employee-auth/login-errors';
import { isSupabase } from '@/lib/data/config';
import { getSupabase } from '@/lib/supabase/client';
import { normalizeLoginName } from '@/lib/validation/login-name';
import type { Employee } from '@/features/he-thong/nhan-vien/core/types';
import { getEmployeeByLoginName } from '@/features/he-thong/nhan-vien/services/nhan-vien-service';

function parseLoginUsernameStatus(raw: unknown): LoginUsernameStatus {
  const value = String(raw ?? '').trim();
  if (value === 'inactive' || value === 'resigned' || value === 'ok') {
    return value;
  }
  return 'not_found';
}

export function resolveLoginUsernameStatusFromEmployee(
  employee: Employee | null | undefined,
): LoginUsernameStatus {
  if (!employee) return 'not_found';
  if (employee.tai_khoan_dang_hoat_dong === false) return 'inactive';
  if (shouldDisableAuthForStatus(employee.trang_thai)) return 'resigned';
  return 'ok';
}

/** Pre-login username check — mock uses employee service; Supabase uses SECURITY DEFINER RPC. */
export async function checkLoginUsernameStatus(
  loginName: string,
): Promise<LoginUsernameStatus> {
  const normalized = normalizeLoginName(loginName);
  if (!normalized) return 'not_found';

  if (!isSupabase()) {
    const employee = await getEmployeeByLoginName(normalized);
    return resolveLoginUsernameStatusFromEmployee(employee);
  }

  const supabase = getSupabase();
  if (!supabase) return 'not_found';

  const { data, error } = await supabase.rpc('check_login_username', {
    p_login_name: normalized,
  });
  if (error) return 'not_found';
  return parseLoginUsernameStatus(data);
}
