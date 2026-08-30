import type { ActionType, ModulePermission } from '@/features/he-thong/phan-quyen/core/types';

/** Gộp nhiều `ModulePermission` (ví dụ từ một chức vụ) thành `Record<module_id, actions>`. */
export function mergeModulePermissionsToGrants(modules: ModulePermission[]): Record<string, ActionType[]> {
  const out: Record<string, ActionType[]> = {};
  for (const m of modules) {
    out[m.module_id] = [...m.actions];
  }
  return out;
}
