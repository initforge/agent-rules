import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { txt } from '@/lib/text';
import { Building2, Tag, Inbox, Users } from 'lucide-react';
import { toast } from 'sonner';
import DateRangePicker from '@/components/ui/DateRangePicker';
import DashboardToolbar from '@/components/shared/DashboardToolbar';
import FilterChipMultiSelect from '@/components/shared/FilterChipMultiSelect';
import LoadingSpinnerWithText from '@/components/shared/LoadingSpinnerWithText';
import StatsKpiGrid from '@/components/shared/stats/StatsKpiGrid';
import StatsDataGrid from '@/components/shared/stats/StatsDataGrid';
import StatsDrillDownDialog from '@/components/shared/stats/StatsDrillDownDialog';
import type { StatsDataGridColumn } from '@/components/shared/stats/types';
import EnumBadge from '@/components/ui/EnumBadge';
import type { DeptSummaryRow } from '../core/stats-types';
import { useDepartments } from '@/features/he-thong/phong-ban/hooks/use-phong-ban';
import { useAuthStore } from '@/store/useStore';
import { useCan } from '@/hooks/use-can';
import { Employee } from '../core/types';
import { STATUS_OPTIONS, STATUS_BADGE_CONFIG } from '../core/constants';
import {
  DATE_RANGE_PRESETS,
  DEFAULT_KPI_IDS,
  DEFAULT_STATS_DATE_PRESET_ID,
  STATS_KPI_STORAGE_KEY,
  STATS_CHART_HEIGHT,
  STATS_CHART_HEIGHT_MOBILE,
  type DateRangePresetId,
} from '../core/stats-constants';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getDateRangeFromPreset } from '../utils/stats-date-range';
import { isAllStatsDateRange } from '@/lib/stats-date-range';
import { clampDateRangeForRole, canExportStats } from '../utils/stats-permissions';
import { useEmployeeStats } from '../hooks/use-employee-stats';
import { exportStatsToExcel, exportStatsToPdf } from '../utils/export-stats-report';
import { formatDateTime, formatDate } from '@/lib/utils';
import { usePrimaryColor } from '@/lib/theme-utils';
import StatsExportDropdown from './StatsExportDropdown';
import StatsKpiConfigPopover from './StatsKpiConfigPopover';

const EmployeeStatsCharts = lazy(() => import('./EmployeeStatsCharts'));

const ChartsFallback = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {[1, 2].map((i) => (
      <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-[250px] animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="h-[200px] bg-muted/30 rounded-lg" />
      </div>
    ))}
  </div>
);

interface EmployeeStatsProps {
  employees: Employee[];
  isLoading: boolean;
  onViewItem?: (item: Employee) => void;
}

type DrillDownState =
  | { kind: 'dept'; deptId: string; label: string }
  | { kind: 'status'; status: string; label: string };

function loadVisibleKpiIds(): string[] {
  try {
    const raw = localStorage.getItem(STATS_KPI_STORAGE_KEY);
    if (!raw) return [...DEFAULT_KPI_IDS];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_KPI_IDS];
  } catch {
    return [...DEFAULT_KPI_IDS];
  }
}

