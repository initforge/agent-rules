import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { authSensitiveQueryOptions } from '@/lib/supabase/query-config';
import { fetchPositionPermissionGrants } from '@/lib/fetch-position-permission-grants';

export function positionPermissionGrantsQueryOptions(positionId: string) {
  return queryOptions({
    queryKey: queryKeys.permissionGrants.byPosition(positionId),
    queryFn: () => fetchPositionPermissionGrants(positionId),
    enabled: Boolean(positionId),
    ...authSensitiveQueryOptions,
  });
}
