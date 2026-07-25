import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { listQueryOptions, masterDataQueryOptions } from '@/lib/supabase/query-config';
import {
  getRoleMatrixPositions,
  getRoles,
  getRolesForModule,
} from '@/features/he-thong/phan-quyen/services/phan-quyen-service';

export function roleMatrixPositionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.roles.matrixPositions,
    queryFn: getRoleMatrixPositions,
    ...masterDataQueryOptions,
  });
}

export function moduleRolePermissionsQueryOptions(moduleId: string) {
  return queryOptions({
    queryKey: queryKeys.roles.forModule(moduleId),
    queryFn: () => getRolesForModule(moduleId),
    enabled: Boolean(moduleId),
    ...listQueryOptions,
  });
}

/** Toàn bộ matrix — tránh dùng trên UI phân quyền (egress cao). */
export function rolesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.roles.all,
    queryFn: getRoles,
    ...masterDataQueryOptions,
  });
}
