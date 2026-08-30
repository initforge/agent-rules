import { useMemo } from 'react';

export interface ExcludeSelfDimension<TItem> {
  passesOthers: (item: TItem) => boolean;
  getBucketKey: (item: TItem) => string | null | undefined;
}

/**
 * Đếm theo nguyên tắc exclude-self: mỗi dimension chỉ áp dụng filter của các dimension khác.
 */
export function countWithExcludeSelf<TItem>(
  items: TItem[],
  baseFilter: (item: TItem) => boolean,
  dimensions: ExcludeSelfDimension<TItem>[]
): Record<string, number>[] {
  const results = dimensions.map(() => ({} as Record<string, number>));

  for (const item of items) {
    if (!baseFilter(item)) continue;
    dimensions.forEach((dim, i) => {
      if (!dim.passesOthers(item)) return;
      const key = dim.getBucketKey(item);
      if (key == null || key === '') return;
      results[i][key] = (results[i][key] || 0) + 1;
    });
  }

  return results;
}

export function createFilterCountsHook<TItem, TFilters, TResult>(
  config: {
    matchesSearch: (item: TItem, searchTerm: string) => boolean;
    matchesColumnSearch: (item: TItem, filters: TFilters) => boolean;
    buildResult: (
      items: TItem[],
      searchTerm: string,
      filters: TFilters,
      countMaps: Record<string, number>[]
    ) => TResult;
    getDimensions: (
      items: TItem[],
      searchTerm: string,
      filters: TFilters
    ) => ExcludeSelfDimension<TItem>[];
  }
) {
  return function useFilterCounts(
    items: TItem[],
    searchTerm: string,
    filters: TFilters
  ): TResult {
    return useMemo(() => {
      const dimensions = config.getDimensions(items, searchTerm, filters);
      const baseFilter = (item: TItem) =>
        config.matchesSearch(item, searchTerm) && config.matchesColumnSearch(item, filters);
      const countMaps = countWithExcludeSelf(items, baseFilter, dimensions);
      return config.buildResult(items, searchTerm, filters, countMaps);
    }, [items, searchTerm, filters]);
  };
}
