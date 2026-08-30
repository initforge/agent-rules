import { queryOptions } from '@tanstack/react-query';
import { queryKeys, DEPARTMENTS_LIST_QUERY_PARAMS, POSITIONS_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { masterDataQueryOptions } from '@/lib/supabase/query-config';
import { getDepartments } from '@/features/he-thong/phong-ban/services/phong-ban-service';
import {
  getActivePositions,
  getPositions,
} from '@/features/he-thong/chuc-vu/services/chuc-vu-service';
import { getBranches } from '@/features/he-thong/chi-nhanh/services/chi-nhanh-service';
import { getJobLevels } from '@/features/he-thong/cap-bac/services/cap-bac-service';

export function departmentsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.departments.all,
    queryFn: () =>
      getDepartments({
        limit: DEPARTMENTS_LIST_QUERY_PARAMS.limit,
        offset: DEPARTMENTS_LIST_QUERY_PARAMS.offset,
        orderBy: DEPARTMENTS_LIST_QUERY_PARAMS.orderBy,
        ascending: DEPARTMENTS_LIST_QUERY_PARAMS.ascending,
      }),
    ...masterDataQueryOptions,
  });
}

export function positionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.positions.all,
    queryFn: () =>
      getPositions({
        limit: POSITIONS_LIST_QUERY_PARAMS.limit,
        offset: POSITIONS_LIST_QUERY_PARAMS.offset,
        orderBy: POSITIONS_LIST_QUERY_PARAMS.orderBy,
        ascending: POSITIONS_LIST_QUERY_PARAMS.ascending,
      }),
    ...masterDataQueryOptions,
  });
}

/** Picker / form gán chức vụ — chỉ bản ghi active (Supabase filter server-side). */
export function activePositionsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.positions.active,
    queryFn: getActivePositions,
    ...masterDataQueryOptions,
  });
}

export function branchesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.branches.all,
    queryFn: getBranches,
    ...masterDataQueryOptions,
  });
}

export function jobLevelsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.jobLevels.all,
    queryFn: getJobLevels,
    ...masterDataQueryOptions,
  });
}
