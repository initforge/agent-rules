import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryFacts } from './repo-facts.js';

export type SkillRole = 'process' | 'domain' | 'design' | 'auditor' | 'verifier';
export interface SkillRoute { readonly id: string; readonly primary: boolean; readonly role: SkillRole; readonly reason: string; readonly source: string; readonly source_hash: string; readonly graph_hash: string }
export interface CapabilityProvider { readonly id: string; readonly capability: string; readonly explicitOnly?: boolean; readonly available?: boolean; readonly priority?: number }
export type RequestedMode = 'qa' | 'plan' | 'execute' | 'auto';

/**
 * Deterministic affected scope. Environment facts only *filter* compatibility;
 * they never activate a skill by themselves. Explicit skill IDs always win.
 */
export interface AffectedScope {
  readonly paths?: readonly string[];
  readonly stacks?: readonly string[];
  readonly runtime_surfaces?: readonly string[];
}

export interface NativeRouteInput {
  readonly prompt: string;
  readonly requestedMode?: RequestedMode;
  readonly explicitSkills?: readonly string[];
  readonly explicitProviders?: readonly string[];
  readonly activeProjectScope?: string | null;
  readonly affectedScope?: AffectedScope;
  readonly repositoryFacts?: RepositoryFacts;
}
export interface RouteResult { readonly skills: readonly SkillRoute[]; readonly capabilities: readonly string[]; readonly providers: Readonly<Record<string, string | null>>; readonly suppressed: readonly { id: string; reason: string }[] }

interface GraphNode {
  readonly id: string; readonly layer: string; readonly source: string; readonly source_hash: string; readonly routing_source?: string; readonly routing_hash?: string;
  readonly role?: SkillRole; readonly activation?: 'implicit' | 'explicit-only'; readonly conflicts?: readonly string[]; readonly exclusive_group?: string | null;
  readonly routing: { readonly signals?: string[]; readonly excludes?: string[]; readonly priority?: number; readonly requires?: string[]; readonly supports?: string[]; readonly project_scope?: string; readonly default?: boolean; readonly compatibility?: Readonly<Record<string, string>> };
}
interface ContextGraph { readonly version: number; readonly nodes: GraphNode[] }
interface IntegrationRegistry { readonly integrations: readonly { readonly id: string; readonly capabilities?: readonly string[]; readonly priority?: number; readonly activation?: 'automatic' | 'explicit-only' }[] }

