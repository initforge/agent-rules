#!/usr/bin/env node
/**
 * test/helpers/sleeper.mjs — helper process for process-safety tests.
 * Usage: node sleeper.mjs <ms> [--children N] [--tag <name>]
 */
const ms = Number(process.argv[2] ?? 1000);
if (process.argv.includes('--children')) {
  const idx = process.argv.indexOf('--children');
  const n = Number(process.argv[idx + 1] ?? 1);
  const { spawn } = await import('node:child_process');
  for (let i = 0; i < n; i++) {
    spawn(process.execPath, ['-e', `setTimeout(()=>{}, ${ms + 5000})`], { stdio: 'ignore' });
  }
}
if (process.argv.includes('--tag')) {
  const idx = process.argv.indexOf('--tag');
  process.title = `sleeper-${process.argv[idx + 1] ?? 'x'}`;
}
setTimeout(() => process.exit(0), ms);
