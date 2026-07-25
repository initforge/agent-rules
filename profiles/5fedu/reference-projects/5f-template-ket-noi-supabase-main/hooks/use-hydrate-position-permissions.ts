import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import { isPermissionMatrixEnabled } from '@/lib/permission-matrix-env';
import { positionPermissionGrantsQueryOptions } from '@/features/he-thong/phan-quyen/queries/permission-grants';
import { activePositionsQueryOptions } from '@/features/he-thong/queries/master-data';
import { isActivePositionId } from '@/features/he-thong/chuc-vu/utils/is-active-position-id';

/**
 * Sau đăng nhập / đổi user: hydrate `grantsByModule` từ `var_phan_quyen` theo `id_chuc_vu[0]`.
 * Chỉ fetch grants khi chức vụ còn active — tránh hydrate matrix cho chức vụ đã ngừng HĐ.
 */
export function useHydratePositionPermissions(): void {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const matrixEnabled = isPermissionMatrixEnabled();

  const chucVuKey =
    user && Array.isArray(user.id_chuc_vu) ? (user.id_chuc_vu[0] ?? '') : '';

  const needsActiveCheck =
    hasHydrated && matrixEnabled && Boolean(user) && Boolean(chucVuKey);

  const activePositionsQuery = useQuery({
    ...activePositionsQueryOptions(),
    enabled: needsActiveCheck,
  });

  const isActivePosition =
    needsActiveCheck &&
    activePositionsQuery.isSuccess &&
    isActivePositionId(activePositionsQuery.data, chucVuKey);

  const shouldFetch = needsActiveCheck && isActivePosition;

  const grantsQuery = useQuery({
    ...positionPermissionGrantsQueryOptions(chucVuKey),
    enabled: shouldFetch,
  });

  useEffect(() => {
    if (!hasHydrated) return;

    if (
      !matrixEnabled ||
      !user ||
      !chucVuKey ||
      (needsActiveCheck && activePositionsQuery.isSuccess && !isActivePosition)
    ) {
      usePermissionGrantStore.getState().clearMatrix();
    }
  }, [
    hasHydrated,
    matrixEnabled,
    user,
    chucVuKey,
    needsActiveCheck,
    activePositionsQuery.isSuccess,
    isActivePosition,
  ]);

  useEffect(() => {
    if (!shouldFetch || !user) return;

    const uid = user.id;

    if (grantsQuery.isSuccess) {
      if (useAuthStore.getState().user?.id !== uid) return;
      const position = activePositionsQuery.data?.find(
        (p) => String(p.id) === String(chucVuKey)
      );
      usePermissionGrantStore
        .getState()
        .setMatrixGrants(grantsQuery.data, position?.cap_bac ?? null);
      return;
    }

    if (grantsQuery.isError) {
      if (useAuthStore.getState().user?.id !== uid) return;
      usePermissionGrantStore.getState().clearMatrix();
    }
  }, [
    shouldFetch,
    user,
    chucVuKey,
    grantsQuery.isSuccess,
    grantsQuery.isError,
    grantsQuery.data,
    activePositionsQuery.data,
  ]);
}
