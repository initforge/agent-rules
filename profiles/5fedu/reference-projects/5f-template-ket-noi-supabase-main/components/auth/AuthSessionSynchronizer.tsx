import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabase } from '@/lib/data/config';
import { getAuthService } from '@/lib/supabase/auth';
import { syncAuthStoreFromSupabaseSession } from '@/lib/employee-auth/restore-session';
import { useAuthStore } from '@/store/useStore';
import { isPermissionMatrixEnabled } from '@/lib/permission-matrix-env';
import { positionPermissionGrantsQueryOptions } from '@/features/he-thong/phan-quyen/queries/permission-grants';
import { activePositionsQueryOptions } from '@/features/he-thong/queries/master-data';
import { queryKeys } from '@/lib/query-keys';
import { isActivePositionId } from '@/features/he-thong/chuc-vu/utils/is-active-position-id';

async function prefetchPermissionGrants(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!isPermissionMatrixEnabled() || !user) return;
  const chucVuKey = Array.isArray(user.id_chuc_vu) ? (user.id_chuc_vu[0] ?? '') : '';
  if (!chucVuKey) return;

  const activePositions = await queryClient.fetchQuery(activePositionsQueryOptions());
  if (!isActivePositionId(activePositions, chucVuKey)) return;

  void queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.all });
  void queryClient.prefetchQuery(positionPermissionGrantsQueryOptions(chucVuKey));
}

/** Keeps Zustand auth in sync with Supabase session (reload, token refresh, sign-out). */
export function AuthSessionSynchronizer(): null {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabase() || !hasHydrated) return;

    void syncAuthStoreFromSupabaseSession().then(() => {
      void prefetchPermissionGrants(queryClient);
    });

    const unsubscribe = getAuthService().onAuthStateChange((session) => {
      if (!session) {
        useAuthStore.getState().logout();
        return;
      }
      void syncAuthStoreFromSupabaseSession().then(() => {
        void prefetchPermissionGrants(queryClient);
      });
    });

    return unsubscribe;
  }, [hasHydrated, queryClient]);

  return null;
}
