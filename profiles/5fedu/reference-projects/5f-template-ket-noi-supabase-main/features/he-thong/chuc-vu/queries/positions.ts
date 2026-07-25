import { queryOptions } from '@tanstack/react-query';
import { queryKeys, POSITIONS_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { listQueryOptions } from '@/lib/supabase/query-config';
import {
  getPositionCount,
  getPositions,
  getPositionsPage,
} from '@/features/he-thong/chuc-vu/services/chuc-vu-service';

export function positionCountQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.positions.count,
    queryFn: getPositionCount,
    ...listQueryOptions,
  });
}

export function positionsPageQueryOptions(params: {
  limit: number;
  offset: number;
  orderBy: string;
  ascending: boolean;
}) {
  return queryOptions({
    queryKey: queryKeys.positions.page(params),
    queryFn: () => getPositionsPage(params),
    ...listQueryOptions,
  });
}

export function positionsClientListQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.positions.all,
    queryFn: () =>
      getPositions({
        limit: POSITIONS_LIST_QUERY_PARAMS.limit,
        offset: POSITIONS_LIST_QUERY_PARAMS.offset,
        orderBy: POSITIONS_LIST_QUERY_PARAMS.orderBy,
        ascending: POSITIONS_LIST_QUERY_PARAMS.ascending,
      }),
    ...listQueryOptions,
  });
}
