import React from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import type { SortState } from '@/store/createGenericStore';
import { cn } from '@/lib/utils';
import { txt } from '@/lib/text';

export function ColumnHeaderSortButtons({
  sortColumnId,
  sort,
  setSort,
  close,
}: {
  sortColumnId: string;
  sort: SortState;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  close: () => void;
}) {
  const isAscActive = sort.column === sortColumnId && sort.direction === 'asc';
  const isDescActive = sort.column === sortColumnId && sort.direction === 'desc';

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
          isAscActive
            ? 'bg-primary/15 font-medium text-primary'
            : 'text-foreground hover:bg-muted/80',
        )}
        onClick={() => {
          setSort(sortColumnId, 'asc');
          close();
        }}
      >
        <ArrowDownWideNarrow size={14} className="shrink-0 opacity-80" aria-hidden />
        <span>{txt('employee.columnHeader.sortAsc')}</span>
      </button>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
          isDescActive
            ? 'bg-primary/15 font-medium text-primary'
            : 'text-foreground hover:bg-muted/80',
        )}
        onClick={() => {
          setSort(sortColumnId, 'desc');
          close();
        }}
      >
        <ArrowUpNarrowWide size={14} className="shrink-0 opacity-80" aria-hidden />
        <span>{txt('employee.columnHeader.sortDesc')}</span>
      </button>
    </div>
  );
}
