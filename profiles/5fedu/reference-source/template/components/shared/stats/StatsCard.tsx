import React from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface StatsCardProps {
  /** Tiêu đề section (biểu đồ, bảng) */
  title: string;
  /** Icon cạnh title */
  icon?: LucideIcon;
  /** Nội dung (chart, table) */
  children: React.ReactNode;
  className?: string;
  /** Span 2 cột trên grid desktop (md:col-span-2) */
  spanTwo?: boolean;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  icon: Icon,
  children,
  className,
  spanTwo = false,
}) => (
  <div
    className={cn(
      'bg-card rounded-xl border border-border overflow-hidden',
      spanTwo && 'md:col-span-2',
      className
    )}
  >
    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
      {Icon && <Icon size={18} className="text-muted-foreground shrink-0" />}
      <span className="font-medium text-foreground text-sm">{title}</span>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

export default StatsCard;
