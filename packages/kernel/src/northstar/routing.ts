import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NORTH_STAR_PROTOCOL_VERSION, assertCapabilityManifest, type CapabilityManifest, type TaskPacket, type WorkSpec } from './protocol.js';
import { compareDecisionFabric, decide, loadRepoFacts, type DecisionFabricDecision, type DecisionFabricMode } from './decision-fabric.js';
export type { DecisionFabricMode } from './decision-fabric.js';

/**
 * Additive capability aliases (REQ-002 / skill-mcp-fabric-v1). The logical
 * capability names proposed by the fabric research resolve to the legacy
 * canonical capability names the registry is keyed on. Legacy names remain
 * canonical; aliases never rename or break existing providers.
 */
export const CAPABILITY_ALIASES: Readonly<Record<string, string>> = {
  'docs.library': 'docs.lookup',
  'shell.output.reduce': 'output.compress',
  'code.graph': 'code.semantic',
  'code.symbol': 'code.semantic',
  'design.pen': 'design.inspect',
};

/** Resolve a requested capability to its canonical registry name (identity when unknown). */
export function canonicalCapability(capability: string): string {
  return CAPABILITY_ALIASES[capability] ?? capability;
}

export type SkillRole =
  | 'DOMAIN_JUDGMENT'
  | 'PLANNING_PROCEDURE'
  | 'IMPLEMENTATION_GUIDANCE'
  | 'ARCHITECTURE_LENS'
  | 'QUALITY_LENS'
  | 'SECURITY_LENS'
  | 'VERIFIER'
  | 'BROWSER_OBSERVATION';

export type RequirementStrength = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

export interface SkillRoute {
  id: string;
  primary: boolean;
  role?: SkillRole;
  requirement_strength?: RequirementStrength;
  reason: string;
  /** Canonical graph-backed source. Context compilation must load this path, not guess it. */
  source?: string;
  source_hash?: string;
  graph_hash?: string;
  tier?: SkillTier;
}

export interface CapabilityProvider {
  id: string;
  capability: string;
  explicitOnly?: boolean;
  available?: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
  tokenClass?: 'low' | 'medium' | 'high';
  trust?: string;
  effect?: CapabilityEffect;
  health?: { command: string; expectedExitCodes: number[] };
  fallback?: string;
}


export interface RouteResult {
  skills: SkillRoute[];
  capabilities: string[];
  providers: Record<string, string | null>;
  suppressed: Array<{ id: string; reason: string }>;
  /** New typed routing receipt; default mode is shadow until parity is measured. */
  decision_fabric?: DecisionFabricDecision;
}

interface GraphRouting {
  signals?: string[];
  intent_signals?: string[];
  excludes?: string[];
  priority?: number;
  loads?: string[];
  requires?: string[];
  supports?: string[];
  project_scope?: string;
  platform_scope?: string;
  max_route_tokens?: number;
  default?: boolean;
}

interface GraphNode {
  id: string;
  layer: string;
  source: string;
  source_hash: string;
  routing_source?: string;
  routing_hash?: string;
  routing: GraphRouting;
}

interface ContextGraph {
  version: number;
  nodes: GraphNode[];
}

export interface SkillRouteOptions {
  /** Project/domain scopes are never inferred from prompt text. The caller must activate one explicitly. */
  activeProjectScope?: string | null;
  /** Target repository used for derived RepoFacts; the harness root remains the skill source. */
  repoRoot?: string;
  /** Structured approval for effectful providers; never inferred from prose. */
  taskScopeApproved?: boolean;
  ownerApproved?: boolean;
  /** Canonical planner output; the synthetic fallback is compatibility-only. */
  spec?: WorkSpec;
}

export interface CapabilityEffect {
  effect_level: 'read-only' | 'interactive' | 'write' | 'destructive';
  environment: 'local' | 'browser' | 'network' | 'host';
  approval: 'policy' | 'task-scope' | 'explicit-provider' | 'owner';
  reversible: boolean;
  network: boolean;
  credentials: 'none' | 'optional' | 'required';
  timeout_ms: number;
  provider_evidence: 'static-only' | 'health-probe' | 'live-receipt';
}

export interface CapabilityAuthorization {
  taskScopeApproved?: boolean;
  ownerApproved?: boolean;
}

