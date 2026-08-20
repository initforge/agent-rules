import fs from 'node:fs';
import path from 'node:path';

export type HostId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'antigravity' | 'grok' | 'mimocode';
export type HostExecutionMode = 'ambient' | 'headless';

export interface HostCapability {
  host: HostId;
  ambient: boolean;
  headless: boolean;
  native_subagents: boolean;
  mcp: boolean;
  attestation: 'native' | 'host-attested' | 'declared' | 'unconfirmed';
  notes?: string[];
}

/**
 * Honest host matrix. `headless` means the harness has a known non-interactive CLI
 * contract; it is not inferred merely because a platform directory exists.
 */
export const HOST_CAPABILITIES: Record<HostId, HostCapability> = {
  claude: { host: 'claude', ambient: true, headless: true, native_subagents: true, mcp: true, attestation: 'host-attested' },
  codex: { host: 'codex', ambient: true, headless: true, native_subagents: true, mcp: true, attestation: 'host-attested' },
  opencode: { host: 'opencode', ambient: true, headless: true, native_subagents: false, mcp: true, attestation: 'declared' },
  cursor: { host: 'cursor', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['headless execution intentionally not claimed'] },
  antigravity: { host: 'antigravity', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'host-attested', notes: ['ambient adapter supported; headless contract not certified here'] },
  grok: { host: 'grok', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'host-attested', notes: ['ambient adapter supported; headless contract not certified here'] },
  mimocode: { host: 'mimocode', ambient: true, headless: true, native_subagents: true, mcp: true, attestation: 'declared', notes: ['official CLI supports `mimo run`; exact observed model still requires host evidence'] },
};

export function assertHostSurface(repoRoot: string): void {
  const platformsRoot = path.join(repoRoot, 'platforms');
  for (const host of Object.keys(HOST_CAPABILITIES) as HostId[]) {
    if (!fs.existsSync(path.join(platformsRoot, host))) throw new Error(`host ${host} is declared but platforms/${host} is missing`);
  }
}

export function requireHostMode(host: HostId, mode: HostExecutionMode): HostCapability {
  const capability = HOST_CAPABILITIES[host];
  if (!capability[mode]) throw new Error(`${host} does not have a certified ${mode} mode`);
  return capability;
}
