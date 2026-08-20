import React, { useCallback, useMemo, useState } from 'react';
import { txt } from '@/lib/text';
import {
  getStatsTableScrollMaxHeightCss,
  STATS_TABLE_DEFAULT_PAGE_SIZE,
  STATS_TABLE_MAX_BODY_ROWS,
  STATS_TABLE_PAGE_SIZE_OPTIONS,
} from '@/lib/stats-table';
import { cn } from '@/lib/utils';
import TablePaginationFooter from '@/components/shared/TablePaginationFooter';
import type { StatsTableCardProps as Props } from './types';

const StatsTableCard: React.FC<Props> = ({
  title,
  icon: Icon,
  rows,
  columnLabelKey = 'stats.columnLabel',
  columnValueKey = 'stats.columnValue',
  maxHeight,
  emptyKey = 'stats.noData',
  maxVisibleBodyRows = STATS_TABLE_MAX_BODY_ROWS,
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(STATS_TABLE_DEFAULT_PAGE_SIZE);

  const scrollMaxHeight = maxHeight ?? getStatsTableScrollMaxHeightCss(maxVisibleBodyRows);
  const totalRecords = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const effectivePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, effectivePage, pageSize]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {Icon && <Icon size={14} className="shrink-0 text-primary" aria-hidden />}
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>

      <div
        className={cn(
          'overflow-x-auto overflow-y-auto custom-scrollbar',
          rows.length === 0 && 'p-4',
        )}
        style={{ maxHeight: scrollMaxHeight }}
        role="region"
        aria-label={title}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{txt(emptyKey)}</p>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="sticky top-0 z-[4] bg-muted px-4 py-2 text-left font-semibold text-foreground/80">
                  {txt(columnLabelKey)}
                </th>
                <th className="sticky top-0 z-[4] bg-muted px-4 py-2 text-right font-semibold text-foreground/80">
                  {txt(columnValueKey)}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, idx) => (
                <tr
                  key={row.id ?? `${row.label}-${idx}`}
                  className="border-b border-border/50 even:bg-muted/15 hover:bg-accent transition-colors duration-150"
                >
                  <td className="px-4 py-2 text-foreground">{row.label}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalRecords > 0 && (
        <TablePaginationFooter
          totalRecords={totalRecords}
          page={effectivePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          recordsLabel={txt('stats.footerRecords')}
          pageSizeOptions={[...STATS_TABLE_PAGE_SIZE_OPTIONS]}
          className="w-full shrink-0 rounded-b-xl"
        />
      )}
    </div>
  );
};

export default StatsTableCard;
