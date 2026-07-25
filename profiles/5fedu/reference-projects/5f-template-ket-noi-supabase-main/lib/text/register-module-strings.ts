/**
 * Registry for feature module strings — keeps lib/ free of features/ imports.
 * Call registerModuleStrings from app bootstrap (index.tsx) before render.
 */

const moduleStrings: Record<string, string> = {};

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

export function registerModuleStrings(prefix: string, obj: unknown): void {
  Object.assign(moduleStrings, flatten(prefix, obj));
}

export function getRegisteredModuleStrings(): Readonly<Record<string, string>> {
  return moduleStrings;
}
