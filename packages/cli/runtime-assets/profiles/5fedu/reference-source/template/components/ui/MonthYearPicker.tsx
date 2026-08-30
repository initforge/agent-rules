import React, { useId } from 'react';
import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MonthYearPickerProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  /**
   * Tháng-năm: `YYYY-MM` (khớp `<input type="month">`).
   * Chỉ năm: đặt `yearOnly` — value là `YYYY` (four digits string).
   */
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  /** Chỉ chọn năm (input number), không dùng type="month" */
  yearOnly?: boolean;
  minYear?: number;
  maxYear?: number;
}

const inputCls = (error?: string) =>
  cn(
    'flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums',
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-destructive focus-visible:ring-destructive' : ''
  );

const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  label,
  error,
  required,
  disabled,
  className,
  icon,
  value = '',
  onChange,
  name,
  yearOnly = false,
  minYear = 1990,
  maxYear = 2100,
}) => {
  const autoId = useId();
  const inputId = `my-${autoId.replace(/:/g, '')}`;
  const errorId = error ? `${inputId}-err` : undefined;

  const yearNum = yearOnly ? (value ? parseInt(value, 10) : '') : '';

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
        >
          {icon ?? <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
          {label}
          {required && <span className="text-destructive" aria-hidden>*</span>}
        </label>
      )}
      {yearOnly ? (
        <input
          id={inputId}
          type="number"
          name={name}
          disabled={disabled}
          value={yearNum === '' ? '' : yearNum}
          min={minYear}
          max={maxYear}
          step={1}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? '' : String(parseInt(v, 10)));
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={inputCls(error)}
        />
      ) : (
        <input
          id={inputId}
          type="month"
          name={name}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={inputCls(error)}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  );
};

export default MonthYearPicker;
