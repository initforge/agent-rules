import React from 'react';
import { txt } from '@/lib/text';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Nhãn nút thử lại (mặc định dùng i18n shared.error.retry) */
  retryLabel?: string;
  /** Dùng màu primary cho nút thử lại (đồng bộ với hệ thống) */
  primaryButtons?: boolean;
  className?: string;
}

/** Trạng thái lỗi – tải thất bại, có nút thử lại */
const ErrorState: React.FC<ErrorStateProps> = React.memo(({
  title,
  message,
  onRetry,
  retryLabel,
  primaryButtons = false,
  className,
}) => {
  const resolvedTitle = title ?? txt('shared.error.title');
  const resolvedMessage = message ?? txt('shared.error.message');
  const label = retryLabel ?? txt('shared.error.retry');
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-muted-foreground py-8 bg-card rounded-xl border border-border',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
        <AlertTriangle size={24} />
      </div>
      <p className="text-sm text-foreground font-semibold">{resolvedTitle}</p>
      <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">{resolvedMessage}</p>
      {onRetry && (
        <Button
          variant={primaryButtons ? 'default' : 'outline'}
          size="sm"
          onClick={onRetry}
          className={cn(
            'mt-4',
            primaryButtons ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm' : 'border-border'
          )}
        >
          <RefreshCw size={16} className="mr-2" />
          {label}
        </Button>
      )}
    </div>
  );
});
ErrorState.displayName = 'ErrorState';

export default ErrorState;
