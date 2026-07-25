import React, { useId } from 'react';
import { Mail } from 'lucide-react';
import Input from './Input';
import { cn } from '@/lib/utils';

export interface EmailInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  showMailButton?: boolean;
}

/**
 * Email — validation gốc của trình duyệt, nút gửi mail khi có địa chỉ hợp lệ.
 */
const EmailInput = React.forwardRef<HTMLInputElement, EmailInputProps>(
  ({ className, value, showMailButton = true, label, icon, ...rest }, ref) => {
    const str = typeof value === 'string' ? value.trim() : '';
    const mailto = str.includes('@') ? `mailto:${str}` : '';

    const autoId = useId();
    const inputId = `email-${autoId.replace(/:/g, '')}`;

    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
          >
            {icon ?? <Mail className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
            {label}
            {rest.required && <span className="text-destructive" aria-hidden>*</span>}
          </label>
        )}
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <Input
              ref={ref}
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={value}
              className="w-full"
              label={undefined}
              icon={undefined}
              {...rest}
            />
          </div>
          {showMailButton && mailto ? (
            <a
              href={mailto}
              className={cn(
                'shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-muted/40',
                'text-primary hover:bg-muted transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
              )}
              aria-label="Gửi email"
            >
              <Mail className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }
);
EmailInput.displayName = 'EmailInput';

export default EmailInput;
