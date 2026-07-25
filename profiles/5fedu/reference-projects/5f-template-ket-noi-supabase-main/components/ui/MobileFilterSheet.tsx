import React, { useState, useEffect, useCallback, useRef } from 'react';
import { txt } from '@/lib/text';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Check, ChevronDown, Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterOptionsWithCount } from '@/lib/filterOptionsWithCount';

export interface FilterGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  options: { label: string; value: string; count?: number }[];
  value: string[];
  onChange: (val: string[]) => void;
}

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  onClearAll?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Accordion section cho mỗi nhóm filter                            */
/* ------------------------------------------------------------------ */
const FilterSection: React.FC<{
  group: FilterGroup;
  defaultOpen?: boolean;
}> = ({ group, defaultOpen = true }) => {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [search, setSearch] = useState('');
  const Icon = group.icon;

  const filteredBySearch = group.options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );
  const filtered = filterOptionsWithCount(filteredBySearch, group.value);

  const allSelected = filtered.length > 0 && filtered.every((o) => group.value.includes(o.value));

  const toggle = (val: string) => {
    if (group.value.includes(val)) {
      group.onChange(group.value.filter((v) => v !== val));
    } else {
      group.onChange([...group.value, val]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      const filteredValues = new Set(filtered.map((o) => o.value));
      group.onChange(group.value.filter((v) => !filteredValues.has(v)));
    } else {
      const merged = new Set([...group.value, ...filtered.map((o) => o.value)]);
      group.onChange(Array.from(merged));
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={cn(group.value.length > 0 ? 'text-primary' : 'text-muted-foreground')} />
          <span className="text-sm font-semibold text-foreground">{group.label}</span>
          {group.value.length > 0 && (
            <span className="bg-primary/15 text-primary text-caption font-bold px-1.5 py-0.5 rounded-full tabular-nums">
              {group.value.length}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn('text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>

      {/* Section body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2">
              {/* Search nếu có nhiều option */}
              {group.options.length > 5 && (
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={txt('shared.mobileFilter.searchPlaceholder', { label: group.label.toLowerCase() })}
                    className="w-full h-10 pl-9 pr-3 text-sm bg-muted/40 border border-border rounded-xl placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  />
                </div>
              )}

              {/* Chọn tất cả + Xóa chọn (quy chuẩn filter chip) */}
              {filtered.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex-1 flex items-center gap-3 px-2 min-h-[40px] rounded-lg active:bg-muted/40 transition-colors"
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                        allSelected
                          ? 'bg-primary border-primary text-white'
                          : 'border-border bg-background',
                      )}
                    >
                      {allSelected && <Check size={13} strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">{txt('shared.mobileFilter.selectAll')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => group.onChange([])}
                    className="shrink-0 text-sm font-medium text-primary hover:underline py-2 px-2"
                  >
                    {txt('common.clearSelection')}
                  </button>
                </div>
              )}

              {/* Options */}
              <div className="space-y-0.5">
                {filtered.length === 0 ? (
                  <div className="py-3 text-center text-sm text-muted-foreground">{txt('shared.mobileFilter.notFound')}</div>
                ) : (
                  filtered.map((option) => {
                    const selected = group.value.includes(option.value);
                    const hasCount = option.count !== undefined;
                    const isZeroCount = hasCount && option.count === 0 && !selected;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => !isZeroCount && toggle(option.value)}
                        className={cn(
                          'w-full flex items-center gap-3 px-2 min-h-[44px] rounded-lg transition-colors',
                          isZeroCount
                            ? 'opacity-40'
                            : 'active:bg-muted/40',
                          selected && 'bg-primary/[0.04]',
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                            selected
                              ? 'bg-primary border-primary text-white'
                              : 'border-border bg-background',
                          )}
                        >
                          {selected && <Check size={13} strokeWidth={3} />}
                        </div>
                        <span className={cn('text-sm flex-1 text-left', selected ? 'font-medium text-primary' : 'text-foreground')}>
                          {option.label}
                        </span>
                        {hasCount && (
                          <span className={cn(
                            'shrink-0 text-xs font-medium tabular-nums',
                            selected ? 'text-primary/70' : 'text-muted-foreground'
                          )}>
                            {option.count}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Bottom Sheet chính                                                 */
/* ------------------------------------------------------------------ */
const MobileFilterSheet: React.FC<MobileFilterSheetProps> = ({ open, onClose, groups, onClearAll }) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Tổng số filter đang active
  const totalActive = groups.reduce((sum, g) => sum + g.value.length, 0);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Đóng khi kéo xuống (drag)
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 100 || info.velocity.y > 500) {
        onClose();
      }
    },
    [onClose],
  );

  const content = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="filter-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60]"
          />

          {/* Sheet */}
          <motion.div
            key="filter-sheet"
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 inset-x-0 z-[61] bg-card rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '70vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-primary" />
                <span className="text-base font-bold text-foreground">{txt('shared.mobileFilter.title')}</span>
                {totalActive > 0 && (
                  <span className="bg-primary text-white text-caption font-bold px-2 py-0.5 rounded-full tabular-nums">
                    {totalActive}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/70 transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Body – cuộn được */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {groups.map((group) => (
                <FilterSection key={group.key} group={group} defaultOpen={group.value.length > 0} />
              ))}
            </div>

            {/* Footer cố định */}
            <div className="shrink-0 border-t border-border bg-card px-4 py-3 flex items-center gap-3 safe-area-bottom">
              {onClearAll && totalActive > 0 && (
                <button
                  onClick={() => {
                    onClearAll();
                  }}
                  className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium active:bg-destructive/10 transition-colors"
                >
                  <X size={14} strokeWidth={2.5} />
                  {txt('shared.mobileFilter.clear')}
                </button>
              )}
              <button
                onClick={onClose}
                className={cn(
                  'h-11 flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold shadow-sm active:bg-primary/90 transition-colors',
                  onClearAll && totalActive > 0 ? 'flex-1' : 'flex-1',
                )}
              >
                {txt('common.apply')}
                {totalActive > 0 && (
                  <span className="ml-1.5 bg-white/20 dark:bg-white/15 text-white text-caption font-bold px-1.5 py-0.5 rounded-full tabular-nums">
                    {totalActive}
                  </span>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default MobileFilterSheet;
export type { MobileFilterSheetProps };
