import fs from 'node:fs';
import path from 'node:path';
import { resolveRuntimeAssetsRoot } from './locator.js';

function loadPlatforms(): readonly string[] {
  try {
    const file = path.join(resolveRuntimeAssetsRoot(), 'platforms', 'platform-contracts.json');
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { registry?: { host_ids?: string[] } };
      if (parsed.registry?.host_ids?.length) return parsed.registry.host_ids;
    }
  } catch {}
  return ['opencode', 'codex', 'claude', 'grok', 'antigravity', 'cursor', 'deepseek-harness', 'command-code', 'omp'];
}

export const RUNTIME_PLATFORMS = loadPlatforms() as unknown as ['opencode', 'codex', 'claude', 'grok', 'antigravity', 'cursor', 'deepseek-harness', 'command-code', 'omp'];
export type RuntimePlatform = (typeof RUNTIME_PLATFORMS)[number];
export type HostId = RuntimePlatform;
export const REGISTERED_HOSTS: readonly HostId[] = RUNTIME_PLATFORMS;
