import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DETAIL_SUB_TABLE_HEAD_PX,
  DETAIL_SUB_TABLE_MAX_BODY_ROWS,
  DETAIL_SUB_TABLE_ROW_PX,
} from '@/lib/detail-sub-table';
import { cn } from '@/lib/utils';

/** Chiều cao ước lượng cho một dòng body (padding + text); dùng cho max-height ~N dòng. */
export const EMBEDDED_CHILD_GRID_DEFAULT_ROW_PX = DETAIL_SUB_TABLE_ROW_PX;
/** Chiều cao ước lượng hàng thead. */
export const EMBEDDED_CHILD_GRID_DEFAULT_HEAD_PX = DETAIL_SUB_TABLE_HEAD_PX;
/** Từ số dòng này trở lên, bật ảo hóa tbody (giảm DOM). */
export const EMBEDDED_CHILD_GRID_VIRTUAL_THRESHOLD = 100;

export interface EmbeddedChildDataGridLabelColumn<T> {
  header: React.ReactNode;
  renderCell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** min-width cho cột label sticky trái */
  minWidthClass?: string;
}

export interface EmbeddedChildDataGridColumn<T> {
  id: string;
  header: React.ReactNode;
  renderCell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface EmbeddedChildDataGridActionsColumn<T> {
  header: React.ReactNode;
  renderCell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  /** ví dụ w-28 min-w-[7rem] */
  widthClass?: string;
}

export interface EmbeddedChildDataGridProps<T> {
  rows: T[];
  getRowKey: (row: T) => string;
  labelColumn: EmbeddedChildDataGridLabelColumn<T>;
  /** Cột giữa (cuộn ngang cùng bảng); có thể rỗng. */
  columns?: EmbeddedChildDataGridColumn<T>[];
  actionsColumn: EmbeddedChildDataGridActionsColumn<T>;
  /** Click dòng (vd. mở detail); Enter khi focus hàng. */
  onRowClick?: (row: T) => void;
  /** Số dòng body tối đa hiển thị trước khi cuộn dọc (mặc định 5 — `DETAIL_SUB_TABLE_MAX_BODY_ROWS`). */
  maxVisibleBodyRows?: number;
  rowHeightPx?: number;
  headHeightPx?: number;
  /** Ngưỡng bật ảo hóa (mặc định 100). */
  virtualizeThreshold?: number;
  className?: string;
  tableClassName?: string;
  /** Vùng bọc bảng (border, radius) */
  containerClassName?: string;
}

function TableHead<T>({
  labelColumn,
  columns,
  actionsColumn,
  stickyHeadBg,
}: {
  labelColumn: EmbeddedChildDataGridLabelColumn<T>;
  columns: EmbeddedChildDataGridColumn<T>[];
  actionsColumn: EmbeddedChildDataGridActionsColumn<T>;
  stickyHeadBg: string;
}) {
  return (
    <thead className={stickyHeadBg}>
      <tr>
        <th
          scope="col"
          className={cn(
            'sticky top-0 left-0 z-[21] px-4 py-2 font-semibold text-foreground/80 text-xs whitespace-nowrap border-b border-border text-left',
            'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]',
            stickyHeadBg,
            labelColumn.minWidthClass ?? 'min-w-[140px]',
            labelColumn.headerClassName
          )}
        >
          {labelColumn.header}
        </th>
        {columns.map((col) => (
          <th
            key={col.id}
            scope="col"
            className={cn(
              'sticky top-0 z-20 px-4 py-2 font-semibold text-foreground/80 text-xs whitespace-nowrap border-b border-border',
              stickyHeadBg,
              col.headerClassName
            )}
          >
            {col.header}
          </th>
        ))}
        <th
          scope="col"
          className={cn(
            'sticky top-0 right-0 z-[21] px-4 py-2 font-semibold text-foreground/80 text-xs whitespace-nowrap border-b border-border text-center',
            'shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]',
            stickyHeadBg,
            actionsColumn.widthClass ?? 'w-24 min-w-[6rem]',
            actionsColumn.headerClassName
          )}
        >
          {actionsColumn.header}
        </th>
      </tr>
    </thead>
  );
}

function DataRow<T>({
  row,
  labelColumn,
  columns,
  actionsColumn,
  bodyCellBg,
  onRowClick,
  rowStyle,
}: {
  row: T;
  labelColumn: EmbeddedChildDataGridLabelColumn<T>;
  columns: EmbeddedChildDataGridColumn<T>[];
  actionsColumn: EmbeddedChildDataGridActionsColumn<T>;
  bodyCellBg: string;
  onRowClick?: (row: T) => void;
  rowStyle?: React.CSSProperties;
}) {
  return (
    <tr
      style={rowStyle}
      className={cn('group transition-colors', onRowClick && 'cursor-pointer')}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
    >
      <td
        className={cn(
          'sticky left-0 z-[2] px-4 py-2.5 align-top border-r border-border/80',
          bodyCellBg,
          'shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]',
          labelColumn.cellClassName
        )}
      >
        {labelColumn.renderCell(row)}
      </td>
      {columns.map((col) => (
        <td key={col.id} className={cn('px-4 py-2.5 align-top', bodyCellBg, col.cellClassName)}>
          {col.renderCell(row)}
        </td>
      ))}
      <td
        className={cn(
          'sticky right-0 z-[2] px-4 py-2.5 text-center align-top border-l border-border/80',
          bodyCellBg,
          'shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]',
          actionsColumn.cellClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {actionsColumn.renderCell(row)}
      </td>
    </tr>
  );
}

/**
 * Bảng con trong drawer/detail: cuộn dọc sau N dòng body, cuộn ngang khi nhiều cột,
 * cột label sticky trái + cột thao tác sticky phải, thead sticky trên cùng vùng cuộn.
 * Từ ~100 dòng trở lên: ảo hóa tbody (@tanstack/react-virtual).
 */
function EmbeddedChildDataGrid<T>({
  rows,
  getRowKey,
  labelColumn,
  columns = [],
  actionsColumn,
  onRowClick,
  maxVisibleBodyRows = DETAIL_SUB_TABLE_MAX_BODY_ROWS,
  rowHeightPx = EMBEDDED_CHILD_GRID_DEFAULT_ROW_PX,
  headHeightPx = EMBEDDED_CHILD_GRID_DEFAULT_HEAD_PX,
  virtualizeThreshold = EMBEDDED_CHILD_GRID_VIRTUAL_THRESHOLD,
  className,
  tableClassName,
  containerClassName,
}: EmbeddedChildDataGridProps<T>) {
  const scrollMaxHeight = useMemo(
    () => `calc(${headHeightPx}px + ${maxVisibleBodyRows} * ${rowHeightPx}px)`,
    [headHeightPx, maxVisibleBodyRows, rowHeightPx]
  );

  const stickyHeadBg = 'bg-muted';
  const bodyCellBg = cn('bg-card', 'group-hover:bg-muted/60');
  const parentRef = useRef<HTMLDivElement>(null);

  const useVirtual = rows.length >= virtualizeThreshold;

  /* eslint-disable react-hooks/incompatible-library -- @tanstack/react-virtual */
  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeightPx,
    overscan: 8,
  });
  /* eslint-enable react-hooks/incompatible-library */

  const colSpan = 1 + columns.length + 1;
  const virtualItems = useVirtual ? virtualizer.getVirtualItems() : [];
  const paddingTop = useVirtual && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    useVirtual && virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className={cn('rounded-xl border border-border overflow-hidden bg-card', containerClassName)}>
      <div
        ref={parentRef}
        className={cn('overflow-x-auto overflow-y-auto custom-scrollbar', className)}
        style={{ maxHeight: scrollMaxHeight, overscrollBehavior: 'contain' }}
      >
        <table className={cn('w-full min-w-[520px] text-sm text-left border-separate border-spacing-0', tableClassName)}>
          <TableHead
            labelColumn={labelColumn}
            columns={columns}
            actionsColumn={actionsColumn}
            stickyHeadBg={stickyHeadBg}
          />
          <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border">
            {!useVirtual &&
              rows.map((row) => (
                <DataRow
                  key={getRowKey(row)}
                  row={row}
                  labelColumn={labelColumn}
                  columns={columns}
                  actionsColumn={actionsColumn}
                  bodyCellBg={bodyCellBg}
                  onRowClick={onRowClick}
                />
              ))}
            {useVirtual && paddingTop > 0 && (
              <tr aria-hidden style={{ height: paddingTop }}>
                <td colSpan={colSpan} className="p-0 border-0" />
              </tr>
            )}
            {useVirtual &&
              virtualItems.map((vi) => {
                const row = rows[vi.index];
                return (
                  <DataRow
                    key={getRowKey(row)}
                    row={row}
                    labelColumn={labelColumn}
                    columns={columns}
                    actionsColumn={actionsColumn}
                    bodyCellBg={bodyCellBg}
                    onRowClick={onRowClick}
                    rowStyle={{ height: vi.size }}
                  />
                );
              })}
            {useVirtual && paddingBottom > 0 && (
              <tr aria-hidden style={{ height: paddingBottom }}>
                <td colSpan={colSpan} className="p-0 border-0" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmbeddedChildDataGrid;
