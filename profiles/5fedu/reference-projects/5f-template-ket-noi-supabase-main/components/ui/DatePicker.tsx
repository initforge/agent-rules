import React, { useId } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  /** YYYY-MM-DD hoặc '' */
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  min?: string;
  max?: string;
}

const inputCls = (error?: string) =>
  cn(
    'flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums',
    'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-destructive focus-visible:ring-destructive' : ''
  );

/**
 * Chọn một ngày — giá trị ISO ngày `YYYY-MM-DD` (khớp `<input type="date">`).
 */
const DatePicker: React.FC<DatePickerProps> = ({
  label,
  error,
  required,
  disabled,
  className,
  icon,
  value = '',
  onChange,
  name,
  min,
  max,
}) => {
  const autoId = useId();
  const inputId = `date-${autoId.replace(/:/g, '')}`;
  const errorId = error ? `${inputId}-err` : undefined;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 flex items-center gap-1.5 text-foreground"
        >
          {icon ?? <Calendar className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
          {label}
          {required && <span className="text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <input
        id={inputId}
        type="date"
        name={name}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={inputCls(error)}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">
          {error}
        </p>
      )}
    </div>
  );
};

export default DatePicker;
