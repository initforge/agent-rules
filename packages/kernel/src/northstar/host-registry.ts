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

export interface HostSupportContract {
  verified_at: string;
  documentation: string | null;
  components: {
    lifecycle: { surface: 'hook' | 'plugin' | 'extension' | 'mod' | 'none'; mode: 'native-enforced' | 'native-advisory' | 'managed' | 'unsupported' };
    plan: { mode: 'native-enforced' | 'native-advisory' | 'managed' | 'unsupported' };
    sandbox: { mode: 'native-enforced' | 'native-advisory' | 'managed' | 'unsupported' | 'not-applicable' };
  };
}

let cached: { contracts: Record<string, NativeHostContract>; support: Record<string, HostSupportContract>; hostIds: string[] } | null = null;
let configuredRoot: string | null = null;

export function configureHostRegistryRoot(root: string): void {
  const resolved = path.resolve(root);
  if (!fs.existsSync(path.join(resolved, 'platforms', 'platform-contracts.json'))) throw new Error(`host registry missing under configured runtime assets: ${resolved}`);
  configuredRoot = resolved;
  cached = null;
}

function findRegistryRoot(startDir: string = process.cwd()): string {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(cur, 'platforms', 'platform-contracts.json'))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return startDir;
}

function loadRegistry(repoRoot?: string): { contracts: Record<string, NativeHostContract>; support: Record<string, HostSupportContract>; hostIds: string[] } {
  if (cached && !repoRoot) return cached;
  const root = repoRoot ? path.resolve(repoRoot) : configuredRoot ?? findRegistryRoot();
  const candidates = [
    path.join(root, 'platforms', 'platform-contracts.json'),
    path.resolve(root, 'platforms/platform-contracts.json'),
    path.resolve('platforms/platform-contracts.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        registry?: { host_ids: string[] };
        native_contracts?: Record<string, NativeHostContract>;
        support_matrix?: Record<string, HostSupportContract>;
        platforms?: Record<string, unknown>;
      };
      const hostIds = j.registry?.host_ids ?? Object.keys(j.native_contracts ?? j.platforms ?? {});
      const contracts = (j.native_contracts ?? j.platforms ?? {}) as Record<string, NativeHostContract>;
      cached = { contracts, support: j.support_matrix ?? {}, hostIds };
      return cached;
    }
  }
  // fallback to hardcoded list if registry missing (should not happen)
  const hostIds = ['codex', 'claude', 'grok', 'opencode', 'antigravity', 'cursor', 'deepseek-harness', 'command-code', 'omp'];
  cached = { contracts: {} as Record<string, NativeHostContract>, support: {}, hostIds };
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

export function getHostSupport(hostId: string, repoRoot?: string): HostSupportContract | null {
  return loadRegistry(repoRoot).support[hostId] ?? null;
}
