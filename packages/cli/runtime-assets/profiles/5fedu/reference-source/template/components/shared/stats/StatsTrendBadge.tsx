import React from 'react';
import { txt } from '@/lib/text';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export interface StatsTrendBadgeProps {
  delta: number | null | undefined;
  /** i18n key for tooltip. Default: stats.trendVsLastPeriod */
  tooltipKey?: string;
}

const StatsTrendBadge: React.FC<StatsTrendBadgeProps> = ({
  delta,
  tooltipKey = 'stats.trendVsLastPeriod',
}) => {
  if (delta === null || delta === undefined) return null;

  const content =
    delta === 0 ? (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
        <Minus size={10} /> 0
      </span>
    ) : (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-xs font-semibold',
          delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
        )}
      >
        {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {delta > 0 ? '+' : ''}
        {delta}
      </span>
    );

  return (
    <Tooltip content={txt(tooltipKey)} placement="top">
      <span>{content}</span>
    </Tooltip>
  );
};

export default StatsTrendBadge;
