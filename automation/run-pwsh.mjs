#!/usr/bin/env node
// Cross-platform PowerShell launcher.
//
// Why this exists: `powershell` is Windows-only and absent on Linux/macOS, so any
// npm script hardcoding it breaks the critical path on non-Windows hosts. `pwsh`
// (PowerShell 7+) is the cross-platform binary and is preferred everywhere; plain
// `powershell` (Windows PowerShell 5.1) is only a Windows fallback.
//
// Usage: node automation/run-pwsh.mjs <script.ps1> [args...]

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve a PowerShell binary by probing PATH. Returns null when none is usable. */
export function findPwsh() {
  // pwsh first: cross-platform, and on Windows it is the newer runtime.
  for (const candidate of ['pwsh', 'powershell']) {
    if (candidate === 'powershell' && process.platform !== 'win32') continue;
    const probe = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
      stdio: 'ignore',
      timeout: 15_000,
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

async function main() {
  const [scriptArg, ...args] = process.argv.slice(2);
  if (!scriptArg) {
    console.error('usage: node automation/run-pwsh.mjs <script.ps1> [args...]');
    process.exit(2);
  }

  const scriptPath = path.isAbsolute(scriptArg) ? scriptArg : path.join(REPO_ROOT, scriptArg);
  if (!existsSync(scriptPath)) {
    console.error(`run-pwsh: script not found: ${scriptPath}`);
    process.exit(1);
  }

  const shell = findPwsh();
  if (!shell) {
    console.error(
      'run-pwsh: no PowerShell runtime found.\n' +
        `  ${path.relative(REPO_ROOT, scriptPath)} requires pwsh (PowerShell 7+).\n` +
        '  Install: https://github.com/PowerShell/PowerShell#get-powershell\n' +
        '  Linux:   sudo pacman -S powershell-bin   |   apt: see docs above\n' +
        '  macOS:   brew install --cask powershell'
    );
    process.exit(127);
  }

  const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  child.on('error', (err) => {
    console.error(`run-pwsh: failed to spawn ${shell}: ${err.message}`);
    process.exit(127);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
