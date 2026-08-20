/**
 * Primitives theo nhóm “view type” ERP — import có chủ đích.
 * Catalog đầy đủ: [`VIEW_TYPE_REGISTRY`](../../lib/view-types/registry.ts), tài liệu: `docs/view-types.md`.
 */

/* —— table —— */
export { default as GenericTable } from '@/components/shared/GenericTable';
export { default as GenericToolbar } from '@/components/shared/GenericToolbar';
export { default as TablePaginationFooter } from '@/components/shared/TablePaginationFooter';
export { default as ColumnManager } from '@/components/shared/ColumnManager';
export { default as ExportDialog } from '@/components/shared/ExportDialog';
export { default as ImportDialog } from '@/components/shared/ImportDialog';

/* —— detail —— */
export { default as GenericDrawer } from '@/components/shared/GenericDrawer';
export { default as DetailSection } from '@/components/shared/DetailSection';
export { default as DetailField } from '@/components/shared/DetailField';
export { default as DetailFieldGrid } from '@/components/shared/DetailFieldGrid';
export { default as DetailToolbar } from '@/components/shared/DetailToolbar';
export { default as DetailSystemSection } from '@/components/shared/DetailSystemSection';
export type { DetailSystemSectionProps, DetailSystemSectionLabels } from '@/components/shared/DetailSystemSection';

/* —— form —— */
export { default as FormSection } from '@/components/shared/FormSection';
export { default as FormGrid } from '@/components/shared/FormGrid';
export { FormStepper } from '@/components/shared/FormStepper';
export type { FormStepperProps, FormStepperStep } from '@/components/shared/FormStepper';
export { default as DataField } from '@/components/data-types/DataField';
export { default as RhfDataField } from '@/components/data-types/RhfDataField';

/* —— dashboard —— */
export { default as ModuleDashboardLayout } from '@/components/dashboard/ModuleDashboardLayout';
export { default as SubModuleCard } from '@/components/dashboard/SubModuleCard';

/* —— card_list —— */
export { MobileListCard } from '@/components/shared/MobileListCard';

/* —— master_detail —— */
export { default as GenericSubTableSection } from '@/components/shared/GenericSubTableSection';
export { default as EmbeddedChildDataGrid } from '@/components/shared/EmbeddedChildDataGrid';
export {
  EMBEDDED_CHILD_GRID_DEFAULT_ROW_PX,
  EMBEDDED_CHILD_GRID_DEFAULT_HEAD_PX,
  EMBEDDED_CHILD_GRID_VIRTUAL_THRESHOLD,
} from '@/components/shared/EmbeddedChildDataGrid';

/* —— navigation_shell —— */
export { default as Breadcrumbs } from '@/components/shared/Breadcrumbs';

/* —— security_ui —— */
export { Can } from '@/components/auth/Can';
export type { CanProps } from '@/components/auth/Can';

/* —— feedback_overlay —— */
export { default as EmptyState } from '@/components/shared/EmptyState';
export { default as ConfirmDialog } from '@/components/shared/ConfirmDialog';

/* —— stats —— */
export { default as StatsDataGrid } from '@/components/shared/stats/StatsDataGrid';
export type {
  StatsDataGridColumn,
  StatsDataGridProps,
  StatsDataGridSortState,
} from '@/components/shared/stats/types';
export {
  STATS_TABLE_MAX_BODY_ROWS,
  STATS_TABLE_DEFAULT_PAGE_SIZE,
  getStatsTableScrollMaxHeightCss,
} from '@/lib/stats-table';
