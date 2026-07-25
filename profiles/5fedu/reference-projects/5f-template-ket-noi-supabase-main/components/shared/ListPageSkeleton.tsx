import React from 'react';
import { cn } from '@/lib/utils';
import LoadingSpinnerWithText from './LoadingSpinnerWithText';
import TableSkeleton, { TableSkeletonColumn } from './TableSkeleton';
import CardListSkeleton from './CardListSkeleton';

interface ListPageSkeletonProps {
  /**
   * Nếu có: hiển thị strip "icon xoay tròn + text màu primary" phía trên skeleton.
   * Ví dụ: "Đang tải cấu trúc phòng ban..."
   */
  loadingText?: string;
  /** Cấu hình cột cho bảng skeleton (desktop) */
  tableColumns?: TableSkeletonColumn[] | number;
  /** Số dòng bảng skeleton */
  tableRowCount?: number;
  /** Cột có dòng phụ (index) - ví dụ cột tên */
  tableColumnWithSubline?: number;
  /** Số thẻ skeleton (mobile) */
  cardCount?: number;
  /** Ẩn bảng trên mobile, ẩn card trên desktop */
  showTableOnDesktopOnly?: boolean;
  showCardsOnMobileOnly?: boolean;
  className?: string;
}

/**
 * Skeleton trang danh sách dùng chung: (optional) spinner+text, bảng desktop, card mobile, footer.
 * Giống loading của GenericTable + có thể thêm spinner + text primary.
 */
const ListPageSkeleton: React.FC<ListPageSkeletonProps> = ({
  loadingText,
  tableColumns = 5,
  tableRowCount = 5,
  tableColumnWithSubline,
  cardCount = 3,
  showTableOnDesktopOnly = true,
  showCardsOnMobileOnly = true,
  className,
}) => (
  <div
    className={cn('flex flex-col h-full min-h-0 bg-card overflow-hidden', className)}
    aria-live="polite"
    aria-busy="true"
    aria-label={loadingText ?? 'Đang tải dữ liệu'}
  >
    {loadingText && (
      <div className="shrink-0 py-3 px-3 sm:px-4 border-b border-border/50 bg-muted/20">
        <LoadingSpinnerWithText text={loadingText} centered />
      </div>
    )}

    {/* Desktop: table skeleton */}
    <div
      className={cn(
        'flex-1 min-h-0 overflow-hidden',
        showTableOnDesktopOnly && 'hidden md:block'
      )}
    >
      <TableSkeleton
        columns={tableColumns}
        rowCount={tableRowCount}
        showCheckbox
        showActions
        columnWithSubline={tableColumnWithSubline}
        className="h-full"
      />
    </div>

    {/* Mobile: card skeleton */}
    <div
      className={cn(
        'flex-1 min-h-0 overflow-hidden px-3 pt-1 pb-3',
        showCardsOnMobileOnly && 'md:hidden'
      )}
    >
      <CardListSkeleton cardCount={cardCount} className="h-full" />
    </div>

    {/* Footer skeleton */}
    <div className="border-t border-border bg-card md:bg-muted/10 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 shrink-0">
      <div className="h-3 w-24 bg-muted rounded animate-pulse" />
      <div className="h-7 w-28 bg-muted rounded animate-pulse" />
    </div>
  </div>
);

export default ListPageSkeleton;