/** Return a stable fail-closed reason when a provider's effect lacks authority. */
export function capabilityAuthorizationReason(
  provider: CapabilityProvider,
  explicitProviders: readonly string[] = [],
  authorization: CapabilityAuthorization = {},
): string | null {
  const effect = provider.effect;
  if (!effect || effect.effect_level === 'read-only' || effect.effect_level === 'interactive') return null;
  if (effect.approval === 'policy') return null;
  if (effect.approval === 'explicit-provider' && explicitProviders.includes(provider.id)) return null;
  if (effect.approval === 'owner' && authorization.ownerApproved === true) return null;
  if (effect.approval === 'task-scope' && effect.environment === 'local' && authorization.taskScopeApproved === true) return null;
  return `approval required: ${effect.approval} for ${effect.effect_level} ${effect.environment} effect`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function phraseHit(text: string, phrase: string): boolean {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  if (!needle) return false;
  // Metadata phrases are authored as literal routing vocabulary. Delimit with
  // non-word boundaries so "qa" does not accidentally match "equal".
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(normalize(text));
}

function graphPath(repoRoot: string): string {
  return path.join(repoRoot, 'generated', 'context-graph.json');
}

/**
 * Resolve the harness/workspace root when a caller does not pass one
 * explicitly. The resolved root is used only to locate the canonical
 * generated context graph; it is never a second routing source.
 */
export function findBundledHarnessRoot(): string | null {
  // 1. Check relative to module location (installed runtime or kernel dist)
  const metaDir = typeof import.meta !== 'undefined' && import.meta.dirname ? import.meta.dirname : null;
  if (metaDir) {
    let cur: string | null = path.resolve(metaDir);
    while (cur) {
      if (fs.existsSync(path.join(cur, 'generated', 'context-graph.json')) || fs.existsSync(path.join(cur, 'integrations', 'registry.json'))) {
        return cur;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  // 2. Check global OMP agent runtime directory
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    const globalRuntime = path.join(home, '.omp', 'agent', 'extensions', 'agent-rules-runtime');
    if (fs.existsSync(path.join(globalRuntime, 'generated', 'context-graph.json'))) {
      return globalRuntime;
    }
  }
  return null;
}

function resolveRoutingRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'generated', 'context-graph.json'))) return current;
    if (fs.existsSync(path.join(current, 'rules', 'manifest.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const bundled = findBundledHarnessRoot();
  if (bundled) return bundled;
  return path.resolve(start);
}

function loadContextGraph(repoRoot: string): { graph: ContextGraph; hash: string } | null {
  const file = graphPath(repoRoot);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as ContextGraph;
  if (!Number.isInteger(parsed.version) || parsed.version < 2 || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    throw new Error('canonical context graph is malformed or version < 2');
  }
  const ids = new Set<string>();
  for (const node of parsed.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id)) throw new Error('canonical context graph contains missing/duplicate node ids');
    ids.add(node.id);
    if (typeof node.source !== 'string' || typeof node.source_hash !== 'string' || !/^[0-9a-f]{64}$/.test(node.source_hash) || !node.routing || typeof node.routing !== 'object') {
      throw new Error(`canonical context graph node is missing provenance/routing metadata: ${node.id}`);
    }
  }
  return { graph: parsed, hash: crypto.createHash('sha256').update(raw).digest('hex') };
}

function assertSelectedSourceIntegrity(repoRoot: string, node: GraphNode): void {
  const target = path.resolve(repoRoot, node.source);
  const root = path.resolve(repoRoot);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`routed skill source escapes repository: ${node.source}`);
  const bytes = fs.readFileSync(target);
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== node.source_hash) {
    throw new Error(`canonical context graph is stale for routed skill ${node.id}: expected ${node.source_hash}, got ${actual}`);
  }
  if (node.routing_source) {
    // Single-source routing provenance: routing_source names the SKILL.md file
    // itself (skills/<id>/SKILL.md) and routing_hash is the sha256 of its
    // bytes. The check below hashes whatever routing_source resolves to, so a
    // graph built from SKILL.md metadata is verified against the SKILL.md file
    // bytes. ROUTE.json is legacy-only and never part of canonical routing.
    const routeTarget = path.resolve(repoRoot, node.routing_source);
    if (routeTarget !== root && !routeTarget.startsWith(`${root}${path.sep}`)) throw new Error(`routed skill routing source escapes repository: ${node.routing_source}`);
    if (!node.routing_hash || !fs.existsSync(routeTarget)) throw new Error(`canonical context graph is missing routing provenance for ${node.id}`);
    const routeActual = crypto.createHash('sha256').update(fs.readFileSync(routeTarget)).digest('hex');
    if (routeActual !== node.routing_hash) throw new Error(`canonical context graph routing is stale for ${node.id}: expected ${node.routing_hash}, got ${routeActual}`);
  }
}

