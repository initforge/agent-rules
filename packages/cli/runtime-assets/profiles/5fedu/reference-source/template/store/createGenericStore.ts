import { create } from 'zustand';
import type { CSSProperties } from 'react';

/**
 * Cấu hình cột dùng cho list/table view.
 * Quy định generic: mỗi cột nên có minWidth và maxWidth — xem `lib/table-column-presets.ts` (preset theo loại dữ liệu).
 * Ô dữ liệu dài: `truncate` / ellipsis trong cell; badge dùng `EnumBadge truncate`.
 */
export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  /** Chiều rộng tối thiểu (px). Nên luôn khai báo. */
  minWidth?: number;
  /** Chiều rộng tối đa (px). Nên khai báo cho cột text dài để tránh cột quá rộng. */
  maxWidth?: number;
  /** Chiều rộng hiện tại (do user resize). undefined = auto */
  width?: number;
  order: number;
}

/** Giá trị maxWidth mặc định khi cột không khai báo (tránh cột trải quá rộng). */
export const DEFAULT_COLUMN_MAX_WIDTH = 400;

/** Input cho getColumnCellStyle: cột đầy đủ hoặc bảng con chỉ cần minWidth/maxWidth. */
export type ColumnStyleInput = Pick<ColumnConfig, 'minWidth' | 'maxWidth'>;

/**
 * Style áp dụng cho th/td theo ColumnConfig (minWidth + maxWidth).
 * Dùng thống nhất ở mọi list/table (kể cả bảng con) để cột có kích thước phù hợp.
 */
export function getColumnCellStyle(col: ColumnStyleInput): CSSProperties {
  const style: CSSProperties = {};
  if (col.minWidth != null) style.minWidth = col.minWidth;
  if (col.maxWidth != null) style.maxWidth = col.maxWidth;
  else style.maxWidth = DEFAULT_COLUMN_MAX_WIDTH;
  return style;
}

export interface PaginationState {
  page: number;
  pageSize: number;
}

export interface SortState {
  column: string | null;
  direction: 'asc' | 'desc' | null;
}

export interface GenericState<TFilters> {
  // Data State
  searchTerm: string;
  filters: TFilters;
  pagination: PaginationState;
  sort: SortState;
  
  // UI State
  selectedIds: Set<string>;
  columns: ColumnConfig[];
  
  // Actions
  setSearchTerm: (term: string) => void;
  setFilter: (key: keyof TFilters, value: unknown) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  toggleSelection: (id: string) => void;
  toggleAllSelection: (ids: string[]) => void;
  clearSelection: () => void;
  toggleColumn: (id: string) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  resizeColumn: (id: string, width: number) => void;
  resetColumns: () => void;
  setSort: (column: string | null, direction: 'asc' | 'desc' | null) => void;
  resetState: () => void;
}

export const createGenericStore = <TFilters>(
  initialFilters: TFilters,
  defaultColumns: ColumnConfig[]
) => create<GenericState<TFilters>>((set) => ({
  searchTerm: '',
  filters: initialFilters,
  pagination: {
    page: 1,
    pageSize: 20,
  },
  sort: {
    column: null,
    direction: null,
  },
  selectedIds: new Set(),
  columns: defaultColumns.map((col, i) => ({ ...col, order: col.order ?? i })),

  setSearchTerm: (term) => set((state) => ({ searchTerm: term, pagination: { page: 1, pageSize: state.pagination.pageSize } })),
  
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
    pagination: { ...state.pagination, page: 1 }
  })),

  resetFilters: () => set((state) => ({ 
    filters: initialFilters,
    pagination: { ...state.pagination, page: 1 }
  })),

  setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
  
  setPageSize: (pageSize) => set((state) => ({ pagination: { ...state.pagination, pageSize, page: 1 } })),

  toggleSelection: (id) => set((state) => {
    const newSelected = new Set(state.selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    return { selectedIds: newSelected };
  }),

  toggleAllSelection: (ids) => set((state) => {
    const allSelected = ids.every(id => state.selectedIds.has(id));
    const newSelected = new Set(state.selectedIds);
    
    if (allSelected) {
      ids.forEach(id => newSelected.delete(id));
    } else {
      ids.forEach(id => newSelected.add(id));
    }
    return { selectedIds: newSelected };
  }),

  clearSelection: () => set({ selectedIds: new Set() }),

  toggleColumn: (id) => set((state) => ({
    columns: state.columns.map(col => 
      col.id === id ? { ...col, visible: !col.visible } : col
    )
  })),

  reorderColumns: (fromIndex, toIndex) => set((state) => {
    const sorted = [...state.columns].sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    return {
      columns: sorted.map((col, i) => ({ ...col, order: i }))
    };
  }),

  resizeColumn: (id, width) => set((state) => ({
    columns: state.columns.map(col => {
      if (col.id !== id) return col;
      const min = col.minWidth ?? 50;
      const max = col.maxWidth ?? DEFAULT_COLUMN_MAX_WIDTH;
      return { ...col, width: Math.min(Math.max(width, min), max) };
    })
  })),

  resetColumns: () => set({
    columns: defaultColumns.map((col, i) => ({ ...col, order: col.order ?? i }))
  }),

  setSort: (column, direction) => set({ sort: { column, direction } }),

  resetState: () => set({
    searchTerm: '',
    filters: initialFilters,
    pagination: { page: 1, pageSize: 20 },
    sort: { column: null, direction: null },
    selectedIds: new Set(),
    columns: defaultColumns.map((col, i) => ({ ...col, order: col.order ?? i }))
  })
}));
