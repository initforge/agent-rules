import React, { useEffect, useCallback, useRef } from 'react';
import { txt } from '@/lib/text';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionItem {
  key: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success';
  description?: string;
}

interface MobileActionsSheetProps {
  open: boolean;
  onClose: () => void;
  items: ActionItem[];
  title?: string;
}

const MobileActionsSheet: React.FC<MobileActionsSheetProps> = ({
  open,
  onClose,
  items,
  title,
}) => {
  const resolvedTitle = title || txt('shared.mobileActions.title');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Đóng khi kéo xuống
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > 80 || info.velocity.y > 400) {
        onClose();
      }
    },
    [onClose],
  );

  const handleItemClick = (item: ActionItem) => {
    onClose();
    // Delay nhẹ để sheet đóng trước khi thực hiện action
    setTimeout(() => item.onClick(), 150);
  };

  const variantStyles = {
    default: 'text-foreground active:bg-muted/60',
    danger: 'text-destructive active:bg-destructive/10',
    success: 'text-primary active:bg-primary/10',
  };

  const variantIconStyles = {
    default: 'bg-muted/60 text-muted-foreground',
    danger: 'bg-destructive/10 text-destructive',
    success: 'bg-primary/10 text-primary',
  };

  const content = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="actions-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[60]"
          />

          {/* Sheet */}
          <motion.div
            key="actions-sheet"
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 inset-x-0 z-[61] bg-card rounded-t-2xl shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Settings2 size={16} className="text-primary" />
                <span className="text-base font-bold text-foreground">{resolvedTitle}</span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/70 transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Action items */}
            <div className="py-2 px-2 safe-area-bottom">
              {items.map((item) => {
                const Icon = item.icon;
                const variant = item.variant || 'default';
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'w-full flex items-center gap-3.5 px-3 min-h-[52px] rounded-xl transition-colors',
                      variantStyles[variant],
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        variantIconStyles[variant],
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{item.label}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default MobileActionsSheet;
export type { MobileActionsSheetProps };
