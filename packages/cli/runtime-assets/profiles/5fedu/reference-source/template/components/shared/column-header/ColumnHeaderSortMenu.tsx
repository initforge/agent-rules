import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import MultiSelect from '@/components/ui/MultiSelect';
import type { SortState } from '@/store/createGenericStore';
import { cn } from '@/lib/utils';
import { ColumnHeaderSortButtons } from './ColumnHeaderSortButtons';

/**
 * Chỉ sắp xếp A–Z / Z–A (cột không có lọc giá trị).
 * Quy tắc listview: mọi cột hiển thị đều có nút thao tác (sliders); cột có filter dùng `ColumnHeaderFilter`.
 */
export function ColumnHeaderSortMenu({
  ariaLabel,
  sortColumnId,
  sort,
  setSort,
  /** Ô lọc theo giá trị cột (trong dropdown, dưới sort). */
  columnSearch,
  columnSearchActive,
}: {
  ariaLabel: string;
  sortColumnId: string;
  sort: SortState;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  columnSearch?: React.ReactNode;
  columnSearchActive?: boolean;
}) {
  const isAscActive = sort.column === sortColumnId && sort.direction === 'asc';
  const isDescActive = sort.column === sortColumnId && sort.direction === 'desc';
  const triggerActive = isAscActive || isDescActive || !!columnSearchActive;

  return (
    <MultiSelect
      dropdownOnly
      omitFilterSections
      className="z-[60]"
      options={[]}
      value={[]}
      onChange={() => {}}
      placeholder={ariaLabel}
      suppressSearchAutofocus
      dropdownTopContent={({ close }) => (
        <div className="flex flex-col gap-2">
          <ColumnHeaderSortButtons
            sortColumnId={sortColumnId}
            sort={sort}
            setSort={setSort}
            close={close}
          />
          {columnSearch ? (
            <div className="pt-1.5 border-t border-border/70">{columnSearch}</div>
          ) : null}
        </div>
      )}
      renderDropdownTrigger={({ open, toggle, listboxId }) => (
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'rounded-md p-0.5 text-muted-foreground transition-colors shrink-0 hover:bg-muted/80 hover:text-foreground',
            triggerActive && 'bg-primary/10 text-primary',
          )}
        >
          <SlidersHorizontal size={12} strokeWidth={2} aria-hidden />
        </button>
      )}
    />
  );
}
