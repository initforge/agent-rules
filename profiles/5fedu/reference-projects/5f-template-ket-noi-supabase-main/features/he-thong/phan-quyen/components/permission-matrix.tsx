import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { txt } from '@/lib/text';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getParentPath } from '@/components/shared/Breadcrumbs';
import {
  Shield, ChevronRight, Check, Minus, Save, ChevronDown,
  Layers, Building2, CheckCheck, ArrowLeft,
} from 'lucide-react';
import {
  PERMISSION_FUNCTIONS,
  PERMISSION_ACTIONS,
  SYSTEM_MODULES_CONFIG,
  type PermissionFunction,
} from '../services/phan-quyen-service';
import { PositionPermission, ActionType } from '../core/types';
import Button from '@/components/ui/Button';
import LoadingSpinnerWithText from '@/components/shared/LoadingSpinnerWithText';
import { cn } from '@/lib/utils';
import { useUpdateModulePermissions, usePermissionMatrixRoles } from '../hooks/use-phan-quyen';
import {
  prefetchAdjacentModuleRolePermissions,
  prefetchModuleRolePermissions,
} from '../utils/prefetch-module-permissions';
import { PERMISSION_MODULE_IDS } from '../core/permission-modules-config';
import { useCan } from '@/hooks/use-can';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { usePermissionDeptFilter } from '../hooks/use-permission-dept-filter';
import type { DeptFilterGroup } from '../utils/build-dept-filter-groups';
import {
  getInitialModuleId,
  moduleIdToTab,
  resolveModuleIdFromTab,
} from '../utils/permission-module-url';

const DOT_COLOR: Record<string, string> = {
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500',
  pink: 'bg-pink-500', violet: 'bg-violet-500', orange: 'bg-orange-500',
  cyan: 'bg-cyan-500', teal: 'bg-teal-500', slate: 'bg-slate-400',
};

const TriCheck: React.FC<{
  state: 'none' | 'some' | 'all';
  disabled?: boolean;
  onClick: () => void;
  size?: number;
}> = ({ state, disabled, onClick, size = 18 }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'rounded flex items-center justify-center mx-auto transition-all shrink-0',
      size === 18 ? 'w-[18px] h-[18px]' : 'w-5 h-5',
      disabled
        ? 'opacity-10 cursor-not-allowed bg-muted'
        : state === 'all'
          ? 'bg-primary text-primary-foreground shadow-sm'
          : state === 'some'
            ? 'bg-primary/40 text-primary-foreground'
            : 'bg-muted border border-border hover:border-primary/50',
    )}
  >
    {state === 'all' && <Check size={size === 18 ? 12 : 14} strokeWidth={3} />}
    {state === 'some' && <Minus size={size === 18 ? 12 : 14} strokeWidth={3} />}
  </button>
);

const MATRIX_ACTIONS: ActionType[] = [...PERMISSION_ACTIONS];
const INDIVIDUAL_ACTIONS: ActionType[] = ['view', 'create', 'update', 'delete', 'admin'];

const getModuleSlug = (id: string) => id.split('/').pop() ?? id;

const syncAll = (actions: ActionType[]): ActionType[] => {
  const allOn = INDIVIDUAL_ACTIONS.every((a) => actions.includes(a));
  if (allOn && !actions.includes('all')) return [...actions, 'all'];
  if (!allOn && actions.includes('all')) return actions.filter((a) => a !== 'all');
  return actions;
};

