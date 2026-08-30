import React, { useId } from 'react';
import { Percent } from 'lucide-react';
import NumericFormatInput from './NumericFormatInput';
import { cn } from '@/lib/utils';

export interface PercentInputProps {
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  /** Giá trị 0–100 (hiển thị kèm %) */
  value?: number;
  onChange?: (value: number) => void;
  name?: string;
  decimalScale?: number;
  min?: number;
  max?: number;
}

/**
 * Phần trăm — lưu số 0–100, hiển thị suffix % cạnh ô nhập.
 */
const PercentInput: React.FC<PercentInputProps> = ({
  label,
  error,
  required,
  disabled,
  className,
  icon,
  value,
  onChange,
  name,
  decimalScale = 2,
  min = 0,
  max = 100,
}) => {
  const autoId = useId();
  const groupId = `pct-${autoId.replace(/:/g, '')}`;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={groupId}
          className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
        >
          {icon ?? <Percent className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
          {label}
          {required && <span className="text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <div className="flex items-center gap-2">
        <NumericFormatInput
          id={groupId}
          label={undefined}
          error={undefined}
          required={false}
          disabled={disabled}
          value={value}
          onChange={onChange}
          name={name}
          decimalScale={decimalScale}
          min={min}
          max={max}
          className="flex-1 min-w-0"
        />
        <span className="text-sm font-medium text-muted-foreground shrink-0" aria-hidden>
          %
        </span>
      </div>
      {error && <p className="text-xs font-medium text-destructive mt-1">{error}</p>}
    </div>
  );
};

export default PercentInput;
