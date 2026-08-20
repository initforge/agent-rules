/**
 * projection/registry.ts — canonical integrations registry access.
 *
 * integrations/registry.json is the single source of truth for provider
 * install/version/command. This module validates + extends entries with the
 * capability metadata required by the owner contract §V and computes registry
 * hashes for lease records.
 */
import fs from 'node:fs';
import path from 'node:path';
import { docHash } from '../util/hashes.js';
import type { ProviderCapabilityMetadata, SharingMode } from '../types.js';

export interface RegistryProvider {
  id: string;
  displayName: string;
  kind: string;
  policy: string;
  source?: {
    type?: string;
    package?: string;
    version?: string;
    versionPolicy?: string;
    commandName?: string;
  };
  capabilities?: string[];
  sideEffects?: string;
  trust?: string;
  triggers?: string[];
  permissions?: string[];
  environment?: string[];
  install?: { type?: string; handler?: string; script?: string; verify?: string; uninstall?: string };
  health?: { command?: string; expectedExitCodes?: number[] };
  fallback?: string;
  priority?: number;
  activation?: string;
  nativeHosts?: string[];
}

export interface RegistryDocument {
  version: number;
  description?: string;
  integrations: RegistryProvider[];
}

export interface ExtendedProvider extends ProviderCapabilityMetadata {
  registry_entry: RegistryProvider;
}

const DEFAULT_CAPABILITY: Omit<ProviderCapabilityMetadata, 'id' | 'kind' | 'display_name' | 'capabilities'> = {
  requires_focus_guard: true,
  placement_backend: 'x11-ewmh',
  resource_scope: 'stateless',
  default_sharing_mode: 'exclusive',
  supports_reconnect: false,
  supports_multi_window: false,
  supports_streamable_http: false,
  supports_stdio: true,
  requires_explicit_user_selection: false,
  // These flags describe what the provider CAN do, not a default policy:
  // a stateless MCP server may run in a visible local session just fine
  // (it simply opens no window); GUI providers may also run headless where
  // the registry allows it. Policy enforcement lives in the guardian.
  visible_local_allowed: true,
  headless_allowed: true,
  owner_relocation_allowed: true,
  shared_safe: false,
  gui: false,
};

export class Registry {
  private doc: RegistryDocument;
  readonly registryHash: string;

  constructor(doc: RegistryDocument) {
    this.doc = doc;
    this.registryHash = docHash(doc);
  }

  static load(repoRoot: string): Registry {
    const p = path.join(repoRoot, 'integrations', 'registry.json');
    const raw = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(raw) as RegistryDocument;
    return new Registry(doc);
  }

  get providerCount(): number {
    return this.doc.integrations.length;
  }

  provider(id: string): ExtendedProvider | null {
    const entry = this.doc.integrations.find((i) => i.id === id);
    if (!entry) return null;
    return extendProvider(entry);
  }

  all(): ExtendedProvider[] {
    return this.doc.integrations.map(extendProvider);
  }

  findByCapability(capability: string): ExtendedProvider[] {
    return this.all().filter((p) => p.capabilities.includes(capability));
  }
}

export function extendProvider(entry: RegistryProvider): ExtendedProvider {
  const id = entry.id;
  const source = entry.source;
  const gui = isGuiProvider(entry);
  const resourceScope = inferResourceScope(entry);
  const sharing: SharingMode = entry.sideEffects === 'read-only' && resourceScope === 'stateless' ? 'shared-readonly' : 'exclusive';
  return {
    id,
    kind: (entry.kind as ProviderCapabilityMetadata['kind']) ?? 'mcp',
    display_name: entry.displayName ?? id,
    capabilities: entry.capabilities ?? [],
    requires_focus_guard: gui,
    placement_backend: 'x11-ewmh',
    resource_scope: resourceScope,
    default_sharing_mode: sharing,
    supports_reconnect: gui,
    supports_multi_window: gui,
    supports_streamable_http: false,
    supports_stdio: true,
    requires_explicit_user_selection: entry.policy === 'manual' || entry.activation === 'explicit-only',
    visible_local_allowed: true,
    headless_allowed: true,
    owner_relocation_allowed: true,
    shared_safe: sharing !== 'exclusive',
    gui,
    ...(source ? { registry_entry: entry } : { registry_entry: entry }),
  };
}

function isGuiProvider(entry: RegistryProvider): boolean {
  const id = entry.id;
  if (id === 'pencil-mcp' || id.includes('pencil')) return true;
  if (id.includes('playwright') || id.includes('chrome-devtools') || id.includes('browser')) return true;
  return false;
}

function inferResourceScope(entry: RegistryProvider): ProviderCapabilityMetadata['resource_scope'] {
  const id = entry.id;
  if (id.includes('pencil')) return 'document';
  if (id.includes('chrome-devtools')) return 'browser-cdp';
  if (id.includes('playwright')) return 'browser-profile';
  return 'stateless';
}
