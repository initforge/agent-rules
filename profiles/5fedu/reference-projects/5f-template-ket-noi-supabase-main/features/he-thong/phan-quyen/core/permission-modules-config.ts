/**
 * Cấu hình module phân quyền — chỉ các trang Hệ thống còn trong app.
 */

export interface PermissionModuleItem {
  id: string;
  nameKey: string;
}

export interface PermissionModuleGroup {
  groupTitleKey: string;
  modules: PermissionModuleItem[];
}

export interface PermissionFunction {
  id: string;
  nameKey: string;
  color: string;
  groups: PermissionModuleGroup[];
}

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete', 'admin', 'all'] as const;
export type PermissionActionType = (typeof PERMISSION_ACTIONS)[number];

/** Chỉ nhóm Hệ thống — khớp dashboard và route thực tế */
export const PERMISSION_FUNCTIONS: PermissionFunction[] = [
  {
    id: 'he-thong',
    nameKey: 'nav.system',
    color: 'slate',
    groups: [
      {
        groupTitleKey: 'permission.matrix.systemGroup',
        modules: [
          { id: 'he-thong/nhan-vien', nameKey: 'permission.module.employeeList' },
          { id: 'he-thong/phong-ban', nameKey: 'permission.module.departmentChart' },
          { id: 'he-thong/chuc-vu', nameKey: 'permission.module.positionRole' },
          { id: 'he-thong/thong-tin-cong-ty', nameKey: 'permission.module.companyInfo' },
          { id: 'he-thong/phan-quyen', nameKey: 'permission.module.permission' },
        ],
      },
    ],
  },
];

export function getAllPermissionModules(): { id: string; nameKey: string }[] {
  const list: { id: string; nameKey: string }[] = [];
  PERMISSION_FUNCTIONS.forEach((fn) => {
    fn.groups.forEach((gr) => {
      gr.modules.forEach((m) => list.push({ id: m.id, nameKey: m.nameKey }));
    });
  });
  return list;
}

/** Thứ tự module trong sidebar matrix — dùng prefetch module kề cạnh. */
export const PERMISSION_MODULE_IDS: readonly string[] = getAllPermissionModules().map((m) => m.id);
