import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card một dòng cho danh sách mobile (GenericTable `renderMobileCard`).
 * Tách vùng bấm mở chi tiết (body) và vùng chọn / thao tác (footer) để tránh mở trùng menu và đồng bộ layout giữa các module.
 *
 * - Body: `role="button"` — tap mở detail / record.
 * - Footer: checkbox trái + actions phải — `stopPropagation` để không kích hoạt body; dùng cho hàng “Thao tác” giống summary detail.
 */
export interface MobileListCardProps {
  selected?: boolean;
  onBodyClick?: () => void;
  onBodyKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Avatar hoặc icon dẫn đầu */
  leading: React.ReactNode;
  /** Hàng tiêu đề (vd. tên + badge trạng thái canh phải) */
  titleRow: React.ReactNode;
  /** Dòng phụ dưới tiêu đề (vd. mã, chức danh) */
  subheader?: React.ReactNode;
  /** Một dòng meta gọn (vd. mã · phòng ban) */
  metaLine?: React.ReactNode;
  /** Thanh cuối: thường checkbox trái */
  footerStart?: React.ReactNode;
  /** Thanh cuối: menu / nút phải */
  footerEnd?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function MobileListCard({
  selected,
  onBodyClick,
  onBodyKeyDown,
  leading,
  titleRow,
  subheader,
  metaLine,
  footerStart,
  footerEnd,
  className,
  bodyClassName,
}: MobileListCardProps) {
  const hasFooter = footerStart != null || footerEnd != null;

  return (
    <div
      className={cn(
        'bg-card rounded-xl border shadow-sm transition-all active:scale-[0.98]',
        hasFooter ? 'pt-3 px-3 pb-1.5' : 'p-3',
        selected ? 'border-primary ring-2 ring-primary/10' : 'border-border',
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onBodyClick}
        onKeyDown={onBodyKeyDown}
        className={cn(
          'w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2',
          bodyClassName
        )}
      >
        <div className="flex items-start gap-3">
          {leading}
          <div className="min-w-0 flex-1 space-y-0.5">
            {titleRow}
            {subheader}
            {metaLine}
          </div>
        </div>
      </div>

      {hasFooter && (
        <div
          role="group"
          className="mt-3 flex min-h-0 items-center justify-between gap-1 border-t border-border pt-0.5 pb-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-start gap-1">{footerStart}</div>
          {footerEnd != null && (
            <div className="flex shrink-0 items-center justify-end">{footerEnd}</div>
          )}
        </div>
      )}
    </div>
  );
}
