import { useMemo } from 'react';
import type { FlattenTreeOptions } from './tree-utils';
import { flattenTreeToSortedList } from './tree-utils';

/**
 * Hook: danh sách cây → danh sách phẳng đã sắp xếp DFS (memoized).
 */
export function useTreeFlatten<T>(
  items: T[],
  options: FlattenTreeOptions<T>
): T[] {
  return useMemo(
    () => flattenTreeToSortedList(items, options),
    [items, options]
  );
}

/**
 * Hook chuẩn để lọc danh sách theo searchTerm và filters.
 * Tránh lặp lại logic useMemo + filter trong mỗi trang list.
 *
 * @param data - Danh sách gốc
 * @param searchTerm - Chuỗi tìm kiếm
 * @param filters - Object filter (từ store)
 * @param filterFn - Hàm (item, searchTerm, filters) => boolean
 * @returns Danh sách đã lọc (memoized)
 */
export function useListWithFilter<T, TFilters>(
  data: T[],
  searchTerm: string,
  filters: TFilters,
  filterFn: (item: T, searchTerm: string, filters: TFilters) => boolean
): T[] {
  return useMemo(() => {
    return data.filter((item) => filterFn(item, searchTerm, filters));
  }, [data, searchTerm, filters, filterFn]);
}
