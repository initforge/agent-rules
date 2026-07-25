import { create } from 'zustand';
import type { ActionType } from '@/features/he-thong/phan-quyen/core/types';

/**
 * Quyền theo module (khớp `module_id` trong Phân quyền, ví dụ `he-thong/nhan-vien`).
 * Khi `matrixActive === false`, `can()` dùng luật legacy (view + profile/notifications).
 * Khi `matrixActive === true`, `can()` đối chiếu `grantsByModule` — hydrate sau khi gọi API theo `id_chuc_vu`.
 */
export interface PermissionGrantState {
  matrixActive: boolean;
  grantsByModule: Record<string, ActionType[]>;
  /** Cấp bậc chức vụ đăng nhập — cap_bac=1 → super user toàn hệ thống. */
  positionCapBac: number | null;
  /** Bật matrix + gán quyền (gọi từ service sau khi load chức vụ / phân quyền). */
  setMatrixGrants: (grants: Record<string, ActionType[]>, positionCapBac?: number | null) => void;
  /** Đăng xuất hoặc trước khi đăng nhập lại — tắt matrix, xóa grants. */
  clearMatrix: () => void;
}

export const usePermissionGrantStore = create<PermissionGrantState>((set) => ({
  matrixActive: false,
  grantsByModule: {},
  positionCapBac: null,
  setMatrixGrants: (grants, positionCapBac = null) =>
    set({ matrixActive: true, grantsByModule: grants, positionCapBac }),
  clearMatrix: () => set({ matrixActive: false, grantsByModule: {}, positionCapBac: null }),
}));
