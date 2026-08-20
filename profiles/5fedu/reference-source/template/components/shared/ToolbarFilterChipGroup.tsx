import React, { useState, useRef, useEffect } from 'react';
import { txt } from '@/lib/text';
import { Filter } from 'lucide-react';
import * as m from 'framer-motion/m';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';

export interface ToolbarFilterChipItem {
  id: string;
  /** Có giá trị đang chọn — badge trên nút overflow */
  active?: boolean;
  renderChip: (layout: 'inline' | 'menu') => React.ReactNode;
}

interface ToolbarFilterChipGroupProps {
  items: ToolbarFilterChipItem[];
  /** Số chip hiển thị trực tiếp trên toolbar (mặc định 3) */
  maxVisible?: number;
}

const INLINE_CHIP_CLASS = 'w-[148px]';
const MENU_CHIP_CLASS = 'w-full min-w-[11rem]';

/**
 * Toolbar desktop: tối đa `maxVisible` filter chip inline; phần còn lại trong dropdown nút Filter.
 */
const ToolbarFilterChipGroup: React.FC<ToolbarFilterChipGroupProps> = ({
  items,
  maxVisible = 3,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.slice(0, maxVisible);
  const overflowItems = items.slice(maxVisible);
  const overflowActiveCount = overflowItems.filter((item) => item.active).length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {visibleItems.map((item) => (
        <React.Fragment key={item.id}>
          {item.renderChip('inline')}
        </React.Fragment>
      ))}

      {overflowItems.length > 0 && (
        <div className="relative shrink-0" ref={rootRef}>
          <Tooltip
            content={txt('shared.toolbar.moreFilters')}
            placement="bottom"
            disabled={open}
          >
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className={cn(
                'relative h-8 w-8 flex items-center justify-center rounded-lg border transition-all active:scale-95',
                open || overflowActiveCount > 0
                  ? 'bg-primary/5 border-primary/40 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              aria-label={txt('shared.toolbar.moreFilters')}
              aria-expanded={open}
            >
              <Filter size={14} strokeWidth={2.25} />
              {overflowActiveCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full tabular-nums">
                  {overflowActiveCount}
                </span>
              )}
            </button>
          </Tooltip>

          <AnimatePresence>
            {open && (
              <m.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute left-0 top-full mt-2 z-[41] min-w-[12rem] bg-card backdrop-blur-xl rounded-xl shadow-xl border border-border p-2 space-y-2"
              >
                {overflowItems.map((item) => (
                  <div key={item.id} className="w-full">
                    {item.renderChip('menu')}
                  </div>
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export { INLINE_CHIP_CLASS, MENU_CHIP_CLASS };
export default ToolbarFilterChipGroup;
