import React from 'react';
import { cn } from '@/lib/utils';
import type { StatsKpiCardItem } from './types';
import StatsTrendBadge from './StatsTrendBadge';

export interface StatsKpiGridProps {
  /** Danh sách thẻ KPI (tổng số, hoàn thành, đang làm, …) */
  items: StatsKpiCardItem[];
  /** Grid: 2 cột mobile, 4 cột desktop. Override bằng className */
  className?: string;
  /** Cột / số cột trên desktop, default 4 */
  columns?: 2 | 3 | 4;
}

const StatsKpiGrid: React.FC<StatsKpiGridProps> = ({
  items,
  className,
  columns = 4,
}) => {
  const gridClass =
    columns === 2
      ? 'grid grid-cols-2 gap-2.5'
      : columns === 3
        ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5'
        : 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';

  return (
    <div className={cn(gridClass, className)}>
      {items.map((kpi) => (
        <div
          key={kpi.id}
          className="bg-card rounded-lg border border-border p-2.5 sm:p-3 transition-all hover:shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                kpi.bg ?? 'bg-primary/10'
              )}
            >
              {React.createElement(
                kpi.icon as React.ComponentType<{ size?: number; className?: string }>,
                {
                  size: 15,
                  className: kpi.color ?? 'text-primary',
                }
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-lg font-bold text-foreground tabular-nums">
                  {kpi.value}
                </span>
                {kpi.pct != null && kpi.pct !== '' && (
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {kpi.pct}
                  </span>
                )}
              </div>
            </div>
          </div>
          {kpi.delta !== null && kpi.delta !== undefined && (
            <div className="mt-1.5 pl-[42px]">
              <StatsTrendBadge delta={kpi.delta} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatsKpiGrid;
