import React, { isValidElement } from 'react';
import { cn } from '@/lib/utils';

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  emptyText?: string;
  /** Hành động tùy chọn bên phải giá trị (placement inline — xem lib/detail-action-placement) */
  trailing?: React.ReactNode;
}

/** Một dòng label + value trong màn detail – pattern giống form (label text-sm, khoảng cách rõ) */
const DetailField: React.FC<DetailFieldProps> = ({
  label,
  value,
  icon,
  className,
  emptyText = 'Chưa cập nhật',
  trailing,
}) => {
  const isEmpty = value === undefined || value === null || value === '';

  const valueBlock =
    isEmpty ? (
      <p className="text-body-sm italic text-muted-foreground/50">{emptyText}</p>
    ) : isValidElement(value) ? (
      <div className="text-body-sm leading-relaxed min-w-0">{value}</div>
    ) : (
      <p className="text-body-sm text-foreground leading-relaxed min-w-0">{value}</p>
    );

  return (
    <div className={cn('space-y-1 min-w-0 w-full', className)}>
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {trailing ? (
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">{valueBlock}</div>
          <div
            className="shrink-0 flex items-center gap-1 pt-0.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </div>
        </div>
      ) : (
        valueBlock
      )}
    </div>
  );
};

export default DetailField;