const EmployeeStats: React.FC<EmployeeStatsProps> = ({
  employees,
  isLoading,
  onViewItem,
}) => {
  const { data: departments = [] } = useDepartments();
  const userRole = useAuthStore((s) => s.user?.role);
  const canExport = useCan('export', 'employees');
  const { hex: primaryHex } = usePrimaryColor();
  const isMdUp = useMediaQuery('(min-width: 768px)');
  const chartHeight = isMdUp ? STATS_CHART_HEIGHT : STATS_CHART_HEIGHT_MOBILE;

  const [filterDept, setFilterDept] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePresetId>(DEFAULT_STATS_DATE_PRESET_ID);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [chartsVisible, setChartsVisible] = useState(false);
  const [visibleKpiIds, setVisibleKpiIds] = useState<string[]>(loadVisibleKpiIds);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  const dateRange = useMemo(() => {
    const range = getDateRangeFromPreset(
      dateRangePreset,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined
    );
    return clampDateRangeForRole(range, userRole);
  }, [dateRangePreset, customStart, customEnd, userRole]);

  const {
    filtered,
    deptData,
    statusData,
    hiringData,
    genderData,
    deptSummary,
    kpis,
    DEPT_COLORS,
  } = useEmployeeStats({
    employees,
    filterDept,
    filterStatus,
    dateRange,
    visibleKpiIds,
  });

  useEffect(() => {
    const timer = setTimeout(() => setChartsVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const departmentOptions = departments.map((d) => ({ label: d.ten_phong_ban, value: d.id }));
  const statusOptions = STATUS_OPTIONS.map((s) => ({ label: s.label, value: String(s.value) }));
  const statsActiveFilterCount =
    (filterDept.length > 0 ? 1 : 0) +
    (filterStatus.length > 0 ? 1 : 0) +
    (!isAllStatsDateRange(dateRangePreset) ? 1 : 0);
  const handleClearStatsFilters = () => {
    setFilterDept([]);
    setFilterStatus([]);
    setDateRangePreset(DEFAULT_STATS_DATE_PRESET_ID);
    setCustomStart('');
    setCustomEnd('');
  };

  const statsFilterGroups = useMemo(
    () => [
      {
        key: 'dept',
        label: txt('employee.stats.department'),
        icon: Building2,
        options: departmentOptions,
        value: filterDept,
        onChange: (val: string[]) => setFilterDept(val),
      },
      {
        key: 'status',
        label: txt('employee.stats.status'),
        icon: Tag,
        options: statusOptions,
        value: filterStatus,
        onChange: (val: string[]) => setFilterStatus(val),
      },
    ],
    [departmentOptions, statusOptions, filterDept, filterStatus]
  );

  const handleExportReport = useCallback(
    async (format: 'excel' | 'pdf') => {
      if (!canExportStats(canExport)) return;
      const exportedAt = formatDateTime(new Date());
      const filterDeptLabels = filterDept.map(
        (id) => departments.find((d) => d.id === id)?.ten_phong_ban ?? id
      );
      const filterStatusLabels = filterStatus.map(
        (v) => STATUS_OPTIONS.find((s) => String(s.value) === v)?.label ?? v
      );
      const meta = {
        dateRangeLabel: dateRange.label,
        filterDeptLabels,
        filterStatusLabels,
        exportedAt,
      };
      try {
        if (format === 'excel') {
          await exportStatsToExcel(meta, kpis, deptSummary);
        } else {
          await exportStatsToPdf(meta, kpis, deptSummary);
        }
        toast.success(txt('employee.stats.exportSuccess'), {
          description: txt('employee.stats.exportSuccessDesc'),
        });
      } catch {
        toast.error(txt('employee.stats.exportError'));
      }
    },
    [canExport, filterDept, filterStatus, dateRange.label, departments, kpis, deptSummary]
  );

  const handleToggleKpi = (id: string) => {
    const next = visibleKpiIds.includes(id)
      ? visibleKpiIds.filter((k) => k !== id)
      : [...visibleKpiIds, id];
    if (next.length === 0) return;
    setVisibleKpiIds(next);
    localStorage.setItem(STATS_KPI_STORAGE_KEY, JSON.stringify(next));
  };

  const deptIdByName = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d) => {
      m[d.ten_phong_ban] = d.id;
    });
    return m;
  }, [departments]);

  const openDeptDrillDown = useCallback(
    (deptId: string) => {
      const label = departments.find((d) => d.id === deptId)?.ten_phong_ban ?? deptId;
      setDrillDown({ kind: 'dept', deptId, label });
    },
    [departments],
  );

  const openStatusDrillDown = useCallback((status: string) => {
    const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
    setDrillDown({ kind: 'status', status, label });
  }, []);

  const drillDownRows = useMemo(() => {
    if (!drillDown) return [];
    if (drillDown.kind === 'dept') {
      return filtered.filter((e) => e.phong_ban_id === drillDown.deptId);
    }
    return filtered.filter((e) => e.trang_thai === drillDown.status);
  }, [filtered, drillDown]);

  const drillDownSubtitle = useMemo(() => {
    if (!drillDown) return undefined;
    return txt('stats.drillDown.subtitle', { count: drillDownRows.length, label: drillDown.label });
  }, [drillDown, drillDownRows.length]);

  const drillDownColumns = useMemo((): StatsDataGridColumn<Employee>[] => [
    {
      id: 'id',
      label: 'ID',
      align: 'left',
      minWidth: 72,
      sticky: true,
      sortable: true,
      getSortValue: (row) => row.id,
    },
    {
      id: 'ho_ten',
      label: txt('employee.name'),
      align: 'left',
      minWidth: 160,
      sortable: true,
      getSortValue: (row) => row.ho_ten,
    },
    {
      id: 'ten_phong_ban',
      label: txt('employee.department'),
      align: 'left',
      minWidth: 128,
      sortable: true,
      getSortValue: (row) => row.ten_phong_ban ?? '',
    },
    {
      id: 'ten_chuc_vu',
      label: txt('employee.position'),
      align: 'left',
      minWidth: 128,
      sortable: true,
      getSortValue: (row) => row.ten_chuc_vu ?? '',
    },
    {
      id: 'trang_thai',
      label: txt('employee.status'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.trang_thai,
    },
    {
      id: 'tg_tao',
      label: txt('employee.store.createdCol'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.tg_tao ?? '',
    },
  ], []);

  const renderDrillDownCell = useCallback((colId: string, row: Employee) => {
    switch (colId) {
      case 'id':
        return <span className="font-medium tabular-nums font-mono text-xs">{row.id}</span>;
      case 'ho_ten':
        return (
          <span className="font-medium max-w-[12rem] truncate sm:max-w-none sm:whitespace-normal" title={row.ho_ten}>
            {row.ho_ten}
          </span>
        );
      case 'ten_phong_ban':
        return <span className="text-muted-foreground">{row.ten_phong_ban ?? '—'}</span>;
      case 'ten_chuc_vu':
        return <span className="text-muted-foreground">{row.ten_chuc_vu ?? '—'}</span>;
      case 'trang_thai':
        return <EnumBadge value={row.trang_thai} config={STATUS_BADGE_CONFIG} truncate />;
      case 'tg_tao':
        return (
          <span className="text-muted-foreground tabular-nums">
            {row.tg_tao ? formatDate(row.tg_tao) : '—'}
          </span>
        );
      default:
        return null;
    }
  }, []);

  const handleDrillDownRowClick = useCallback(
    (row: Employee) => {
      if (onViewItem) onViewItem(row);
    },
    [onViewItem],
  );

  const deptStatsColumns = useMemo((): StatsDataGridColumn<DeptSummaryRow>[] => [
    {
      id: 'name',
      label: txt('employee.stats.department'),
      align: 'left',
      minWidth: 144,
      sticky: true,
      sortable: true,
      getSortValue: (row) => row.name,
    },
    {
      id: 'total',
      label: txt('employee.stats.total'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.total,
    },
    {
      id: 'active',
      label: txt('employee.stats.workingShort'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.active,
    },
    {
      id: 'probation',
      label: txt('employee.stats.probation'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.probation,
    },
    {
      id: 'inactive',
      label: txt('employee.stats.leave'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => row.inactive,
    },
    {
      id: 'rate',
      label: txt('employee.stats.activeRate'),
      align: 'center',
      sortable: true,
      getSortValue: (row) => parseFloat(row.rate) || 0,
    },
  ], []);

  const renderDeptStatsCell = useCallback((colId: string, row: DeptSummaryRow) => {
    switch (colId) {
      case 'name':
        return (
          <span className="font-medium max-w-[14rem] truncate sm:max-w-none sm:whitespace-normal" title={row.name}>
            {row.name}
          </span>
        );
      case 'total':
        return <span className="font-semibold tabular-nums">{row.total}</span>;
      case 'active':
        return (
          <span className="font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">{row.active}</span>
        );
      case 'probation':
        return (
          <span className="font-medium text-blue-600 dark:text-blue-400 tabular-nums">{row.probation}</span>
        );
      case 'inactive':
        return <span className="text-muted-foreground tabular-nums">{row.inactive}</span>;
      case 'rate':
        return (
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${row.rate}%` }} />
            </div>
            <span className="text-muted-foreground tabular-nums font-medium">{row.rate}%</span>
          </div>
        );
      default:
        return null;
    }
  }, []);

  const handleDeptRowClick = useCallback(
    (row: DeptSummaryRow) => {
      const deptId = deptIdByName[row.name];
      if (deptId) openDeptDrillDown(deptId);
    },
    [deptIdByName, openDeptDrillDown],
  );

  const dateRangePickerPresets = DATE_RANGE_PRESETS.map((p) => ({ id: p.id, label: p.label }));

  const renderFilters = (
    <>
      <DateRangePicker
        presets={dateRangePickerPresets}
        value={{ preset: dateRangePreset, customStart, customEnd }}
        onChange={(v) => {
          setDateRangePreset(v.preset as DateRangePresetId);
          setCustomStart(v.customStart);
          setCustomEnd(v.customEnd);
        }}
        displayLabel={isAllStatsDateRange(dateRangePreset) ? undefined : dateRange.label}
        placeholder={txt('employee.stats.dateRangePlaceholder')}
      />
      <FilterChipMultiSelect
        options={departmentOptions}
        value={filterDept}
        onChange={setFilterDept}
        icon={Building2}
        placeholder={txt('employee.stats.department')}
        className="w-[150px]"
      />
      <FilterChipMultiSelect
        options={statusOptions}
        value={filterStatus}
        onChange={setFilterStatus}
        icon={Tag}
        placeholder={txt('employee.stats.status')}
        className="w-[140px]"
      />
    </>
  );

  const renderExportAction = canExportStats(canExport) ? (
    <StatsExportDropdown onExport={handleExportReport} compact={false} />
  ) : null;

  const renderMobileExportAction = canExportStats(canExport) ? (
    <StatsExportDropdown onExport={handleExportReport} compact />
  ) : null;

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="shrink-0 py-3 px-3 sm:px-4 border-b border-border/50 bg-muted/20">
          <LoadingSpinnerWithText text={txt('employee.stats.loading')} centered />
        </div>
        <div className="flex-1 p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card rounded-lg border border-border p-2.5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-16 bg-muted/60 rounded" />
                    <div className="h-5 w-10 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-3.5 h-[250px] animate-pulse">
                <div className="h-4 w-32 bg-muted rounded mb-3" />
                <div className="h-[200px] bg-muted/30 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col">
      <DashboardToolbar
        filters={renderFilters}
        actions={
          <div className="flex items-center gap-2">
            <StatsKpiConfigPopover visibleKpiIds={visibleKpiIds} onToggle={handleToggleKpi} />
            {renderExportAction}
          </div>
        }
        mobileActions={renderMobileExportAction}
        filterGroups={statsFilterGroups}
        activeFilterCount={statsActiveFilterCount}
        onClearFilters={handleClearStatsFilters}
        className="static z-auto"
      />

      <div className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="min-w-0 max-w-full space-y-3 p-3 sm:p-4 pb-4">
          {isEmpty ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Inbox size={40} className="mx-auto text-muted-foreground/60 mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">{txt('employee.stats.noData')}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {statsActiveFilterCount > 0
                  ? txt('employee.stats.noDataHint')
                  : txt('employee.stats.noEmployeeInPeriod')}
              </p>
              {statsActiveFilterCount > 0 && (
                <button
                  onClick={handleClearStatsFilters}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {txt('employee.stats.clearFilters')}
                </button>
              )}
            </div>
          ) : (
            <>
              <StatsKpiGrid items={kpis} />

              {chartsVisible && (
                <Suspense fallback={<ChartsFallback />}>
                  <EmployeeStatsCharts
                    chartsVisible={chartsVisible}
                    chartHeight={chartHeight}
                    isMdUp={isMdUp}
                    primaryHex={primaryHex}
                    deptData={deptData}
                    statusData={statusData}
                    hiringData={hiringData}
                    genderData={genderData}
                    DEPT_COLORS={DEPT_COLORS}
                    deptIdByName={deptIdByName}
                    onDeptDrillDown={openDeptDrillDown}
                    onStatusDrillDown={openStatusDrillDown}
                  />
                </Suspense>
              )}

              {deptSummary.length > 0 && (
                <StatsDataGrid
                  title={txt('employee.stats.departmentTable')}
                  icon={Building2}
                  rows={deptSummary}
                  columns={deptStatsColumns}
                  getRowKey={(row) => row.name}
                  renderCell={renderDeptStatsCell}
                  onRowClick={handleDeptRowClick}
                  recordsLabel={txt('stats.footerRecords')}
                />
              )}
            </>
          )}
        </div>
      </div>

      <StatsDrillDownDialog
        open={drillDown != null}
        onClose={() => setDrillDown(null)}
        title={txt('stats.drillDown.title')}
        subtitle={drillDownSubtitle}
        icon={Users}
        rows={drillDownRows}
        columns={drillDownColumns}
        getRowKey={(row) => row.id}
        renderCell={renderDrillDownCell}
        onRowClick={onViewItem ? handleDrillDownRowClick : undefined}
        tableMinWidth="min-w-[48rem]"
      />
    </div>
  );
};

export default EmployeeStats;
