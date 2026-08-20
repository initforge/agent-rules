import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { txt } from '@/lib/text';
import { ChevronDown, Check, X, Search, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Option {
  label: string;
  value: string;
  icon?: React.ElementType;
  /** Số lượng record tương ứng (cross-filter count) */
  count?: number;
}

/**
 * MultiSelect – component generic cho chọn nhiều.
 * Quy chuẩn filter chip: trong dropdown luôn có (1) "Chọn tất cả" bên trái và (2) "Xóa chọn" bên phải.
 * Dùng chung cho desktop; FilterChipMultiSelect/FilterChipSingleSelect wrap component này.
 * Creatable: truyền onCreateOption + createOptionLabel thì khi gõ text không trùng option sẽ hiện "Tạo mới: ...", chọn sẽ gọi onCreateOption(label) và thêm id trả về vào value.
 */
interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  icon?: React.ElementType;
  size?: 'sm' | 'md';
  /** Creatable: (label) => Promise<newOptionValue | null>. Khi có, hiện hàng "Tạo mới" nếu search không khớp option nào. */
  onCreateOption?: (label: string) => Promise<string | null>;
  /** Label cho hàng tạo mới, dùng %s thay cho searchTerm. VD: "Tạo mới: %s" */
  createOptionLabel?: string;
  /** Chỉ render panel dropdown (không nút trigger) — dùng với nút tùy chỉnh (vd. header bảng). */
  dropdownOnly?: boolean;
  /** Điều khiển mở/đóng từ ngoài (bắt buộc khi `dropdownOnly`) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Khi `dropdownOnly`: nút mở panel, nằm trong cùng container (cùng ref click-outside).
   * Bắt buộc khi `dropdownOnly` (không render nút trigger mặc định).
   */
  renderDropdownTrigger?: (ctx: {
    open: boolean;
    toggle: () => void;
    hasValue: boolean;
    listboxId: string;
  }) => React.ReactNode;
  /** Nội dung phía trên ô tìm kiếm (vd. sắp xếp nhanh trên header cột). */
  dropdownTopContent?: React.ReactNode | ((ctx: { close: () => void }) => React.ReactNode);
  /** Khi có `dropdownTopContent`: không auto-focus ô tìm kiếm khi mở. */
  suppressSearchAutofocus?: boolean;
  /** Chỉ hiển thị `dropdownTopContent` (vd. menu chỉ sort), không ô tìm / danh sách option / footer. */
  omitFilterSections?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Chọn...",
  label,
  className,
  icon: Icon,
  size = 'sm',
  onCreateOption,
  createOptionLabel = "Tạo mới: %s",
  dropdownOnly = false,
  open: openControlled,
  onOpenChange,
  renderDropdownTrigger,
  dropdownTopContent,
  suppressSearchAutofocus = false,
  omitFilterSections = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = openControlled !== undefined ? openControlled : internalOpen;
  const setOpen = useCallback((next: boolean) => {
    onOpenChange?.(next);
    if (openControlled === undefined) setInternalOpen(next);
  }, [onOpenChange, openControlled]);
  const toggle = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!isOpen || suppressSearchAutofocus) return;
    searchInputRef.current?.focus();
  }, [isOpen, suppressSearchAutofocus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setOpen]);

  /** `passive: false` để `preventDefault` chặn cuộn bảng khi list ngắn / vùng sort+search. */
  useEffect(() => {
    if (!isOpen) return;
    const panel = dropdownPanelRef.current;
    if (!panel) return;

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const list = optionsListRef.current;
      if (!list) {
        e.preventDefault();
        return;
      }
      const canScroll = list.scrollHeight > list.clientHeight + 1;
      const overList = list.contains(e.target as Node);
      if (overList && canScroll) {
        const { scrollTop, scrollHeight, clientHeight } = list;
        const delta = e.deltaY;
        const atTop = scrollTop <= 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
        if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
          e.preventDefault();
        }
        return;
      }
      e.preventDefault();
    };

    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    const isSelected = value.includes(optionValue);
    if (isSelected) {
      onChange(value.filter((item) => item !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleSelectAll = () => {
    if (value.length === filteredOptions.length) {
      onChange([]);
    } else {
      onChange(filteredOptions.map((opt) => opt.value));
    }
  };

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const searchTrim = searchTerm.trim();
  const hasExactMatch = searchTrim && options.some((o) => o.label.toLowerCase() === searchTrim.toLowerCase());
  const showCreateOption = !!onCreateOption && searchTrim.length > 0 && !hasExactMatch;

  const handleCreateOption = async () => {
    if (!onCreateOption || !searchTrim || isCreating) return;
    setIsCreating(true);
    try {
      const newId = await onCreateOption(searchTrim);
      if (typeof newId === 'string' && !value.includes(newId)) {
        onChange([...value, newId]);
      }
      setSearchTerm('');
    } finally {
      setIsCreating(false);
    }
  };

  const hasValue = value.length > 0;
  const firstName = value.length > 0 ? options.find(o => o.value === value[0])?.label : null;
  const extraCount = value.length - 1;

  const heightClass = size === 'sm' ? 'h-7' : 'h-8';

  const resolvedTopContent =
    typeof dropdownTopContent === 'function'
      ? dropdownTopContent({ close: () => setOpen(false) })
      : dropdownTopContent;
  const hasTopContent = !!resolvedTopContent;
  const panelA11y = omitFilterSections
    ? { id: listboxId, role: 'group' as const }
    : hasTopContent
      ? { role: 'group' as const }
      : { id: listboxId, role: 'listbox' as const };

  return (
    <div
      className={cn(dropdownOnly ? "relative min-w-0" : "relative min-w-[140px]", className)}
      ref={containerRef}
    >
      {dropdownOnly && renderDropdownTrigger
        ? renderDropdownTrigger({ open: isOpen, toggle, hasValue, listboxId })
        : !dropdownOnly && (
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={toggle}
        className={cn(
          "w-full flex items-center justify-between px-2 text-xs border rounded-lg transition-all",
          heightClass,
          isOpen ? "border-primary ring-2 ring-primary/10 bg-background" : hasValue ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-background hover:bg-muted/50",
          hasValue ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
          {Icon && <Icon size={12} className={cn("shrink-0", hasValue ? "text-primary" : "text-muted-foreground")} />}
          {label && <span className="font-medium text-foreground shrink-0">{label}:</span>}

          {!hasValue ? (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate text-xs font-medium">{firstName}</span>
              {extraCount > 0 && (
                <span className="shrink-0 bg-primary/10 text-primary text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums" title={value.map(v => options.find(o => o.value === v)?.label).filter(Boolean).join(', ')}>
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {hasValue && (
            <button
              type="button"
              aria-label={txt('common.clearSelection')}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground"
            >
              <X size={10} />
            </button>
          )}
          <ChevronDown size={11} className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </div>
      </button>
      )}

      {isOpen && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- chặn bubble đóng khi tương tác trong panel dropdown
        <div
          ref={dropdownPanelRef}
          {...panelA11y}
          className={cn(
            "absolute mt-1 overscroll-contain bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200",
            dropdownOnly
              ? "top-full right-0 z-[60] w-[min(280px,calc(100vw-2rem))] min-w-[220px]"
              : "top-full left-0 z-50 w-full min-w-[200px]"
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {resolvedTopContent && (
            <div
              className={cn(
                'bg-muted/20 p-1.5',
                !omitFilterSections && 'border-b border-border',
              )}
            >
              {resolvedTopContent}
            </div>
          )}
          {!omitFilterSections && (
          <>
          {/* Search */}
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                className="w-full pl-7 pr-3 py-1.5 text-xs text-foreground border border-border rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                placeholder="Tìm kiếm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Options */}
          <div
            ref={optionsListRef}
            {...(hasTopContent ? { id: listboxId, role: 'listbox' as const } : {})}
            className="max-h-[220px] overflow-y-auto overscroll-contain custom-scrollbar p-1"
          >
            {filteredOptions.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border mb-0.5">
                <button
                  type="button"
                  className="flex items-center flex-1 min-w-0 hover:bg-muted/50 rounded-lg cursor-pointer py-0.5 -my-0.5 px-1 -mx-1 text-left"
                  onClick={handleSelectAll}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center mr-2 transition-colors shrink-0",
                    value.length === filteredOptions.length && filteredOptions.length > 0 ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card"
                  )}>
                    {value.length === filteredOptions.length && filteredOptions.length > 0 && <Check size={9} />}
                  </div>
                  <span className="truncate">{txt('common.selectAll')}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange([]); }}
                  className="shrink-0 text-xs font-medium text-primary hover:underline py-0.5 px-1"
                >
                  {txt('common.clearSelection')}
                </button>
              </div>
            )}

            {filteredOptions.length === 0 && !showCreateOption ? (
              <div className="py-3 text-center text-xs text-muted-foreground">Không tìm thấy</div>
            ) : (
              <>
              {filteredOptions.map((option) => {
                const isSelected = value.includes(option.value);
                const hasCount = option.count !== undefined;
                const isZeroCount = hasCount && option.count === 0 && !isSelected;
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isZeroCount}
                    tabIndex={isZeroCount ? -1 : 0}
                    onClick={() => !isZeroCount && handleSelect(option.value)}
                    onKeyDown={(e) => {
                      if (isZeroCount) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(option.value);
                      }
                    }}
                    className={cn(
                      "flex items-center px-2 py-1.5 text-xs rounded-lg transition-colors",
                      isZeroCount
                        ? "opacity-40 cursor-not-allowed"
                        : "cursor-pointer",
                      isSelected ? "bg-primary/5 text-primary" : !isZeroCount && "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center mr-2 transition-colors shrink-0",
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card"
                    )}>
                      {isSelected && <Check size={9} />}
                    </div>
                    {option.icon && <option.icon size={13} className="mr-1.5 text-muted-foreground" />}
                    <span className="truncate">{option.label}</span>
                    {hasCount && (
                      <span className={cn(
                        "ml-auto shrink-0 text-xs font-medium tabular-nums pl-2",
                        isSelected ? "text-primary/70" : "text-muted-foreground"
                      )}>
                        {option.count}
                      </span>
                    )}
                  </div>
                );
              })}
              {showCreateOption && (
                <div
                  role="button"
                  tabIndex={isCreating ? -1 : 0}
                  onClick={isCreating ? undefined : handleCreateOption}
                  onKeyDown={(e) => {
                    if (isCreating) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCreateOption();
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors",
                    isCreating ? "opacity-60 cursor-wait" : "cursor-pointer text-primary hover:bg-primary/10"
                  )}
                >
                  {isCreating ? (
                    <Loader2 size={14} className="animate-spin shrink-0" />
                  ) : (
                    <Plus size={14} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {createOptionLabel.replace(/%s/g, searchTrim)}
                  </span>
                </div>
              )}
              </>
            )}
          </div>
          
          {/* Footer */}
          {hasValue && (
            <div className="px-2 py-1.5 bg-muted/30 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
              <span className="tabular-nums">{value.length} / {options.length} đã chọn</span>
              <button type="button" onClick={() => setOpen(false)} className="text-primary font-medium hover:underline text-xs">Xong</button>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
