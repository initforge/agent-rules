import React, { useId } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import Input from './Input';
import { cn } from '@/lib/utils';

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export interface UrlInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  showOpenButton?: boolean;
}

/**
 * URL — `type="url"`, nút mở liên kết khi có giá trị hợp lệ.
 */
const UrlInput = React.forwardRef<HTMLInputElement, UrlInputProps>(
  ({ className, value, showOpenButton = true, label, icon, ...rest }, ref) => {
    const str = typeof value === 'string' ? value : '';
    let href = '';
    try {
      if (str.trim()) {
        const u = new URL(normalizeUrl(str));
        href = u.href;
      }
    } catch {
      href = '';
    }

    const autoId = useId();
    const inputId = `url-${autoId.replace(/:/g, '')}`;

    return (
      <div className={cn('w-full', className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium leading-none mb-1.5 flex items-center gap-1.5 text-foreground"
          >
            {icon ?? <Link2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
            {label}
            {rest.required && <span className="text-destructive" aria-hidden>*</span>}
          </label>
        )}
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <Input
              ref={ref}
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={value}
              className="w-full"
              label={undefined}
              icon={undefined}
              {...rest}
            />
          </div>
          {showOpenButton && href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg border border-border bg-muted/40',
                'text-primary hover:bg-muted transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
              )}
              aria-label="Mở liên kết trong tab mới"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }
);
UrlInput.displayName = 'UrlInput';

export default UrlInput;
