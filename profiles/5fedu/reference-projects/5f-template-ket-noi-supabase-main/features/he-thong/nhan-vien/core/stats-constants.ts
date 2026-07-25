/**
 * Constants for Employee Stats / Dashboard
 */

import { txt } from '@/lib/text';
import {
  DEFAULT_STATS_DATE_PRESET_ID,
  STANDARD_STATS_DATE_PRESET_IDS,
  type StandardStatsDatePresetId,
} from '@/lib/stats-date-range';

export type DateRangePresetId = StandardStatsDatePresetId;

const PRESET_LABEL_KEYS: Record<Exclude<DateRangePresetId, 'custom'>, string> = {
  all: 'employee.stats.preset.all',
  this_week: 'employee.stats.preset.thisWeek',
  last_week: 'employee.stats.preset.lastWeek',
  last_7_days: 'employee.stats.preset.last7Days',
  this_month: 'employee.stats.preset.thisMonth',
  last_month: 'employee.stats.preset.lastMonth',
  last_30_days: 'employee.stats.preset.last30Days',
  this_quarter: 'employee.stats.preset.thisQuarter',
  last_quarter: 'employee.stats.preset.lastQuarter',
  last_6_months: 'employee.stats.preset.last6Months',
  this_year: 'employee.stats.preset.thisYear',
  last_year: 'employee.stats.preset.lastYear',
};

export { DEFAULT_STATS_DATE_PRESET_ID };

export const DATE_RANGE_PRESETS: { id: DateRangePresetId; label: string }[] = [
  ...STANDARD_STATS_DATE_PRESET_IDS.map((id) => ({
    id,
    get label() {
      return txt(PRESET_LABEL_KEYS[id]);
    },
  })),
  { id: 'custom', get label() { return txt('employee.stats.preset.custom'); } },
];

export const DEPT_COLORS = [
  '#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#10b981',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

import type { TrangThaiNhanVien } from './constants';

export const STATUS_COLORS: Record<TrangThaiNhanVien, string> = {
  'Đang làm việc': '#10b981',
  'Thử việc': '#3b82f6',
  'Nghỉ phép': '#f59e0b',
  'Nghỉ việc': '#94a3b8',
};

export const STATUS_LABELS: Record<TrangThaiNhanVien, string> = {
  'Đang làm việc': txt('employee.statusActive'),
  'Thử việc': txt('employee.statusProbation'),
  'Nghỉ phép': txt('employee.statusLeave'),
  'Nghỉ việc': txt('employee.statusResigned'),
};

export const GENDER_COLORS: Record<string, string> = {
  Nam: '#6366f1',
  Nữ: '#ec4899',
  Khác: '#94a3b8',
};

export const GENDER_LABELS: Record<string, string> = {
  get Nam() { return txt('employee.genderMale'); },
  get Nữ() { return txt('employee.genderFemale'); },
  get Khác() { return txt('employee.genderOther'); },
};

/** KPI ids used for visibility config (localStorage) */
export const DEFAULT_KPI_IDS = ['total', 'active', 'probation', 'inactive'] as const;
export const STATS_KPI_STORAGE_KEY = 'nhan-vien-stats-kpi';

/** Max months non-admin can select for date range (security) */
export const MAX_DATE_RANGE_MONTHS_NON_ADMIN = 12;

/** Chiều cao chuẩn cho biểu đồ stats (Recharts ResponsiveContainer) — desktop */
export const STATS_CHART_HEIGHT = 200;

/** Mobile: cao hơn một chút để legend + pie đỡ chật */
export const STATS_CHART_HEIGHT_MOBILE = 232;
