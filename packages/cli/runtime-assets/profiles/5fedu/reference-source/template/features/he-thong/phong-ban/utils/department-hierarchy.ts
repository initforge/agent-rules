import { getDescendantIds } from '@/lib/tree-utils';
import { txt } from '@/lib/text';
import { DEPARTMENT_MAX_LEVEL, DEPARTMENT_ROOT_LEVEL } from '../core/constants';
import type { Department } from '../core/types';

export type DepartmentParentValidationError =
  | 'parentMustBeRoot'
  | 'maxDepthExceeded'
  | 'cannotMoveParentWithChildren';

const treeOpts = {
  getId: (d: Department) => d.id,
  getParentId: (d: Department) => d.cha_id,
};

export function departmentHasChildren(deptId: string, all: Department[]): boolean {
  return all.some((d) => d.cha_id === deptId);
}

export function canAddChildDepartment(dept: Department): boolean {
  return dept.cap_do < DEPARTMENT_MAX_LEVEL;
}

export function getEligibleParentDepartments(
  all: Department[],
  options?: { excludeId?: string | null },
): Department[] {
  const excluded = new Set<string>();
  if (options?.excludeId) {
    excluded.add(options.excludeId);
    getDescendantIds(options.excludeId, all, treeOpts).forEach((id) => excluded.add(id));
  }
  return all.filter(
    (d) => d.cap_do === DEPARTMENT_ROOT_LEVEL && !excluded.has(d.id),
  );
}

export function normalizeParentId(chaId: string | null | undefined): string | null {
  if (chaId === '' || chaId == null) return null;
  return chaId;
}

export function validateDepartmentParentChange(
  dept: Department | null,
  rawParentId: string | null | undefined,
  all: Department[],
): DepartmentParentValidationError | null {
  const parentId = normalizeParentId(rawParentId);

  if (dept && departmentHasChildren(dept.id, all) && parentId !== null) {
    return 'cannotMoveParentWithChildren';
  }

  if (parentId === null) {
    return null;
  }

  const parent = all.find((d) => d.id === parentId);
  if (!parent || parent.cap_do !== DEPARTMENT_ROOT_LEVEL) {
    return 'parentMustBeRoot';
  }

  const resultingLevel = parent.cap_do + 1;
  if (resultingLevel > DEPARTMENT_MAX_LEVEL) {
    return 'maxDepthExceeded';
  }

  return null;
}

export function getDepartmentParentValidationMessage(
  error: DepartmentParentValidationError,
): string {
  switch (error) {
    case 'parentMustBeRoot':
      return txt('department.validation.parentMustBeRoot');
    case 'maxDepthExceeded':
      return txt('department.validation.maxDepthExceeded');
    case 'cannotMoveParentWithChildren':
      return txt('department.validation.cannotMoveParentWithChildren');
  }
}
