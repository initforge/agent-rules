import React from 'react';
import { Plus } from 'lucide-react';
import { DETAIL_SUB_TABLE_SCROLL_MAX_HEIGHT } from '@/lib/detail-sub-table';
import Button from '@/components/ui/Button';
import EmptyState from './EmptyState';
import { cn } from '@/lib/utils';

export interface GenericSubTableSectionProps {
  /** Tiêu đề section (uppercase, primary) */
  title: string;
  /** Icon bên trái tiêu đề */
  icon?: React.ReactNode;
  /** Số lượng (badge), tùy chọn */
  count?: number;
  /** Nhãn nút Thêm */
  addLabel?: string;
  /** Callback khi bấm Thêm */
  onAdd?: () => void;
  /** Khi không có dữ liệu: tiêu đề EmptyState */
  emptyTitle?: string;
  /** Mô tả EmptyState */
  emptyDescription?: string;
  /** Icon EmptyState */
  emptyIcon?: React.ReactNode;
  /** Đang tải: hiển thị loading thay vì bảng/empty */
  loading?: boolean;
  /** Text hiển thị khi loading (mặc định "Đang tải...") */
  loadingText?: string;
  /** Chiều cao tối đa vùng scroll bảng (mặc định ~5 dòng body — `DETAIL_SUB_TABLE_SCROLL_MAX_HEIGHT`) */
  maxTableHeight?: string;
  className?: string;
  /**
   * Nội dung bảng: thead + tbody.
   * Khi không truyền và count === 0 → hiển thị EmptyState.
   * Khi truyền → bọc trong wrapper scroll + table.
   */
  children?: React.ReactNode;
}

/**
 * Bảng con chuẩn generic (dùng trong Detail/Form): card, header (icon + title + badge + nút Thêm), EmptyState hoặc bảng scroll.
 * Tham khảo: TaiSanDetail (Lịch sử cấp phát / Thu hồi), Dự án > Công việc.
 */
const GenericSubTableSection: React.FC<GenericSubTableSectionProps> = ({
  title,
  icon,
  count,
  addLabel,
  onAdd,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  loading = false,
  loadingText = 'Đang tải...',
  maxTableHeight = DETAIL_SUB_TABLE_SCROLL_MAX_HEIGHT,
  className,
  children,
}) => {
  const showEmpty = !loading && count !== undefined && count === 0 && !children;
  const showTable = !loading && (children != null || (count !== undefined && count > 0));

  return (
    <div
      className={cn(
        'w-full bg-card p-3.5 sm:p-4 md:p-5 rounded-xl border border-border shadow-sm space-y-2.5 sm:space-y-3',
        className
      )}
    >
      <div className="flex items-center gap-3 pb-2 sm:pb-2.5">
        <div className="flex items-center gap-2 shrink-0">
          {icon}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary font-bold">
            {title}
          </h4>
          {count !== undefined && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium tabular-nums bg-primary/10 text-primary border border-primary/20">
              {count}
            </span>
          )}
        </div>
        <div className="flex-1 self-center h-px border-b border-dashed border-border/80 mx-1" aria-hidden />
        {onAdd && addLabel && (
          <Button
            type="button"
            size="sm"
            onClick={onAdd}
            className="bg-primary text-white hover:bg-primary/90 shadow-sm h-8 px-3 shrink-0"
          >
            <Plus size={14} className="mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>

      {loading && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          {loadingText}
        </div>
      )}

      {showEmpty && (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={emptyIcon}
        />
      )}

      {showTable && children != null && (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div
            className="overflow-x-auto overflow-y-auto custom-scrollbar"
            style={{ maxHeight: maxTableHeight }}
          >
            <table className="w-full text-sm text-left border-collapse">
              {children}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenericSubTableSection;
