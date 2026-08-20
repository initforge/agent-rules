import { PERMISSION_MODULE_IDS } from '../core/permission-modules-config';

export function moduleIdToTab(moduleId: string): string {
  return moduleId.split('/').pop() ?? moduleId;
}

export function resolveModuleIdFromTab(tab: string | null): string | null {
  if (!tab) return null;
  const found = PERMISSION_MODULE_IDS.find((id) => moduleIdToTab(id) === tab);
  return found ?? null;
}

export function getInitialModuleId(tab: string | null): string {
  return resolveModuleIdFromTab(tab) ?? PERMISSION_MODULE_IDS[0] ?? 'he-thong/nhan-vien';
}
