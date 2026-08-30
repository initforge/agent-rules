import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { txt } from '@/lib/text';
import { useCanAccessModuleChecker } from '@/hooks/use-can-access-module-checker';
import { getAppResourceForPath } from '@/lib/module-nav-config';
import { usePermissionGrantStore } from '@/store/usePermissionGrantStore';
import { useAuthStore } from '@/store/useStore';

interface ModulePermissionRouteProps {
  children: React.ReactNode;
}

/**
 * Chặn route module Hệ thống khi user không có quyền vào (view/create/admin/super).
 * Bản quyền và route không map resource — không bọc component này.
 */
export function ModulePermissionRoute({ children }: ModulePermissionRouteProps) {
  const location = useLocation();
  const resource = getAppResourceForPath(location.pathname);
  const canAccess = useCanAccessModuleChecker();
  const matrixActive = usePermissionGrantStore((s) => s.matrixActive);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const deniedRef = useRef(false);

  const shouldDeny =
    Boolean(resource) && hasHydrated && matrixActive && !canAccess(resource as NonNullable<typeof resource>);

  useEffect(() => {
    if (shouldDeny && !deniedRef.current) {
      deniedRef.current = true;
      toast.error(txt('shared.error.forbidden'));
    }
    if (!shouldDeny) {
      deniedRef.current = false;
    }
  }, [shouldDeny]);

  if (!resource || !hasHydrated || !matrixActive) {
    return children;
  }

  if (!canAccess(resource)) {
    return <Navigate to="/he-thong" replace />;
  }

  return children;
}
