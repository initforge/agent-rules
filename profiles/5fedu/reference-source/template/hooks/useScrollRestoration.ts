import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const SCROLL_CONTAINER_ID = 'main-content';

/**
 * Scroll restoration cho SPA với custom scroll container (<main> thay vì window).
 * - PUSH/REPLACE (click link, menu, submenu): scroll về đầu trang.
 * - POP (nút Back, breadcrumb back): khôi phục vị trí scroll đã lưu.
 * Pattern chuẩn: "Scroll to top on push, restore on pop" (iOS/Android, Gmail, Slack).
 */
export function useScrollRestoration(scrollContainerId = SCROLL_CONTAINER_ID) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const previousPath = useRef<string>(location.pathname);

  useEffect(() => {
    const container = document.getElementById(scrollContainerId);
    if (!container) return;

    // Lưu vị trí scroll của trang đang rời đi
    scrollPositions.current.set(previousPath.current, container.scrollTop);
    previousPath.current = location.pathname;

    if (navigationType === 'POP') {
      const savedPosition = scrollPositions.current.get(location.pathname);
      requestAnimationFrame(() => {
        container.scrollTo(0, savedPosition ?? 0);
      });
    } else {
      requestAnimationFrame(() => {
        container.scrollTo(0, 0);
      });
    }
  }, [location.pathname, navigationType, scrollContainerId]);
}
