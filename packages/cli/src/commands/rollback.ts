import { COORDINATOR_HOSTS, createInstallationCoordinator } from '../runtime/installation-coordinator.js';
import { ExitCode, type CliOptions, type CommandResult } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRuntimeStateRoot } from '../runtime/locator.js';

export async function rollbackCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const targets = args.filter((value) => !value.startsWith('-'));
  if (targets.length === 0) return { exitCode: ExitCode.InvalidArgument, message: 'Specify a host or use --all explicitly.' };
  const hosts = targets.includes('all')
    ? COORDINATOR_HOSTS.filter((host) => fs.existsSync(path.join(resolveRuntimeStateRoot(), 'rollback', host, 'native', '.install-options-backup.json')))
    : targets;
  if (hosts.length === 0) return { exitCode: ExitCode.InvalidArgument, message: 'No rollback generation is available.' };
  const invalid = hosts.find((host) => !COORDINATOR_HOSTS.includes(host as never));
  if (invalid) return { exitCode: ExitCode.InvalidArgument, message: `Invalid platform: ${invalid}. Valid: ${COORDINATOR_HOSTS.join(', ')}, all` };
  const coordinator = createInstallationCoordinator({ dryRun: options.dryRun });
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const host of hosts) {
    const receipt = await coordinator.rollback(host as (typeof COORDINATOR_HOSTS)[number]);
    results[host] = receipt.readback?.[host] ?? null;
    if (receipt.errors?.[host]) errors[host] = receipt.errors[host];
  }
  return {
    exitCode: Object.keys(errors).length ? ExitCode.LegacyFailed : ExitCode.Success,
    message: Object.keys(errors).length ? `${Object.keys(errors).length} host rollback(s) failed` : `${hosts.length} host rollback(s) restored the previous owned generation`,
    data: { hosts, results, errors },
  };
}
