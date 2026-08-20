import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}) => {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center justify-between p-3 rounded-xl bg-muted/50 transition-colors gap-4',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted cursor-pointer',
        className,
      )}
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
};

export default React.memo(ToggleSwitch);
