import { useMemo } from 'react';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { PositionPermission } from '../core/types';
import {
  buildDeptFilterGroups,
  DEPT_FILTER_OTHER,
  labelForDeptFilterId,
  type DeptFilterGroup,
} from '../utils/build-dept-filter-groups';

interface UsePermissionDeptFilterResult {
  groups: DeptFilterGroup[];
  filteredRoles: PositionPermission[];
  labelForId: string;
}

export function usePermissionDeptFilter(
  roles: PositionPermission[],
  departments: Department[],
  filterId: string | null,
): UsePermissionDeptFilterResult {
  const groups = useMemo(
    () => buildDeptFilterGroups(departments, roles),
    [departments, roles],
  );

  const filteredRoles = useMemo(() => {
    if (filterId === null) return roles;
    if (filterId === DEPT_FILTER_OTHER) {
      return roles.filter((r) => !r.phong_ban_id);
    }
    return roles.filter((r) => r.phong_ban_id === filterId);
  }, [roles, filterId]);

  const labelForId = useMemo(
    () => labelForDeptFilterId(filterId, groups, departments),
    [filterId, groups, departments],
  );

  return { groups, filteredRoles, labelForId };
}
