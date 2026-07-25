/**
 * Chuỗi giao diện (một ngôn ngữ): gộp bảng phẳng từ `ui` + các module để tra key động (`txt`).
 * Feature strings registered via `bootstrap-module-strings.ts` (app entry).
 */
import { fmt } from '@/lib/fmt';
import { ui } from './ui';
import { tenure } from './tenure';
import { taiLieu } from './tai-lieu';
import { getRegisteredModuleStrings } from './register-module-strings';

function flatten(prefix: string, obj: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  function walk(p: string, o: unknown) {
    if (typeof o === 'string') {
      out[p] = o;
      return;
    }
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        walk(p ? `${p}.${k}` : k, v);
      }
    }
  }
  walk(prefix, obj);
  return out;
}

const BASE_STRINGS: Readonly<Record<string, string>> = Object.freeze({
  ...flatten('', ui),
  ...flatten('tenure', tenure),
  ...flatten('taiLieu', taiLieu),
});

function resolveString(key: string): string | undefined {
  return BASE_STRINGS[key] ?? getRegisteredModuleStrings()[key];
}

/** Tất cả key dạng `nav.home`, `employee.detail.fullName`, … (base + registered) */
export function getAllStrings(): Readonly<Record<string, string>> {
  return Object.freeze({ ...BASE_STRINGS, ...getRegisteredModuleStrings() });
}

export type TFunction = typeof txt;

/**
 * Tra chuỗi theo key (breadcrumb, phân quyền động, …).
 * Hỗ trợ thay `{{var}}` qua object options (bỏ qua `lng`, `ns`, `defaultValue`).
 */
export function txt(key: string, options?: Record<string, unknown> | string): string {
  if (typeof options === 'string') {
    const fallback = options;
    const raw = resolveString(key);
    return raw !== undefined ? raw : fallback;
  }

  const raw = resolveString(key);
  if (raw === undefined) return key;

  if (!options || typeof options !== 'object') return raw;

  const vars: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(options)) {
    if (k === 'lng' || k === 'ns' || k === 'defaultValue') continue;
    vars[k] = v as string | number | undefined;
  }
  return fmt(raw, vars);
}

export { ui, tenure, taiLieu, fmt };
export { registerModuleStrings } from './register-module-strings';
