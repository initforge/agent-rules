import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DateRangePreset {
  id: string;
  label: string;
}

export interface DateRangeValue {
  preset: string;
  /** YYYY-MM-DD or '' */
  customStart: string;
  /** YYYY-MM-DD or '' */
  customEnd: string;
}

interface DateRangePickerProps {
  /** Available presets (e.g. "Tháng này", "Quý này", "Năm nay", …) */
  presets: DateRangePreset[];
  /** Current value */
  value: DateRangeValue;
  /** Called when value changes */
  onChange: (value: DateRangeValue) => void;
  /** Display label for the currently selected range */
  displayLabel?: string;
  /** Placeholder when nothing selected */
  placeholder?: string;
  /** Additional classes on the trigger button */
  className?: string;
  /** ID of the "custom" preset, default = 'custom' */
  customPresetId?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  presets,
  value,
  onChange,
  displayLabel,
  placeholder = 'Khoảng thời gian',
  className,
  customPresetId = 'custom',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const customStartId = useId();
  const customEndId = useId();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isCustom = value.preset === customPresetId;

  const triggerLabel = useMemo(() => {
    if (displayLabel) return displayLabel;
    if (isCustom && value.customStart && value.customEnd) {
      return `${formatDisplay(value.customStart)} – ${formatDisplay(value.customEnd)}`;
    }
    const found = presets.find((p) => p.id === value.preset);
    return found?.label ?? placeholder;
  }, [displayLabel, value, presets, placeholder, isCustom]);

  const handlePreset = (id: string) => {
    if (id === customPresetId) {
      onChange({ ...value, preset: customPresetId });
    } else {
      onChange({ preset: id, customStart: '', customEnd: '' });
      setOpen(false);
    }
  };

  return (
    <div className={cn('relative', className)} ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'h-8 pl-2.5 pr-2 flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap',
          open
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Calendar size={13} className="shrink-0" />
        <span className="truncate max-w-[140px]">{triggerLabel}</span>
        <ChevronDown size={12} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex">
            {/* Left column: From / To */}
            <div className="w-[180px] p-3 space-y-2.5 border-r border-border">
              <div>
                <label htmlFor={customStartId} className="text-xs font-medium text-muted-foreground mb-1 block">Từ ngày</label>
                <input
                  id={customStartId}
                  type="date"
                  value={value.customStart}
                  onChange={(e) =>
                    onChange({ preset: customPresetId, customStart: e.target.value, customEnd: value.customEnd })
                  }
                  className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                />
              </div>
              <div>
                <label htmlFor={customEndId} className="text-xs font-medium text-muted-foreground mb-1 block">Đến ngày</label>
                <input
                  id={customEndId}
                  type="date"
                  value={value.customEnd}
                  onChange={(e) =>
                    onChange({ preset: customPresetId, customStart: value.customStart, customEnd: e.target.value })
                  }
                  className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                />
              </div>
              {isCustom && value.customStart && value.customEnd && (
                <button
                  onClick={() => setOpen(false)}
                  className="w-full h-7 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  Áp dụng
                </button>
              )}
            </div>

            {/* Right column: Preset grid (2 cols) */}
            <div className="w-[200px] p-2">
              <p className="text-xs font-semibold text-muted-foreground px-1.5 mb-1.5">Chọn nhanh</p>
              <div className="grid grid-cols-2 gap-1">
                {presets
                  .filter((p) => p.id !== customPresetId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePreset(p.id)}
                      className={cn(
                        'h-7 px-2 rounded-lg text-xs font-medium transition-all text-left truncate',
                        value.preset === p.id
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-foreground hover:bg-muted border border-transparent'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default DateRangePicker;
