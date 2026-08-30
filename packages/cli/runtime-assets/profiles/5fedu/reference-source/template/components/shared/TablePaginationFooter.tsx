import React, { useState, useRef, useEffect } from 'react';
import { txt } from '@/lib/text';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import PageSizeSelect from './PageSizeSelect';
import { cn } from '@/lib/utils';

export interface TablePaginationFooterProps {
  /** Tổng số bản ghi */
  totalRecords: number;
  /** Trang hiện tại (1-based) */
  page: number;
  /** Số bản ghi mỗi trang */
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Số bản ghi đã chọn (hiển thị badge) */
  selectedCount?: number;
  /** Label sau số tổng, vd: "bản ghi" / "records" */
  recordsLabel: string;
  /** Các lựa chọn pageSize */
  pageSizeOptions?: number[];
  /** Class cho container */
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

/**
 * Footer phân trang dùng chung cho bảng/danh sách: tổng bản ghi, khoảng đang xem,
 * số đã chọn, chọn page size, nút first/prev/page/next/last (double-click trang để nhập số).
 */
export const TablePaginationFooter: React.FC<TablePaginationFooterProps> = ({
  totalRecords,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectedCount = 0,
  recordsLabel: _recordsLabel,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}) => {
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const start = totalRecords === 0 ? 0 : Math.min((page - 1) * pageSize + 1, totalRecords);
  const end = Math.min(page * pageSize, totalRecords);

  const handleGoToPage = () => {
    const num = parseInt(pageInput, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num);
    }
    setEditingPage(false);
    setPageInput('');
  };

  useEffect(() => {
    if (!editingPage) queueMicrotask(() => setPageInput(''));
  }, [editingPage]);

  useEffect(() => {
    if (!editingPage || !pageInputRef.current) return;
    pageInputRef.current.focus();
    queueMicrotask(() => pageInputRef.current?.select());
  }, [editingPage]);

  return (
    <div
      className={cn(
        'border-t border-border bg-card md:bg-muted/10 px-3 sm:px-4 py-1.5',
        'flex items-center justify-between gap-2 shrink-0 min-w-0',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
        <span className="tabular-nums whitespace-nowrap">
          <span className="font-medium text-foreground">{start}–{end}</span>
          <span className="text-muted-foreground/60">/Tổng:</span>
          <span className="font-semibold text-foreground">{totalRecords}</span>
        </span>
        {selectedCount > 0 && (
          <>
            <span className="text-primary font-medium hidden sm:inline tabular-nums">
              · {selectedCount} {txt('common.selected')}
            </span>
            <span className="sm:hidden inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-primary/15 text-primary text-xs font-bold tabular-nums">
              {selectedCount}✓
            </span>
          </>
        )}
        <div className="flex items-center border-l border-border pl-2 shrink-0">
          <PageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
            options={pageSizeOptions}
            totalRecords={totalRecords}
            perPageLabel={txt('common.perPage')}
            allLabel={txt('common.all')}
            className="hidden sm:inline-flex"
          />
          <PageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
            options={pageSizeOptions}
            totalRecords={totalRecords}
            perPageLabel=""
            allLabel={txt('common.all')}
            compact
            className="sm:hidden"
            aria-label={txt('common.perPage')}
          />
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Tooltip content={txt('common.firstPage')} placement="top">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => onPageChange(1)}
            className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
          >
            <ChevronsLeft size={13} />
          </Button>
        </Tooltip>
        <Tooltip content={txt('common.prevPage')} placement="top">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
          >
            <ChevronLeft size={13} />
          </Button>
        </Tooltip>
        <Tooltip content={txt('common.doubleClickToPage')} placement="top">
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
              <button
                type="button"
                title={txt('common.doubleClickToPage')}
                onDoubleClick={() => {
                  setEditingPage(true);
                  setPageInput(String(page));
                }}
                className="h-6 min-w-[24px] flex items-center justify-center rounded bg-primary text-white text-xs font-bold px-1 tabular-nums cursor-default border-0"
              >
                {page}
              </button>
            )}
            <span className="text-muted-foreground/40 text-xs">/</span>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">{totalPages}</span>
          </div>
        </Tooltip>
        <Tooltip content={txt('common.nextPage')} placement="top">
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-all"
          >
            <ChevronRight size={13} />
          </Button>
        </Tooltip>
        <Tooltip content={txt('common.lastPage')} placement="top">
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="h-6 w-6 p-0 border-border rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
          >
            <ChevronsRight size={13} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default TablePaginationFooter;
