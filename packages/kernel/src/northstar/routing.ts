import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repositoryFactsText, type RepositoryFacts } from './repo-facts.js';

export type SkillRole = 'DOMAIN_JUDGMENT' | 'PLANNING_PROCEDURE' | 'IMPLEMENTATION_GUIDANCE' | 'ARCHITECTURE_LENS' | 'QUALITY_LENS' | 'SECURITY_LENS' | 'VERIFIER' | 'BROWSER_OBSERVATION';
export interface SkillRoute { readonly id: string; readonly primary: boolean; readonly role: SkillRole; readonly reason: string; readonly source: string; readonly source_hash: string; readonly graph_hash: string }
export interface CapabilityProvider { readonly id: string; readonly capability: string; readonly explicitOnly?: boolean; readonly available?: boolean; readonly priority?: number }
export interface NativeRouteInput { readonly prompt: string; readonly explicitSkills?: readonly string[]; readonly explicitProviders?: readonly string[]; readonly activeProjectScope?: string | null; readonly repositoryFacts?: RepositoryFacts }
export interface RouteResult { readonly skills: readonly SkillRoute[]; readonly capabilities: readonly string[]; readonly providers: Readonly<Record<string, string | null>>; readonly suppressed: readonly { id: string; reason: string }[] }

interface GraphNode {
  readonly id: string; readonly layer: string; readonly source: string; readonly source_hash: string; readonly routing_source?: string; readonly routing_hash?: string;
  readonly routing: { readonly signals?: string[]; readonly excludes?: string[]; readonly priority?: number; readonly requires?: string[]; readonly supports?: string[]; readonly project_scope?: string; readonly default?: boolean };
}
interface ContextGraph { readonly version: number; readonly nodes: GraphNode[] }
interface IntegrationRegistry { readonly integrations: readonly { readonly id: string; readonly capabilities?: readonly string[]; readonly priority?: number; readonly activation?: 'automatic' | 'explicit-only' }[] }

function sha256(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function normalize(value: string): string { return value.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); }
function phraseHit(text: string, phrase: string): boolean {
  const needle = normalize(phrase);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(normalize(text));
}

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

export function inferSkillRole(slug: string): SkillRole {
  if (slug.includes('browser') || slug.includes('playwright')) return 'BROWSER_OBSERVATION';
  if (slug.includes('security') || slug.includes('auth')) return 'SECURITY_LENS';
  if (slug === 'quality' || slug.includes('audit')) return 'QUALITY_LENS';
  if (slug.includes('architect') || slug.includes('contract')) return 'ARCHITECTURE_LENS';
  if (slug.includes('plan') || slug === 'finish-to-completion') return 'PLANNING_PROCEDURE';
  if (slug.includes('verif') || slug.includes('parity')) return 'VERIFIER';
  if (slug.includes('taste') || slug.includes('domain')) return 'DOMAIN_JUDGMENT';
  return 'IMPLEMENTATION_GUIDANCE';
}

export function routeSkills(input: NativeRouteInput, root: string): SkillRoute[] {
  const { graph, hash } = loadGraph(root);
  const requested = new Set(input.explicitSkills ?? []);
  const candidates = graph.nodes
    .filter((node) => node.layer === 'skills' && node.id.startsWith('skill:'))
    .map((node) => ({ node, slug: node.id.slice(6) }))
    .filter(({ node, slug }) => {
      const scope = node.routing.project_scope;
      if (scope && scope !== input.activeProjectScope) return false;
      if (requested.has(slug)) return true;
      const routingText = `${input.prompt} ${input.repositoryFacts ? repositoryFactsText(input.repositoryFacts) : ''}`;
      if ((node.routing.excludes ?? []).some((signal) => phraseHit(routingText, signal))) return false;
      return node.routing.default === true || (node.routing.signals ?? []).some((signal) => phraseHit(routingText, signal));
    })
    .sort((a, b) => Number(requested.has(b.slug)) - Number(requested.has(a.slug)) || (b.node.routing.priority ?? 0) - (a.node.routing.priority ?? 0) || a.slug.localeCompare(b.slug));

  const bySlug = new Map(graph.nodes.filter((node) => node.id.startsWith('skill:')).map((node) => [node.id.slice(6), node]));
  const selected = new Map<string, { node: GraphNode; reason: string }>();
  for (const candidate of candidates) selected.set(candidate.slug, { node: candidate.node, reason: requested.has(candidate.slug) ? 'explicit skill request' : 'canonical skill signal match' });
  for (const [slug, entry] of [...selected]) {
    for (const dependency of entry.node.routing.requires ?? []) {
      const node = bySlug.get(dependency);
      if (node && !selected.has(dependency)) selected.set(dependency, { node, reason: `declared dependency of ${slug}` });
    }
  }
  return [...selected].map(([slug, entry], index) => {
    assertSource(root, entry.node);
    return { id: slug, primary: index === 0, role: inferSkillRole(slug), reason: entry.reason, source: entry.node.source, source_hash: entry.node.source_hash, graph_hash: hash };
  });
}

export function inferCapabilities(prompt: string, facts?: RepositoryFacts): string[] {
  const text = `${prompt} ${facts ? repositoryFactsText(facts) : ''}`;
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
    const capabilities = inferCapabilities(input.prompt, input.repositoryFacts);
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
