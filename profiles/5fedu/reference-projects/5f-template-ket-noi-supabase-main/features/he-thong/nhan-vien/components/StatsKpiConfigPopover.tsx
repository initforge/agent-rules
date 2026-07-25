import React, { useState, useRef, useEffect } from 'react';
import { txt } from '@/lib/text';
import { LayoutTemplate } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { DEFAULT_KPI_IDS } from '../core/stats-constants';

export interface StatsKpiConfigPopoverProps {
  visibleKpiIds: string[];
  onToggle: (id: string) => void;
}

const KPI_LABEL_KEYS: Record<string, string> = {
  total: 'employee.stats.totalEmployees',
  active: 'employee.stats.working',
  probation: 'employee.stats.probation',
  inactive: 'employee.stats.leaveResigned',
};

const StatsKpiConfigPopover: React.FC<StatsKpiConfigPopoverProps> = ({
  visibleKpiIds,
  onToggle,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Tooltip content={txt('employee.stats.kpiOptions')} placement="bottom">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
        >
          <LayoutTemplate size={14} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-card rounded-xl shadow-xl border border-border z-50 p-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            {txt('employee.stats.showKpi')}
          </p>
          {DEFAULT_KPI_IDS.map((id) => {
            const label = txt(KPI_LABEL_KEYS[id] ?? id);
            return (
              <label
                key={id}
                className="flex items-center gap-2 py-1.5 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleKpiIds.includes(id)}
                  onChange={() => onToggle(id)}
                />
                {label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StatsKpiConfigPopover;
