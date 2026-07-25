import { queryOptions } from '@tanstack/react-query';
import { queryKeys, EMPLOYEES_LIST_QUERY_PARAMS } from '@/lib/query-keys';
import { listQueryOptions } from '@/lib/supabase/query-config';
import {
  getEmployeeById,
  getEmployeeCount,
  getEmployees,
  getEmployeesForStats,
  getEmployeesPage,
} from '@/features/he-thong/nhan-vien/services/nhan-vien-service';

export function employeeCountQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.employees.count,
    queryFn: getEmployeeCount,
    ...listQueryOptions,
  });
}

export function employeeDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.employees.detail(id),
    queryFn: () => getEmployeeById(id),
    enabled: Boolean(id),
    ...listQueryOptions,
  });
}

export function employeesClientListQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.employees.list({
      limit: EMPLOYEES_LIST_QUERY_PARAMS.limit,
      offset: EMPLOYEES_LIST_QUERY_PARAMS.offset,
      orderBy: EMPLOYEES_LIST_QUERY_PARAMS.orderBy,
      ascending: EMPLOYEES_LIST_QUERY_PARAMS.ascending,
    }),
    queryFn: () => getEmployees(),
    ...listQueryOptions,
  });
}

export function employeesPageQueryOptions(params: {
  limit: number;
  offset: number;
  orderBy: string;
  ascending: boolean;
}) {
  return queryOptions({
    queryKey: queryKeys.employees.page(params),
    queryFn: () => getEmployeesPage(params),
    ...listQueryOptions,
  });
}

export function employeesStatsSampleQueryOptions(params: {
  limit: number;
  orderBy: string;
  ascending: boolean;
}) {
  return queryOptions({
    queryKey: queryKeys.employees.statsSample(params.limit),
    queryFn: () =>
      getEmployeesForStats({
        limit: params.limit,
        offset: 0,
        orderBy: params.orderBy,
        ascending: params.ascending,
      }),
    ...listQueryOptions,
  });
}
