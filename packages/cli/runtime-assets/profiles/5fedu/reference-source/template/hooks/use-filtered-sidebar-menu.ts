import { useMemo } from 'react';
import { SIDEBAR_MENU, type MenuItem } from '@/lib/sidebar-menu';
import { hasAnySystemModuleAccess } from '@/lib/module-nav-config';
import { useCanAccessModuleChecker } from '@/hooks/use-can-access-module-checker';

const LICENSE_PATH = '/thong-tin-ban-quyen';

/** Sidebar + Home cards — ẩn Hệ thống nếu không vào được module nào; luôn giữ Bản quyền. */
export function useFilteredSidebarMenu(): MenuItem[] {
  const canAccess = useCanAccessModuleChecker();

  return useMemo(() => {
    const showSystem = hasAnySystemModuleAccess(canAccess);
    return SIDEBAR_MENU.filter((item) => {
      if (item.path === LICENSE_PATH) return true;
      if (item.path === '/he-thong') return showSystem;
      return true;
    });
  }, [canAccess]);
}
