
import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BadgeColor } from './EnumBadge';

/* ------------------------------------------------------------------ */
/*  Color palette – đồng bộ với EnumBadge COLOR_CLASSES                */
/* ------------------------------------------------------------------ */

const SELECTED_COLOR_CLASSES: Record<string, string> = {
  primary:
    'bg-primary/10 text-primary border-primary/30 ring-primary/20',
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 dark:ring-emerald-900/30',
  blue:
    'bg-blue-50 text-blue-700 border-blue-200 ring-blue-200/50 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 dark:ring-blue-900/30',
  amber:
    'bg-amber-50 text-amber-700 border-amber-200 ring-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 dark:ring-amber-900/30',
  rose:
    'bg-rose-50 text-rose-700 border-rose-200 ring-rose-200/50 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800 dark:ring-rose-900/30',
  indigo:
    'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-200/50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800 dark:ring-indigo-900/30',
  pink:
    'bg-pink-50 text-pink-700 border-pink-200 ring-pink-200/50 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-800 dark:ring-pink-900/30',
  violet:
    'bg-violet-50 text-violet-700 border-violet-200 ring-violet-200/50 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800 dark:ring-violet-900/30',
  sky:
    'bg-sky-50 text-sky-700 border-sky-200 ring-sky-200/50 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800 dark:ring-sky-900/30',
  slate:
    'bg-muted text-foreground border-border ring-border/50',
  cyan:
    'bg-cyan-50 text-cyan-700 border-cyan-200 ring-cyan-200/50 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-800 dark:ring-cyan-900/30',
};

/** Màu dot – dùng inline style để tránh dynamic class bị Tailwind purge */
const DOT_HEX: Record<string, string> = {
  emerald: '#10b981', blue: '#3b82f6', amber: '#f59e0b', rose: '#f43f5e',
  indigo: '#6366f1', pink: '#ec4899', violet: '#8b5cf6', sky: '#0ea5e9',
  slate: '#94a3b8', cyan: '#06b6d4',
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RadioOption {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  /** Màu accent khi được chọn – tái sử dụng palette từ EnumBadge */
  color?: BadgeColor;
}

export interface RadioGroupProps {
  label?: string;
  /** Icon cạnh nhãn (đồng bộ Input / Combobox) */
  labelIcon?: React.ReactNode;
  options: RadioOption[];
  value?: string | number;
  onChange: (value: string | number) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Layout hiển thị:
   * - `auto` (mặc định): tự chọn – ≤4 options → segmented ngang, 5+ → grid 2 cột
   * - `horizontal`: segmented control ngang (wrap khi chật)
   * - `vertical`: danh sách dọc full-width
   * - `grid`: lưới 2 cột
   */
  layout?: 'auto' | 'horizontal' | 'vertical' | 'grid';
  /** Kích thước: sm, md (mặc định), lg */
  size?: 'sm' | 'md' | 'lg';
  /** Hiển thị chấm tròn màu thay vì icon */
  showColorDot?: boolean;
  /** Hiển thị icon ✓ khi selected */
  showCheck?: boolean;
  /** @deprecated Dùng layout thay direction */
  direction?: 'horizontal' | 'vertical';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * RadioGroup – nhóm nút chọn dạng segmented / grid / vertical.
 * Hỗ trợ color-coded options, color dot, check icon, layout thích ứng.
 */
const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  labelIcon,
  options,
  value,
  onChange,
  error,
  required,
  disabled = false,
  className,
  layout = 'auto',
  size = 'md',
  showColorDot = false,
  showCheck = false,
  direction,
}) => {
  /* ----- Resolve layout ----- */
  const resolvedLayout = (() => {
    // Backward compat: direction prop
    if (direction === 'vertical') return 'vertical';
    if (direction === 'horizontal') return 'horizontal';
    if (layout !== 'auto') return layout;
    // Auto: ≤4 → horizontal, 5+ → grid
    return options.length <= 4 ? 'horizontal' : 'grid';
  })();

  const isSegmented = resolvedLayout === 'horizontal';
  const isGrid = resolvedLayout === 'grid';
  const isVertical = resolvedLayout === 'vertical';

  /* ----- Size classes ----- */
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-4 py-2.5 text-sm gap-2',
  };

  /* ----- Container classes ----- */
  const containerClass = cn(
    isSegmented && 'inline-flex flex-wrap rounded-lg border border-border bg-muted/30 p-0.5 w-full',
    isSegmented && size === 'sm' && 'min-h-10 items-stretch',
    isGrid && 'grid grid-cols-2 gap-1.5',
    isVertical && 'flex flex-col gap-1.5',
    disabled && 'opacity-50 pointer-events-none',
  );

  /* ----- Render single option button ----- */
  const renderOption = (option: RadioOption) => {
    const isSelected = value === option.value;
    const color = option.color;

    // Selected color classes
    const selectedClasses = color
      ? cn(SELECTED_COLOR_CLASSES[color] ?? SELECTED_COLOR_CLASSES.slate, 'ring-1')
      : 'bg-background text-foreground shadow-sm border-border ring-1 ring-border/50';

    // Unselected classes
    const unselectedClasses =
      'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent';

    return (
      <button
        key={option.value}
        type="button"
        onClick={() => !disabled && onChange(option.value)}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 select-none border',
          sizeClasses[size],
          isSegmented && 'flex-1 min-w-0',
          isSegmented && size === 'sm' && 'min-h-9',
          isSelected
            ? cn(selectedClasses, 'font-semibold')
            : unselectedClasses,
        )}
      >
        {/* Color dot */}
        {showColorDot && color && (
          <span
            className="shrink-0 w-2 h-2 rounded-full transition-opacity duration-200"
            style={{
              backgroundColor: DOT_HEX[color] ?? DOT_HEX.slate,
              opacity: isSelected ? 1 : 0.4,
            }}
          />
        )}

        {/* Custom icon (nếu không dùng color dot) */}
        {!showColorDot && option.icon && (
          <span className={cn('shrink-0 transition-opacity', isSelected ? 'opacity-100' : 'opacity-50')}>
            {option.icon}
          </span>
        )}

        {/* Label */}
        <span className="truncate">{option.label}</span>

        {/* Check icon */}
        {showCheck && isSelected && (
          <Check size={13} className="shrink-0 ml-auto" strokeWidth={2.5} />
        )}
      </button>
    );
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground">
          {labelIcon && <span className="text-muted-foreground shrink-0">{labelIcon}</span>}
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className={containerClass}>
        {options.map(renderOption)}
      </div>
      {error && <p className="text-xs font-medium text-destructive mt-1.5 ml-1">{error}</p>}
    </div>
  );
};

export default RadioGroup;
