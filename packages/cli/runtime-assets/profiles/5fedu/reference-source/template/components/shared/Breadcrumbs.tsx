import React, { useMemo } from 'react';
import { txt } from '@/lib/text';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import type { TFunction } from '@/lib/text';

interface RouteConfig {
  label: string;
  parentPath?: string;
}

const getRouteConfig = (t: TFunction): Record<string, RouteConfig> => ({
  '/': { label: t('breadcrumb.home') },
  '/thong-tin-ban-quyen': { label: t('breadcrumb.licenseInfo'), parentPath: '/' },
  '/he-thong': { label: t('breadcrumb.systemAdmin'), parentPath: '/' },
  '/he-thong/nhan-vien': { label: t('breadcrumb.employee'), parentPath: '/he-thong' },
  '/he-thong/phong-ban': { label: t('breadcrumb.department'), parentPath: '/he-thong' },
  '/he-thong/chuc-vu': { label: t('breadcrumb.position'), parentPath: '/he-thong' },
  '/he-thong/thong-tin-cong-ty': { label: t('breadcrumb.companyInfo'), parentPath: '/he-thong' },
  '/he-thong/phan-quyen': { label: t('breadcrumb.permission'), parentPath: '/he-thong' },
  '/ho-so': { label: t('breadcrumb.profile'), parentPath: '/' },
  '/thong-bao': { label: t('notification.title'), parentPath: '/' },
});

/** Cấp cha theo breadcrumb/router (không dùng lịch sử trình duyệt). Dùng cho nút Back / bottom nav. */
export function getParentPath(pathname: string, t: TFunction): string | undefined {
  if (pathname === '/') return undefined;
  if (pathname.startsWith('/ho-so-nhan-vien/')) {
    return '/he-thong/nhan-vien';
  }
  const config = getRouteConfig(t);
  const exact = config[pathname]?.parentPath;
  if (exact !== undefined) return exact;
  return undefined;
}

interface BreadcrumbItem {
  label: string;
  to: string;
  isLast: boolean;
}

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const ROUTE_CONFIG = useMemo(() => getRouteConfig(txt), []);

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const currentPath = location.pathname;
    const items: BreadcrumbItem[] = [];
    const currentConfig = ROUTE_CONFIG[currentPath];

    if (currentConfig) {
      items.unshift({
        label: currentConfig.label,
        to: currentPath,
        isLast: true,
      });

      if (currentConfig.parentPath) {
        const parentConfig = ROUTE_CONFIG[currentConfig.parentPath];
        if (parentConfig) {
          items.unshift({
            label: parentConfig.label,
            to: currentConfig.parentPath,
            isLast: false,
          });
        }
      }
    } else {
      const pathnames = currentPath.split('/').filter((x) => x);
      pathnames.forEach((value, index) => {
        const to = `/${pathnames.slice(0, index + 1).join('/')}`;
        const label =
          ROUTE_CONFIG[to]?.label || value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
        items.push({
          label,
          to,
          isLast: index === pathnames.length - 1,
        });
      });
      if (items.length > 0) {
        const firstPath = items[0].to;
        const firstConfig = ROUTE_CONFIG[firstPath];
        if (firstConfig?.parentPath === '/' && ROUTE_CONFIG['/']) {
          items.unshift({
            label: ROUTE_CONFIG['/'].label,
            to: '/',
            isLast: false,
          });
        }
      }
    }

    return items;
  }, [location.pathname, ROUTE_CONFIG]);

  if (location.pathname === '/') {
    return (
      <nav aria-label={txt('breadcrumb.label')}>
        <ol className="flex items-center gap-1 flex-nowrap overflow-hidden">
          <li className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-md text-primary" aria-hidden>
              <Home size={14} />
            </span>
            <span
              className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center whitespace-nowrap shadow-sm shadow-primary/20"
              aria-current="page"
            >
              {txt('breadcrumb.home')}
            </span>
          </li>
        </ol>
      </nav>
    );
  }

  const crumbsToShow = breadcrumbs[0]?.to === '/' ? breadcrumbs.slice(1) : breadcrumbs;

  return (
    <nav aria-label={txt('breadcrumb.label')}>
      <ol className="flex items-center gap-1 flex-nowrap overflow-hidden">
        <li className={`flex items-center gap-1.5 ${breadcrumbs.length > 1 ? 'hidden md:flex' : 'flex'}`}>
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all px-2 py-0.5"
            title={txt('breadcrumb.goHome')}
          >
            <Home size={14} />
            <span className="text-xs font-normal whitespace-nowrap">{txt('breadcrumb.home')}</span>
          </Link>
        </li>

        {crumbsToShow.map((crumb, index) => {
          const isHiddenOnMobile = crumbsToShow.length > 2 && index < crumbsToShow.length - 2;
          let separatorClass = 'text-muted-foreground shrink-0';
          if (index === 0 && crumbsToShow.length >= 1) {
            separatorClass += ' hidden md:block';
          }

          return (
            <li
              key={crumb.to}
              className={`flex items-center gap-1 ${isHiddenOnMobile ? 'hidden md:flex' : 'flex'}`}
            >
              <ChevronRight size={12} className={separatorClass} />

              {crumb.isLast ? (
                <span
                  className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center whitespace-nowrap shadow-sm shadow-primary/20"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.to}
                  className="px-2 py-0.5 rounded-md text-muted-foreground hover:text-primary text-xs font-normal transition-all whitespace-nowrap"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default React.memo(Breadcrumbs);
