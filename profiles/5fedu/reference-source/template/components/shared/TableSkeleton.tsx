import React from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_COLUMN_MAX_WIDTH } from '@/store/createGenericStore';

export interface TableSkeletonColumn {
  /** MinWidth cho cột (px hoặc string) */
  minWidth?: number | string;
  /** MaxWidth cho cột (px); nếu không có thì dùng DEFAULT_COLUMN_MAX_WIDTH */
  maxWidth?: number;
}

interface TableSkeletonProps {
  /** Số cột nội dung (không tính checkbox và cột Thao tác) */
  columns: TableSkeletonColumn[] | number;
  /** Số dòng skeleton */
  rowCount?: number;
  /** Hiển thị cột checkbox */
  showCheckbox?: boolean;
  /** Hiển thị cột Thao tác */
  showActions?: boolean;
  /** Cột nào có thêm dòng phụ (ví dụ cột tên có subtitle) - index trong columns */
  columnWithSubline?: number;
  className?: string;
}

/**
 * Skeleton bảng dùng chung: thead + tbody với các ô animate-pulse.
 * Dùng cho desktop list/table loading.
 */
const TableSkeleton: React.FC<TableSkeletonProps> = ({
  columns,
  rowCount = 5,
  showCheckbox = true,
  showActions = true,
  columnWithSubline,
  className,
}) => {
  const cols = typeof columns === 'number'
    ? Array.from({ length: columns }, () => ({}))
    : columns;

  return (
    <div className={cn('flex-1 min-h-0 overflow-hidden', className)}>
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            {showCheckbox && (
              <th className="w-[44px] px-3 py-2 border-b border-border">
                <div className="w-4 h-4 bg-muted rounded animate-pulse" />
              </th>
            )}
            {cols.map((col, i) => (
              <th
                key={i}
                className="px-4 py-2 border-b border-border min-w-0"
                style={{
                  minWidth: col.minWidth ?? 100,
                  maxWidth: col.maxWidth ?? DEFAULT_COLUMN_MAX_WIDTH,
                }}
              >
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              </th>
            ))}
            {showActions && (
              <th className="w-[80px] px-3 py-2 border-b border-border">
                <div className="h-3 w-12 bg-muted rounded animate-pulse mx-auto" />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, i) => (
            <tr key={i} className="[&>td]:border-b [&>td]:border-border">
              {showCheckbox && (
                <td className="px-3 py-2.5">
                  <div className="w-4 h-4 bg-muted/60 rounded animate-pulse" />
                </td>
              )}
              {cols.map((col, colIndex) => (
                <td key={colIndex} className="px-4 py-2.5">
                  <div className="space-y-1.5">
                    <div
                      className={cn(
                        'h-3 bg-muted/60 rounded animate-pulse',
                        i % 2 === 0 ? 'w-3/4' : 'w-1/2'
                      )}
                    />
                    {columnWithSubline === colIndex && (
                      <div className="h-2.5 w-1/3 bg-muted/40 rounded animate-pulse" />
                    )}
                  </div>
                </td>
              ))}
              {showActions && (
                <td className="px-3 py-2.5">
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="w-6 h-6 bg-muted/40 rounded animate-pulse" />
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableSkeleton;
