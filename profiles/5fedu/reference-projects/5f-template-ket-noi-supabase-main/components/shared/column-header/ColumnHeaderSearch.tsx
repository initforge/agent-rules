import React from 'react';
import { Search } from 'lucide-react';
import { txt } from '@/lib/text';
import { cn } from '@/lib/utils';

/**
 * Ô lọc text theo giá trị hiển thị cột — chỉ dùng cho cột **không** có MultiSelect
 * (cột Phòng ban / Chức vụ / Trạng thái dùng một ô `MultiSelect` duy nhất: sort + tìm + tick).
 */
export function ColumnHeaderSearch({
  value,
  onChange,
  ariaLabel,
  className,
  variant = 'inDropdown',
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  className?: string;
  /** `inDropdown`: cùng layout với ô tìm trong `MultiSelect` (icon + input). */
  variant?: 'inDropdown' | 'inlineHeader';
}) {
  if (variant === 'inDropdown') {
    return (
      <div className="relative w-full min-w-0">
        <Search
          size={13}
          className="pointer-events-none absolute left-2 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          enterKeyHint="search"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={txt('common.search')}
          className={cn(
            'w-full min-w-0 border border-border rounded-lg bg-background py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary',
            className,
          )}
        />
      </div>
    );
  }

  return (
    <input
      type="search"
      enterKeyHint="search"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      placeholder={txt('employee.columnHeader.searchPlaceholder')}
      className={cn(
        'h-6 min-w-[2.75rem] w-[3.75rem] sm:w-[5rem] max-w-[6.5rem] shrink-0 rounded border border-border/80 bg-background px-1 py-0 text-[10px] leading-tight text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-1 focus:ring-primary/35',
        className,
      )}
    />
  );
}
