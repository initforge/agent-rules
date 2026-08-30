import React from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Color palette – mỗi màu có light + dark variant                   */
/* ------------------------------------------------------------------ */

const COLOR_CLASSES: Record<string, string> = {
  primary:
    'bg-primary/10 text-primary border-primary/20',
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  blue:
    'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
  amber:
    'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
  rose:
    'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900',
  indigo:
    'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900',
  pink:
    'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-900',
  violet:
    'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900',
  sky:
    'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900',
  slate:
    'bg-muted text-muted-foreground border-border',
  cyan:
    'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-900',
};

export type BadgeColor = keyof typeof COLOR_CLASSES;

/* ------------------------------------------------------------------ */
/*  Config type – dùng khi khai báo badge config cho từng enum         */
/* ------------------------------------------------------------------ */

export interface BadgeConfigItem {
  label: string;
  color: BadgeColor;
  icon?: React.ReactNode;
}

export type BadgeConfig<T extends string | number = string | number> = Record<T, BadgeConfigItem>;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export type EnumBadgeShape = 'pill' | 'rounded';

export interface EnumBadgeProps {
  /** Giá trị enum hiện tại */
  value: string | number | undefined | null;
  /** Config map: value → { label, color, icon? } */
  config: BadgeConfig<string | number>;
  /** Label hiển thị khi value không có trong config */
  fallbackLabel?: string;
  /** Class bổ sung */
  className?: string;
  /**
   * `pill` — viền tròn (rounded-full), phù hợp trạng thái.
   * `rounded` — viền vuông nhẹ (rounded-md), phù hợp cấp/level.
   */
  shape?: EnumBadgeShape;
  /**
   * Một dòng trong ô bảng hẹp: không xuống dòng; quá dài thì ellipsis (…).
   * Nên bật trong cell có maxWidth; kèm `title` để xem đủ khi hover.
   */
  truncate?: boolean;
}

/**
 * EnumBadge – badge tái sử dụng cho mọi trường enum.
 * Mặc định pill (rounded-full); `shape="rounded"` cho badge dạng ô vuông nhẹ.
 */
const EnumBadge: React.FC<EnumBadgeProps> = ({
  value,
  config,
  fallbackLabel = '—',
  className,
  shape = 'pill',
  truncate = false,
}) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const item = config[value];
  const label = item?.label ?? fallbackLabel;
  const colorClasses = item ? COLOR_CLASSES[item.color] ?? COLOR_CLASSES.slate : COLOR_CLASSES.slate;
  const labelStr = String(label);

  return (
    <span
      title={truncate ? labelStr : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border transition-colors',
        shape === 'pill' ? 'rounded-full' : 'rounded-md',
        truncate && 'max-w-full min-w-0',
        colorClasses,
        className,
      )}
    >
      {item?.icon != null && <span className="shrink-0">{item.icon}</span>}
      <span className={cn(truncate && 'min-w-0 truncate')}>{labelStr}</span>
    </span>
  );
};

export default EnumBadge;
