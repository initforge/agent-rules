/**
 * Generic types cho các module Thống kê / Báo cáo.
 * Các module (nhân viên, công việc, v.v.) dùng chung để chuẩn hóa UI.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Một thẻ KPI trong lưới tổng quan (số liệu, icon, phần trăm, xu hướng) */
export interface StatsKpiCardItem {
  id: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Tailwind text color, e.g. 'text-primary' */
  color?: string;
  /** Tailwind bg color, e.g. 'bg-primary/10' */
  bg?: string;
  /** Hiển thị phụ, e.g. '45%' */
  pct?: string | null;
  /** Thay đổi so kỳ (để hiển thị badge xu hướng). null = ẩn */
  delta?: number | null;
}

/** Một dòng trong bảng thống kê đơn giản (2 cột: nhãn + giá trị) */
export interface StatsTableRow {
  /** Cột 1: tên / nhãn */
  label: string;
  /** Cột 2: số hoặc chuỗi */
  value: number | string;
  /** Optional key for row (e.g. id) */
  id?: string;
}

/** Props cho card bảng thống kê 2 cột */
export interface StatsTableCardProps {
  title: string;
  /** Icon hiển thị cạnh title */
  icon?: LucideIcon;
  /** Dữ liệu bảng */
  rows: StatsTableRow[];
  /** Key cột 1 (i18n) */
  columnLabelKey?: string;
  /** Key cột 2 (i18n) */
  columnValueKey?: string;
  /** Chiều cao tối đa vùng scroll (e.g. 'max-h-[240px]') */
  maxHeight?: string;
  /** Không có dữ liệu: key i18n thông báo */
  emptyKey?: string;
  /** Số dòng body tối đa trong viewport trước khi scroll (mặc định STATS_TABLE_MAX_BODY_ROWS) */
  maxVisibleBodyRows?: number;
}

export type StatsDataGridAlign = 'left' | 'center' | 'right';

export interface StatsDataGridSortState {
  column: string | null;
  direction: 'asc' | 'desc' | null;
}

/** Cột bảng thống kê đa cột */
export interface StatsDataGridColumn<T = unknown> {
  id: string;
  label: string;
  align?: StatsDataGridAlign;
  minWidth?: number;
  /** Ghim trái khi cuộn ngang (mặc định: cột đầu tiên) */
  sticky?: boolean;
  sortable?: boolean;
  /** Giá trị dùng sort client-side */
  getSortValue?: (row: T) => string | number;
}

export interface StatsDataGridProps<T> {
  title: string;
  icon?: LucideIcon;
  rows: T[];
  columns: StatsDataGridColumn<T>[];
  getRowKey: (row: T) => string;
  renderCell: (colId: string, row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Phân trang controlled */
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  maxVisibleBodyRows?: number;
  /** Hàng tổng — `rows` = toàn bộ dataset (trước slice trang) */
  renderSummaryRow?: (colId: string, rows: T[]) => ReactNode;
  recordsLabel?: string;
  tableMinWidth?: string;
  sort?: StatsDataGridSortState;
  onSort?: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  className?: string;
  /** Ẩn card header/border — dùng bên trong AppDialog / StatsDrillDownDialog */
  embedded?: boolean;
}
