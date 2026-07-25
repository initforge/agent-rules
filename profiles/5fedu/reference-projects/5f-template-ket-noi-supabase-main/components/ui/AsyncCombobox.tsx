import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Option } from './Combobox';

export type { Option } from './Combobox';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export interface AsyncComboboxProps {
  /** Tải options theo chuỗi tìm (gọi khi mở dropdown và khi debounce search) */
  loadOptions: (query: string) => Promise<Option[]>;
  value?: string | number | null;
  onChange: (value: string | number | '') => void;
  label?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  icon?: React.ReactNode;
  dropdownInPortal?: boolean;
  clearable?: boolean;
  /** Độ trễ debounce tìm (ms), mặc định 300 */
  debounceMs?: number;
}

/**
 * Combobox một giá trị — options tải bất đồng bộ (danh sách lớn).
 */
const AsyncCombobox: React.FC<AsyncComboboxProps> = ({
  loadOptions,
  value,
  onChange,
  label,
  placeholder = 'Chọn một mục...',
  searchPlaceholder = 'Tìm kiếm...',
  error,
  required,
  className,
  disabled = false,
  icon,
  dropdownInPortal = false,
  clearable = true,
  debounceMs = 300,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, debounceMs);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const updateDropdownRect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const listHeight = 320;
    const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - rect.bottom : listHeight;
    const openAbove = spaceBelow < Math.min(listHeight, 240);
    setDropdownRect({
      top: openAbove ? rect.top - listHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (dropdownInPortal) updateDropdownRect();
  }, [isOpen, dropdownInPortal, updateDropdownRect]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const opts = await loadOptions(debouncedSearch.trim());
        if (!cancelled) setOptions(opts);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, debouncedSearch, loadOptions]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownInPortal && (target as Element).closest?.('[data-async-combobox-dropdown]')) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownInPortal, isOpen]);

  useEffect(() => {
    if (!isOpen || !dropdownInPortal) return;
    const reposition = () => updateDropdownRect();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen, dropdownInPortal, updateDropdownRect]);

  const selectedOption = useMemo(() => options.find((opt) => opt.value === value), [options, value]);

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const dropdownContent = (
    <>
      <div className="p-2 border-b border-border sticky top-0 bg-card z-10">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            className="w-full pl-9 pr-3 py-2 text-sm text-foreground bg-muted border border-border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <div className="max-h-[220px] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin opacity-60" />
            Đang tải...
          </div>
        ) : options.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Không có dữ liệu</div>
        ) : (
          options.map((option) => (
            <div
              key={String(option.value)}
              role="option"
              aria-selected={value === option.value}
              tabIndex={0}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors',
                value === option.value
                  ? 'bg-primary/5 text-primary font-medium'
                  : 'text-foreground hover:bg-muted/50'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(option.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(option.value);
                }
              }}
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span>{option.label}</span>
                {option.subLabel && (
                  <span className="text-xs text-muted-foreground font-normal">{option.subLabel}</span>
                )}
              </div>
              {value === option.value && <Check size={16} className="text-primary shrink-0" />}
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className={cn('w-full relative', className)} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 flex items-center gap-1.5 text-foreground">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        role="combobox"
        disabled={disabled}
        className={cn(
          'relative w-full h-10 rounded-lg border border-border bg-background py-2 px-3 text-sm text-foreground ring-offset-background flex items-center justify-between cursor-pointer transition-all duration-200 text-left',
          isOpen ? 'border-primary ring-2 ring-primary/20' : 'hover:border-border/80 focus-within:border-border/80',
          error ? 'border-destructive focus-visible:ring-destructive' : '',
          disabled ? 'opacity-50 cursor-not-allowed bg-muted' : ''
        )}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
      >
        <span className={cn('truncate flex-1 min-w-0', !selectedOption && 'text-muted-foreground')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {clearable && selectedOption && !disabled && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                clearSelection(e);
              }}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
              role="button"
              tabIndex={-1}
              aria-hidden
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={16} className={cn('text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
        </div>
      </button>

      {error && <p className="text-xs font-medium text-destructive mt-1.5 ml-1">{error}</p>}

      {dropdownInPortal && isOpen && dropdownRect && typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              <motion.div
                id={listboxId}
                role="listbox"
                data-async-combobox-dropdown
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[9999] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
                style={{
                  top: dropdownRect.top,
                  left: dropdownRect.left,
                  width: Math.max(dropdownRect.width, 280),
                  maxHeight: 320,
                }}
              >
                {dropdownContent}
              </motion.div>
            </AnimatePresence>,
            document.body
          )
        : null}

      {!dropdownInPortal && (
        <AnimatePresence>
          {isOpen && !disabled && (
            <motion.div
              id={listboxId}
              role="listbox"
              data-async-combobox-dropdown
              initial={{ opacity: 0, y: 5, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
            >
              {dropdownContent}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default AsyncCombobox;
