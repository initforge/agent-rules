import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerWithTextProps {
  /** Nội dung hiển thị bên cạnh spinner (thường là "Đang tải...") */
  text: string;
  /** Spinner + text căn giữa theo chiều ngang */
  centered?: boolean;
  className?: string;
}

/**
 * Spinner xoay tròn + text màu primary, dùng chung cho trạng thái loading.
 * Dùng trong toolbar, strip trên skeleton, hoặc inline.
 */
const LoadingSpinnerWithText: React.FC<LoadingSpinnerWithTextProps> = ({
  text,
  centered = true,
  className,
}) => (
  <div
    className={cn(
      'flex items-center gap-2 text-primary',
      centered && 'justify-center',
      className
    )}
    role="status"
    aria-live="polite"
    aria-label={text}
  >
    <div
      className="h-5 w-5 shrink-0 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
      aria-hidden
    />
    <span className="text-sm font-medium">{text}</span>
  </div>
);

export default LoadingSpinnerWithText;
