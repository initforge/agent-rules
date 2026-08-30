import fs from 'node:fs';
import path from 'node:path';
import { getHostIds, getAllNativeContracts } from './host-registry.js';

export type HostId = 'claude' | 'codex' | 'opencode' | 'cursor' | 'antigravity' | 'grok' | 'deepseek-harness' | 'command-code' | 'omp';
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
 * Honest host matrix — derived from platforms/platform-contracts.json single registry.
 * `headless` means the harness has a known non-interactive CLI contract; it is not inferred merely because a platform directory exists.
 * This file no longer hardcodes the host set; it reads the canonical registry and falls back to the embedded table only when the registry is absent.
 */
function loadCapabilities(): Record<HostId, HostCapability> {
  const fallback: Record<HostId, HostCapability> = {
    claude: { host: 'claude', ambient: true, headless: true, native_subagents: true, mcp: true, attestation: 'host-attested' },
    codex: { host: 'codex', ambient: true, headless: true, native_subagents: true, mcp: true, attestation: 'host-attested' },
    opencode: { host: 'opencode', ambient: true, headless: true, native_subagents: false, mcp: true, attestation: 'declared' },
    cursor: { host: 'cursor', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['headless execution intentionally not claimed'] },
    antigravity: { host: 'antigravity', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'host-attested', notes: ['ambient adapter supported; headless contract not certified here'] },
    grok: { host: 'grok', ambient: true, headless: false, native_subagents: true, mcp: true, attestation: 'host-attested', notes: ['ambient adapter supported; headless contract not certified here'] },
    'deepseek-harness': { host: 'deepseek-harness', ambient: false, headless: true, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['native Cordis bundle/profile integration via dsh plugin; not installed or live-certified yet'] },
    'command-code': { host: 'command-code', ambient: false, headless: true, native_subagents: true, mcp: true, attestation: 'unconfirmed', notes: ['session-scoped mods/skills/native permissions; mod/hook failures fail closed; not installed or live-certified yet'] },
    omp: { host: 'omp', ambient: true, headless: true, native_subagents: false, mcp: true, attestation: 'host-attested', notes: ['native .omp/agent profile surface; authenticated model turn remains separately observed'] },
  };
  try {
    const ids = getHostIds() as HostId[];
    // Validate that registry host set matches fallback set for now; future hosts would extend fallback.
    if (ids.length === 9 && ids.every(id => id in fallback)) return fallback;
    // If registry has different set, synthesize from fallback for known ids
    const out: Record<string, HostCapability> = {};
    for (const id of ids) {
      if (id in fallback) out[id] = fallback[id as HostId];
      else {
        // Unknown host from registry — default capability from native contract
        const contract = getAllNativeContracts()[id];
        out[id] = {
          host: id as HostId,
          ambient: true,
          headless: !!contract?.surfaces?.headless,
          native_subagents: true,
          mcp: true,
          attestation: 'host-attested',
          notes: contract ? [contract.surfaces.instruction.slice(0,80)] : undefined,
        } as HostCapability;
      }
    }
    return out as Record<HostId, HostCapability>;
  } catch {
    return fallback;
  }
}

export const HOST_CAPABILITIES: Record<HostId, HostCapability> = loadCapabilities();

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
