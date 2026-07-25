import { useMemo } from 'react';
import { canAccessModule, type AppResource } from '@/lib/permissions';
import { useCan } from '@/hooks/use-can';
import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';

/** Gom `useCan` theo resource — tái render khi hydrate matrix. */
export function useResourcePermissions(resource: AppResource) {
  const canView = useCan('view', resource);
  const canCreate = useCan('create', resource);
  const canEdit = useCan('edit', resource);
  const canDelete = useCan('delete', resource);
  const canExport = useCan('export', resource);
  const canImport = useCan('import', resource);
  const matrixActive = usePermissionGrantStore((s) => s.matrixActive);
  const positionCapBac = usePermissionGrantStore((s) => s.positionCapBac);
  const user = useAuthStore((s) => s.user);
  const canAccess = useMemo(
    () => canAccessModule(user, resource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, resource, matrixActive, positionCapBac, canView, canCreate]
  );
  return useMemo(
    () => ({
      canView,
      canCreate,
      canEdit,
      canDelete,
      canExport,
      canImport,
      canAccessModule: canAccess,
    }),
    [canView, canCreate, canEdit, canDelete, canExport, canImport, canAccess]
  );
}
