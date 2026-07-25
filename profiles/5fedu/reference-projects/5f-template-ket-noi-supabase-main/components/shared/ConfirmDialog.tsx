
import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useConfirmStore } from '@/store/useConfirmStore';
import { DIALOG_SIZE } from '@/lib/dialog-sizes';
import { cn } from '@/lib/utils';
import { Z_INDEX_APP_MODAL_CLASS } from '@/lib/dialog-sizes';

const ConfirmDialog: React.FC = () => {
  const { isOpen, options, close, isLoading, setLoading } = useConfirmStore();
  const { title, message, variant, confirmText, cancelText, onConfirm, onCancel } = options;
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
      close();
    } catch (error) {
      if (import.meta.env.DEV) console.error("Confirm action failed", error);
      setLoading(false);
    }
  };

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
    close();
  }, [onCancel, close]);

  // Focus trap + Escape key
  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el) el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        handleCancel();
        return;
      }
      // Trap focus within dialog
      if (e.key === 'Tab' && el) {
        const focusable = el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
  }, [isOpen, isLoading, handleCancel]);

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4"><Trash2 size={24} /></div>;
      case 'warning':
        return <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4"><AlertTriangle size={24} /></div>;
      default:
        return <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-4"><Info size={24} /></div>;
    }
  };

  const getConfirmButtonClass = () => {
    switch (variant) {
      case 'danger': return 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200 dark:shadow-rose-950/40';
      case 'warning': return 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200 dark:shadow-amber-950/40';
      default: return 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cn('fixed inset-0 flex items-center justify-center p-4', Z_INDEX_APP_MODAL_CLASS)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isLoading ? handleCancel : undefined}
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
          />
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className={cn("relative bg-card rounded-xl p-6 w-full shadow-2xl border border-border/40 flex flex-col items-center text-center outline-none", DIALOG_SIZE.CONFIRM)}
          >
            {getIcon()}
            
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-foreground mb-2">{title}</h3>
            
            <div className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {message}
            </div>

            <div className="flex gap-3 w-full">
              <Button 
                variant="outline" 
                onClick={handleCancel} 
                disabled={isLoading}
                className="flex-1 border-border text-muted-foreground hover:bg-muted h-11 rounded-lg"
              >
                {cancelText}
              </Button>
              <Button 
                onClick={handleConfirm} 
                isLoading={isLoading}
                className={`flex-1 h-11 rounded-lg ${getConfirmButtonClass()}`}
              >
                {confirmText}
              </Button>
            </div>

            {!isLoading && (
                 <button 
                    onClick={handleCancel}
                    aria-label="Đóng"
                    className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                 >
                     <X size={20} />
                 </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
