/** Maximum hierarchy depth: level 1 (root department) + level 2 (child group). */
export const DEPARTMENT_MAX_LEVEL = 2 as const;

/** Root departments sit at level 1. Only they may be selected as parent. */
export const DEPARTMENT_ROOT_LEVEL = 1 as const;