function packetRoutingText(packet: TaskPacket): string {
  return [
    packet.goal,
    ...(packet.constraints ?? []),
    ...(packet.context?.references ?? []),
    ...(packet.context?.entrypoints ?? []),
    ...(packet.context?.symbols ?? []),
    ...packet.scope.owned,
  ].join('\n');
}

export function inferSkillRole(slug: string): SkillRole {
  if (slug === 'ui-taste' || slug.includes('taste') || slug.includes('compliance') || slug.includes('domain')) {
    return 'DOMAIN_JUDGMENT';
  }
  if (slug === 'browser-qa' || slug.includes('browser') || slug.includes('playwright')) {
    return 'BROWSER_OBSERVATION';
  }
  if (slug === 'security-audit' || slug.includes('security') || slug.includes('auth')) {
    return 'SECURITY_LENS';
  }
  if (slug === 'quality' || slug.includes('test') || slug.includes('audit')) {
    return 'QUALITY_LENS';
  }
  if (slug.includes('architecture') || slug.includes('contract')) {
    return 'ARCHITECTURE_LENS';
  }
  if (slug.includes('planning') || slug.includes('plan')) {
    return 'PLANNING_PROCEDURE';
  }
  if (slug.includes('verifier') || slug.includes('parity')) {
    return 'VERIFIER';
  }
  return 'IMPLEMENTATION_GUIDANCE';
}

export type SkillTier = 1 | 2 | 3;

export interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  role: SkillRole;
  project_scope?: string;
  source: string;
  source_hash: string;
  requires?: string[];
  supports?: string[];
  tier: SkillTier;
}

export function describeSkillCatalog(repoRoot: string, options: SkillRouteOptions = {}): SkillCatalogItem[] {
  const graphInfo = loadContextGraph(repoRoot);
  if (!graphInfo) return [];
  const skillNodes = graphInfo.graph.nodes.filter((node) => node.layer === 'skills' && node.id.startsWith('skill:'));
  return skillNodes
    .filter((node) => {
      const scope = String(node.routing?.project_scope ?? '');
      return !scope || scope === (options.activeProjectScope ?? '');
    })
    .map((node) => {
      const slug = node.id.slice('skill:'.length);
      const role = inferSkillRole(slug);
      return {
        id: slug,
        name: slug,
        description: `Specialized expertise for ${role.toLowerCase().replace(/_/g, ' ')} (${slug})`,
        role,
        project_scope: node.routing?.project_scope,
        source: node.source,
        source_hash: node.source_hash,
        requires: node.routing?.requires,
        supports: node.routing?.supports,
        tier: 1,
      };
    });
}

