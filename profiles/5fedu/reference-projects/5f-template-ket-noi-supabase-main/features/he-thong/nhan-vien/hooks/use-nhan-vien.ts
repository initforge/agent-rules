import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createEmployee, updateEmployee, deleteEmployees, updateEmployeeStatus, bulkUpdateEmployees, restoreEmployees, resetEmployeePassword, importEmployees } from "../services/nhan-vien-service";
import { EmployeeCreateFormValues, EmployeeEditFormValues } from "../core/schema";
import { Employee } from "../core/types";
import type { TrangThaiNhanVien } from "../core/constants";
import { toast } from "sonner";
import { txt } from '@/lib/text';
import { queryKeys } from '@/lib/query-keys';
import { employeeDetailQueryOptions } from '../queries/employees';
import { getErrorMessage } from '@/lib/utils';
import type { ImportMutationInput } from '@/lib/import';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { useShallow } from 'zustand/react/shallow';
import { useEmployeesList } from './use-employees-list';

/** Danh sách nhân viên — tự bật phân trang server khi tổng > 500. */
export const useEmployees = (options?: { loadFullForStats?: boolean }) => {
  const { pagination, sort } = useEmployeeStore(
    useShallow((s) => ({ pagination: s.pagination, sort: s.sort })),
  );
  const result = useEmployeesList({
    page: pagination.page,
    pageSize: pagination.pageSize,
    sort,
    loadFullForStats: options?.loadFullForStats,
  });
  return {
    data: result.employees,
    total: result.total,
    mode: result.mode,
    isServerPaginated: result.isServerPaginated,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
  };
};

function patchEmployeesListCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (old: Employee[] | undefined) => Employee[] | undefined,
) {
  queryClient.setQueriesData<Employee[]>(
    {
      queryKey: queryKeys.employees.all,
      predicate: (q) => q.queryKey[1] !== 'page' && q.queryKey[1] !== 'count',
    },
    updater,
  );
}

export const useEmployee = (id: string | null) => {
  return useQuery({
    ...employeeDetailQueryOptions(id ?? ''),
    enabled: !!id,
  });
};

export const useCreateEmployee = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EmployeeCreateFormValues) => createEmployee(data),
    onSuccess: (created) => {
      patchEmployeesListCache(queryClient, (old) => (old ? [...old, created] : [created]));
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.count });
      toast.success(txt('employee.toast.createSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdateEmployee = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployeeEditFormValues }) => updateEmployee(id, data),
    onSuccess: (updated, variables) => {
      patchEmployeesListCache(queryClient, (old) =>
        old?.map((e) => (e.id === variables.id ? updated : e)),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.pagePrefix });
      queryClient.setQueryData(queryKeys.employees.detail(variables.id), updated);
      toast.success(txt('employee.toast.updateSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdateStatusEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ ids, status }: { ids: string[], status: TrangThaiNhanVien }) => updateEmployeeStatus(ids, status),
      onSuccess: (_, variables) => {
        patchEmployeesListCache(queryClient, (old) =>
          old?.map((e) =>
            variables.ids.includes(e.id) ? { ...e, trang_thai: variables.status } : e,
          ),
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.employees.pagePrefix });
        variables.ids.forEach((id) => {
          queryClient.setQueryData<Employee | undefined>(queryKeys.employees.detail(id), (prev) =>
            prev ? { ...prev, trang_thai: variables.status } : prev,
          );
        });
        toast.success(txt('employee.toast.statusUpdateSuccess', { count: variables.ids.length }));
      },
      onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
    });
};

export const useBulkUpdateEmployees = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, fields }: { ids: string[]; fields: Record<string, unknown> }) =>
      bulkUpdateEmployees(ids, fields),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.anyDetail });
      toast.success(txt('employee.toast.bulkUpdateSuccess', { count: variables.ids.length }));
      onSuccess?.();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`),
  });
};

export const useDeleteEmployees = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteEmployees(ids),
    onSuccess: (_, ids) => {
      patchEmployeesListCache(queryClient, (old) => old?.filter((e) => !ids.includes(e.id)));
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.count });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.pagePrefix });
      ids.forEach((id) => queryClient.removeQueries({ queryKey: queryKeys.employees.detail(id) }));
      toast.success(txt('employee.toast.deleteSuccess', { count: ids.length }));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err))
  });
};

/**
 * Hook xóa có thể hoàn tác (undo).
 * Xóa trước → hiện toast có nút "Hoàn tác" → nếu nhấn thì restore lại.
 */
export const useDeleteWithUndo = () => {
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (ids: string[]) => deleteEmployees(ids),
    onSuccess: (_, ids) => {
      patchEmployeesListCache(queryClient, (old) => old?.filter((e) => !ids.includes(e.id)));
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.count });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.pagePrefix });
      ids.forEach((id) => queryClient.removeQueries({ queryKey: queryKeys.employees.detail(id) }));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });

  const restoreMut = useMutation({
    mutationFn: (employees: Employee[]) => restoreEmployees(employees),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.anyDetail });
      toast.success(txt('employee.toast.undoSuccess'));
    },
  });

  const deleteWithUndo = async (
    employees: Employee[],
    callbacks?: { onDone?: () => void }
  ) => {
    const ids = employees.map(e => e.id);
    const snapshot = [...employees]; // lưu bản sao để restore

    await deleteMut.mutateAsync(ids);
    callbacks?.onDone?.();

    toast(txt('employee.toast.deleteCount', { count: ids.length }), {
      duration: 6000,
      action: {
        label: txt('employee.toast.undo'),
        onClick: () => restoreMut.mutate(snapshot),
      },
    });
  };

  return { deleteWithUndo, isPending: deleteMut.isPending };
};

export const useResetEmployeePassword = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetEmployeePassword(id, password),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.detail(variables.id) });
      toast.success(txt('employee.form.resetPasswordSuccess'));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};

export const useImportEmployees = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, onProgress }: ImportMutationInput) =>
      importEmployees(rows, { onProgress }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.count });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.pagePrefix });
      if (result.created > 0) {
        toast.success(txt('employee.toast.importSuccess', { count: result.created }));
      }
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};
