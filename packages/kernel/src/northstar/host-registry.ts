import fs from 'node:fs';
import path from 'node:path';

export interface NativeHostContract {
  id: string;
  cliSignal: string;
  homeEnv: string;
  homeDefault: string;
  surfaces: Record<string, string>;
  paths: Record<string, string>;
  precedence: string;
  reload: string;
  mergeStrategy: string;
  capabilities: { detectsByFeature: boolean; features: string[] };
  installStrategy: string;
  readbackStrategy: string;
  canaryStrategy: string;
  uninstallStrategy: string;
  authBoundary: { offlineClaims: string[]; requiresAuthClaims: string[] };
  limits: string[];
}

let cached: { contracts: Record<string, NativeHostContract>; hostIds: string[] } | null = null;

function loadRegistry(repoRoot?: string): { contracts: Record<string, NativeHostContract>; hostIds: string[] } {
  if (cached) return cached;
  const root = repoRoot ?? path.resolve(import.meta.dirname ?? '.', '../../../..');
  // Try multiple candidate roots
  const candidates = [
    path.join(root, 'platforms', 'platform-contracts.json'),
    path.resolve('platforms/platform-contracts.json'),
    path.resolve(process.cwd(), 'platforms/platform-contracts.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p,'utf8')) as {
        registry?: { host_ids: string[] };
        native_contracts?: Record<string, NativeHostContract>;
        platforms?: Record<string, unknown>;
      };
      const hostIds = j.registry?.host_ids ?? Object.keys(j.native_contracts ?? j.platforms ?? {});
      const contracts = (j.native_contracts ?? {}) as Record<string, NativeHostContract>;
      cached = { contracts, hostIds };
      return cached;
    }
  }
  // fallback to hardcoded list if registry missing (should not happen)
  const hostIds = ["codex","claude","grok","opencode","antigravity","cursor","deepseek-harness","command-code","omp"];
  cached = { contracts: {} as Record<string,NativeHostContract>, hostIds };
  return cached;
}

export function getHostIds(repoRoot?: string): string[] {
  return loadRegistry(repoRoot).hostIds;
}

export function getNativeContract(hostId: string, repoRoot?: string): NativeHostContract | null {
  const reg = loadRegistry(repoRoot);
  return reg.contracts[hostId] ?? null;
}

export function getAllNativeContracts(repoRoot?: string): Record<string, NativeHostContract> {
  return loadRegistry(repoRoot).contracts;
}

// Re-export for kernel usage
export const HOST_IDS = getHostIds();
