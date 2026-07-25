/** @deprecated Auth role is not used for authorization — permissions come from `var_phan_quyen`. */
export const ADMIN_POSITION_IDS = ['pos-1', '1'] as const;

/** @deprecated See ADMIN_POSITION_IDS. */
export const ADMIN_POSITION_MA =
  (import.meta.env.VITE_ADMIN_POSITION_MA as string | undefined)?.trim().toUpperCase() || 'CEO';

export type EmployeeAuthAction =
  | 'create'
  | 'change_login'
  | 'reset_password'
  | 'sync_metadata'
  | 'disable'
  | 'enable';

/** @deprecated Do not use for authorization. Kept for backward compatibility in edge/shared helpers. */
export function resolveAppRole(
  chucVuId: string | null | undefined,
  maChucVu?: string | null | undefined,
): 'admin' | 'user' {
  if (chucVuId && (ADMIN_POSITION_IDS as readonly string[]).includes(chucVuId)) {
    return 'admin';
  }
  if (maChucVu && maChucVu.trim().toUpperCase() === ADMIN_POSITION_MA) {
    return 'admin';
  }
  return 'user';
}

/** Trạng thái nhân viên không được đăng nhập. */
export const INACTIVE_EMPLOYEE_STATUSES = ['Nghỉ việc'] as const;

export function shouldDisableAuthForStatus(trangThai: string): boolean {
  return (INACTIVE_EMPLOYEE_STATUSES as readonly string[]).includes(trangThai);
}
