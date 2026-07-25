/**
 * Quy ước vị trí hành động trên màn detail (code-first, không phải action engine).
 * - prominent: vùng toolbar chính (DetailToolbar)
 * - inline: cạnh giá trị trường (DetailField trailing)
 */
export type DetailActionPlacement = 'prominent' | 'inline';

export interface DetailChromeActionBase {
  id: string;
  placement: DetailActionPlacement;
  label: string;
  /** Bắt buộc khi placement === 'inline' — gom action theo trường */
  fieldKey?: string;
}

export function partitionDetailActions<T extends DetailChromeActionBase>(actions: T[]): {
  prominent: T[];
  inlineByFieldKey: Record<string, T[]>;
} {
  const prominent: T[] = [];
  const inlineByFieldKey: Record<string, T[]> = {};

  for (const a of actions) {
    if (a.placement === 'prominent') {
      prominent.push(a);
      continue;
    }
    const fk = a.fieldKey ?? '_';
    if (!inlineByFieldKey[fk]) inlineByFieldKey[fk] = [];
    inlineByFieldKey[fk].push(a);
  }

  return { prominent, inlineByFieldKey };
}
