
import React, { useId } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  required?: boolean;
  icon?: React.ReactNode;
}

/**
 * Textarea – trường nhập nội dung dài, chuẩn hoá style với Input/Combobox.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, required, icon, id: externalId, ...props }, ref) => {
    const autoId = useId();
    const textareaId = externalId || autoId;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 flex items-center gap-1.5 text-foreground">
            {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
            {label}
            {required && <span className="text-destructive" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            'flex min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground transition-colors resize-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-destructive focus-visible:ring-destructive' : '',
            className
          )}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-xs font-medium text-destructive mt-1.5 ml-1">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export default Textarea;
