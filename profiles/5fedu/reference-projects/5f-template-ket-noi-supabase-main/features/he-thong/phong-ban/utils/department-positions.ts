import type { Position } from '@/features/he-thong/chuc-vu/core/types';

function normalizeEntityId(id: string | number | null | undefined): string | null {
  if (id == null || id === '') return null;
  return String(id);
}

/** Positions assigned to a department (safe id match for string/number). */
export function getPositionsForDepartment(positions: Position[], departmentId: string): Position[] {
  const normalizedDeptId = normalizeEntityId(departmentId);
  if (!normalizedDeptId) return [];

  return positions
    .filter((p) => normalizeEntityId(p.phong_ban_id) === normalizedDeptId)
    .sort((a, b) => a.thu_tu - b.thu_tu);
}