function routeSkillsFromGraph(packet: TaskPacket, repoRoot: string, graphInfo: { graph: ContextGraph; hash: string }, options: SkillRouteOptions): SkillRoute[] {
  const text = packetRoutingText(packet);
  const requested = new Set(packet.skills ?? []);
  const skillNodes = graphInfo.graph.nodes.filter((node) => node.layer === 'skills' && node.id.startsWith('skill:'));
  const bySlug = new Map(skillNodes.map((node) => [node.id.slice('skill:'.length), node]));
  const candidates: Array<{ node: GraphNode; priority: number; explicit: boolean; hits: string[]; role: SkillRole }> = [];

  const hasArchitecturalIntent = /\b(redesign|architect(?:ure)?|information architecture|responsive layout|design contract|system design)\b/i.test(text);

  for (const node of skillNodes) {
    const slug = node.id.slice('skill:'.length);
    const routing = node.routing ?? {};
    const scope = String(routing.project_scope ?? '');
    const scopeActive = !scope || scope === (options.activeProjectScope ?? '');
    if (!scopeActive) continue;

    // Explicit requests and architectural intent are never suppressed by weak lexical excludes
    const explicit = requested.has(slug);
    const excluded = !explicit && !hasArchitecturalIntent && (routing.excludes ?? []).some((phrase) => phraseHit(text, phrase));
    const hits = (routing.signals ?? []).filter((phrase) => phraseHit(text, phrase));
    if (excluded || (!explicit && hits.length === 0 && !routing.default)) continue;
    const domainBonus = scope && scope === (options.activeProjectScope ?? '') ? 500 : 0;
    const role = inferSkillRole(slug);
    candidates.push({ priority: explicit ? 10_000 + domainBonus + Number(routing.priority ?? 0) : domainBonus + Number(routing.priority ?? 0), node, explicit, hits, role });
  }

  candidates.sort((a, b) => b.priority - a.priority || a.node.id.localeCompare(b.node.id));
  const primary = candidates[0];
  if (!primary) return [];

  const selected: Array<{ node: GraphNode; reason: string; role: SkillRole; requirement_strength: RequirementStrength }> = [{
    node: primary.node,
    reason: primary.explicit ? 'explicit TaskPacket request via canonical context graph' : `canonical context-graph signal match: ${primary.hits.join(', ')}`,
    role: primary.role,
    requirement_strength: 'REQUIRED',
  }];

  // 1. Explicitly requested candidates
  for (const candidate of candidates) {
    if (candidate.explicit && !selected.some((entry) => entry.node.id === candidate.node.id)) {
      selected.push({
        node: candidate.node,
        reason: 'explicit TaskPacket request via canonical context graph',
        role: candidate.role,
        requirement_strength: 'REQUIRED',
      });
    }
  }

  // 2. Required dependencies
  for (const entry of [...selected]) {
    const entryRouting = entry.node.routing ?? {};
    for (const dependency of entryRouting.requires ?? []) {
      const node = bySlug.get(dependency);
      if (!node || selected.some((s) => s.node.id === node.id)) continue;
      const scope = String(node.routing?.project_scope ?? '');
      if (scope && scope !== (options.activeProjectScope ?? '')) continue;
      const depRole = inferSkillRole(dependency);
      selected.push({ node, reason: `required by ${entry.node.id}`, role: depRole, requirement_strength: 'REQUIRED' });
    }
  }

  // 3. Recommended supports (declared in SKILL.md metadata)
  for (const entry of [...selected]) {
    const entryRouting = entry.node.routing ?? {};
    for (const support of entryRouting.supports ?? []) {
      const node = bySlug.get(support);
      if (!node || selected.some((s) => s.node.id === node.id)) continue;
      const scope = String(node.routing?.project_scope ?? '');
      if (scope && scope !== (options.activeProjectScope ?? '')) continue;
      // Explicit requests and excluded skills are never simply auto-composed:
      // a support whose own excludes match the prompt is skipped.
      if (!hasArchitecturalIntent && (node.routing?.excludes ?? []).some((phrase) => phraseHit(text, phrase))) continue;
      const supportRole = inferSkillRole(support);
      selected.push({ node, reason: `support for ${entry.node.id}; declared in SKILL.md metadata`, role: supportRole, requirement_strength: 'RECOMMENDED' });
    }
  }

  // 4. Taste modifier parity
  const primarySlug = primary.node.id.slice('skill:'.length);
  const tasteDirectionPhrases: string[][] = [
    ['brandkit'],
    ['brutalist', 'brutalist-skill'],
    ['minimalist', 'minimalist-skill'],
    ['redesign', 'redesign-skill'],
    ['soft-ui', 'soft ui', 'soft-skill'],
    ['high-end', 'high end', 'taste-skill'],
  ];
  const matchedTasteDirections = tasteDirectionPhrases.filter((phrases) => phrases.some((phrase) => phraseHit(text, phrase)));
  const explicitTasteReview = ['taste review', 'review taste', 'ui-taste review', 'review ui-taste', 'đánh giá taste', 'review thẩm mỹ', 'đánh giá thẩm mỹ', 'rà soát thẩm mỹ'].some((phrase) => phraseHit(text, phrase));
  const tasteIsModifier = matchedTasteDirections.length === 1 && bySlug.has('ui-taste') && (
    primarySlug === 'frontend-architect' || (primarySlug === '5fedu-module-parity' && explicitTasteReview)
  );
  if (tasteIsModifier && !selected.some((entry) => entry.node.id === 'skill:ui-taste')) {
    const tasteNode = bySlug.get('ui-taste');
    if (tasteNode) {
      selected.push({
        node: tasteNode,
        reason: 'brief-led taste modifier for UI design/review intent',
        role: 'ARCHITECTURE_LENS',
        requirement_strength: 'RECOMMENDED',
      });
    }
  }

  return selected.map((entry, index) => {
    assertSelectedSourceIntegrity(repoRoot, entry.node);
    return {
      id: entry.node.id.slice('skill:'.length),
      primary: index === 0,
      role: entry.role,
      requirement_strength: entry.requirement_strength,
      reason: entry.reason,
      source: entry.node.source,
      source_hash: entry.node.source_hash,
      graph_hash: graphInfo.hash,
    };
  });
}

