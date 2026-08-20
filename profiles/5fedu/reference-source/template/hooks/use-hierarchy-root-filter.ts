import { useMemo } from 'react';
import { getRootItems, countNodesInSubtree } from '@/lib/tree-utils';
import type { GetIdFn, GetParentIdFn, GetOrderFn } from '@/lib/tree-utils';

export interface HierarchyRootOption<T> {
  label: string;
  value: string;
  count: number;
  item: T;
}

export interface UseHierarchyRootFilterOptions<T> {
  items: T[];
  getId: GetIdFn<T>;
  getParentId: GetParentIdFn<T>;
  getOrder?: GetOrderFn<T>;
  getRootLabel: (item: T) => string;
}

/**
 * Hook: từ danh sách cây, trả về options cho filter "theo gốc" (mỗi root + số lượng node trong cây con).
 * Dùng cho FilterChipMultiSelect trong toolbar (vd. Phòng ban).
 */
export function useHierarchyRootFilter<T>(
  options: UseHierarchyRootFilterOptions<T>
): HierarchyRootOption<T>[] {
  const { items, getId, getParentId, getOrder, getRootLabel } = options;

  return useMemo(() => {
    const roots = getRootItems(items, { getParentId, getOrder });
    return roots.map((item) => ({
      label: getRootLabel(item),
      value: getId(item),
      count: countNodesInSubtree(getId(item), items, { getId, getParentId }),
      item,
    }));
  }, [items, getId, getParentId, getOrder, getRootLabel]);
}
