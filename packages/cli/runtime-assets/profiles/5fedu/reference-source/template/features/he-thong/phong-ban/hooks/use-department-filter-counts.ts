import { matchesSearchTerm } from '@/lib/searchUtils';
import { getRootItems } from '@/lib/tree-utils';
import { useMemo } from 'react';
import type { Department } from '../core/types';
import type { DepartmentFilters } from '../store/useDepartmentStore';
import { DEPARTMENT_SEARCHABLE_KEYS } from '../utils/search-keys';
import { departmentMatchesColumnSearch } from '../utils/column-search';
import { createFilterCountsHook } from '@/lib/factories/createFilterCountsHook';

function statusChipKey(d: Department): 'Active' | 'Inactive' {
  return d.trang_thai === 'Đang hoạt động' ? 'Active' : 'Inactive';
}

function buildVisibleIdsUnderRoots(rootIds: string[], departments: Department[]): Set<string> {
  const visibleIds = new Set<string>();
  let current = new Set<string>(rootIds);
  while (current.size > 0) {
    current.forEach((id) => visibleIds.add(id));
    const next = new Set<string>();
    departments.forEach((d) => {
      if (d.cha_id && current.has(d.cha_id)) next.add(d.id);
    });
    current = next;
  }
  return visibleIds;
}

interface DepartmentWithParent extends Department {
  ten_phong_cha: string;
}

const useDepartmentFilterCountsBase = createFilterCountsHook<
  DepartmentWithParent,
  DepartmentFilters,
  {
    rootCounts: Record<string, number>;
    statusCounts: Record<'Active' | 'Inactive', number>;
  }
>({
  matchesSearch: (d, searchTerm) =>
    matchesSearchTerm(d as Record<string, unknown>, searchTerm, DEPARTMENT_SEARCHABLE_KEYS),
  matchesColumnSearch: (d, filters) => {
    return departmentMatchesColumnSearch(d, filters.columnSearch, d.ten_phong_cha);
  },
  getDimensions: (departments, _searchTerm, filters) => {
    const roots = getRootItems(departments, {
      getParentId: (d) => d.cha_id,
      getOrder: (d) => d.thu_tu,
    });

    const rootByDeptId = new Map<string, string>();
    for (const root of roots) {
      for (const id of buildVisibleIdsUnderRoots([root.id], departments)) {
        rootByDeptId.set(id, root.id);
      }
    }

    const visibleIds = buildVisibleIdsUnderRoots(filters.id_phong_goc, departments);
    const matchesStatus = (d: Department) => {
      const key = statusChipKey(d);
      return filters.status.length === 0 || filters.status.includes(key);
    };
    const matchesRoot = (d: Department) =>
      filters.id_phong_goc.length === 0 || visibleIds.has(d.id);

    return [
      {
        passesOthers: (d) => matchesStatus(d),
        getBucketKey: (d) => rootByDeptId.get(d.id),
      },
      {
        passesOthers: (d) => matchesRoot(d),
        getBucketKey: (d) => statusChipKey(d),
      },
    ];
  },
  buildResult: (_departments, _searchTerm, _filters, countMaps) => {
    const rootMap = countMaps[0] ?? {};
    const statusMap = countMaps[1] ?? {};
    return {
      rootCounts: rootMap,
      statusCounts: {
        Active: statusMap.Active ?? 0,
        Inactive: statusMap.Inactive ?? 0,
      },
    };
  },
});

/** Count cross-filter cho chip toolbar Phòng ban (exclude-self). */
export function useDepartmentFilterCounts(
  departments: Department[],
  searchTerm: string,
  filters: DepartmentFilters,
) {
  const departmentsWithParent = useMemo<DepartmentWithParent[]>(() => {
    const parentNameMap = new Map<string, string>();
    departments.forEach((d) => {
      parentNameMap.set(d.id, d.ten_phong_ban);
    });
    return departments.map((d) => ({
      ...d,
      ten_phong_cha: d.cha_id ? parentNameMap.get(d.cha_id) ?? '' : '',
    }));
  }, [departments]);

  return useDepartmentFilterCountsBase(departmentsWithParent, searchTerm, filters);
}
