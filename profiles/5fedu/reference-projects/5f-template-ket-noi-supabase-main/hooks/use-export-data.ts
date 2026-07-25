import { useMemo } from 'react';
import type { PaginationState } from '@/store/createGenericStore';

interface ExportColumn {
  key: string;
  label: string;
}

interface UseExportDataOptions<T> {
  /** Danh sách data đã lọc */
  data: T[];
  /** Có đang mở dialog export không (lazy — chỉ tính khi true) */
  isOpen: boolean;
  /** Hàm chuyển đổi 1 item thành object phẳng cho export */
  mapFn: (item: T) => Record<string, unknown>;
  /** Pagination hiện tại */
  pagination: PaginationState;
  /** Các id đang được chọn */
  selectedIds: Set<string>;
  /** Hàm lấy id từ item */
  keyExtractor: (item: T) => string;
}

interface ExportDataResult {
  /** Toàn bộ dữ liệu export (đã map) */
  exportData: Record<string, unknown>[];
  /** Dữ liệu trang hiện tại */
  paginatedData: Record<string, unknown>[];
  /** Dữ liệu các dòng đã chọn */
  selectedData: Record<string, unknown>[];
}

/**
 * Hook tái sử dụng cho export data.
 * Lazy: chỉ tính khi `isOpen === true`, trả [] khi đóng.
 */
export function useExportData<T>({
  data,
  isOpen,
  mapFn,
  pagination,
  selectedIds,
  keyExtractor,
}: UseExportDataOptions<T>): ExportDataResult {
  const exportData = useMemo(() => {
    if (!isOpen) return [];
    return data.map(mapFn);
  }, [data, isOpen, mapFn]);

  const paginatedData = useMemo(() => {
    if (!isOpen) return [];
    const start = (pagination.page - 1) * pagination.pageSize;
    return exportData.slice(start, start + pagination.pageSize);
  }, [exportData, pagination, isOpen]);

  const selectedData = useMemo(() => {
    if (!isOpen || selectedIds.size === 0) return [];
    return exportData.filter((_, i) => selectedIds.has(keyExtractor(data[i])));
  }, [exportData, selectedIds, data, keyExtractor, isOpen]);

  return { exportData, paginatedData, selectedData };
}

export type { ExportColumn };
