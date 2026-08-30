import type { Position } from '../core/types';
import { createColumnSearchMatcher } from '@/lib/factories/createColumnSearchMatcher';

/** Cột đã có MultiSelect trong header — không dùng thêm `columnSearch` text cho cùng cột. */
export const POSITION_COLUMN_IDS_WITH_MULTISELECT = ['trang_thai'] as const;

export function columnIdToPositionKey(colId: string): keyof Position {
  return colId as keyof Position;
}

const matcher = createColumnSearchMatcher<Position, void>({
  skipColumnIds: POSITION_COLUMN_IDS_WITH_MULTISELECT,
  getFieldValue: (pos, colId) => {
    const key = columnIdToPositionKey(colId);
    const raw = pos[key];
    return raw == null ? '' : String(raw);
  },
});

export const countColumnSearchActive = matcher.countActive;

export const positionMatchesColumnSearch = (
  pos: Position,
  columnSearch: Record<string, string> | undefined,
) => matcher.matches(pos, columnSearch, undefined);
