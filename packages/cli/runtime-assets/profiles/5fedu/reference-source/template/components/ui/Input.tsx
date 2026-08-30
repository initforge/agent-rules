import React, { useId } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  required?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, icon, required, id: externalId, ...props }, ref) => {
    const autoId = useId();
    const inputId = externalId || autoId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 flex items-center gap-1.5">
            {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
            {label}
            {required && <span className="text-destructive" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            type={type}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(
              "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
              error ? 'border-destructive focus-visible:ring-destructive' : '',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export default Input;
