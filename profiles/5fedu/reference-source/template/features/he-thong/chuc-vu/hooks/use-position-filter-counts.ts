import { matchesSearchTerm } from '@/lib/searchUtils';
import { useMemo } from 'react';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position, PositionFilters } from '../core/types';
import { POSITION_SEARCHABLE_KEYS } from '../utils/search-keys';
import { positionMatchesColumnSearch } from '../utils/column-search';
import { getDepartmentSubtreeIds } from '../utils/build-position-tree-rows';
import { createFilterCountsHook } from '@/lib/factories/createFilterCountsHook';

function statusChipKey(p: Position): 'Active' | 'Inactive' {
  return p.trang_thai === 'Đang hoạt động' ? 'Active' : 'Inactive';
}

function findRootDepartmentId(deptId: string, departments: Department[]): string {
  let current = departments.find((d) => d.id === deptId);
  while (current?.cha_id) {
    current = departments.find((d) => d.id === current!.cha_id);
  }
  return current?.id ?? deptId;
}

interface PositionCountItem extends Position {
  root_dept_id?: string;
  in_selected_root_scope: boolean;
}

const usePositionFilterCountsBase = createFilterCountsHook<
  PositionCountItem,
  PositionFilters,
  {
    deptCounts: Record<string, number>;
    groupCounts: Record<string, number>;
    levelCounts: Record<string, number>;
    distinctLevels: number[];
    statusCounts: Record<'Active' | 'Inactive', number>;
  }
>({
  matchesSearch: (p, searchTerm) =>
    matchesSearchTerm(p as Record<string, unknown>, searchTerm, POSITION_SEARCHABLE_KEYS),
  matchesColumnSearch: (p, filters) => positionMatchesColumnSearch(p, filters.columnSearch),
  getDimensions: (_positions, _searchTerm, filters) => {
    const matchesStatus = (p: Position) =>
      filters.status.length === 0 || filters.status.includes(statusChipKey(p));
    const matchesRoot = (p: Position) =>
      filters.id_phong_goc.length === 0 || p.in_selected_root_scope;
    const matchesGroup = (p: Position) =>
      filters.phong_ban_id.length === 0 ||
      (p.phong_ban_id != null && filters.phong_ban_id.includes(p.phong_ban_id));
    const matchesLevel = (p: Position) =>
      filters.cap_bac.length === 0 ||
      (p.cap_bac != null && filters.cap_bac.includes(String(p.cap_bac)));
    return [
      {
        passesOthers: (p) => matchesStatus(p) && matchesGroup(p) && matchesLevel(p),
        getBucketKey: (p) => p.root_dept_id,
      },
      {
        passesOthers: (p) => matchesStatus(p) && matchesRoot(p) && matchesLevel(p),
        getBucketKey: (p) => p.phong_ban_id,
      },
      {
        passesOthers: (p) => matchesStatus(p) && matchesRoot(p) && matchesGroup(p),
        getBucketKey: (p) => (p.cap_bac != null ? String(p.cap_bac) : undefined),
      },
      {
        passesOthers: (p) => matchesRoot(p) && matchesGroup(p) && matchesLevel(p),
        getBucketKey: (p) => statusChipKey(p),
      },
    ];
  },
  buildResult: (positions, _searchTerm, _filters, countMaps) => {
    const deptMap = countMaps[0] ?? {};
    const groupMap = countMaps[1] ?? {};
    const levelMap = countMaps[2] ?? {};
    const statusMap = countMaps[3] ?? {};
    const distinctLevels = [...new Set(positions.map((p) => p.cap_bac).filter((lv): lv is number => lv != null))]
      .sort((a, b) => a - b);

    return {
      deptCounts: deptMap,
      groupCounts: groupMap,
      levelCounts: levelMap,
      distinctLevels,
      statusCounts: {
        Active: statusMap.Active ?? 0,
        Inactive: statusMap.Inactive ?? 0,
      },
    };
  },
});

/**
 * Counts cho các filter chips: Phòng gốc / Nhóm / Cấp bậc / Trạng thái.
 * Mỗi count dùng nguyên tắc **exclude-self**.
 */
export function usePositionFilterCounts(
  positions: Position[],
  departments: Department[],
  searchTerm: string,
  filters: PositionFilters,
) {
  const subtreeIds = useMemo(
    () => getDepartmentSubtreeIds(departments, filters.id_phong_goc),
    [departments, filters.id_phong_goc],
  );
  const rootByDeptId = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d) => {
      map.set(d.id, findRootDepartmentId(d.id, departments));
    });
    return map;
  }, [departments]);

  const countItems = useMemo<PositionCountItem[]>(
    () =>
      positions.map((p) => ({
        ...p,
        root_dept_id: p.phong_ban_id ? rootByDeptId.get(p.phong_ban_id) : undefined,
        in_selected_root_scope:
          filters.id_phong_goc.length === 0 ||
          (p.phong_ban_id != null && subtreeIds.has(p.phong_ban_id)),
      })),
    [positions, rootByDeptId, filters.id_phong_goc.length, subtreeIds],
  );

  const result = usePositionFilterCountsBase(countItems, searchTerm, filters);
  const rootDeptIds = useMemo(
    () =>
      departments
        .filter((d) => !d.cha_id)
        .sort((a, b) => a.thu_tu - b.thu_tu)
        .map((d) => d.id),
    [departments],
  );
  const normalizedDeptCounts: Record<string, number> = {};
  const targetRootIds = filters.id_phong_goc.length > 0 ? filters.id_phong_goc : rootDeptIds;
  targetRootIds.forEach((rootId) => {
    normalizedDeptCounts[rootId] = result.deptCounts[rootId] ?? 0;
  });

  return {
    ...result,
    deptCounts: normalizedDeptCounts,
  };
}
