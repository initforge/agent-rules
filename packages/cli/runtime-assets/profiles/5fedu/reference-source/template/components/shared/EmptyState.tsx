import React from 'react';
import { txt } from '@/lib/text';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title?: string;
  description?: string;
  /** Icon: React element (e.g. <Layers />) hoặc component reference (e.g. Layers) – nếu là component sẽ được render với size 40 */
  icon?: React.ReactNode | React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
}

const defaultIcon = <Layers size={40} className="mb-3 opacity-20" />;

/** Trạng thái không có dữ liệu – dùng trong bảng, filter, danh sách */
const EmptyState: React.FC<EmptyStateProps> = React.memo(({
  title,
  description,
  icon,
  className,
}) => {
  const resolvedTitle = title || txt('shared.empty.title');
  const iconContent =
    icon === undefined || icon === null
      ? defaultIcon
      : typeof icon === 'function'
        ? React.createElement(icon as React.ComponentType<{ size?: number; className?: string }>, {
            size: 40,
            className: 'mb-3 opacity-20',
          })
        : icon;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-muted-foreground py-8 bg-card rounded-xl border border-dashed border-border',
        className
      )}
    >
      {iconContent}
      <p className="text-sm text-foreground font-semibold">{resolvedTitle}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
});
EmptyState.displayName = 'EmptyState';

export default EmptyState;