/** Deterministic, bounded skill selection with semantic role composition. */
export function routeSkills(packet: TaskPacket, repoRoot?: string, options: SkillRouteOptions = {}): SkillRoute[] {
  const effectiveRoot = repoRoot ?? resolveRoutingRoot();
  const graph = loadContextGraph(effectiveRoot);
  if (!graph) {
    // Fail closed: there is exactly one resolver path (the generated context
    // graph). A missing graph is a build/install error, never a reason to
    // route through hard-coded signal regexes.
    throw new Error(
      `Skill routing requires the generated context graph at ${graphPath(effectiveRoot)}; run the build (npm run build) to generate it`,
    );
  }
  return routeSkillsFromGraph(packet, effectiveRoot, graph, options);
}

interface IntegrationRegistryRecord {
  id: string;
  kind: string;
  policy: 'required' | 'recommended' | 'optional';
  capabilities?: string[];
  priority?: number;
  activation?: 'automatic' | 'explicit-only';
  tokenClass?: 'low' | 'medium' | 'high';
  trust?: string;
  source?: Record<string, unknown>;
  effect: CapabilityEffect;
  health?: { command: string; expectedExitCodes: number[] };
  fallback?: string;
}

interface IntegrationRegistry {
  version: number;
  integrations: IntegrationRegistryRecord[];
}

