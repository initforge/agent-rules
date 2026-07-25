/** Bật ma trận quyền theo chức vụ (hydrate từ `var_phan_quyen`). Opt-out: `VITE_USE_PERMISSION_MATRIX=false`. */
export function isPermissionMatrixEnabled(): boolean {
  return import.meta.env.VITE_USE_PERMISSION_MATRIX !== 'false';
}
