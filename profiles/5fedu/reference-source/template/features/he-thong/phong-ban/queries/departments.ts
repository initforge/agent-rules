import { queryOptions } from '@tanstack/react-query';
import { queryKeys, DEPARTMENTS_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { listQueryOptions, masterDataQueryOptions } from '@/lib/supabase/query-config';
import {
  getDepartmentCount,
  getDepartments,
  getDepartmentsPage,
} from '@/features/he-thong/phong-ban/services/phong-ban-service';

export function departmentCountQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.departments.count,
    queryFn: getDepartmentCount,
    ...listQueryOptions,
  });
}

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

export function departmentsPageQueryOptions(params: {
  limit: number;
  offset: number;
  orderBy: string;
  ascending: boolean;
}) {
  return queryOptions({
    queryKey: queryKeys.departments.page(params),
    queryFn: () => getDepartmentsPage(params),
    ...listQueryOptions,
  });
}
