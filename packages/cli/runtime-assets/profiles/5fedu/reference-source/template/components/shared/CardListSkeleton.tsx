import React from 'react';
import { cn } from '@/lib/utils';

interface CardListSkeletonProps {
  /** Số thẻ skeleton */
  cardCount?: number;
  className?: string;
}

/**
 * Skeleton danh sách thẻ (mobile): avatar + 2 dòng chữ + khối lớn.
 * Dùng cho mobile list loading (Nhân viên, Phòng ban, ...).
 */
const CardListSkeleton: React.FC<CardListSkeletonProps> = ({
  cardCount = 3,
  className,
}) => (
  <div className={cn('flex-1 min-h-0 space-y-3 overflow-hidden', className)}>
    {Array.from({ length: cardCount }).map((_, i) => (
      <div
        key={i}
        className="bg-card rounded-xl border border-border p-3.5 animate-pulse"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-lg bg-muted shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 w-2/3 bg-muted rounded" />
            <div className="h-2.5 w-1/3 bg-muted/60 rounded" />
          </div>
        </div>
        <div className="h-12 bg-muted/30 rounded-lg" />
      </div>
    ))}
  </div>
);

export default CardListSkeleton;
