
import React, { useState, useCallback } from 'react';
import { txt } from '@/lib/text';
import { useNavigate, useLocation } from 'react-router-dom';
import { getParentPath } from './Breadcrumbs';
import { ArrowLeft, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import MobileFilterSheet from '@/components/ui/MobileFilterSheet';
import type { FilterGroup } from '@/components/ui/MobileFilterSheet';

interface DashboardToolbarProps {
  /** Desktop filter chips (MultiSelect, etc.) */
  filters?: React.ReactNode;
  /** Desktop action buttons (Export, etc.) */
  actions?: React.ReactNode;
  /** Mobile action buttons (icon-only) */
  mobileActions?: React.ReactNode;
  /** Nội dung hiển thị ngay sau nút Back (cả mobile & desktop), ví dụ ô search */
  leadingContent?: React.ReactNode;
  /** Desktop (≥sm): ngay sau Back — vd. TabGroup; trước filter chips */
  desktopStartSlot?: React.ReactNode;
  /** Mobile: nội dung hàng 2 full width (vd. ô search), Back + leadingContent ở hàng 1 */
  mobileRow2Content?: React.ReactNode;
  /** Hàng 2 toolbar (filter chips, v.v.) – hiển thị dưới hàng 1, cả desktop và mobile (nếu không truyền mobileRow2Content thì dùng luôn cho mobile) */
  row2Content?: React.ReactNode;
  /** Khi true: row2Content chỉ hiện trên mobile, không hiện trên desktop (tránh trùng với filters ở hàng 1) */
  row2ContentMobileOnly?: boolean;
  /** Filter groups for mobile bottom sheet */
  filterGroups?: FilterGroup[];
  /** Number of active filters */
  activeFilterCount?: number;
  /** Callback to clear all filters */
  onClearFilters?: () => void;
  /** Ghi đè Back. Mặc định: về trang cha theo breadcrumb (`getParentPath`). */
  onBack?: () => void;
  /** Hide back button */
  hideBack?: boolean;
  /** Extra class – use to override default sticky positioning */
  className?: string;
  /** Khi set, wrap nội dung toolbar trong div có class này (vd. max-w-5xl mx-auto px-4 sm:px-6) để đồng bộ chiều rộng với layout nội dung */
  innerWrapperClassName?: string;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  filters,
  actions,
  mobileActions,
  leadingContent,
  desktopStartSlot,
  mobileRow2Content,
  row2Content,
  row2ContentMobileOnly = false,
  filterGroups,
  activeFilterCount = 0,
  onClearFilters,
  onBack,
  hideBack = false,
  className,
  innerWrapperClassName,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    const parent = getParentPath(location.pathname, txt);
    navigate(parent ?? '/');
  }, [onBack, location.pathname, navigate]);
  const hasFilters = filterGroups && filterGroups.length > 0;
  const row2 = row2Content ?? mobileRow2Content;

  const innerContent = (
    <>
      {/* ===== MOBILE (< sm) ===== */}
      <div className={cn("sm:hidden flex gap-2", row2 && "flex-col")}>
        <div className="flex items-center gap-1.5 w-full min-w-0">
          {!hideBack && (
            <button
              onClick={handleBack}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground active:scale-95 transition-all"
            >
              <ArrowLeft size={15} className="stroke-[2.5px]" />
            </button>
          )}

          {leadingContent && <div className="flex-1 min-w-0">{leadingContent}</div>}

          {hasFilters && (
            <button
              onClick={() => setShowMobileFilters(true)}
              className={cn(
                "shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border transition-all active:scale-95 relative",
                activeFilterCount > 0
                  ? 'bg-primary/5 border-primary/40 text-primary'
                  : 'bg-background border-border text-muted-foreground'
              )}
            >
              <Filter size={15} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {!leadingContent && <div className="flex-1" />}

          {mobileActions}
        </div>
        {row2 && <div className="w-full min-w-0">{row2}</div>}
      </div>

      {/* Mobile: clear filters strip */}
      {activeFilterCount > 0 && (
        <div className="sm:hidden pt-1.5">
          <button
            onClick={onClearFilters}
            className="h-7 px-2.5 flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-all border border-destructive/20 active:scale-95"
          >
            <X size={12} className="stroke-[2.5px]" />
            {txt('common.clearFilters', { count: activeFilterCount })}
          </button>
        </div>
      )}

      {/* Mobile filter sheet */}
      {hasFilters && (
        <MobileFilterSheet
          open={showMobileFilters}
          onClose={() => setShowMobileFilters(false)}
          groups={filterGroups!}
          onClearAll={onClearFilters}
        />
      )}

      {/* ===== DESKTOP (>= sm): một hàng — Back + desktopStartSlot + filter chips … flex … actions */}
      <div className="hidden sm:flex items-center gap-2 min-w-0">
        {!hideBack && (
          <button
            onClick={handleBack}
            className="shrink-0 h-8 px-2 -ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95"
          >
            <ArrowLeft size={15} className="stroke-[2.5px]" />
            <span className="text-xs font-medium">{txt('common.back')}</span>
          </button>
        )}

        {desktopStartSlot && (
          <div className="shrink-0 min-w-0">{desktopStartSlot}</div>
        )}

        {leadingContent && <div className="flex-1 min-w-0 max-w-[21rem]">{leadingContent}</div>}

        {/* Filter chips */}
        {filters && (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {filters}
            {activeFilterCount > 0 && onClearFilters && (
              <button
                onClick={onClearFilters}
                className="h-7 px-2 flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-all border border-destructive/20 hover:border-destructive/30 active:scale-95 shrink-0"
              >
                <X size={11} className="stroke-[2.5px]" />
                {txt('common.clearFilters', { count: activeFilterCount })}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 shrink" aria-hidden />

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Row 2: filter chips (desktop hoặc chỉ mobile khi row2ContentMobileOnly) */}
      {row2Content && (
        <div className={cn(
          "pt-2 mt-2 border-t border-border/60",
          row2ContentMobileOnly ? "sm:hidden" : "hidden sm:block"
        )}>
          <div className="flex flex-wrap items-center gap-2">
            {row2Content}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className={cn("sticky top-12 md:top-14 z-30 shrink-0", !innerWrapperClassName && "bg-card border-b border-border px-3 sm:px-4 py-2", className)}>
      {innerWrapperClassName ? (
        <div className={cn(innerWrapperClassName, "py-2 bg-card border-b border-border")}>
          {innerContent}
        </div>
      ) : (
        innerContent
      )}
    </div>
  );
};

export default DashboardToolbar;
