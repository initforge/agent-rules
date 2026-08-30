import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import MultiSelect from '@/components/ui/MultiSelect';
import type { Option } from '@/components/ui/MultiSelect';
import type { SortState } from '@/store/createGenericStore';
import { filterOptionsWithCount } from '@/lib/filterOptionsWithCount';
import { cn } from '@/lib/utils';
import { ColumnHeaderSortButtons } from './ColumnHeaderSortButtons';

/**
 * Menu header cột (desktop): sắp xếp A–Z / Z–A + lọc multi-select (cùng store với toolbar).
 * Một ô tìm duy nhất trong panel: ô tìm của MultiSelect (không thêm ô lọc text cột riêng).
 */
export function ColumnHeaderFilter({
  options,
  value,
  onChange,
  ariaLabel,
  sortColumnId,
  sort,
  setSort,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  ariaLabel: string;
  sortColumnId: string;
  sort: SortState;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
}) {
  const visible = filterOptionsWithCount(options, value);

  const isAscActive = sort.column === sortColumnId && sort.direction === 'asc';
  const isDescActive = sort.column === sortColumnId && sort.direction === 'desc';
  const sortActive = isAscActive || isDescActive;
  const hasFilter = value.length > 0;
  const triggerActive = hasFilter || sortActive;

  return (
    <MultiSelect
      dropdownOnly
      suppressSearchAutofocus
      className="z-[60]"
      options={visible}
      value={value}
      onChange={onChange}
      placeholder={ariaLabel}
      dropdownTopContent={({ close }) => (
        <ColumnHeaderSortButtons
          sortColumnId={sortColumnId}
          sort={sort}
          setSort={setSort}
          close={close}
        />
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
