import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Mặc định 'primary' – tiêu đề section luôn màu primary. Dùng 'muted' chỉ khi section phụ, ít nhấn mạnh. */
  variant?: 'primary' | 'muted';
  /** Id cho anchor link (vd. TOC nhảy tới section) */
  id?: string;
  /** Cùng hàng với tiêu đề (thống kê, nút Thêm, …) — căn phải, `flex-wrap` trên mobile */
  headerRight?: React.ReactNode;
}

/**
 * Section chung cho form và detail: card trắng, tiêu đề uppercase + icon, border-bottom.
 * FormSection và DetailSection dùng chung component này.
 * Quy ước: tiêu đề section luôn màu primary (variant mặc định 'primary'). Xem docs/UI-CONVENTIONS.md.
 */
const Section: React.FC<SectionProps> = ({ title, icon, children, className, variant = 'primary', id, headerRight }) => {
  const isPrimary = variant === 'primary';

  return (
    <div
      id={id}
      className={cn(
        'w-full bg-card p-3.5 sm:p-4 md:p-5 rounded-xl border border-border shadow-sm space-y-2.5 sm:space-y-3',
        id && 'scroll-mt-24',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2 sm:pb-2.5 border-b',
          isPrimary ? 'border-primary/20' : 'border-border'
        )}
      >
        <h4
          className={cn(
            'text-xs font-semibold uppercase tracking-wider flex min-w-0 items-center gap-1.5 sm:gap-2',
            isPrimary ? 'text-primary font-bold' : 'text-muted-foreground'
          )}
        >
          {icon}
          <span className="truncate">{title}</span>
        </h4>
        {headerRight != null ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerRight}</div> : null}
      </div>
      {children}
    </div>
  );
};

export default Section;
