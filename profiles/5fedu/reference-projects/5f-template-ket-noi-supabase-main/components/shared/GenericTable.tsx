import React, { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Sigma } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import EmptyState from './EmptyState';
import LoadingSpinnerWithText from './LoadingSpinnerWithText';
import PageSizeSelect from './PageSizeSelect';
import { cn } from '@/lib/utils';
import type { ColumnConfig, SortState } from '@/store/createGenericStore';
import { getColumnCellStyle } from '@/store/createGenericStore';

/** Ngưỡng kích hoạt virtual scroll tự động (số dòng trên trang) */
const VIRTUAL_THRESHOLD = 50;
/** Chiều rộng cột checkbox (px) */
const TABLE_CHECKBOX_WIDTH = 44;
/** Chiều rộng cột Thao tác (px) — Sửa + menu ⋮ */
const TABLE_ACTION_COLUMN_WIDTH = 92;
/** MinWidth mặc định cho cột khi tính sticky offset (px) */
const DEFAULT_COLUMN_MIN_WIDTH = 120;

interface GenericTableProps<T> {
  data: T[];
  columns: ColumnConfig[];
  isLoading: boolean;

  // Selection
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleAll: (ids: string[]) => void;

  // Pagination
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;

  // Sort
  sort?: SortState;
  onSort?: (column: string | null, direction: 'asc' | 'desc' | null) => void;

  // Renders
  renderCell: (colId: string, item: T) => React.ReactNode;
  renderMobileCard: (item: T, isSelected: boolean) => React.ReactNode;

  // Actions
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string;

  // UX
  density?: 'compact' | 'default' | 'comfortable';
  /** Bật virtual scroll khi dòng > VIRTUAL_THRESHOLD (mặc định: true) */
  enableVirtualScroll?: boolean;

  // Column resize
  onResizeColumn?: (id: string, width: number) => void;

  /** Số cột đầu (tính từ trái) được ghim cố định khi cuộn ngang. Mặc định 1. */
  stickyLeftCount?: number;

  /** Khi isLoading: hiển thị strip icon xoay + text màu primary. Mặc định "Đang tải dữ liệu". */
  loadingText?: string;

  /** Empty state: khi data.length === 0 (không loading) */
  emptyTitle?: string;
  emptyDescription?: string;

  /** Hàng tổng/count hiển thị dưới toolbar, trên header bảng. Trả về nội dung cho từng cột (data = toàn bộ data đang hiển thị). */
  renderSummaryRow?: (colId: string, data: T[]) => React.ReactNode;

  /** Desktop: phụ kiện bên phải nhãn cột (vd. filter icon). Không kích hoạt sort; `stopPropagation` đã bọc sẵn. */
  renderColumnHeaderAccessory?: (col: ColumnConfig) => React.ReactNode | null;
  /** Khi true và có `onSort`: nhãn cột chỉ là text (không nút sort / mũi tên); sort qua accessory (vd. menu sliders). */
  hideSortOnColumnLabel?: boolean;

  /** Tổng bản ghi (phân trang server). Mặc định = data.length. */
  totalRecordCount?: number;
  /** `data` đã là trang hiện tại — không slice thêm theo page/pageSize. */
  serverPaginated?: boolean;
}

/*
 * Z-INDEX HIERARCHY (within table scroll container):
 *   z-[1]  : body sticky cells (left/right columns)
 *   z-[2]  : thead row (sticky top)
 *   z-[3]  : thead sticky corners (left+top / right+top)
 */

