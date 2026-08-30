import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { txt } from '@/lib/text';
import { FileDown, ChevronDown, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Z_INDEX_CONTEXT_MENU_CLASS } from '@/lib/dialog-sizes';

export type StatsExportFormat = 'excel' | 'pdf';

export interface StatsExportDropdownProps {
  onExport: (format: StatsExportFormat) => Promise<void>;
  disabled?: boolean;
  /** true = chỉ hiển thị nút icon (mobile), false = nút đầy đủ (desktop) */
  compact?: boolean;
}

const MENU_WIDTH_PX = 208; // w-52

const StatsExportDropdown: React.FC<StatsExportDropdownProps> = ({
  onExport,
  disabled = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_WIDTH_PX, window.innerWidth - MENU_WIDTH_PX - 8)
    );
    setMenuPos({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = async (format: StatsExportFormat) => {
    setIsExporting(true);
    setOpen(false);
    try {
      await onExport(format);
    } finally {
      setIsExporting(false);
    }
  };

  const compactMenu = (
    <div className="p-1.5">
      <button
        type="button"
        onClick={() => handleSelect('excel')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left"
      >
        <FileSpreadsheet size={16} className="text-emerald-600" /> Excel
      </button>
      <button
        type="button"
        onClick={() => handleSelect('pdf')}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left"
      >
        <FileText size={16} className="text-red-600" /> PDF
      </button>
    </div>
  );

  const fullMenu = (
    <>
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground">
          {txt('employee.stats.selectFormat')}
        </p>
      </div>
      <div className="p-1.5">
        <button
          type="button"
          onClick={() => handleSelect('excel')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={16} className="text-emerald-600" />
          </div>
          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
            Excel (.xlsx)
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleSelect('pdf')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-red-600" />
          </div>
          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
            PDF (.pdf)
          </span>
        </button>
      </div>
    </>
  );

  const menuPortal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        className={cn(
          'fixed w-52 overflow-hidden rounded-xl border border-border bg-card shadow-xl',
          Z_INDEX_CONTEXT_MENU_CLASS
        )}
        style={{ top: menuPos.top, left: menuPos.left }}
        role="menu"
      >
        {compact ? compactMenu : fullMenu}
      </div>,
      document.body
    );

  if (compact) {
    return (
      <div className="relative shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled || isExporting}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-white shadow-sm active:scale-95"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
        </button>
        {menuPortal}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled || isExporting}
        className={cn(
          'h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium border shadow-sm active:scale-95',
          'bg-primary text-white border-primary hover:bg-primary/90'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {isExporting ? (
          <Loader2 size={14} className="animate-spin shrink-0" />
        ) : (
          <FileDown size={14} className="shrink-0" />
        )}
        <span>{isExporting ? txt('employee.stats.exporting') : txt('employee.stats.exportReport')}</span>
        {!isExporting && (
          <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
        )}
      </button>
      {menuPortal}
    </div>
  );
};

export default StatsExportDropdown;
