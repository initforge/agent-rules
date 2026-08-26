#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) ?? 'HEAD';
const changed = spawnSync('git', ['diff', '--name-only', base], { cwd: root, encoding: 'utf8' });
if (changed.status !== 0) throw new Error(`cannot read changed paths from ${base}`);
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
if (untracked.status !== 0) throw new Error('cannot read untracked paths');
const files = [...new Set([...changed.stdout.split(/\r?\n/), ...untracked.stdout.split(/\r?\n/)].filter(Boolean))];
const domains = new Set(files.map((file) => file.startsWith('packages/kernel/') ? 'kernel' : file.startsWith('packages/engine/') ? 'engine' : file.startsWith('packages/cli/') ? 'cli' : file.startsWith('platforms/') ? 'native' : file.startsWith('.github/') || file.startsWith('automation/') ? 'automation' : 'root'));
const commands = [['npm', ['run', 'check']], ['npm', ['run', 'build']]];
if (domains.has('kernel')) commands.push(['npm', ['test', '-w', 'packages/kernel']]);
if (domains.has('engine')) commands.push(['npm', ['test', '-w', 'packages/engine']]);
if (domains.has('cli') || domains.has('native')) commands.push(['npm', ['test', '-w', 'packages/cli']]);
if (domains.has('automation') || domains.has('native')) commands.push(['node', ['automation/validate-workflow-v3.mjs']]);
console.log(JSON.stringify({ base, files, domains: [...domains], selected: commands.map(([command, args]) => [command, ...args]) }, null, 2));
if (process.argv.includes('--run')) {
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
if (!fs.existsSync(path.join(root, 'architecture', 'agent-workflow.yaml'))) throw new Error('architecture map is required');
