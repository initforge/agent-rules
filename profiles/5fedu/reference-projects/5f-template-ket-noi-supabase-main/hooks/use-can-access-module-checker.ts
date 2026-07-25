import { useAuthStore } from '@/store/useStore';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import { canAccessModule, type AppResource } from '@/lib/permissions';

/** Subscribe matrix và trả hàm kiểm tra vào module. */
export function useCanAccessModuleChecker(): (resource: AppResource) => boolean {
  const user = useAuthStore((s) => s.user);
  usePermissionGrantStore((s) => s.matrixActive);
  usePermissionGrantStore((s) => s.grantsByModule);
  usePermissionGrantStore((s) => s.positionCapBac);

  return (resource: AppResource) => canAccessModule(user, resource);
}