/* ─── Department filter dropdown (grouped by root phòng ban) ─── */
const DeptFilterDropdown: React.FC<{
  value: string | null;
  groups: DeptFilterGroup[];
  selectedLabel: string;
  onChange: (value: string | null) => void;
  className?: string;
}> = ({ value, groups, selectedLabel, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const label = value === null ? txt('permission.matrix.filterByDeptAll') : selectedLabel;

  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left bg-card hover:bg-muted/50 min-w-0 max-w-[180px] sm:max-w-[220px]',
          open ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        )}
      >
        <Building2 size={14} className="text-muted-foreground shrink-0" />
        <span className="text-[13px] font-medium text-foreground truncate flex-1">{label}</span>
        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-50 right-0 top-full mt-1 min-w-[200px] max-w-[280px] max-h-[280px] overflow-y-auto bg-card border border-border rounded-lg shadow-xl no-scrollbar py-1">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-[13px]', value === null ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground')}>
            {value === null && <Check size={14} className="shrink-0" />}
            <span className={value === null ? 'font-semibold' : ''}>{txt('permission.matrix.filterByDeptAll')}</span>
          </button>
          {groups.map((group) => (
            <React.Fragment key={group.rootId}>
              <div className="h-px bg-border my-1" />
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary truncate">
                {group.rootLabel}
              </div>
              {group.items.map((item) => {
                const isSel = value === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => { onChange(item.value); setOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 py-2 text-left text-[13px] truncate',
                      item.isGroup ? 'pl-6 pr-3' : 'px-3',
                      isSel ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted text-foreground',
                    )}
                  >
                    {isSel && <Check size={14} className="shrink-0" />}
                    <span className={cn('truncate', isSel && 'font-semibold')}>{item.label}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Desktop: Function Dropdown ─── */
const FunctionDropdown: React.FC<{
  selected: PermissionFunction | null;
  onSelect: (fn: PermissionFunction | null) => void;
}> = ({ selected, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dotClass = selected ? (DOT_COLOR[selected.color] ?? 'bg-primary') : 'bg-primary';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left bg-card hover:bg-muted/50',
          open ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        )}
      >
        <div className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} />
        <span className="text-[13px] font-semibold text-foreground truncate flex-1">
          {selected ? txt(selected.nameKey) : txt('common.all')}
        </span>
        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-[280px] overflow-y-auto no-scrollbar p-1">
            <button onClick={() => { onSelect(null); setOpen(false); }} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left', !selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground')}>
              <Layers size={13} className="shrink-0" />
              <span className="text-[13px] font-medium flex-1">{txt('common.all')}</span>
              {!selected && <Check size={13} className="text-primary shrink-0" />}
            </button>
            <div className="h-px bg-border my-1" />
            {PERMISSION_FUNCTIONS.map((fn) => {
              const isSel = selected?.id === fn.id;
              const count = fn.groups.reduce((s, g) => s + g.modules.length, 0);
              return (
                <button key={fn.id} onClick={() => { onSelect(fn); setOpen(false); }} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left', isSel ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground')}>
                  <div className={cn('w-2 h-2 rounded-full shrink-0', DOT_COLOR[fn.color] ?? 'bg-primary')} />
                  <span className="text-[13px] font-medium flex-1 truncate">{txt(fn.nameKey)}</span>
                  {isSel && <Check size={13} className="text-primary shrink-0" />}
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-5 text-right">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Mobile: full-screen permission editing for one module ─── */
const MobileModuleDetail: React.FC<{
  moduleId: string;
  roles: PositionPermission[];
  onBack: () => void;
}> = ({ moduleId, roles, onBack }) => {
  const canEditMatrix = useCan('edit', 'permissions');
  const updateMutation = useUpdateModulePermissions();
  const [localPerms, setLocalPerms] = useState<Record<string, ActionType[]>>({});
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const { data: departments = [] } = useDepartments();
  const { groups: deptGroups, filteredRoles, labelForId: deptFilterLabel } = usePermissionDeptFilter(
    roles,
    departments,
    deptFilter,
  );

  const moduleConfig = useMemo(() => SYSTEM_MODULES_CONFIG.find((m) => m.id === moduleId), [moduleId]);
  const moduleName = moduleConfig ? txt(moduleConfig.nameKey) : moduleId;

  useEffect(() => {
    const p: Record<string, ActionType[]> = {};
    roles.forEach((role) => {
      const mp = role.quyen_han.find((q) => q.module_id === moduleId);
      p[role.id] = mp ? syncAll([...mp.actions]) : [];
    });
    queueMicrotask(() => setLocalPerms(p));
  }, [moduleId, roles]);

  const actionLabels: Record<string, string> = {
    view: txt('permission.form.view'), create: txt('permission.form.add'),
    update: txt('permission.form.edit'), delete: txt('permission.form.delete'),
    admin: txt('permission.matrix.admin'), all: txt('permission.form.all'),
  };

  const groupedRoles = useMemo(() => {
    const groups: Record<string, PositionPermission[]> = {};
    const deptOrder: Record<string, number> = {};
    filteredRoles.forEach((role) => {
      const dept = role.ten_phong_ban || txt('permission.matrix.otherDept');
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(role);
      const o = role.thu_tu_phong_ban ?? 9999;
      if (deptOrder[dept] === undefined || o < deptOrder[dept]) deptOrder[dept] = o;
    });
    const sortedDepts = Object.keys(groups).sort((a, b) => (deptOrder[a] ?? 9999) - (deptOrder[b] ?? 9999));
    sortedDepts.forEach((d) => groups[d].sort((a, b) => (a.thu_tu_chuc_vu ?? 9999) - (b.thu_tu_chuc_vu ?? 9999)));
    return { groups, sortedDepts };
  }, [filteredRoles]);

  const allRoleIds = filteredRoles.map((r) => r.id);

  const toggleOne = (roleId: string, action: ActionType) => {
    if (!canEditMatrix) return;
    setLocalPerms((prev) => {
      const cur = prev[roleId] || [];
      if (action === 'all') return { ...prev, [roleId]: cur.includes('all') ? [] : [...MATRIX_ACTIONS] };
      const toggled = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action];
      return { ...prev, [roleId]: syncAll(toggled) };
    });
  };

  const toggleActionForRoles = (roleIds: string[], action: ActionType) => {
    if (!canEditMatrix) return;
    setLocalPerms((prev) => {
      if (action === 'all') {
        const allHave = roleIds.every((id) => (prev[id] || []).includes('all'));
        const next = { ...prev };
        roleIds.forEach((id) => { next[id] = allHave ? [] : [...MATRIX_ACTIONS]; });
        return next;
      }
      const allHave = roleIds.every((id) => (prev[id] || []).includes(action));
      const next = { ...prev };
      roleIds.forEach((id) => {
        const cur = next[id] || [];
        next[id] = syncAll(allHave ? cur.filter((a) => a !== action) : cur.includes(action) ? cur : [...cur, action]);
      });
      return next;
    });
  };

  const getActionState = (roleIds: string[], action: ActionType): 'none' | 'some' | 'all' => {
    const w = roleIds.filter((id) => (localPerms[id] || []).includes(action));
    return w.length === 0 ? 'none' : w.length === roleIds.length ? 'all' : 'some';
  };

  const handleSave = () => {
    if (!canEditMatrix) return;
    updateMutation.mutate({
      moduleId,
      updates: Object.entries(localPerms).map(([roleId, actions]) => ({ roleId, actions })),
    }, { onSuccess: onBack });
  };

  const MobileTriBtn: React.FC<{ label: string; state: 'none' | 'some' | 'all'; onClick: () => void; disabled?: boolean }> = ({ label, state, onClick, disabled }) => (
    <button type="button" disabled={disabled} onClick={onClick} className={cn(
      'flex items-center justify-center gap-1.5 px-1 py-2.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-95',
      disabled && 'opacity-40 pointer-events-none',
      state === 'all' ? 'bg-primary/15 border-primary/30 text-primary' : state === 'some' ? 'bg-primary/8 border-primary/20 text-primary/70' : 'bg-muted/30 border-border text-muted-foreground',
    )}>
      <span className={cn('w-[18px] h-[18px] rounded flex items-center justify-center shrink-0', state === 'all' ? 'bg-primary text-white' : state === 'some' ? 'bg-primary/40 text-white' : 'bg-muted border border-border')}>
        {state === 'all' && <Check size={11} strokeWidth={3} />}
        {state === 'some' && <Minus size={11} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in slide-in-from-right-4 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="shrink-0 h-8 px-2 -ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground active:scale-95 transition-all">
          <ArrowLeft size={15} className="stroke-[2.5px]" />
          <span className="text-xs font-medium">{txt('common.back')}</span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{moduleName}</p>
        </div>
        <Button onClick={handleSave} disabled={!canEditMatrix} isLoading={updateMutation.isPending} className="bg-primary text-white shadow-lg h-8 px-3 rounded-lg font-bold text-xs shrink-0">
          <Save size={13} className="mr-1" />
          {txt('common.saveChanges')}
        </Button>
      </div>

      {/* Dept filter */}
      <div className="flex p-3 pb-2 shrink-0 border-b border-border/50">
        <DeptFilterDropdown
          value={deptFilter}
          groups={deptGroups}
          selectedLabel={deptFilterLabel}
          onChange={setDeptFilter}
          className="w-full"
        />
      </div>

      {/* Permission cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 pb-safe">
        {/* Select all */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCheck size={14} className="text-primary" />
            <span className="text-[12px] font-bold text-primary">{txt('permission.matrix.selectAll')}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MATRIX_ACTIONS.map((a) => <MobileTriBtn key={a} label={actionLabels[a]} state={getActionState(allRoleIds, a)} onClick={() => toggleActionForRoles(allRoleIds, a)} disabled={!canEditMatrix} />)}
          </div>
        </div>

        {groupedRoles.sortedDepts.map((dept) => {
          const dr = groupedRoles.groups[dept]; const dids = dr.map((r) => r.id);
          return (
            <div key={dept} className="space-y-1.5">
              <div className="bg-muted/40 border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 size={14} className="text-primary shrink-0" />
                  <span className="text-[12px] font-bold text-foreground/80 flex-1 truncate">{txt(dept)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MATRIX_ACTIONS.map((a) => <MobileTriBtn key={a} label={actionLabels[a]} state={getActionState(dids, a)} onClick={() => toggleActionForRoles(dids, a)} disabled={!canEditMatrix} />)}
                </div>
              </div>
              {dr.map((role) => {
                const cur = localPerms[role.id] || [];
                return (
                  <div key={role.id} className="bg-card border border-border rounded-xl p-3 ml-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      <span className="text-[12px] font-semibold text-foreground flex-1 truncate">{role.ten_chuc_vu}</span>
                      <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{role.ma_chuc_vu}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {MATRIX_ACTIONS.map((a) => (
                        <MobileTriBtn key={a} label={actionLabels[a]} state={cur.includes(a) ? 'all' : 'none'} onClick={() => toggleOne(role.id, a)} disabled={!canEditMatrix} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─── Mobile: Module list (main view on mobile) ─── */
const MobileModuleList: React.FC<{
  onSelectModule: (id: string) => void;
  onModulePrefetch?: (id: string) => void;
}> = ({ onSelectModule, onModulePrefetch }) => {
  const [filterFn, setFilterFn] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(PERMISSION_FUNCTIONS.map((f) => f.id)));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(
    PERMISSION_FUNCTIONS.flatMap((fn) => fn.groups.map((gr) => `${fn.id}:${gr.groupTitleKey}`)),
  ));

  const displayed = filterFn ? PERMISSION_FUNCTIONS.filter((f) => f.id === filterFn) : PERMISSION_FUNCTIONS;

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  return (
    <>
      {/* Function filter chips */}
      <div className="flex gap-1.5 p-3 pb-2 overflow-x-auto no-scrollbar shrink-0">
        <button
          onClick={() => { setFilterFn(null); setExpanded(new Set(PERMISSION_FUNCTIONS.map((f) => f.id))); }}
          className={cn('shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors', !filterFn ? 'bg-primary text-white border-primary' : 'bg-card border-border text-muted-foreground')}
        >
          {txt('common.all')}
        </button>
        {PERMISSION_FUNCTIONS.map((fn) => (
          <button key={fn.id} onClick={() => { setFilterFn(fn.id); setExpanded(new Set([fn.id])); }} className={cn('shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors', filterFn === fn.id ? 'bg-primary text-white border-primary' : 'bg-card border-border text-muted-foreground')}>
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', filterFn === fn.id ? 'bg-white/70' : (DOT_COLOR[fn.color] ?? 'bg-primary'))} />
            {txt(fn.nameKey)}
          </button>
        ))}
      </div>

      {/* Module tree */}
      <div className="flex-1 overflow-y-auto pb-safe">
        {displayed.map((fn) => {
          const isExp = expanded.has(fn.id);
          return (
            <div key={fn.id}>
              <button
                onClick={() =>
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    if (n.has(fn.id)) n.delete(fn.id);
                    else n.add(fn.id);
                    return n;
                  })
                }
                className={cn('w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-border/50', isExp ? 'bg-primary/[0.04]' : '')}
              >
                <div className={cn('w-1 h-5 rounded-full shrink-0', isExp ? 'bg-primary' : 'bg-border')} />
                <span className={cn('text-[13px] font-bold uppercase tracking-wide flex-1', isExp ? 'text-primary' : 'text-foreground/70')}>{txt(fn.nameKey)}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums mr-1">{fn.groups.reduce((s, g) => s + g.modules.length, 0)}</span>
                <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', !isExp && '-rotate-90')} />
              </button>
              {isExp && fn.groups.map((gr) => {
                const groupKey = `${fn.id}:${gr.groupTitleKey}`;
                const isGrExp = expandedGroups.has(groupKey);
                return (
                  <div key={gr.groupTitleKey}>
                    <button type="button" onClick={() => toggleGroup(groupKey)} className={cn('w-full flex items-center gap-2.5 px-4 pl-8 py-3 text-left border-b border-border/50 transition-colors active:bg-muted/40', isGrExp ? 'bg-muted/20' : '')}>
                      <div className="w-0.5 h-4 rounded-full bg-primary/40 shrink-0" />
                      <span className="text-sm font-semibold text-foreground/90 flex-1">{txt(gr.groupTitleKey)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{gr.modules.length}</span>
                      <ChevronDown size={14} className={cn('text-foreground/60 transition-transform shrink-0', !isGrExp && '-rotate-90')} />
                    </button>
                    {isGrExp && gr.modules.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onSelectModule(m.id)}
                        onMouseEnter={() => onModulePrefetch?.(m.id)}
                        onFocus={() => onModulePrefetch?.(m.id)}
                        className="w-full flex items-center gap-2.5 px-4 pl-12 py-3.5 text-left border-b border-border/30 transition-colors active:bg-primary/5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/25 shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="text-[13px] text-foreground block">{txt(m.nameKey)}</span>
                          <span className="font-mono text-[10px] text-muted-foreground/40 block">{getModuleSlug(m.id)}</span>
                        </span>
                        <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
};

/* ─── Main Component ─── */
const PermissionMatrix: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const queryClient = useQueryClient();
  const goBackToParent = () => {
    const p = getParentPath(location.pathname, txt);
    navigate(p ?? '/he-thong');
  };
  const [selectedFunction, setSelectedFunction] = useState<PermissionFunction | null>(null);
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(() => new Set(PERMISSION_FUNCTIONS.map((f) => f.id)));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(
    PERMISSION_FUNCTIONS.flatMap((fn) => fn.groups.map((gr) => `${fn.id}:${gr.groupTitleKey}`)),
  ));
  const [selectedModuleId, setSelectedModuleId] = useState<string>(() => getInitialModuleId(tabFromUrl));
  const [mobileSelectedModule, setMobileSelectedModule] = useState<string | null>(() => {
    const resolved = resolveModuleIdFromTab(tabFromUrl);
    if (!resolved || typeof window === 'undefined') return null;
    return window.matchMedia('(max-width: 1023px)').matches ? resolved : null;
  });
  const activeModuleId = mobileSelectedModule ?? selectedModuleId;
  const { data: roles = [], isLoading } = usePermissionMatrixRoles(activeModuleId);
  const { data: departments = [] } = useDepartments();
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);
  const [localPermissions, setLocalPermissions] = useState<Record<string, ActionType[]>>({});
  const { groups: deptGroups, filteredRoles, labelForId: deptFilterLabel } = usePermissionDeptFilter(
    roles,
    departments,
    selectedDeptFilter,
  );

  const syncTabToUrl = useCallback(
    (moduleId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', moduleIdToTab(moduleId));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSelectModule = useCallback(
    (id: string) => {
      setSelectedModuleId(id);
      setSelectedDeptFilter(null);
      syncTabToUrl(id);
    },
    [syncTabToUrl],
  );

  const handleOpenMobileModule = useCallback(
    (id: string) => {
      setMobileSelectedModule(id);
      setSelectedModuleId(id);
      setSelectedDeptFilter(null);
      syncTabToUrl(id);
    },
    [syncTabToUrl],
  );

  useEffect(() => {
    const resolved = resolveModuleIdFromTab(tabFromUrl);
    if (!resolved || resolved === selectedModuleId) return;
    queueMicrotask(() => {
      setSelectedModuleId(resolved);
      setSelectedDeptFilter(null);
    });
  }, [tabFromUrl, selectedModuleId]);

  const updateMutation = useUpdateModulePermissions();
  const canEditMatrix = useCan('edit', 'permissions');

  const prefetchModulePermissions = (moduleId: string) => {
    prefetchModuleRolePermissions(queryClient, moduleId);
  };

  useEffect(() => {
    if (!activeModuleId) return;
    prefetchModuleRolePermissions(queryClient, activeModuleId);
    prefetchAdjacentModuleRolePermissions(queryClient, activeModuleId, PERMISSION_MODULE_IDS);
  }, [activeModuleId, queryClient]);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectedModule = useMemo(() => SYSTEM_MODULES_CONFIG.find((m) => m.id === selectedModuleId), [selectedModuleId]);
  const displayModuleName = selectedModule ? txt(selectedModule.nameKey) : selectedModuleId;

  useEffect(() => {
    const p: Record<string, ActionType[]> = {};
    roles.forEach((role) => {
      const mp = role.quyen_han.find((q) => q.module_id === activeModuleId);
      p[role.id] = mp ? syncAll([...mp.actions]) : [];
    });
    queueMicrotask(() => setLocalPermissions(p));
  }, [activeModuleId, roles]);

  const actionLabels: Record<string, string> = {
    view: txt('permission.form.view'), create: txt('permission.form.add'),
    update: txt('permission.form.edit'), delete: txt('permission.form.delete'),
    admin: txt('permission.matrix.admin'), all: txt('permission.form.all'),
  };

  const filteredFunctions = useMemo(() => selectedFunction ? PERMISSION_FUNCTIONS.filter((f) => f.id === selectedFunction.id) : PERMISSION_FUNCTIONS, [selectedFunction]);

  const groupedRoles = useMemo(() => {
    const groups: Record<string, PositionPermission[]> = {};
    const deptOrder: Record<string, number> = {};
    filteredRoles.forEach((role) => {
      const dept = role.ten_phong_ban || txt('permission.matrix.otherDept');
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(role);
      const o = role.thu_tu_phong_ban ?? 9999;
      if (deptOrder[dept] === undefined || o < deptOrder[dept]) deptOrder[dept] = o;
    });
    const sortedDepts = Object.keys(groups).sort((a, b) => (deptOrder[a] ?? 9999) - (deptOrder[b] ?? 9999));
    sortedDepts.forEach((d) => groups[d].sort((a, b) => (a.thu_tu_chuc_vu ?? 9999) - (b.thu_tu_chuc_vu ?? 9999)));
    return { groups, sortedDepts };
  }, [filteredRoles]);

  const toggleOne = (roleId: string, action: ActionType) => {
    if (!canEditMatrix) return;
    setLocalPermissions((prev) => {
      const cur = prev[roleId] || [];
      if (action === 'all') return { ...prev, [roleId]: cur.includes('all') ? [] : [...MATRIX_ACTIONS] };
      const toggled = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action];
      return { ...prev, [roleId]: syncAll(toggled) };
    });
  };

  const toggleActionForRoles = (roleIds: string[], action: ActionType) => {
    if (!canEditMatrix) return;
    setLocalPermissions((prev) => {
      if (action === 'all') {
        const allHave = roleIds.every((id) => (prev[id] || []).includes('all'));
        const next = { ...prev };
        roleIds.forEach((id) => { next[id] = allHave ? [] : [...MATRIX_ACTIONS]; });
        return next;
      }
      const allHave = roleIds.every((id) => (prev[id] || []).includes(action));
      const next = { ...prev };
      roleIds.forEach((id) => {
        const cur = next[id] || [];
        next[id] = syncAll(allHave ? cur.filter((a) => a !== action) : cur.includes(action) ? cur : [...cur, action]);
      });
      return next;
    });
  };

  const getActionState = (roleIds: string[], action: ActionType): 'none' | 'some' | 'all' => {
    const w = roleIds.filter((id) => (localPermissions[id] || []).includes(action));
    return w.length === 0 ? 'none' : w.length === roleIds.length ? 'all' : 'some';
  };

  const handleSave = () => {
    if (!canEditMatrix) return;
    updateMutation.mutate({
      moduleId: selectedModuleId,
      updates: Object.entries(localPermissions).map(([roleId, actions]) => ({ roleId, actions })),
    });
  };

  const toggleFunctionExpand = (id: string) => {
    setExpandedFunctions((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allRoleIds = filteredRoles.map((r) => r.id);

  if (isLoading) return <div className="flex-1 flex items-center justify-center min-h-[200px]"><LoadingSpinnerWithText text={txt('permission.matrix.loading')} centered /></div>;

  return (
    <>
      {/* ─── Mobile: module detail overlay ─── */}
      {mobileSelectedModule && (
        <MobileModuleDetail
          moduleId={mobileSelectedModule}
          roles={roles}
          onBack={() => setMobileSelectedModule(null)}
        />
      )}

      <div className="flex flex-col lg:flex-row h-full gap-0 lg:gap-5 overflow-hidden">

        {/* ─── Mobile: toolbar + module list (thay thế toàn bộ giao diện cũ) ─── */}
        <div className="lg:hidden flex flex-col h-full overflow-hidden bg-card rounded-xl border border-border shadow-sm">
          {/* Toolbar */}
          <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-2 shrink-0">
            <button type="button" onClick={goBackToParent} className="shrink-0 h-8 px-2 -ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground active:scale-95 transition-all" aria-label={txt('common.back')}>
              <ArrowLeft size={15} className="stroke-[2.5px]" />
              <span className="text-xs font-medium">{txt('common.back')}</span>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <h1 className="text-sm font-semibold text-foreground truncate">{txt('permission.title')}</h1>
            </div>
          </div>
          {/* Module list */}
          <MobileModuleList
            onSelectModule={handleOpenMobileModule}
            onModulePrefetch={prefetchModulePermissions}
          />
        </div>

        {/* ─── Desktop: Sidebar ─── */}
        <div className="hidden lg:flex w-[280px] xl:w-[300px] flex-col shrink-0">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-2.5 border-b border-border">
              <FunctionDropdown selected={selectedFunction} onSelect={(fn) => {
                setSelectedFunction(fn);
                if (fn) setExpandedFunctions((prev) => new Set([...prev, fn.id]));
                else setExpandedFunctions(new Set(PERMISSION_FUNCTIONS.map((f) => f.id)));
              }} />
            </div>

            <div className="overflow-y-auto no-scrollbar flex-1 py-1">
              {filteredFunctions.map((fn) => {
                const isExp = expandedFunctions.has(fn.id);
                return (
                  <div key={fn.id}>
                    <button onClick={() => toggleFunctionExpand(fn.id)} className={cn('w-full flex items-center gap-2 px-3 py-[7px] transition-colors text-left', isExp ? 'bg-primary/[0.06] dark:bg-primary/10' : 'hover:bg-muted/50')}>
                      <div className={cn('w-1 h-4 rounded-full shrink-0', isExp ? 'bg-primary' : 'bg-border')} />
                      <span className={cn('text-[12px] font-bold uppercase tracking-wide flex-1 truncate', isExp ? 'text-primary' : 'text-foreground/70')}>{txt(fn.nameKey)}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-5 text-right">{fn.groups.reduce((s, g) => s + g.modules.length, 0)}</span>
                      <ChevronDown size={12} className={cn('text-muted-foreground transition-transform shrink-0', !isExp && '-rotate-90')} />
                    </button>
                    {isExp && (
                      <div className="ml-[18px] border-l border-border/70">
                        {fn.groups.map((gr) => {
                          const groupKey = `${fn.id}:${gr.groupTitleKey}`;
                          const isGrExp = expandedGroups.has(groupKey);
                          return (
                            <div key={gr.groupTitleKey}>
                              <button type="button" onClick={() => toggleGroupExpand(groupKey)} className={cn('w-full flex items-center gap-2 pl-3 pr-2 py-2 text-left transition-colors', isGrExp ? 'bg-muted/30' : 'hover:bg-muted/20')}>
                                <div className="w-0.5 h-4 rounded-full bg-primary/40 shrink-0" />
                                <span className="text-xs font-semibold text-foreground/90 truncate flex-1">{txt(gr.groupTitleKey)}</span>
                                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-4 text-right">{gr.modules.length}</span>
                                <ChevronDown size={12} className={cn('text-foreground/60 transition-transform shrink-0', !isGrExp && '-rotate-90')} />
                              </button>
                              {isGrExp && gr.modules.map((m) => {
                                const isActive = selectedModuleId === m.id;
                                return (
                                  <button
                                    key={m.id}
                                    onClick={() => handleSelectModule(m.id)}
                                    onMouseEnter={() => prefetchModulePermissions(m.id)}
                                    onFocus={() => prefetchModulePermissions(m.id)}
                                    className={cn('w-full flex items-start gap-1.5 pl-5 pr-2 py-[5px] transition-all text-left', isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 font-normal')}
                                  >
                                    <span className={cn('w-1 h-1 rounded-full shrink-0 mt-[6px]', isActive ? 'bg-primary' : 'bg-muted-foreground/30')} />
                                    <span className="flex-1 min-w-0">
                                      <span className="text-[12px] block truncate">{txt(m.nameKey)}</span>
                                      <span className={cn('font-mono text-[9.5px] block truncate', isActive ? 'text-primary/50' : 'text-muted-foreground/40')}>{getModuleSlug(m.id)}</span>
                                    </span>
                                    {isActive && <ChevronRight size={10} className="text-primary shrink-0 mt-[5px]" />}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Desktop: Matrix table ─── */}
        <div className="hidden lg:flex flex-1 flex-col overflow-hidden min-w-0">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
            {/* Toolbar */}
            <div className="p-3 lg:p-4 border-b border-border bg-muted/30 flex items-center gap-3">
              <button type="button" onClick={goBackToParent} className="shrink-0 h-8 px-2 -ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95" aria-label={txt('common.back')}>
                <ArrowLeft size={15} className="stroke-[2.5px]" />
                <span className="text-xs font-medium">{txt('common.back')}</span>
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="h-4 w-4" />
                </div>
                <h1 className="text-sm font-semibold text-foreground truncate">{txt('permission.title')}</h1>
              </div>
              <DeptFilterDropdown
                value={selectedDeptFilter}
                groups={deptGroups}
                selectedLabel={deptFilterLabel}
                onChange={setSelectedDeptFilter}
              />
              <Button onClick={handleSave} disabled={!canEditMatrix} isLoading={updateMutation.isPending} className="bg-primary text-white shadow-xl h-9 px-5 rounded-lg font-bold text-sm shrink-0">
                <Save size={14} className="mr-1.5" />
                {txt('common.saveChanges')}
              </Button>
            </div>

            {/* Module name sub-header */}
            <div className="px-6 py-2 border-b border-border/50 bg-muted/10 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{txt('permission.matrix.setupTitle')}</span>
              <span className="text-xs font-semibold text-primary truncate">{displayModuleName}</span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b-2 border-border">
                  <tr>
                    <th className="px-6 py-2.5 text-left text-[11px] font-semibold text-muted-foreground w-[220px]">{txt('permission.matrix.position')}</th>
                    {MATRIX_ACTIONS.map((a) => <th key={a} className="px-2 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{actionLabels[a]}</th>)}
                  </tr>
                  <tr className="border-t border-border bg-muted/20">
                    <td className="px-6 py-2 text-[11px] font-bold text-primary/80">{txt('permission.matrix.selectAll')}</td>
                    {MATRIX_ACTIONS.map((a) => <td key={a} className="px-1 py-2 text-center"><TriCheck state={getActionState(allRoleIds, a)} disabled={!canEditMatrix} onClick={() => toggleActionForRoles(allRoleIds, a)} /></td>)}
                  </tr>
                </thead>
                <tbody>
                  {groupedRoles.sortedDepts.map((dept) => {
                    const dr = groupedRoles.groups[dept]; const dids = dr.map((r) => r.id);
                    return (
                      <React.Fragment key={dept}>
                        <tr className="bg-muted/40 border-t-2 border-border">
                          <td className="px-6 py-2"><span className="flex items-center gap-1.5 font-bold text-[12px] text-foreground/80"><Building2 size={13} className="text-primary shrink-0" />{txt(dept)}</span></td>
                          {MATRIX_ACTIONS.map((a) => <td key={a} className="px-1 py-2 text-center"><TriCheck state={getActionState(dids, a)} disabled={!canEditMatrix} onClick={() => toggleActionForRoles(dids, a)} /></td>)}
                        </tr>
                        {dr.map((role, ri) => {
                          const cur = localPermissions[role.id] || []; const isLast = ri === dr.length - 1;
                          return (
                            <tr key={role.id} className="hover:bg-muted/20 transition-colors border-t border-border/50">
                              <td className="px-6 py-2 pl-8">
                                <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                                  <span className="flex flex-col items-center shrink-0 w-3 self-stretch">
                                    <span className="w-px flex-1 bg-border" />
                                    <span className="w-1.5 h-1.5 rounded-full border-2 border-primary/40 bg-card shrink-0" />
                                    {!isLast && <span className="w-px flex-1 bg-border" />}
                                  </span>
                                  {role.ten_chuc_vu}
                                </span>
                              </td>
                              {MATRIX_ACTIONS.map((a) => <td key={a} className="px-1 py-2 text-center"><TriCheck state={cur.includes(a) ? 'all' : 'none'} disabled={!canEditMatrix} onClick={() => toggleOne(role.id, a)} /></td>)}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PermissionMatrix;
