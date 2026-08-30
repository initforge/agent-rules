import React, { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TableRowIconButtonVariant = 'primary' | 'muted' | 'danger';
export type TableRowIconButtonSize = 'compact' | 'default';

export interface TableRowIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  label: string;
  size?: TableRowIconButtonSize;
  variant?: TableRowIconButtonVariant;
  iconSize?: number;
  iconStrokeWidth?: number;
}

const sizeClass: Record<TableRowIconButtonSize, string> = {
  compact: 'h-6 w-6 inline-flex items-center justify-center rounded transition-all',
  default: 'p-1.5 rounded-md transition-all',
};

const variantClass: Record<TableRowIconButtonVariant, string> = {
  primary: 'text-primary hover:bg-primary/10',
  muted: 'text-muted-foreground hover:text-foreground hover:bg-muted',
  danger: 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30',
};

export const TableRowIconButton = forwardRef<HTMLButtonElement, TableRowIconButtonProps>(
  function TableRowIconButton(
    {
      icon: Icon,
      label,
      size = 'default',
      variant = 'primary',
      iconSize,
      iconStrokeWidth = 2.25,
      className,
      type = 'button',
      onClick,
      ...rest
    },
    ref,
  ) {
    const resolvedIconSize = iconSize ?? (size === 'compact' ? 12 : 15);

    return (
      <button
        ref={ref}
        type={type}
        title={label}
        aria-label={label}
        className={cn(sizeClass[size], variantClass[variant], className)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        {...rest}
      >
        <Icon size={resolvedIconSize} strokeWidth={iconStrokeWidth} />
      </button>
    );
  },
);
