/**
 * Types for Employee Stats / Dashboard
 */
import type { DateRangePresetId } from './stats-constants';

export interface StatsDateRange {
  preset: DateRangePresetId;
  /** Start of range (inclusive) */
  start: Date;
  /** End of range (inclusive), "as at" date for headcount */
  end: Date;
  label: string;
}

export interface DeptChartItem {
  name: string;
  value: number;
}

export interface StatusChartItem {
  name: string;
  value: number;
  fill: string;
}

export interface HiringChartItem {
  label: string;
  count: number;
}

export interface GenderChartItem {
  name: string;
  value: number;
  fill: string;
}

export interface DeptSummaryRow {
  name: string;
  total: number;
  active: number;
  probation: number;
  inactive: number;
  rate: string;
}

export interface StatsTrends {
  totalDelta: number;
  activeDelta: number;
  hiredThisMonth: number;
  hiredPrevMonth: number;
  /** Same period last year (for YoY) */
  totalYoY?: number;
  activeYoY?: number;
}

export interface KpiItem {
  id: string;
  label: string;
  value: number;
  icon: unknown; // LucideIcon or similar
  color: string;
  bg: string;
  pct: string | null;
  delta: number | null;
  yoyPercent?: number | null;
}

export interface StatsMiniSummary {
  hiredThisMonth: number;
  maleCount: number;
  femaleCount: number;
  topDept: { name: string; value: number } | null;
}

export interface StatsExportMeta {
  dateRangeLabel: string;
  filterDeptLabels: string[];
  filterStatusLabels: string[];
  exportedAt: string;
}
