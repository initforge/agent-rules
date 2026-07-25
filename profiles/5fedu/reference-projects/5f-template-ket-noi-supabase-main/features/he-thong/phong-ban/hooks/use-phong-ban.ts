import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createDepartment, updateDepartment, deleteDepartment, updateDepartmentStatus, importDepartments } from "../services/phong-ban-service";
import { DepartmentFormValues } from "../core/schema";
import type { Department } from '../core/types';
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import { toast } from "sonner";
import { txt } from '@/lib/text';
import { queryKeys } from '@/lib/query-keys';
import { departmentsQueryOptions } from '@/features/he-thong/queries/master-data';
import { getErrorMessage } from '@/lib/utils';
import type { ImportMutationInput } from '@/lib/import';

export const useDepartments = () => {
  return useQuery(departmentsQueryOptions());
};

export const useCreateDepartment = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDepartment,
    onSuccess: (created) => {
      queryClient.setQueryData<Department[]>(queryKeys.departments.all, (old) =>
        old ? [...old, created].sort((a, b) => a.duong_dan.localeCompare(b.duong_dan)) : [created],
      );
      toast.success(txt('department.toast.createSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdateDepartment = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string, data: DepartmentFormValues }) => updateDepartment(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Department[]>(queryKeys.departments.all, (old) =>
        old?.map((d) => (d.id === updated.id ? updated : d)),
      );
      toast.success(txt('department.toast.updateSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdateStatusDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TrangThaiHoatDong }) => updateDepartmentStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<Department[]>(queryKeys.departments.all, (old) =>
        old?.map((d) =>
          d.id === variables.id ? { ...d, trang_thai: variables.status } : d,
        ),
      );
      toast.success(txt('department.toast.updateSuccess'));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};

export const useDeleteDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
      toast.success(txt('department.toast.deleteSuccess'));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err))
  });
};

export const useImportDepartments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, onProgress }: ImportMutationInput) =>
      importDepartments(rows, { onProgress }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments.count });
      void queryClient.invalidateQueries({ queryKey: queryKeys.departments.pagePrefix });
      if (result.created > 0) {
        toast.success(txt('department.toast.importSuccess', { count: result.created }));
      }
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};
