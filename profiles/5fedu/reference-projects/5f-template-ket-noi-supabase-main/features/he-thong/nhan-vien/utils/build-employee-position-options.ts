import { fmt } from '@/lib/fmt';
import type { Option } from '@/components/ui/Combobox';
import type { Department } from '@/features/he-thong/phong-ban/core/types';
import type { Position } from '@/features/he-thong/chuc-vu/core/types';
import { position as positionText } from '@/features/he-thong/chuc-vu/text';
import {
  buildPositionTreeRows,
  isPositionTreeRowSelectable,
} from '@/features/he-thong/chuc-vu/utils/build-position-tree-rows';
import {
  resolveEmployeeOrgUnits,
  type EmployeeOrgUnits,
} from './resolve-employee-org-units';

const INDENT_CHAR = '\u00A0';
const INDENT_PER_LEVEL = 3;
const POSITION_PREFIX = '└─ ';

function formatPositionLabel(level: number, text: string): string {
  const indent = Array(Math.max(0, level - 1))
    .fill(INDENT_CHAR.repeat(INDENT_PER_LEVEL))
    .join('');
  return indent + POSITION_PREFIX + text;
}

/** Combobox options: department headers (disabled) + positions nested under department tree. */
export function buildEmployeePositionComboboxOptions(
  departments: Department[],
  positions: Position[],
): Option[] {
  const active = positions.filter(
    (p) => p.trang_thai === 'Đang hoạt động' && p.phong_ban_id,
  );
  const rows = buildPositionTreeRows(departments, active);
  const options: Option[] = [];

  for (const row of rows) {
    if (row.kind === 'department') {
      if (row.positionCount === 0) continue;
      options.push({
        label: row.department.ten_phong_ban,
        value: `__dept__:${row.department.id}`,
        subLabel: row.department.ma_phong_ban,
        disabled: true,
      });
      continue;
    }
    if (!isPositionTreeRowSelectable(row)) continue;
    options.push({
      label: formatPositionLabel(row.level, row.position.ten_chuc_vu),
      value: String(row.position.id),
      subLabel: row.position.ma_chuc_vu,
    });
  }

  return options;
}

export function getDepartmentIdForPosition(
  positions: Position[],
  positionId: string | number | null | undefined,
): string | null {
  if (positionId == null || positionId === '') return null;
  const normalized = String(positionId);
  const position = positions.find((p) => String(p.id) === normalized);
  return position?.phong_ban_id != null ? String(position.phong_ban_id) : null;
}

export function getPositionNameById(
  positions: Position[],
  positionId: string | number | null | undefined,
): string {
  if (positionId == null || positionId === '') return '';
  const normalized = String(positionId);
  return positions.find((p) => String(p.id) === normalized)?.ten_chuc_vu ?? '';
}

export function getOrgUnitsForPosition(
  departments: Department[],
  positions: Position[],
  positionId: string | null | undefined,
): EmployeeOrgUnits {
  const deptId = getDepartmentIdForPosition(positions, positionId);
  return resolveEmployeeOrgUnits(deptId, departments);
}

export function getDepartmentNameForPosition(
  departments: Department[],
  positions: Position[],
  positionId: string | null | undefined,
): string {
  return getOrgUnitsForPosition(departments, positions, positionId).ten_phong_ban ?? '';
}

export function getDivisionNameForPosition(
  departments: Department[],
  positions: Position[],
  positionId: string | number | null | undefined,
): string {
  return getOrgUnitsForPosition(departments, positions, positionId).ten_bo_phan ?? '';
}

export function findPositionById(
  positions: Position[],
  positionId: string | number | null | undefined,
): Position | undefined {
  if (positionId == null || positionId === '') return undefined;
  const normalized = String(positionId);
  return positions.find((p) => String(p.id) === normalized);
}

export function getPositionDepartmentId(
  position: Position | undefined,
): string | null {
  const raw = position?.phong_ban_id;
  if (raw == null || raw === '') return null;
  return String(raw);
}

export function getCapBacForPosition(
  positions: Position[],
  positionId: string | number | null | undefined,
): number | null {
  if (positionId == null || positionId === '') return null;
  const position = positions.find((p) => String(p.id) === String(positionId));
  return position?.cap_bac ?? null;
}

/** Hiển thị cấp bậc số — đồng bộ nhãn module Chức vụ. */
export function formatEmployeeCapBacLabel(
  capBac: number | null | undefined,
): string {
  if (capBac == null) return '';
  return fmt(positionText.toolbar.levelLabel, { value: String(capBac) });
}
