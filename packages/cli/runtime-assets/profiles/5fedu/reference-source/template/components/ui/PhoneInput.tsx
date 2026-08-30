import React, { useId } from 'react';
import { Phone } from 'lucide-react';
import Input from './Input';
import { cn } from '@/lib/utils';

function toTelHref(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

export interface PhoneInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  showCallButton?: boolean;
}

/**
 * Điện thoại — `inputMode="tel"`, nút gọi khi có số.
 */
const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, showCallButton = true, label, icon, ...rest }, ref) => {
    const str = typeof value === 'string' ? value : '';
    const tel = toTelHref(str);

    const autoId = useId();
    const inputId = `phone-${autoId.replace(/:/g, '')}`;

    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
          >
            {icon ?? <Phone className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
            {label}
            {rest.required && <span className="text-destructive" aria-hidden>*</span>}
          </label>
        )}
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <Input
              ref={ref}
              id={inputId}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={value}
              className="w-full"
              label={undefined}
              icon={undefined}
              {...rest}
            />
          </div>
          {showCallButton && tel ? (
            <a
              href={tel}
              className={cn(
                'shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-muted/40',
                'text-primary hover:bg-muted transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
              )}
              aria-label="Gọi điện"
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }
);
PhoneInput.displayName = 'PhoneInput';

export default PhoneInput;
