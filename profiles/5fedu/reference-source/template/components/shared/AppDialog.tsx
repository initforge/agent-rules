import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import {
  DIALOG_MAX_HEIGHT,
  getDialogSizeClass,
  Z_INDEX_DATA_DIALOG_CLASS,
  Z_INDEX_DATA_DIALOG_CONTENT_CLASS,
  type DialogSizeKey,
} from '@/lib/dialog-sizes';
import { cn } from '@/lib/utils';

export interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  size?: DialogSizeKey;
  children: ReactNode;
  footer?: ReactNode;
}

const AppDialog: React.FC<AppDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = 'XL',
  children,
  footer,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (el) el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const focusable = el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className={cn('fixed inset-0 bg-black/40 dark:bg-black/60', Z_INDEX_DATA_DIALOG_CLASS)}
            aria-hidden
          />
          <div
            className={cn(
              'fixed inset-0 flex items-center justify-center p-4 pointer-events-none',
              Z_INDEX_DATA_DIALOG_CONTENT_CLASS,
            )}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-dialog-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                'pointer-events-auto flex w-full flex-col rounded-2xl border border-border bg-card shadow-2xl outline-none',
                getDialogSizeClass(size),
                DIALOG_MAX_HEIGHT,
              )}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    {Icon && (
                      <div className="shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
                        <Icon size={16} aria-hidden />
                      </div>
                    )}
                    <h2 id="app-dialog-title" className="text-sm font-semibold text-foreground truncate">
                      {title}
                    </h2>
                  </div>
                  {subtitle && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={title}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

              {footer && (
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AppDialog;
