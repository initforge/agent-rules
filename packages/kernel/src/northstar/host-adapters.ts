import fs from 'node:fs';
import path from 'node:path';

export type HostId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'antigravity' | 'grok' | 'deepseek-harness' | 'command-code';
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
  'deepseek-harness': { host: 'deepseek-harness', ambient: false, headless: true, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['native Cordis bundle/profile integration via dsh plugin; not installed or live-certified yet'] },
  'command-code': { host: 'command-code', ambient: false, headless: true, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['session-scoped mods/skills/native permissions; mod/hook failures fail closed; not installed or live-certified yet'] },
};

export function assertHostSurface(repoRoot: string): void {
  const platformsRoot = path.join(repoRoot, 'platforms');
  for (const host of Object.keys(HOST_CAPABILITIES) as HostId[]) {
    // DeepSeek Harness and Command Code are registered HostIds whose native
    // projections land in P2/P3; until then there is no platforms/<host> dir
    // and no surface to assert.
    if (host === 'deepseek-harness' || host === 'command-code') continue;
    if (!fs.existsSync(path.join(platformsRoot, host))) throw new Error(`host ${host} is declared but platforms/${host} is missing`);
  }
}

export function requireHostMode(host: HostId, mode: HostExecutionMode): HostCapability {
  const capability = HOST_CAPABILITIES[host];
  if (!capability[mode]) throw new Error(`${host} does not have a certified ${mode} mode`);
  return capability;
}
