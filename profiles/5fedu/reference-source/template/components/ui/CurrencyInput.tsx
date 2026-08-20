
import React, { useState, useEffect, useCallback } from 'react';
import { cn, getLocale } from '@/lib/utils';

export interface CurrencyInputProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
  icon?: React.ReactNode;
  className?: string;
  /** Giá trị số thực (không format) */
  value?: number | string;
  /** Callback khi giá trị thay đổi (trả về số thực) */
  onChange?: (value: number) => void;
  /** Tên field cho react-hook-form (dùng với register) */
  name?: string;
}

/**
 * CurrencyInput – trường nhập số tiền có tự động format dấu phân cách hàng nghìn.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      label,
      error,
      required,
      disabled = false,
      placeholder = '0',
      suffix = 'VND',
      icon,
      className,
      value,
      onChange,
      name,
    },
    ref
  ) => {
    // Format number with dot separator (vi-VN style)
    const formatNumber = useCallback((num: number | string): string => {
      const n = typeof num === 'string' ? parseFloat(num) : num;
      if (isNaN(n) || n === 0) return '';
      return new Intl.NumberFormat(getLocale()).format(n);
    }, []);

    const [displayValue, setDisplayValue] = useState(() => formatNumber(value ?? 0));

    // Sync external value changes
    useEffect(() => {
      const formatted = formatNumber(value ?? 0);
      queueMicrotask(() => setDisplayValue(formatted));
    }, [value, formatNumber]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Only allow digits, dots and commas
      const cleaned = raw.replace(/[^\d]/g, '');
      const num = parseFloat(cleaned) || 0;
      setDisplayValue(num === 0 ? '' : new Intl.NumberFormat(getLocale()).format(num));
      onChange?.(num);
    };

    return (
      <div className="w-full">
        {label && (
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 flex items-center gap-1.5 text-foreground">
            {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type="text"
            inputMode="numeric"
            name={name}
            disabled={disabled}
            placeholder={placeholder}
            value={displayValue}
            onChange={handleChange}
            className={cn(
              'flex h-10 w-full rounded-lg border border-border bg-background py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              icon ? 'pl-10' : 'pl-3',
              suffix ? 'pr-14' : 'pr-3',
              error ? 'border-destructive focus-visible:ring-destructive' : '',
              className
            )}
          />
          {suffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium pointer-events-none select-none">
              {suffix}
            </div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-destructive mt-1.5 ml-1">{error}</p>}
      </div>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

export default CurrencyInput;
