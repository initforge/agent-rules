import React, { useState, useEffect, useCallback, useId } from 'react';
import { cn, getLocale } from '@/lib/utils';

export interface NumericFormatInputProps {
  label?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Icon hiển thị cạnh label (chuẩn form như module nhân viên) */
  icon?: React.ReactNode;
  /** Hiển thị dấu sao (*) cho trường bắt buộc */
  required?: boolean;
  /** Giá trị số (có thể có phần thập phân) */
  value?: number | string;
  /** Callback khi giá trị thay đổi */
  onChange?: (value: number) => void;
  /** Alias cho onChange, nhận (formattedValue, numberValue) - tương thích react-number-format */
  onValueChange?: (_formatted: string, values: { floatValue?: number }) => void;
  onBlur?: () => void;
  name?: string;
  /** Số chữ số thập phân tối đa khi hiển thị (mặc định 2) */
  decimalScale?: number;
  min?: number;
  max?: number;
  /** Gắn id cho `<input>` (vd. label ngoài bọc PercentInput) */
  id?: string;
}

/**
 * NumericFormatInput – nhập số có tự động format dấu phân cách hàng nghìn (vi-VN: 120.000).
 */
const NumericFormatInput = React.forwardRef<HTMLInputElement, NumericFormatInputProps>(
  (
    {
      label,
      error,
      disabled = false,
      placeholder = '0',
      className,
      icon,
      required,
      value,
      onChange,
      onValueChange,
      onBlur,
      name,
      decimalScale = 2,
      min,
      max,
      id: idProp,
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = idProp ?? `numeric-${autoId.replace(/:/g, '')}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const formatNumber = useCallback(
      (num: number | string): string => {
        const n = typeof num === 'string' ? parseFloat(num) : num;
        if (isNaN(n)) return '';
        if (n === 0) return '';
        const formatted = new Intl.NumberFormat(getLocale(), {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimalScale,
        }).format(n);
        return formatted;
      },
      [decimalScale]
    );

    /** Parse chuỗi đã format (vi-VN: "120.000" hoặc "120.000,5") hoặc số thuần (120000). */
    const parseInput = useCallback((str: string): number => {
      const s = str.trim();
      if (!s) return 0;
      const noThousand = s.replace(/\./g, '');
      const decimal = noThousand.replace(/,/g, '.');
      const num = parseFloat(decimal);
      return isNaN(num) ? 0 : num;
    }, []);

    const [displayValue, setDisplayValue] = useState(() => formatNumber(value ?? 0));

    useEffect(() => {
      const formatted = formatNumber(value ?? 0);
      queueMicrotask(() => setDisplayValue(formatted));
    }, [value, formatNumber]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const num = parseInput(raw);
      const clamped = max != null && num > max ? max : min != null && num < min ? min : num;
      setDisplayValue(raw === '' ? '' : formatNumber(clamped));
      onChange?.(clamped);
      onValueChange?.(raw === '' ? '' : formatNumber(clamped), { floatValue: clamped });
    };

    const handleBlur = () => {
      const num = parseInput(displayValue);
      const clamped = max != null && num > max ? max : min != null && num < min ? min : num;
      setDisplayValue(num === 0 || isNaN(num) ? '' : formatNumber(clamped));
      if (num !== clamped) {
        onChange?.(clamped);
        onValueChange?.('', { floatValue: clamped });
      }
      onBlur?.();
    };

    const inputEl = (
      <input
        ref={ref}
        id={inputId}
        type="text"
        inputMode="decimal"
        name={name}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground placeholder:text-muted-foreground ring-offset-background transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive focus-visible:ring-destructive' : '',
          className
        )}
      />
    );

    if (label) {
      return (
        <div className="w-full">
          <label htmlFor={inputId} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 flex items-center gap-1.5 text-foreground">
            {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
            {label}
            {required && <span className="text-destructive" aria-hidden="true">*</span>}
          </label>
          {inputEl}
          {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">{error}</p>}
        </div>
      );
    }

    return (
      <div className="w-full">
        {inputEl}
        {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">{error}</p>}
      </div>
    );
  }
);

NumericFormatInput.displayName = 'NumericFormatInput';

export default NumericFormatInput;
