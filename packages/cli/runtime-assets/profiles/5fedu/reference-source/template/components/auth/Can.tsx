import React, { useMemo } from 'react';
import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import { can, type AppAction, type AppResource } from '@/lib/permissions';

export interface CanProps {
  action: AppAction;
  resource: AppResource;
  children: React.ReactNode;
  /** Hiển thị khi không đủ quyền (mặc định không render gì) */
  fallback?: React.ReactNode;
}

/**
 * Ẩn/hiện nhánh UI theo quyền — bọc nút hoặc khối hành động.
 *
 * @example
 * <Can action="delete" resource="employees">
 *   <Button variant="destructive">Xóa</Button>
 * </Can>
 */
export function Can({ action, resource, children, fallback = null }: CanProps) {
  const user = useAuthStore((s) => s.user);
  const matrixActive = usePermissionGrantStore((s) => s.matrixActive);
  const grantsByModule = usePermissionGrantStore((s) => s.grantsByModule);
  const allowed = useMemo(
    () => can(user, action, resource),
    // matrixActive + grantsByModule: can() đọc store bên trong — cần để re-compute khi hydrate quyền
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional subscription to permission store
    [user, action, resource, matrixActive, grantsByModule]
  );
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
