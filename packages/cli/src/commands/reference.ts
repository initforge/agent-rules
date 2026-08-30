import { consumeDomainReference, loadDomainPack, resolveHarnessRoot, searchDomainReferences } from '@initforge/agent-rules-kernel/northstar/domain-packs.js';
import { resolveRuntimeAssetsRoot } from '../runtime/locator.js';

export function readReference(repoRoot: string, packId: string, relativePath: string, options: { component?: string; behavior?: string; anchor?: string } = {}) {
  const pack = loadDomainPack(resolveHarnessRoot(repoRoot, resolveRuntimeAssetsRoot()), packId);
  const consumed = consumeDomainReference(pack, relativePath, { component: options.component, behavior: options.behavior, anchor: options.anchor });
  return consumed;
}

export function searchReferences(repoRoot: string, packId: string, query: string, limit = 20) {
  const pack = loadDomainPack(resolveHarnessRoot(repoRoot, resolveRuntimeAssetsRoot()), packId);
  return searchDomainReferences(pack, query, limit);
}
