/**
 * test/helpers/proc.ts — /proc helpers for tests (count processes by marker).
 */
import { readdirSync, readFileSync } from 'node:fs';

export function listProcMatching(marker: string): number[] {
  const out: number[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync('/proc');
  } catch {
    return out;
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8');
      if (cmd.includes(marker)) out.push(Number(name));
    } catch {
      /* gone */
    }
  }
  return out;
}
