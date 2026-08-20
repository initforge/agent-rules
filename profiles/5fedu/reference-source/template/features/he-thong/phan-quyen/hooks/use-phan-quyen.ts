import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { updateModulePermissions } from '../services/phan-quyen-service';
import type { ActionType } from '../core/types';
import { toast } from 'sonner';
import { txt } from '@/lib/text';
import { queryKeys } from '@/lib/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { moduleRolePermissionsQueryOptions } from '../queries/roles';

export function usePermissionMatrixRoles(moduleId: string) {
  return useQuery(moduleRolePermissionsQueryOptions(moduleId));
}

export const useUpdateModulePermissions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      moduleId,
      updates,
    }: {
      moduleId: string;
      updates: { roleId: string; actions: ActionType[] }[];
    }) => updateModulePermissions(moduleId, updates),
    onSuccess: (_data, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.forModule(moduleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissionGrants.all });
      toast.success(txt('permission.toast.updateSuccess'));
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
};
