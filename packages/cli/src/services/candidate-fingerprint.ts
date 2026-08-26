import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Hash untracked source inputs without making generated receipts self-referential. */
export function hashUntrackedCandidateFiles(cwd: string): string {
  const result = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', cwd });
  if (result.status !== 0) return '0'.repeat(64);
  const names = result.stdout.split('\0').filter(Boolean)
    .filter((name) => !name.replace(/\\/g, '/').startsWith('.agent/evidence/') && !name.replace(/\\/g, '/').startsWith('.agent/tmp/'))
    .sort();
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name).update('\0');
    try {
      const file = path.resolve(cwd, name);
      const stat = fs.lstatSync(file);
      hash.update(stat.isSymbolicLink() ? fs.readlinkSync(file) : stat.isFile() ? fs.readFileSync(file) : '<non-file>').update('\0');
    } catch {
      hash.update('<unreadable>').update('\0');
    }
  }
  return hash.digest('hex');
}
