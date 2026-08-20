import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '../core/types';
import { flattenTreeToSortedList } from '@/lib/tree-utils';
import { getLanguage } from '@/lib/utils';

export type PositionTreeRow =
  | {
      kind: 'department';
      id: string;
      department: Department;
      level: number;
      positionCount: number;
    }
  | {
      kind: 'position';
      id: string;
      position: Position;
      level: number;
    };

const deptTreeOptions = {
  getId: (d: Department) => d.id,
  getParentId: (d: Department) => d.cha_id,
  getOrder: (d: Department) => d.thu_tu,
  includeOrphans: true as const,
};

function entityIdKey(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

/** Id phòng ban trong phạm vi lọc phòng gốc (BFS subtree). */
export function getDepartmentSubtreeIds(
  departments: Department[],
  rootFilterIds: string[],
): Set<string> {
  if (rootFilterIds.length === 0) {
    return new Set(departments.map((d) => String(d.id)));
  }
  const visible = new Set<string>();
  let current = new Set(rootFilterIds.map(String));
  while (current.size > 0) {
    current.forEach((id) => visible.add(id));
    const next = new Set<string>();
    departments.forEach((d) => {
      const parentId = entityIdKey(d.cha_id);
      if (parentId && current.has(parentId)) next.add(String(d.id));
    });
    current = next;
  }
  return visible;
}

export function defaultPositionSort(a: Position, b: Position): number {
  const capA = a.cap_bac ?? 999;
  const capB = b.cap_bac ?? 999;
  if (capA !== capB) return capA - capB;
  if (a.thu_tu !== b.thu_tu) return a.thu_tu - b.thu_tu;
  return a.ten_chuc_vu.localeCompare(b.ten_chuc_vu, getLanguage());
}

/** Ghép cây phòng ban (DFS) + chức vụ con trực tiếp dưới từng phòng ban. */
export function buildPositionTreeRows(
  departments: Department[],
  positions: Position[],
  sortPositions: (a: Position, b: Position) => number = defaultPositionSort,
): PositionTreeRow[] {
  const flatDepts = flattenTreeToSortedList(departments, deptTreeOptions);
  const byDept = new Map<string, Position[]>();

  for (const p of positions) {
    const deptId = entityIdKey(p.phong_ban_id);
    if (!deptId) continue;
    const list = byDept.get(deptId) ?? [];
    list.push(p);
    byDept.set(deptId, list);
  }

  for (const list of byDept.values()) {
    list.sort(sortPositions);
  }

  const rows: PositionTreeRow[] = [];
  for (const dept of flatDepts) {
    const deptPositions = byDept.get(String(dept.id)) ?? [];
    rows.push({
      kind: 'department',
      id: `dept:${dept.id}`,
      department: dept,
      level: dept.cap_do,
      positionCount: deptPositions.length,
    });
    for (const pos of deptPositions) {
      rows.push({
        kind: 'position',
        id: pos.id,
        position: pos,
        level: dept.cap_do + 1,
      });
    }
  }
  return rows;
}

export function isPositionTreeRowSelectable(row: PositionTreeRow): boolean {
  return row.kind === 'position';
}
