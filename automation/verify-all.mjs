#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmExecPath = process.env.npm_execpath;
const npmStep = (args) => npmExecPath
  ? [process.execPath, [npmExecPath, ...args]]
  : [process.platform === 'win32' ? 'npm.cmd' : 'npm', args];
const checks = [
  ['build', ...npmStep(['run', 'build'])],
  ['typecheck', ...npmStep(['run', 'check'])],
  ['repository tests', ...npmStep(['test'])],
  ['skill catalog audit', ...npmStep(['run', 'skills:audit', '--', '--profile', '5fedu'])],
  ['skill activation evaluation', ...npmStep(['run', 'skills:eval'])],
  ['context integrity audit', ...npmStep(['run', 'harness:audit'])],
  ['global behavior', process.execPath, ['automation/test-global-behavior.mjs']],
  ['packed clean static lifecycle', ...npmStep(['run', 'test:package-smoke', '-w', 'packages/cli'])],
];

for (const [label, executable, args] of checks) {
  const started = Date.now();
  process.stdout.write('\n=== ' + label + ' ===\n');
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', shell: !npmExecPath && process.platform === 'win32', windowsHide: true, timeout: 900_000 });
  if (result.error || result.status !== 0) {
    process.stderr.write(label + ' FAILED: ' + (result.error?.message ?? 'exit ' + result.status) + '\n');
    process.exit(result.status ?? 1);
  }
  process.stdout.write(label + ' PASS (' + (Date.now() - started) + 'ms)\n');
}

process.stdout.write('\nverify:all PASS\n');
