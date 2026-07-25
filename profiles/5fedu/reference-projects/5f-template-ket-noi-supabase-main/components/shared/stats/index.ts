/**
 * Generic components cho các màn Thống kê / Báo cáo.
 * Dùng chung cho: Nhân viên (nhan-vien-stats), Báo cáo công việc (bao-cao), và các module thống kê sau này.
 *
 * Chuẩn layout màn báo cáo/thống kê:
 * - DashboardToolbar (filters, actions, filterGroups, activeFilterCount, onClearFilters, onBack)
 * - StatsKpiGrid (các thẻ KPI: icon, label, value, pct, delta)
 * - StatsCard / StatsTableCard (biểu đồ hoặc bảng 2 cột)
 * - StatsDataGrid (bảng đa cột giống listview, scroll + phân trang)
 *
 * Types: StatsKpiCardItem, StatsTableRow, StatsTableCardProps, StatsDataGridProps (xem types.ts).
 */

export { default as StatsKpiGrid } from './StatsKpiGrid';
export { default as StatsCard } from './StatsCard';
export { default as StatsTableCard } from './StatsTableCard';
export { default as StatsDataGrid } from './StatsDataGrid';
export { default as StatsDrillDownDialog } from './StatsDrillDownDialog';
export { default as StatsTrendBadge } from './StatsTrendBadge';
export type {
  StatsKpiCardItem,
  StatsTableRow,
  StatsTableCardProps,
  StatsDataGridColumn,
  StatsDataGridProps,
  StatsDataGridSortState,
  StatsDataGridAlign,
} from './types';
export type { StatsDrillDownDialogProps, StatsDrillDownDialogSize } from './StatsDrillDownDialog';
