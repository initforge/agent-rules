export interface ColumnSearchMatcherConfig<TItem, TContext = void> {
  /** Cột đã có MultiSelect ở header — bỏ qua trong columnSearch text */
  skipColumnIds: readonly string[];
  getFieldValue: (item: TItem, colId: string, context: TContext) => string;
}

export interface ColumnSearchMatcher<TItem, TContext = void> {
  countActive: (columnSearch: Record<string, string> | undefined) => number;
  matches: (
    item: TItem,
    columnSearch: Record<string, string> | undefined,
    context: TContext
  ) => boolean;
}

export function createColumnSearchMatcher<TItem, TContext = void>(
  config: ColumnSearchMatcherConfig<TItem, TContext>
): ColumnSearchMatcher<TItem, TContext> {
  const { skipColumnIds, getFieldValue } = config;

  const countActive = (columnSearch: Record<string, string> | undefined): number => {
    if (!columnSearch) return 0;
    let n = 0;
    for (const [colId, q] of Object.entries(columnSearch)) {
      if (!q.trim()) continue;
      if (skipColumnIds.includes(colId)) continue;
      n += 1;
    }
    return n;
  };

  const matches = (
    item: TItem,
    columnSearch: Record<string, string> | undefined,
    context: TContext
  ): boolean => {
    if (!columnSearch) return true;
    for (const [colId, q] of Object.entries(columnSearch)) {
      if (skipColumnIds.includes(colId)) continue;
      const trimmed = q.trim();
      if (!trimmed) continue;
      const str = getFieldValue(item, colId, context);
      if (!str.toLowerCase().includes(trimmed.toLowerCase())) return false;
    }
    return true;
  };

  return { countActive, matches };
}
