import { useMemo } from 'react';
import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import {
  canOnRecord,
  type AppAction,
  type AppResource,
  type RecordPermissionContext,
} from '@/lib/permissions';

/** `canOnRecord()` với subscribe matrix + cap_bac. */
export function useCanOnRecord(
  action: AppAction,
  resource: AppResource,
  ctx?: RecordPermissionContext
): boolean {
  const user = useAuthStore((s) => s.user);
  const matrixActive = usePermissionGrantStore((s) => s.matrixActive);
  const grantsByModule = usePermissionGrantStore((s) => s.grantsByModule);
  const positionCapBac = usePermissionGrantStore((s) => s.positionCapBac);
  const nguoiTao = ctx?.nguoi_tao;

  return useMemo(
    () => canOnRecord(user, action, resource, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate when permission matrix hydrates
    [user, action, resource, nguoiTao, matrixActive, grantsByModule, positionCapBac]
  );
}