function readIntegrationRegistry(harnessRoot: string): IntegrationRegistry {
  const file = path.join(harnessRoot, 'integrations', 'registry.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as IntegrationRegistry;
  if (!Number.isInteger(parsed.version) || !Array.isArray(parsed.integrations)) throw new Error('integration registry is malformed');
  const ids = new Set<string>();
  for (const integration of parsed.integrations) {
    if (!integration?.id || ids.has(integration.id)) throw new Error(`integration registry contains missing/duplicate id: ${integration?.id ?? '<missing>'}`);
    ids.add(integration.id);
    if (!Array.isArray(integration.capabilities) || integration.capabilities.length === 0) throw new Error(`integration ${integration.id} has no canonical capabilities`);
    if (!integration.effect) throw new Error(`integration ${integration.id} has no effect contract`);
    if (integration.health && (typeof integration.health.command !== 'string' || !integration.health.command.trim() || !Array.isArray(integration.health.expectedExitCodes) || integration.health.expectedExitCodes.some((code) => !Number.isInteger(code)))) throw new Error(`integration ${integration.id} has malformed health contract`);
    if (integration.fallback !== undefined && (typeof integration.fallback !== 'string' || !integration.fallback.trim())) throw new Error(`integration ${integration.id} has malformed fallback`);
  }
  return parsed;
}

function providersFromIntegrationRegistry(harnessRoot: string): CapabilityProvider[] {
  const registry = readIntegrationRegistry(harnessRoot);
  const out: CapabilityProvider[] = [];
  for (const integration of registry.integrations) {
    for (const capability of integration.capabilities ?? []) {
      out.push({
        id: integration.id,
        capability,
        priority: integration.priority ?? 50,
        explicitOnly: integration.activation === 'explicit-only',
        tokenClass: integration.tokenClass,
        trust: integration.trust,
        effect: integration.effect,
        ...(integration.health ? { health: integration.health } : {}),
        ...(integration.fallback ? { fallback: integration.fallback } : {}),
        metadata: {
          mode: integration.kind === 'mcp' ? 'mcp' : integration.kind === 'cli-tool' ? 'cli' : 'host',
          integration_id: integration.id,
          policy: integration.policy,
          activation: integration.activation ?? 'automatic',
          token_class: integration.tokenClass ?? 'medium',
          trust: integration.trust ?? 'declared',
          effect: integration.effect,
          ...(integration.health ? { health: integration.health } : {}),
          ...(integration.fallback ? { fallback: integration.fallback } : {}),
          ...(integration.source ? { source: integration.source } : {}),
        },
      });
    }
  }
  return out;
}

function registerManualExplicitProviders(broker: CapabilityBroker, harnessRoot: string): void {
  const manualRoot = path.join(harnessRoot, 'integrations', 'manual');
  if (!fs.existsSync(manualRoot)) return;
  for (const dirent of fs.readdirSync(manualRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const manifestPath = path.join(manualRoot, dirent.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { id?: string; activation?: string; capabilities?: string[]; effect?: CapabilityEffect; health?: { command: string; expectedExitCodes: number[] }; fallback?: string };
    if (!manifest.id || !Array.isArray(manifest.capabilities)) continue;
    // One concept has one owner (REQ-014): when the same integration id is
    // already registered from the canonical integrations/registry.json, the
    // manual manifest is a legacy mirror and must not register a second time.
    if (broker.provider(manifest.id)) continue;
    if (manifest.activation !== 'explicit-only') throw new Error(`manual integration ${manifest.id} must be explicit-only`);
    if (!manifest.effect) throw new Error(`manual integration ${manifest.id} has no effect contract`);
    for (const capability of manifest.capabilities) {
      broker.register({ id: manifest.id, capability, priority: 50, explicitOnly: true, effect: manifest.effect, ...(manifest.health ? { health: manifest.health } : {}), ...(manifest.fallback ? { fallback: manifest.fallback } : {}), metadata: { mode: 'host', activation: 'manual', integration_id: manifest.id, effect: manifest.effect, ...(manifest.health ? { health: manifest.health } : {}), ...(manifest.fallback ? { fallback: manifest.fallback } : {}) } });
    }
  }
}

export class CapabilityBroker {
  private readonly providers: CapabilityProvider[] = [];

  constructor(private readonly harnessRoot?: string, private readonly decisionFabricMode: DecisionFabricMode = 'active') {}

  register(provider: CapabilityProvider): void {
    if (this.providers.some((p) => p.id === provider.id && p.capability === provider.capability)) throw new Error(`duplicate capability provider: ${provider.id} for ${provider.capability}`);
    this.providers.push({ ...provider });
  }

  resolve(capability: string, explicitProviders: readonly string[] = [], authorization: CapabilityAuthorization = {}): CapabilityProvider | null {
    const canonical = canonicalCapability(capability);
    const eligible = this.providers
      .filter((provider) => provider.capability === canonical && provider.available !== false)
      .filter((provider) => !provider.explicitOnly || explicitProviders.includes(provider.id))
      .filter((provider) => capabilityAuthorizationReason(provider, explicitProviders, authorization) === null);
    const explicitlyRequested = eligible
      .filter((provider) => explicitProviders.includes(provider.id))
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id));
    if (explicitlyRequested.length > 0) return explicitlyRequested[0] ?? null;
    return eligible.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id))[0] ?? null;
  }

  provider(id: string, capability?: string): CapabilityProvider | null {
    const canonical = capability ? canonicalCapability(capability) : undefined;
    return this.providers.find((provider) => provider.id === id && (!canonical || provider.capability === canonical)) ?? null;
  }

  hint(id: string, capability?: string): string | null {
    const provider = this.provider(id, capability);
    if (!provider) return null;
    const mode = String(provider.metadata?.mode ?? 'builtin');
    const source = provider.metadata?.source as Record<string, unknown> | undefined;
    if (mode === 'cli' && source?.package) {
      const version = typeof source.version === 'string' ? `@${source.version}` : '';
      return `${provider.capability}: npx -y ${String(source.package)}${version} (provider=${provider.id})`;
    }
    if (mode === 'mcp') return `${provider.capability}: use host-attached MCP provider ${provider.id}; do not expose unrelated MCP tools`;
    if (mode === 'host' && provider.metadata?.guidance) return `${provider.capability}: ${String(provider.metadata.guidance)} (provider=${provider.id})`;
    return `${provider.capability}: provider=${provider.id}`;
  }

  manifest(manifestId = 'CAP-default'): CapabilityManifest {
    const manifest: CapabilityManifest = {
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      manifest_id: manifestId,
      providers: this.providers.map((provider) => ({
        id: provider.id,
        capability: provider.capability,
        mode: provider.metadata?.mode === 'mcp' ? 'mcp' : provider.metadata?.mode === 'host' ? 'host' : provider.metadata?.mode === 'cli' ? 'cli' : 'builtin',
        ...(provider.explicitOnly ? { explicit_only: true } : {}),
        ...(provider.metadata ? { metadata: { ...provider.metadata } } : {}),
      })),
    };
    assertCapabilityManifest(manifest);
    return manifest;
  }

  route(packet: TaskPacket, explicitProviders: readonly string[] = [], options: SkillRouteOptions = {}): RouteResult {
    const unknownExplicit = explicitProviders.filter((id) => !this.providers.some((provider) => provider.id === id));
    if (unknownExplicit.length > 0) throw new Error(`unknown explicit capability provider(s): ${[...new Set(unknownExplicit)].join(', ')}`);
    // The broker and the context compiler must consult the same graph-bound
    // route. Falling back here while the compiler uses generated/context-graph
    // would create two skill decisions in one run.
    const legacySkills = routeSkills(packet, this.harnessRoot, options);
    const legacyCapabilities = [...new Set(packet.capabilities ?? inferCapabilities(packet))];
    const decision = compareDecisionFabric(decide({
      packet,
      spec: options.spec ?? {
        protocol_version: NORTH_STAR_PROTOCOL_VERSION,
        spec_id: packet.spec_id,
        revision: packet.spec_revision,
        work_id: packet.work_id ?? packet.spec_id,
        requirements: packet.requirements.map((id) => ({ id, statement: packet.goal, mandatory: true, claims: packet.acceptance.map((entry) => entry.claim_id) })),
        risk_class: 'S1',
      },
      repoFacts: loadRepoFacts(options.repoRoot ?? this.harnessRoot ?? process.cwd()),
      mode: this.decisionFabricMode,
    }), { skills: legacySkills.map((skill) => skill.id), capabilities: legacyCapabilities });
    const skills = this.decisionFabricMode === 'active'
      ? legacySkills.filter((skill) => decision.skills.includes(skill.id))
      : legacySkills;
    const capabilities = this.decisionFabricMode === 'active' ? decision.capabilities : legacyCapabilities;
    const providers: Record<string, string | null> = {};
    const suppressed: Array<{ id: string; reason: string }> = [];
    const authorization: CapabilityAuthorization = {
      // A packet's owned scope is the structured task-scope approval for local
      // reversible writes. Network/host writes still require owner approval.
      taskScopeApproved: options.taskScopeApproved ?? packet.scope.owned.length > 0,
      ownerApproved: options.ownerApproved === true,
    };
    for (const capability of capabilities) {
      const selected = this.resolve(capability, explicitProviders, authorization);
      providers[capability] = selected?.id ?? null;
      for (const provider of this.providers.filter((p) => p.capability === capability)) {
        if (provider.explicitOnly && !explicitProviders.includes(provider.id)) {
          suppressed.push({ id: provider.id, reason: 'explicit-only provider was not requested' });
        } else {
          const reason = capabilityAuthorizationReason(provider, explicitProviders, authorization);
          if (reason) suppressed.push({ id: provider.id, reason });
        }
      }
    }
    return { skills, capabilities, providers, suppressed, decision_fabric: decision };
  }
}

