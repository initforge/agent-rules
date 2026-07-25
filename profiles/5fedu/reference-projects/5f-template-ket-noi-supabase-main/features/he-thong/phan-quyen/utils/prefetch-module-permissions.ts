import type { QueryClient } from '@tanstack/react-query';
import { moduleRolePermissionsQueryOptions } from '@/features/he-thong/phan-quyen/queries/roles';

export function prefetchModuleRolePermissions(
  queryClient: QueryClient,
  moduleId: string,
): void {
  if (!moduleId) return;
  void queryClient.prefetchQuery(moduleRolePermissionsQueryOptions(moduleId));
}

export function prefetchAdjacentModuleRolePermissions(
  queryClient: QueryClient,
  moduleId: string,
  orderedModuleIds: readonly string[],
): void {
  const idx = orderedModuleIds.indexOf(moduleId);
  if (idx === -1) return;
  if (idx > 0) {
    prefetchModuleRolePermissions(queryClient, orderedModuleIds[idx - 1]!);
  }
  if (idx < orderedModuleIds.length - 1) {
    prefetchModuleRolePermissions(queryClient, orderedModuleIds[idx + 1]!);
  }
}
