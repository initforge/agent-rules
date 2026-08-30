import type { User } from '@/types';
import type { ActionType } from '@/features/he-thong/phan-quyen/core/types';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';

/**
 * Hành động gắn với UI (nút, route) — mở rộng theo nghiệp vụ.
 * Khi có policy server-side, vẫn phải kiểm tra lại API.
 */
export type AppAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import';

/**
 * Tài nguyên (module) — thêm khi có module mới.
 */
export type AppResource =
  | 'employees'
  | 'departments'
  | 'positions'
  | 'company'
  | 'permissions'
  | 'profile'
  | 'notifications'
  | '*';

export interface RecordPermissionContext {
  nguoi_tao?: string | null;
}

/**
 * Ánh xạ `AppResource` → `module_id` trong Phân quyền (vd. `he-thong/nhan-vien`).
 * Không có trong map → `can()` dùng luật legacy (profile, notifications, *).
 */
export const APP_RESOURCE_TO_MODULE: Partial<Record<AppResource, string>> = {
  employees: 'he-thong/nhan-vien',
  departments: 'he-thong/phong-ban',
  positions: 'he-thong/chuc-vu',
  company: 'he-thong/thong-tin-cong-ty',
  permissions: 'he-thong/phan-quyen',
};

/** UI dùng `edit`; ma trận phân quyền dùng `update`. */
export function mapAppActionToActionType(action: AppAction): ActionType {
  if (action === 'edit') return 'update';
  return action as ActionType;
}

/** cap_bac = 1 trên chức vụ đăng nhập → full CRUD mọi module (khi matrix đã hydrate). */
export function isGlobalPermissionSuperUser(): boolean {
  const { matrixActive, positionCapBac } = usePermissionGrantStore.getState();
  if (!matrixActive) return false;
  return positionCapBac === 1;
}

/** Quản trị module (`admin` / `all` trong ma trận). */
export function isModulePermissionAdmin(moduleId: string): boolean {
  const { grantsByModule } = usePermissionGrantStore.getState();
  const allowed = grantsByModule[moduleId] ?? [];
  return allowed.includes('admin') || allowed.includes('all');
}

function isRecordCreator(user: User, ctx?: RecordPermissionContext): boolean {
  if (!ctx?.nguoi_tao || !user.employee_id) return false;
  return String(ctx.nguoi_tao) === String(user.employee_id);
}

function resolveModuleId(resource: AppResource): string | undefined {
  return APP_RESOURCE_TO_MODULE[resource];
}

function matrixHasAction(moduleId: string, need: ActionType): boolean {
  const { grantsByModule } = usePermissionGrantStore.getState();
  const allowed = grantsByModule[moduleId] ?? [];
  if (allowed.includes('all') || allowed.includes('admin')) return true;
  return allowed.includes(need);
}

/**
 * Luật member (chưa hydrate matrix từ API chức vụ).
 */
function legacyCan(user: User, action: AppAction, resource: AppResource): boolean {
  void user;
  if (action === 'view') return true;
  if (resource === 'profile' && (action === 'edit' || action === 'view')) return true;
  if (resource === 'notifications' && action === 'view') return true;
  return false;
}

function matrixCan(user: User, action: AppAction, resource: AppResource): boolean {
  void user;
  const moduleId = resolveModuleId(resource);
  if (moduleId === undefined) {
    return legacyCan(user, action, resource);
  }

  if (isGlobalPermissionSuperUser()) return true;
  if (isModulePermissionAdmin(moduleId)) return true;

  const need = mapAppActionToActionType(action);
  return matrixHasAction(moduleId, need);
}

/**
 * Kiểm tra quyền phía client (UX: ẩn nút). Không thay thế RLS / API.
 */
export function can(
  user: User | null | undefined,
  action: AppAction,
  resource: AppResource
): boolean {
  if (!user) return false;

  const { matrixActive } = usePermissionGrantStore.getState();
  if (matrixActive) {
    return matrixCan(user, action, resource);
  }

  return legacyCan(user, action, resource);
}

/**
 * Vào module (card dashboard / route): cần xem, thêm, sửa, quản trị module, hoặc super cap_bac=1.
 */
export function canAccessModule(
  user: User | null | undefined,
  resource: AppResource
): boolean {
  if (!user) return false;
  if (isGlobalPermissionSuperUser()) return true;

  const moduleId = resolveModuleId(resource);
  if (moduleId && isModulePermissionAdmin(moduleId)) return true;

  return (
    can(user, 'view', resource) ||
    can(user, 'create', resource) ||
    can(user, 'edit', resource)
  );
}

/**
 * Quyền theo dòng — bổ sung creator xem/sửa; xóa không bypass theo creator.
 */
export function canOnRecord(
  user: User | null | undefined,
  action: AppAction,
  resource: AppResource,
  ctx?: RecordPermissionContext
): boolean {
  if (!user) return false;

  if (action === 'delete') {
    return can(user, 'delete', resource);
  }

  if (can(user, action, resource)) return true;

  if (action === 'view' || action === 'edit') {
    return isRecordCreator(user, ctx);
  }

  return false;
}
