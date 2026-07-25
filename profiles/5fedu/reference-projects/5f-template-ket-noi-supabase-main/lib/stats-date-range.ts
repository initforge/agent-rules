/**
 * Shared stats tab date-range conventions (tab Thống kê).
 * Reference: docs/UI-CONVENTIONS.md § Tab Thống kê — filter thời gian
 */

/** Default: no date filter — show all records (chip shows placeholder, not a preset label). */
export const DEFAULT_STATS_DATE_PRESET_ID = 'all' as const;

export type StandardStatsDatePresetId =
  | typeof DEFAULT_STATS_DATE_PRESET_ID
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_quarter'
  | 'last_quarter'
  | 'last_6_months'
  | 'this_year'
  | 'last_year'
  | 'custom';

/** Preset ids shown in DateRangePicker quick grid (excluding `custom`). Order matters for UX. */
export const STANDARD_STATS_DATE_PRESET_IDS: readonly Exclude<
  StandardStatsDatePresetId,
  'custom'
>[] = [
  DEFAULT_STATS_DATE_PRESET_ID,
  'this_week',
  'last_week',
  'last_7_days',
  'this_month',
  'last_month',
  'last_30_days',
  'this_quarter',
  'last_quarter',
  'last_6_months',
  'this_year',
  'last_year',
] as const;

export function isAllStatsDateRange(preset: string): boolean {
  return preset === DEFAULT_STATS_DATE_PRESET_ID;
}
