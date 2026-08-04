/**
 * Symlink capability probe.
 *
 * Windows requires Administrator / Developer Mode to create symlinks and
 * otherwise fails with EPERM; some POSIX sandboxes also block them. Probe once
 * at load so symlink-dependent tests skip explicitly (never silently pass) and
 * keep their fail-closed assertions whenever the capability exists.
 *
 * ponytail: probes a 'file' symlink only. Windows grants 'file' and 'dir'
 * symlinks under the same privilege and POSIX grants both unconditionally, so
 * one probe gates all symlink-dependent tests. Revisit if a platform splits
 * the two.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export const SYMLINK_CAPABLE = (() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'symlink-cap-'));
  try {
    const target = path.join(dir, 'target');
    writeFileSync(target, 'x');
    symlinkSync(target, path.join(dir, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();