function GenericTable<T>({
  data, columns, isLoading,
  selectedIds, onToggleSelection, onToggleAll,
  page, pageSize, onPageChange, onPageSizeChange,
  sort, onSort,
  renderCell, renderMobileCard,
  onRowClick, keyExtractor,
  density = 'default',
  enableVirtualScroll = true,
  onResizeColumn,
  stickyLeftCount = 1,
  loadingText = 'Đang tải dữ liệu',
  emptyTitle,
  emptyDescription,
  renderSummaryRow,
  renderColumnHeaderAccessory,
  hideSortOnColumnLabel = false,
  totalRecordCount,
  serverPaginated = false,
}: GenericTableProps<T>) {

  const visibleColumns = useMemo(() =>
    [...columns].filter(c => c.visible).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [columns]
  );

  /** Cột dữ liệu (bỏ 'actions') – cột Thao tác luôn render riêng cố định bên phải */
  const dataColumns = useMemo(
    () => visibleColumns.filter(col => col.id !== 'actions'),
    [visibleColumns]
  );

  /** Tổng minWidth của bảng để luôn cuộn ngang khi nhiều cột, tránh ép cột xuống dòng */
  const tableMinWidth = useMemo(() => {
    const cols = dataColumns.reduce((sum, c) => sum + (c.width ?? c.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH), 0);
    return TABLE_CHECKBOX_WIDTH + cols + TABLE_ACTION_COLUMN_WIDTH;
  }, [dataColumns]);

  /** Tính left offset tích lũy cho từng cột sticky (sau checkbox) */
  const stickyLeftOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = TABLE_CHECKBOX_WIDTH - 1; // -1px overlap checkbox → cột đầu
    for (let i = 0; i < stickyLeftCount && i < dataColumns.length; i++) {
      offsets.push(acc);
      const col = dataColumns[i];
      acc += col.width ?? col.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH;
    }
    return offsets;
  }, [dataColumns, stickyLeftCount]);
  const totalRecords = totalRecordCount ?? data.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const paginatedData = useMemo(() => {
    if (serverPaginated) return data;
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize, serverPaginated]);

  const currentPageIds = useMemo(() => {
    const extract = keyExtractor ?? ((item: T) => (item as { id?: string })?.id ?? '');
    return paginatedData.map(extract);
  }, [paginatedData, keyExtractor]);
  const isAllSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const isIndeterminate = currentPageIds.some(id => selectedIds.has(id)) && !isAllSelected;

  // Virtual scroll setup – chỉ kích hoạt khi có nhiều dòng
  const useVirtual = enableVirtualScroll && paginatedData.length > VIRTUAL_THRESHOLD;
  const virtualParentRef = useRef<HTMLDivElement>(null);
  const rowHeight = density === 'compact' ? 32 : density === 'comfortable' ? 48 : 38;
  // TanStack Virtual intentionally returns non-memoizable helpers; safe here.
  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer
  const rowVirtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => virtualParentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  // Scroll shadow state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollShadow, setScrollShadow] = useState({ left: false, right: false });

  const setTableScrollEl = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    virtualParentRef.current = el;
  }, []);

  const updateScrollShadow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollShadow({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollShadow();
    el.addEventListener('scroll', updateScrollShadow, { passive: true });
    const ro = new ResizeObserver(updateScrollShadow);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollShadow); ro.disconnect(); };
  }, [updateScrollShadow, isLoading]);

  // Go-to-page
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  const handleGoToPage = useCallback(() => {
    const p = parseInt(pageInput);
    if (p >= 1 && p <= totalPages) onPageChange(p);
    setEditingPage(false);
  }, [pageInput, totalPages, onPageChange]);

  useEffect(() => {
    if (!editingPage) return;
    const id = requestAnimationFrame(() => pageInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [editingPage]);

  // Sort handler
  const handleHeaderClick = useCallback((colId: string) => {
    if (!onSort) return;
    if (sort?.column === colId) {
      if (sort.direction === 'asc') onSort(colId, 'desc');
      else if (sort.direction === 'desc') onSort(null, null);
      else onSort(colId, 'asc');
    } else {
      onSort(colId, 'asc');
    }
  }, [onSort, sort]);

  // Column resize handler
  const resizingRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, colId: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colId, startX: e.clientX, startW: currentWidth };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(resizingRef.current.startW + delta, 50);
      onResizeColumn?.(resizingRef.current.colId, newW);
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [onResizeColumn]);

  /** Padding dọc ô (tbody) — default 38px hàng, compact 32px */
  const cellPy = density === 'compact' ? 'py-1' : density === 'comfortable' ? 'py-3' : 'py-1.5';
  /** Padding header — khớp mật độ với body */
  const headerPy = density === 'compact' ? 'py-1' : density === 'comfortable' ? 'py-2' : 'py-1.5';

  // Skeleton loading: strip icon xoay + chữ primary (Nhân sự, ...) rồi skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-card overflow-hidden" aria-live="polite" aria-busy="true" aria-label={loadingText}>
        <div className="shrink-0 py-3 px-3 sm:px-4 border-b border-border/50 bg-muted/20">
          <LoadingSpinnerWithText text={loadingText} centered />
        </div>
        <div className="hidden md:block flex-1 min-h-0 overflow-hidden">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className={cn('w-[44px] px-3 border-b border-border', headerPy)}><div className="w-4 h-4 bg-muted rounded animate-pulse" /></th>
                {dataColumns.map(col => (
                  <th key={col.id} className={cn('px-4 border-b border-border min-w-0', headerPy)} style={getColumnCellStyle(col)}>
                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                  </th>
                ))}
                <th className={cn('w-[92px] px-3 border-b border-border', headerPy)}><div className="h-3 w-12 bg-muted rounded animate-pulse mx-auto" /></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="[&>td]:border-b [&>td]:border-border">
                  <td className="px-3 py-2.5"><div className="w-4 h-4 bg-muted/60 rounded animate-pulse" /></td>
                  {dataColumns.map(col => (
                    <td key={col.id} className="px-4 py-2.5">
                      <div className={cn("h-3 bg-muted/60 rounded animate-pulse", i % 2 === 0 ? "w-3/4" : "w-1/2")} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5"><div className="flex gap-1 justify-center">{[1,2,3].map(n => <div key={n} className="w-6 h-6 bg-muted/40 rounded animate-pulse" />)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden flex-1 space-y-3 px-3 pt-1 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-3.5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2"><div className="h-3.5 w-2/3 bg-muted rounded" /><div className="h-2.5 w-1/3 bg-muted/60 rounded" /></div>
              </div>
              <div className="h-12 bg-muted/30 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-card px-3 py-1.5 flex items-center justify-between shrink-0">
          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          <div className="h-7 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">

      {/* 1. DESKTOP VIEW with scroll shadows */}
      <div className="hidden md:block flex-1 min-h-0 relative">
        {/* Scroll shadow overlays */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-card/80 to-transparent z-[4] pointer-events-none transition-opacity", scrollShadow.left ? "opacity-100" : "opacity-0")} />
        <div className={cn("absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-card/80 to-transparent z-[4] pointer-events-none transition-opacity", scrollShadow.right ? "opacity-100" : "opacity-0")} />

        <div
          ref={setTableScrollEl}
          className="h-full overflow-auto custom-scrollbar [contain:layout_paint]"
          style={{ overscrollBehavior: 'contain' }}
        >
          <table className="text-sm text-left border-separate border-spacing-0" style={{ minWidth: tableMinWidth, width: '100%' }}>
            <thead className="sticky top-0 z-[2]">
              {renderSummaryRow && (
                <tr className="bg-muted/60 border-b border-border/80">
                  <th
                    className={cn(
                      "sticky left-0 z-[3] px-3 py-1.5 border-b border-r border-border/80 text-center text-xs font-medium",
                      "bg-muted border-l-2 border-l-primary/50 text-muted-foreground"
                    )}
                    style={{ width: TABLE_CHECKBOX_WIDTH, minWidth: TABLE_CHECKBOX_WIDTH, maxWidth: TABLE_CHECKBOX_WIDTH }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Sigma size={12} className="opacity-70 shrink-0" aria-hidden />
                      <span className="tabular-nums">{data.length > 0 ? data.length : '—'}</span>
                    </div>
                  </th>
                  {dataColumns.map((col, index) => {
                    const isSticky = index < stickyLeftCount;
                    const colStyle: React.CSSProperties = col.width
                      ? { ...getColumnCellStyle(col), width: col.width }
                      : getColumnCellStyle(col);
                    if (isSticky) {
                      colStyle.left = stickyLeftOffsets[index];
                    }
                    return (
                      <th
                        key={col.id}
                        className={cn(
                          "px-4 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/80 whitespace-nowrap",
                          isSticky && "sticky z-[3] bg-muted border-r border-border/80"
                        )}
                        style={colStyle}
                      >
                        <div className="min-w-0 overflow-hidden text-ellipsis">
                          {renderSummaryRow(col.id, data)}
                        </div>
                      </th>
                    );
                  })}
                  <th
                    className="sticky right-0 z-[3] px-3 py-1.5 bg-muted border-b border-l border-border/80 text-center"
                    style={{ width: TABLE_ACTION_COLUMN_WIDTH }}
                  >
                    {renderSummaryRow ? renderSummaryRow('actions', data) : null}
                  </th>
                </tr>
              )}
              <tr className="bg-muted border-b border-border">
                <th className={cn('sticky left-0 z-[3] px-3 bg-muted border-b border-r border-border text-center', headerPy)} style={{ width: TABLE_CHECKBOX_WIDTH, minWidth: TABLE_CHECKBOX_WIDTH, maxWidth: TABLE_CHECKBOX_WIDTH }}>
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                      onChange={() => onToggleAll(currentPageIds)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-primary transition-colors"
                    />
                  </div>
                </th>

                {dataColumns.map((col, index) => {
                  const isSticky = index < stickyLeftCount;
                  const isSorted = sort?.column === col.id;
                  const sortable = !!onSort;
                  const showLabelSortButton = sortable && !hideSortOnColumnLabel;
                  const colStyle: React.CSSProperties = col.width
                    ? { ...getColumnCellStyle(col), width: col.width }
                    : getColumnCellStyle(col);
                  if (isSticky) {
                    colStyle.left = stickyLeftOffsets[index];
                  }
                  const accessory = renderColumnHeaderAccessory?.(col);
                  return (
                    <th
                      key={col.id}
                      className={cn(
                        "px-4 font-semibold text-foreground/80 border-b border-border text-xs whitespace-nowrap transition-colors select-none relative",
                        headerPy,
                        isSticky && "sticky z-[3] bg-muted border-r border-border",
                      )}
                      style={colStyle}
                    >
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        {showLabelSortButton ? (
                          <button
                            type="button"
                            className={cn(
                              'flex items-center gap-1 min-w-0 flex-1 text-left font-semibold text-inherit bg-transparent border-0 p-0',
                              'cursor-pointer hover:text-foreground group',
                            )}
                            onClick={() => handleHeaderClick(col.id)}
                          >
                            <span className="truncate">{col.label}</span>
                            <span className={cn('shrink-0 transition-opacity', isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40')}>
                              {isSorted && sort?.direction === 'desc'
                                ? <ArrowDown size={12} className="text-primary" />
                                : <ArrowUp size={12} className={isSorted ? 'text-primary' : ''} />
                              }
                            </span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <span className="truncate">{col.label}</span>
                          </div>
                        )}
                        {accessory ? (
                          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- chặn bubble để không kích hoạt sort khi mở filter cột
                          <div
                            className="shrink-0"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {accessory}
                          </div>
                        ) : null}
                      </div>
                      {/* Column resize handle */}
                      {onResizeColumn && (
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- column resize drag handle
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          onMouseDown={(e) => {
                            const th = e.currentTarget.parentElement;
                            handleResizeStart(e, col.id, th?.offsetWidth ?? col.minWidth ?? 100);
                          }}
                          className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group/handle hover:bg-primary/30 active:bg-primary/50 transition-colors"
                        >
                          <div className="absolute right-[2px] top-1/2 -translate-y-1/2 w-[1px] h-3.5 bg-border group-hover/handle:bg-primary/60 transition-colors" />
                        </div>
                      )}
                    </th>
                  );
                })}

                <th
                  className={cn(
                    'sticky right-0 z-[3] px-3 bg-muted border-b border-l border-border text-center font-semibold text-foreground/80 text-xs',
                    headerPy,
                  )}
                  style={{ width: TABLE_ACTION_COLUMN_WIDTH }}
                >
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={dataColumns.length + 2} className="py-16 text-center bg-card">
                    <EmptyState title={emptyTitle} description={emptyDescription} />
                  </td>
                </tr>
              ) : (
                (() => {
                  const items = useVirtual ? rowVirtualizer.getVirtualItems() : paginatedData.map((_, i) => ({ index: i, size: rowHeight, start: 0 }));
                  const totalSize = useVirtual ? rowVirtualizer.getTotalSize() : 0;

                  return (
                    <>
                      {/* Spacer top khi dùng virtual scroll */}
                      {useVirtual && items.length > 0 && items[0].start > 0 && (
                        <tr><td colSpan={dataColumns.length + 2} style={{ height: items[0].start, padding: 0, border: 'none' }} /></tr>
                      )}

                      {items.map((virtualRow) => {
                        const item = paginatedData[virtualRow.index];
                        if (!item) return null;
                        const itemId = keyExtractor(item);
                        const isSelected = selectedIds.has(itemId);

                        const rowClass = isSelected
                          ? 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                          : 'bg-card even:bg-muted/15 hover:bg-accent transition-colors duration-150';

                        // Sticky cells cần nền đặc (opaque) để không bị xuyên thấu khi cuộn ngang
                        const stickyCellClass = isSelected
                          ? 'bg-accent group-hover:bg-accent'
                          : 'bg-card group-hover:bg-accent transition-colors duration-150';

                        return (
                          <tr
                            key={itemId}
                            data-index={virtualRow.index}
                            ref={useVirtual ? rowVirtualizer.measureElement : undefined}
                            onClick={() => onRowClick?.(item)}
                            className={`group cursor-pointer ${rowClass} [&>td]:border-b [&>td]:border-border`}
                          >
                            <td
                              className={`sticky left-0 z-[1] px-3 ${cellPy} border-r border-border text-center ${stickyCellClass}`}
                              style={{ width: TABLE_CHECKBOX_WIDTH, minWidth: TABLE_CHECKBOX_WIDTH, maxWidth: TABLE_CHECKBOX_WIDTH }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => onToggleSelection(itemId)}
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer accent-primary transition-colors"
                                />
                              </div>
                            </td>

                            {dataColumns.map((col, index) => {
                              const isSticky = index < stickyLeftCount;
                              const tdStyle: React.CSSProperties = {
                                ...getColumnCellStyle(col),
                                ...(col.width != null ? { width: col.width } : {}),
                              };
                              if (isSticky) {
                                tdStyle.left = stickyLeftOffsets[index];
                              }
                              return (
                                <td
                                  key={col.id}
                                  className={cn(
                                    `px-4 ${cellPy}`,
                                    isSticky && `sticky z-[1] border-r border-border/50 ${stickyCellClass}`
                                  )}
                                  style={tdStyle}
                                >
                                  <div className="min-w-0 max-w-full overflow-hidden">
                                    {renderCell(col.id, item)}
                                  </div>
                                </td>
                              );
                            })}

                            <td
                              className={`sticky right-0 z-[1] px-2 ${cellPy} border-l border-border/50 text-center ${stickyCellClass}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderCell('actions', item)}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Spacer bottom khi dùng virtual scroll */}
                      {useVirtual && items.length > 0 && (
                        <tr><td colSpan={dataColumns.length + 2} style={{ height: totalSize - (items[items.length - 1].start + items[items.length - 1].size), padding: 0, border: 'none' }} /></tr>
                      )}
                    </>
                  );
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. MOBILE VIEW */}
      <div className="md:hidden flex-1 min-h-0 space-y-3 overflow-y-auto pb-3 px-3 pt-1">
        {data.length === 0 ? (
          <div className="py-12"><EmptyState title={emptyTitle} description={emptyDescription} /></div>
        ) : (
          paginatedData.map((item) => {
            const itemId = keyExtractor(item);
            const isSelected = selectedIds.has(itemId);
            return (
              <div key={itemId} className="transition-[transform,opacity] duration-150 active:scale-[0.98]">
                {renderMobileCard(item, isSelected)}
              </div>
            );
          })
        )}
      </div>

      {/* 3. FOOTER */}
      {totalRecords > 0 && (
        <div className="border-t border-border bg-card md:bg-muted/10 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 shrink-0">

          {/* Left: Record summary + selected count */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <span className="tabular-nums">
              <span className="font-medium text-foreground">{Math.min((page - 1) * pageSize + 1, totalRecords)}–{Math.min(page * pageSize, totalRecords)}</span>
              <span className="text-muted-foreground/60">/Tổng:</span>
              <span className="font-semibold text-foreground">{totalRecords}</span>
            </span>

            {/* Selected count: badge on mobile, text on desktop */}
            {selectedIds.size > 0 && (
              <>
                <span className="text-primary font-medium hidden sm:inline">
                  · {selectedIds.size} đã chọn
                </span>
                <span className="sm:hidden inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-primary/15 text-primary text-xs font-bold tabular-nums">
                  {selectedIds.size}✓
                </span>
              </>
            )}

            {/* Page size select: desktop + mobile (dùng chung component) */}
            <div className="flex items-center border-l border-border pl-2">
              <PageSizeSelect
                value={pageSize}
                onChange={onPageSizeChange}
                totalRecords={totalRecords}
                compact={false}
                className="hidden sm:inline-flex"
              />
              <PageSizeSelect
                value={pageSize}
                onChange={onPageSizeChange}
                totalRecords={totalRecords}
                perPageLabel=""
                compact
                className="sm:hidden"
                aria-label="Số bản ghi mỗi trang"
              />
            </div>
          </div>

          {/* Right: Pagination controls */}
          <div className="flex items-center gap-0.5">
            <Tooltip content="Trang đầu" placement="top">
              <Button
                variant="outline" size="sm"
                disabled={page === 1}
                onClick={() => onPageChange(1)}
                className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
              >
                <ChevronsLeft size={13} />
              </Button>
            </Tooltip>
            <Tooltip content="Trang trước" placement="top">
              <Button
                variant="outline" size="sm"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
              >
                <ChevronLeft size={13} />
              </Button>
            </Tooltip>

            <Tooltip content="Nhấn đúp để nhập trang" placement="top">
              <div className="flex items-center gap-0.5 px-1">
                {editingPage ? (
                  <input
                    ref={pageInputRef}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                    onBlur={handleGoToPage}
                    onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
                    className="h-6 w-10 text-center text-xs font-bold border border-primary rounded bg-background text-foreground outline-none tabular-nums"
                  />
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => {
                      setEditingPage(true);
                      setPageInput(String(page));
                      setTimeout(() => pageInputRef.current?.select(), 50);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditingPage(true);
                        setPageInput(String(page));
                        setTimeout(() => pageInputRef.current?.select(), 50);
                      }
                    }}
                    className="h-6 min-w-[24px] flex items-center justify-center rounded bg-primary text-white text-xs font-bold px-1 tabular-nums cursor-default"
                  >
                    {page}
                  </span>
                )}
                <span className="text-muted-foreground/40 text-xs">/</span>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{totalPages || 1}</span>
              </div>
            </Tooltip>

            <Tooltip content="Trang sau" placement="top">
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
              >
                <ChevronRight size={13} />
              </Button>
            </Tooltip>
            <Tooltip content="Trang cuối" placement="top">
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(totalPages)}
                className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
              >
                <ChevronsRight size={13} />
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(GenericTable) as typeof GenericTable;
