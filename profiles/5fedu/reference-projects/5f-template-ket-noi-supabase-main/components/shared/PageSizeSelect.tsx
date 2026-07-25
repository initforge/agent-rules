import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageSizeSelectProps {
  value: number;
  onChange: (size: number) => void;
  options?: number[];
  totalRecords: number;
  perPageLabel?: string;
  allLabel?: string;
  compact?: boolean;
  className?: string;
  'aria-label'?: string;
}

const DEFAULT_OPTIONS = [10, 20, 30, 50, 100];

/** Vạch trái mỗi cấp – mỗi level một màu riêng biệt */
const LEVEL_COLORS = [
  'border-l-emerald-400',
  'border-l-sky-400',
  'border-l-violet-400',
  'border-l-amber-400',
  'border-l-rose-400',
  'border-l-fuchsia-400',
];

export const PageSizeSelect: React.FC<PageSizeSelectProps> = ({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  totalRecords,
  perPageLabel = '/ trang',
  allLabel = 'Tất cả',
  compact = false,
  className,
  'aria-label': ariaLabel = 'Số bản ghi mỗi trang',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const showAllOption = totalRecords > 100 && !options.includes(totalRecords);
  const allOptions = showAllOption ? [...options, totalRecords] : options;
  const displayLabel = value === totalRecords && showAllOption ? allLabel : String(value);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className={cn('inline-flex items-center gap-1', className)} ref={containerRef}>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          onClick={() => setIsOpen((o) => !o)}
          className={cn(
            'inline-flex items-center gap-0.5 tabular-nums font-medium transition-all',
            'border border-border rounded bg-card text-foreground',
            'hover:bg-muted/60 hover:border-primary/30',
            'focus:outline-none focus:ring-1 focus:ring-primary/20',
            isOpen && 'border-primary/40 ring-1 ring-primary/20 bg-muted/60',
            compact
              ? 'h-6 pl-1.5 pr-4 text-xs'
              : 'h-6 pl-2 pr-5 text-xs'
          )}
        >
          {displayLabel}
          <ChevronDown
            size={11}
            strokeWidth={2.5}
            className={cn(
              'absolute text-muted-foreground transition-transform duration-150',
              compact ? 'right-1' : 'right-1.5',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <div
            role="listbox"
            className="absolute left-0 bottom-full z-50 mb-1 min-w-[5rem] rounded-md border border-border bg-card shadow-lg overflow-hidden"
            style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.10)' }}
          >
            {allOptions.map((size, idx) => {
              const isAll = showAllOption && size === totalRecords;
              const label = isAll ? allLabel : String(size);
              const isSelected = value === size;
              const barColor = LEVEL_COLORS[idx % LEVEL_COLORS.length];

              return (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(size); setIsOpen(false); }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 tabular-nums transition-colors',
                    'border-l-[3px] px-2.5 py-1.5 text-xs',
                    barColor,
                    isSelected
                      ? 'bg-primary/8 text-foreground font-bold'
                      : 'bg-card text-foreground/80 font-medium hover:bg-muted/50',
                  )}
                >
                  <span>{label}</span>
                  {isSelected && <Check size={10} strokeWidth={3} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {perPageLabel && (
        <span className="text-muted-foreground/60 text-xs whitespace-nowrap">{perPageLabel}</span>
      )}
    </div>
  );
};

export default PageSizeSelect;
