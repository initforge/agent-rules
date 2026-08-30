import fs from 'node:fs';
import path from 'node:path';
import type { CommandResult, CliOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { COORDINATOR_HOSTS } from '../runtime/installation-coordinator.js';
import { resolveRuntimeStateRoot } from '../runtime/locator.js';
import { installCmd } from './install.js';

function installedHosts(): string[] {
  const root = path.join(resolveRuntimeStateRoot(), 'current', 'install-options');
  return COORDINATOR_HOSTS.filter((host) => fs.existsSync(path.join(root, `${host}.json`)));
}

export function updateCmd(args: string[], options: CliOptions, profiles?: string[]): Promise<CommandResult> {
  const targets = args.filter((value) => !value.startsWith('-'));
  let normalized = [...args];
  if (targets.length === 0 || targets.includes('all')) {
    const installed = installedHosts();
    if (installed.length === 0) return Promise.resolve({ exitCode: ExitCode.InvalidArgument, message: 'No installed hosts were found. Run agent-rules install first.' });
    normalized = [...installed, ...args.filter((value) => value.startsWith('-'))];
  }
  return installCmd(normalized, options, { mode: 'update', ...(profiles ? { profiles } : {}) });
}
