import React, { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import NumericFormatInput from './NumericFormatInput';
import { cn } from '@/lib/utils';

export interface NumberStepperProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  value?: number;
  onChange?: (value: number) => void;
  name?: string;
  min?: number;
  max?: number;
  step?: number;
  decimalScale?: number;
}

/**
 * Số có nút + / − (số lượng, bước nhỏ).
 */
const NumberStepper: React.FC<NumberStepperProps> = ({
  label,
  error,
  required,
  disabled,
  className,
  icon,
  value = 0,
  onChange,
  name,
  min,
  max,
  step = 1,
  decimalScale = 0,
}) => {
  const v = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const autoId = useId();
  const inputId = `step-${autoId.replace(/:/g, '')}`;

  const bump = (delta: number) => {
    const next = v + delta;
    let n = next;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    onChange?.(n);
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
        >
          {icon}
          {label}
          {required && <span className="text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <div className="flex gap-2 items-center">
        <button
          type="button"
          disabled={disabled || (min != null && v <= min)}
          className={cn(
            'shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-background',
            'hover:bg-muted disabled:opacity-40 disabled:pointer-events-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
          )}
          aria-label="Giảm"
          onClick={() => bump(-step)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <NumericFormatInput
          id={inputId}
          label={undefined}
          error={undefined}
          required={false}
          disabled={disabled}
          value={v}
          onChange={onChange}
          name={name}
          decimalScale={decimalScale}
          min={min}
          max={max}
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          disabled={disabled || (max != null && v >= max)}
          className={cn(
            'shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-background',
            'hover:bg-muted disabled:opacity-40 disabled:pointer-events-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
          )}
          aria-label="Tăng"
          onClick={() => bump(step)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs font-medium text-destructive mt-1">{error}</p>}
    </div>
  );
};

export default NumberStepper;
