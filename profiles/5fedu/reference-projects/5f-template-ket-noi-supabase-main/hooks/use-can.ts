import { useMemo } from 'react';
import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import { can, type AppAction, type AppResource } from '@/lib/permissions';

/** Gọi `can()` với subscribe matrix — tái render khi hydrate quyền chức vụ. */
export function useCan(action: AppAction, resource: AppResource): boolean {
  const user = useAuthStore((s) => s.user);
  const matrixActive = usePermissionGrantStore((s) => s.matrixActive);
  const grantsByModule = usePermissionGrantStore((s) => s.grantsByModule);
  const positionCapBac = usePermissionGrantStore((s) => s.positionCapBac);
  return useMemo(
    () => can(user, action, resource),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate when permission matrix hydrates
    [user, action, resource, matrixActive, grantsByModule, positionCapBac]
  );
}