function sha256(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

export function findBundledHarnessRoot(): string | null {
  let cursor = path.resolve(import.meta.dirname);
  while (true) {
    if (fs.existsSync(path.join(cursor, 'generated', 'context-graph.json'))) return cursor;
    const packed = path.join(cursor, 'runtime-assets');
    if (fs.existsSync(path.join(packed, 'generated', 'context-graph.json'))) return packed;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function loadGraph(root: string): { graph: ContextGraph; hash: string } {
  const file = path.join(root, 'generated', 'context-graph.json');
  if (!fs.existsSync(file)) throw new Error(`Skill routing requires ${file}; run npm run build`);
  const raw = fs.readFileSync(file, 'utf8');
  const graph = JSON.parse(raw) as ContextGraph;
  if (!Number.isInteger(graph.version) || graph.version < 2 || !Array.isArray(graph.nodes)) throw new Error('canonical context graph is malformed');
  return { graph, hash: sha256(raw) };
}

function assertSource(root: string, node: GraphNode): void {
  const resolvedRoot = path.resolve(root);
  const source = path.resolve(root, node.source);
  if (!source.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`routed skill escapes harness root: ${node.source}`);
  if (!fs.existsSync(source) || sha256(fs.readFileSync(source)) !== node.source_hash) throw new Error(`context graph is stale for ${node.id}`);
  if (node.routing_source && node.routing_hash) {
    const routingSource = path.resolve(root, node.routing_source);
    if (!routingSource.startsWith(`${resolvedRoot}${path.sep}`) || !fs.existsSync(routingSource) || sha256(fs.readFileSync(routingSource)) !== node.routing_hash) throw new Error(`routing metadata is stale for ${node.id}`);
  }
}

/**
 * Environment facts only filter compatibility; they never activate a skill.
 * A non-explicit candidate is dropped when the affected scope provably
 * contradicts its declared compatibility, and never added by it.
 */
function compatibilityFilter(node: GraphNode, input: NativeRouteInput): boolean {
  const compat = node.routing.compatibility;
  if (!compat || Object.keys(compat).length === 0) return true;
  const scope = input.affectedScope;
  if (!scope) return true;
  const stacks = scope.stacks ?? [];
  if (stacks.length > 0 && typeof compat.stacks === 'string' && compat.stacks !== 'all' && !compat.stacks.split(',').map((s) => s.trim()).some((s) => stacks.includes(s))) return false;
  const surfaces = scope.runtime_surfaces ?? [];
  if (surfaces.length > 0 && typeof compat.runtime_surfaces === 'string' && compat.runtime_surfaces !== 'all' && !compat.runtime_surfaces.split(',').map((s) => s.trim()).some((s) => surfaces.includes(s))) return false;
  return true;
}

/** Deterministic canonical routing (Lock 1): never a runtime classifier. */
export function routeSkills(input: NativeRouteInput, root: string): SkillRoute[] {
  const { graph, hash } = loadGraph(root);
  const requested = new Set(input.explicitSkills ?? []);
  const mode = input.requestedMode ?? 'auto';
  const modeSkill = mode === 'plan' ? 'plan-and-handoff' : mode === 'qa' ? 'verification-router' : null;

  const candidates = graph.nodes
    .filter((node) => node.layer === 'skills' && node.id.startsWith('skill:'))
    .map((node) => ({ node, slug: node.id.slice(6) }))
    .filter(({ node, slug }) => {
      const scope = node.routing.project_scope;
      if (scope && scope !== input.activeProjectScope) return false;
      if (requested.has(slug)) return true; // explicit skill wins
      if (modeSkill === slug) return true;  // requested mode is deterministic
      if ((mode === 'plan' && slug === 'verification-router') || (mode === 'qa' && slug === 'plan-and-handoff')) return false;
      // Deterministic signals only: project/profile compatibility and
      // affected-scope compatibility. No natural-language implicit selection:
      // implicit semantic activation belongs to the host-native model reading
      // the exact skill name/description, never to a runtime phrase classifier.
      const projectMatch = Boolean(node.routing.project_scope && node.routing.project_scope === input.activeProjectScope);
      if (node.routing.project_scope && !projectMatch) return false;
      if (projectMatch) return true;
      return node.routing.default === true && compatibilityFilter(node, input);
    })
    .sort((a, b) => Number(requested.has(b.slug)) - Number(requested.has(a.slug)) || Number(modeSkill === b.slug) - Number(modeSkill === a.slug) || (b.node.routing.priority ?? 0) - (a.node.routing.priority ?? 0) || a.slug.localeCompare(b.slug));

  const bySlug = new Map(graph.nodes.filter((node) => node.id.startsWith('skill:')).map((node) => [node.id.slice(6), node]));
  const selected = new Map<string, { node: GraphNode; reason: string }>();
  const select = (slug: string, reason: string, visiting: readonly string[] = []): void => {
    if (visiting.includes(slug)) throw new Error(`skill dependency cycle: ${[...visiting, slug].join(' -> ')}`);
    if (selected.has(slug)) return;
    const node = bySlug.get(slug);
    if (!node) throw new Error(`skill dependency is missing: ${visiting.at(-1) ?? 'route'} requires ${slug}`);
    for (const selectedSlug of selected.keys()) {
      const selectedNode = bySlug.get(selectedSlug);
      if ((node.conflicts ?? []).includes(selectedSlug) || (selectedNode?.conflicts ?? []).includes(slug)) {
        throw new Error(`skill conflict: ${slug} conflicts with ${selectedSlug}`);
      }
      if (node.exclusive_group && selectedNode?.exclusive_group === node.exclusive_group) {
        throw new Error(`skill exclusive group conflict (${node.exclusive_group}): ${slug}, ${selectedSlug}`);
      }
    }
    selected.set(slug, { node, reason });
    for (const dependency of node.routing.requires ?? []) {
      select(dependency, `declared dependency of ${slug}`, [...visiting, slug]);
    }
  };
  for (const candidate of candidates) {
    const reason = requested.has(candidate.slug)
      ? 'explicit skill request'
      : modeSkill === candidate.slug
        ? `requested ${mode} mode`
        : candidate.node.routing.project_scope === input.activeProjectScope
          ? `project/profile compatibility: ${input.activeProjectScope}`
          : 'canonical default skill';
    select(candidate.slug, reason);
  }
  for (const [slug, entry] of [...selected]) {
    for (const dependency of entry.node.routing.requires ?? []) {
      select(dependency, `declared dependency of ${slug}`, [slug]);
    }
  }
  return [...selected].map(([slug, entry], index) => {
    assertSource(root, entry.node);
    if (!entry.node.role) throw new Error(`routed skill has no registry role: ${slug}`);
    return { id: slug, primary: index === 0, role: entry.node.role, reason: entry.reason, source: entry.node.source, source_hash: entry.node.source_hash, graph_hash: hash };
  });
}

export function inferCapabilities(prompt: string, _facts?: RepositoryFacts, affectedScope?: AffectedScope): string[] {
  const text = `${prompt} ${(affectedScope?.runtime_surfaces ?? []).join(' ')} ${(affectedScope?.stacks ?? []).join(' ')}`;
  const capabilities = ['filesystem.read', 'filesystem.write', 'code.search', 'shell.exec', 'git.read'];
  if (/\b(browser|playwright|e2e|visual|frontend|css|tsx|jsx|react|next|vue|svelte)\b/i.test(text)) capabilities.push('browser.verify');
  if (/\b(console|network|devtools|cdp|browser debug)\b/i.test(text)) capabilities.push('browser.debug');
  if (/\b(documentation|docs?|external api|release notes|changelog|latest)\b/i.test(text)) capabilities.push('docs.lookup');
  if (/\b(database|postgres|prisma|supabase|sql|drizzle)\b/i.test(text)) capabilities.push('database.query');
  if (/\b(logs?|runtime error|diagnostic)\b/i.test(text)) capabilities.push('runtime.logs');
  return [...new Set(capabilities)];
}

export class CapabilityBroker {
  private readonly providers: CapabilityProvider[] = [];
  constructor(private readonly root: string) {}
  register(provider: CapabilityProvider): void {
    if (!this.providers.some((item) => item.id === provider.id && item.capability === provider.capability)) this.providers.push(provider);
  }
  resolveSkills(input: NativeRouteInput): SkillRoute[] { return routeSkills(input, this.root); }
  route(input: NativeRouteInput): RouteResult {
    const explicitProviders = new Set(input.explicitProviders ?? []);
    const knownProviders = new Set(this.providers.map((provider) => provider.id));
    const unknown = [...explicitProviders].filter((provider) => !knownProviders.has(provider));
    if (unknown.length) throw new Error(`unknown explicit capability provider(s): ${unknown.join(', ')}`);
    const capabilities = inferCapabilities(input.prompt, input.repositoryFacts, input.affectedScope);
    const providers: Record<string, string | null> = {};
    const suppressed: { id: string; reason: string }[] = [];
    for (const capability of capabilities) {
      const eligible = this.providers.filter((provider) => provider.capability === capability && provider.available !== false).filter((provider) => !provider.explicitOnly || explicitProviders.has(provider.id)).sort((a, b) => Number(explicitProviders.has(b.id)) - Number(explicitProviders.has(a.id)) || (a.priority ?? 100) - (b.priority ?? 100) || a.id.localeCompare(b.id));
      providers[capability] = eligible[0]?.id ?? null;
      for (const provider of this.providers.filter((item) => item.capability === capability && item.explicitOnly && !explicitProviders.has(item.id))) suppressed.push({ id: provider.id, reason: 'explicit-only provider was not requested' });
    }
    return { skills: this.resolveSkills(input), capabilities, providers, suppressed };
  }
}

function registryProviders(root: string): CapabilityProvider[] {
  const file = path.join(root, 'integrations', 'registry.json');
  if (!fs.existsSync(file)) return [];
  const registry = JSON.parse(fs.readFileSync(file, 'utf8')) as IntegrationRegistry;
  if (!Array.isArray(registry.integrations)) throw new Error('integration registry is malformed');
  return registry.integrations.flatMap((integration) => (integration.capabilities ?? []).map((capability: string) => ({ id: integration.id, capability, priority: integration.priority ?? 50, explicitOnly: integration.activation === 'explicit-only' })));
}

export function createStandardCapabilityBroker(root: string): CapabilityBroker {
  const broker = new CapabilityBroker(root);
  for (const capability of ['filesystem.read', 'filesystem.write', 'code.search', 'shell.exec', 'git.read']) broker.register({ id: `native-${capability.replace('.', '-')}`, capability, priority: 10 });
  for (const provider of registryProviders(root)) broker.register(provider);
  return broker;
}
