
import React from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

export interface StatusToggleProps {
  label?: string;
  /** number (0/1) or string (e.g. 'Đang hoạt động' / 'Ngừng hoạt động') */
  value?: number | string;
  onChange: (value: number | string) => void;
  activeLabel?: string;
  inactiveLabel?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Icon hiển thị cạnh label (chuẩn generic form) */
  icon?: React.ReactNode;
}

/**
 * StatusToggle – toggle bật/tắt cho trạng thái hoạt động.
 * Thay thế dropdown 2 giá trị (Hoạt động / Ngừng).
 */
const StatusToggle: React.FC<StatusToggleProps> = ({
  label,
  value,
  onChange,
  activeLabel = 'Hoạt động',
  inactiveLabel = 'Ngừng hoạt động',
  error,
  required,
  disabled = false,
  className,
  icon,
}) => {
  const isActive =
    typeof value === 'string'
      ? value === activeLabel
      : Number(value) === 1;

  const handleToggle = () => {
    if (disabled) return;
    if (typeof value === 'string') {
      onChange(isActive ? inactiveLabel : activeLabel);
    } else {
      onChange(isActive ? 0 : 1);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="text-sm font-medium leading-none mb-2 flex items-center gap-1.5 text-foreground">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between rounded-lg border px-3 py-2 h-10 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/30 border-border text-muted-foreground',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="flex items-center gap-2">
          {isActive ? (
            <Check size={14} className="text-primary" />
          ) : (
            <X size={14} className="text-muted-foreground" />
          )}
          {isActive ? activeLabel : inactiveLabel}
        </span>

        {/* Toggle Switch */}
        <div
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
            isActive ? 'bg-primary' : 'bg-border'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-card shadow-sm transition-transform duration-200',
              isActive ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </div>
      </button>
      {error && <p className="text-xs font-medium text-destructive mt-1.5 ml-1">{error}</p>}
    </div>
  );
};

export default StatusToggle;