export function inferCapabilities(packet: TaskPacket): string[] {
  const text = `${packet.goal}\n${packet.scope.owned.join('\n')}\n${(packet.context?.symbols ?? []).join('\n')}`;
  const out = ['filesystem.read', 'filesystem.write', 'code.search', 'shell.exec', 'git.read'];
  if (/\b(cross[- ]file|impact analysis|callers?|references?|symbol|large refactor|dependency graph)\b/i.test(text)) out.push('code.semantic');
  if (/\b(browser|playwright|e2e|visual|ui|tsx|jsx|css|drawer|modal|frontend)\b/i.test(text)) out.push('browser.verify');
  if (/\b(exploratory|click-through|interactive browser|navigate the live|manual browser)\b/i.test(text)) out.push('browser.explore');
  if (/\b(console|network|cdp|devtools|browser debug|performance trace)\b/i.test(text)) out.push('browser.debug');
  if (/\b(documentation|docs?|external api|latest api|release notes|changelog)\b/i.test(text)) out.push('docs.lookup');
  if (/\b(logs?|runtime error|production error|diagnostic)\b/i.test(text)) out.push('runtime.logs');
  if (/\b(metrics?|latency|throughput|memory|cpu|performance budget)\b/i.test(text)) out.push('runtime.metrics');
  if (/\b(traces?|opentelemetry|span|distributed tracing)\b/i.test(text)) out.push('runtime.traces');
  // output.compress is intentionally not inferred: compression must prove net
  // value in task-level ablations before it becomes part of the default path.
  // Pencil/design capabilities are intentionally NEVER inferred.
  return [...new Set(out)];
}

function resolveCapabilityHarnessRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'integrations', 'registry.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const bundled = findBundledHarnessRoot();
  if (bundled) return bundled;
  return path.resolve(start);
}

/** Backward-compatible alias for the standard broker. */
export function createDefaultCapabilityBroker(harnessRoot?: string): CapabilityBroker {
  return createStandardCapabilityBroker(harnessRoot);
}

/**
 * Build the provider surface from one external integration source of truth.
 * Builtins are tiny kernel primitives; every external MCP/CLI provider comes
 * from integrations/registry.json. Manual providers are explicit-only.
 */
export function createStandardCapabilityBroker(harnessRoot?: string, options: { decisionFabricMode?: DecisionFabricMode } = {}): CapabilityBroker {
  const resolvedRoot = resolveCapabilityHarnessRoot(harnessRoot ?? process.cwd());
  const broker = new CapabilityBroker(resolvedRoot, options.decisionFabricMode ?? 'active');
  const builtins: CapabilityProvider[] = [
    { id: 'builtin-filesystem-read', capability: 'filesystem.read', priority: 1, tokenClass: 'low', trust: 'native-live', effect: { effect_level: 'read-only', environment: 'local', approval: 'policy', reversible: true, network: false, credentials: 'none', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
    { id: 'builtin-filesystem-write', capability: 'filesystem.write', priority: 1, tokenClass: 'low', trust: 'native-live', effect: { effect_level: 'write', environment: 'local', approval: 'task-scope', reversible: true, network: false, credentials: 'none', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
    { id: 'builtin-rg', capability: 'code.search', priority: 1, tokenClass: 'low', trust: 'native-live', effect: { effect_level: 'read-only', environment: 'local', approval: 'policy', reversible: true, network: false, credentials: 'none', timeout_ms: 30000, provider_evidence: 'live-receipt' } },
    { id: 'safe-argv', capability: 'shell.exec', priority: 1, tokenClass: 'low', trust: 'native-live', effect: { effect_level: 'write', environment: 'local', approval: 'task-scope', reversible: false, network: false, credentials: 'optional', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
    { id: 'git-cli', capability: 'git.read', priority: 1, tokenClass: 'low', trust: 'native-live', effect: { effect_level: 'read-only', environment: 'local', approval: 'policy', reversible: true, network: false, credentials: 'none', timeout_ms: 30000, provider_evidence: 'live-receipt' } },
    { id: 'host-runtime-logs', capability: 'runtime.logs', priority: 5, tokenClass: 'low', trust: 'declared', metadata: { mode: 'host', guidance: 'use project-native structured logs via safe shell/provider adapters' }, effect: { effect_level: 'read-only', environment: 'host', approval: 'task-scope', reversible: true, network: false, credentials: 'optional', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
    { id: 'host-runtime-metrics', capability: 'runtime.metrics', priority: 5, tokenClass: 'low', trust: 'declared', metadata: { mode: 'host', guidance: 'use project-native metrics endpoints/files via safe shell/provider adapters' }, effect: { effect_level: 'read-only', environment: 'host', approval: 'task-scope', reversible: true, network: false, credentials: 'optional', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
    { id: 'host-runtime-traces', capability: 'runtime.traces', priority: 5, tokenClass: 'medium', trust: 'declared', metadata: { mode: 'host', guidance: 'use project-native trace/OTel artifacts via safe shell/provider adapters' }, effect: { effect_level: 'read-only', environment: 'host', approval: 'task-scope', reversible: true, network: false, credentials: 'optional', timeout_ms: 120000, provider_evidence: 'live-receipt' } },
  ];
  builtins.forEach((entry) => broker.register(entry));
  const registryFile = path.join(resolvedRoot, 'integrations', 'registry.json');
  if (fs.existsSync(registryFile)) providersFromIntegrationRegistry(resolvedRoot).forEach((entry) => broker.register(entry));
  registerManualExplicitProviders(broker, resolvedRoot);
  return broker;
}
