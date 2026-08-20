import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrangThaiHoatDong } from '@/lib/constants/trang-thai';
import {
  createPosition,
  updatePosition,
  deletePositions,
  updatePositionStatus,
  importPositions,
} from "../services/chuc-vu-service";
import { PositionFormValues } from "../core/schema";
import type { Position } from '../core/types';
import { toast } from "sonner";
import { txt } from '@/lib/text';
import { queryKeys } from '@/lib/query-keys';
import { positionsQueryOptions, activePositionsQueryOptions } from '@/features/he-thong/queries/master-data';
import { getErrorMessage } from '@/lib/utils';
import type { ImportMutationInput } from '@/lib/import';

function invalidateActivePositions(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.positions.active });
}

/** Matrix `roles.forModule` + member `can()` grants — gọi khi đổi trạng thái / CRUD chức vụ. */
function invalidatePositionPermissionCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  positionIds?: readonly string[],
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.all });
  if (positionIds?.length) {
    for (const id of positionIds) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.byPosition(id) });
    }
  }
}

export const usePositions = () => {
  return useQuery(positionsQueryOptions());
};

export const useActivePositions = () => {
  return useQuery(activePositionsQueryOptions());
};

export const useCreatePosition = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPosition,
    onSuccess: (created) => {
      queryClient.setQueryData<Position[]>(queryKeys.positions.all, (old) =>
        old ? [...old, created].sort((a, b) => a.thu_tu - b.thu_tu) : [created],
      );
      invalidateActivePositions(queryClient);
      invalidatePositionPermissionCaches(queryClient, [created.id]);
      toast.success(txt('position.toast.createSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdatePosition = (onSuccess?: () => void) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string, data: PositionFormValues }) => updatePosition(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Position[]>(queryKeys.positions.all, (old) =>
        old?.map((p) => (p.id === updated.id ? updated : p)),
      );
      invalidateActivePositions(queryClient);
      invalidatePositionPermissionCaches(queryClient, [updated.id]);
      toast.success(txt('position.toast.updateSuccess'));
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
  });
};

export const useUpdateStatusPosition = () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ ids, status }: { ids: string[], status: TrangThaiHoatDong }) => updatePositionStatus(ids, status),
      onSuccess: (_, variables) => {
        queryClient.setQueryData<Position[]>(queryKeys.positions.all, (old) =>
          old?.map((p) =>
            variables.ids.includes(p.id) ? { ...p, trang_thai: variables.status } : p,
          ),
        );
        invalidateActivePositions(queryClient);
        invalidatePositionPermissionCaches(queryClient, variables.ids);
        toast.success(txt('position.toast.statusUpdate', { count: variables.ids.length }));
      },
      onError: (err: unknown) => toast.error(`Lỗi: ${getErrorMessage(err)}`)
    });
};

export const useDeletePosition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deletePositions(ids),
    onSuccess: (_, ids) => {
      queryClient.setQueryData<Position[]>(queryKeys.positions.all, (old) =>
        old?.filter((p) => !ids.includes(p.id)),
      );
      invalidateActivePositions(queryClient);
      toast.success(txt('position.toast.deleteSuccess', { count: ids.length }));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err))
  });
};

export const useImportPositions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, onProgress }: ImportMutationInput) =>
      importPositions(rows, { onProgress }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.positions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.positions.count });
      void queryClient.invalidateQueries({ queryKey: queryKeys.positions.pagePrefix });
      invalidateActivePositions(queryClient);
      invalidatePositionPermissionCaches(queryClient);
      if (result.created > 0) {
        toast.success(txt('position.toast.importSuccess', { count: result.created }));
      }
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};
