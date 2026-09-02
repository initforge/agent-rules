import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createStandardCapabilityBroker, findBundledHarnessRoot, type AffectedScope, type RouteResult, type SkillRoute } from './routing.js';
import { collectRepositoryFacts } from './repo-facts.js';

export const NATIVE_TURN_ROUTER_VERSION = '4.0.0';
export type RouteStatus = 'READY' | 'NEEDS_USER' | 'BLOCKED' | 'UNSUPPORTED' | 'DEGRADED';
export interface NativeTurnModelRef { readonly provider: string; readonly model_id: string }
export interface NativeTurnRequest {
  readonly protocol_version: string; readonly host: string; readonly session_id: string; readonly turn_id: string; readonly cwd: string; readonly prompt: string;
  readonly requested_mode?: 'qa' | 'plan' | 'execute' | 'auto'; readonly host_facts?: { readonly model?: string | NativeTurnModelRef | null };
  readonly explicit?: { readonly skills?: string[]; readonly capability_providers?: string[]; readonly active_project_scope?: string | null; readonly affected_scope?: AffectedScope }; readonly project_facts?: { readonly domain_pack?: string | null; readonly changed_files?: string[] }; readonly repo_root?: string;
}
export interface RouteCapsuleSkill { readonly id: string; readonly role: string; readonly primary: boolean; readonly reason: string; readonly source: string; readonly source_hash: string; readonly graph_hash: string }
export interface RouteCapsuleIntegration { readonly capability: string; readonly provider: string | null; readonly suppressed_reason?: string }
export interface RouteCapsule {
  readonly schema: 'agent-rules/route-capsule'; readonly version: 1; readonly route_id: string; readonly generation: number; readonly idempotency_key: string;
  readonly protocol_version: string; readonly host: string; readonly session_id: string; readonly turn_id: string; readonly status: RouteStatus;
  readonly model: { readonly requested: string | null; readonly observed: null }; readonly skills: readonly RouteCapsuleSkill[]; readonly integrations: readonly RouteCapsuleIntegration[];
  readonly context: { readonly estimated_tokens: number; readonly rendered: string }; readonly proof: { readonly selected: readonly string[]; readonly omitted: readonly { proof: string; reason: string }[] };
  readonly identity: { readonly prompt_sha256: string; readonly context_sha256: string }; readonly observed: { readonly routed_at: string; readonly router_version: string };
}
export interface NativeTurnRouteOptions { readonly generation?: number; readonly now?: () => Date; readonly harnessRoot?: string }
export interface RoutedTurn { readonly capsule: RouteCapsule; readonly brokerRoute: RouteResult }
export class NativeTurnRouterError extends Error { readonly status: RouteStatus; constructor(message: string, status: RouteStatus = 'BLOCKED') { super(message); this.name = 'NativeTurnRouterError'; this.status = status; } }

function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function nativeTurnIdempotencyKey(request: NativeTurnRequest, promptHash: string, generation: number): string { return sha256([request.host, request.session_id, request.turn_id, promptHash, String(generation)].join('\u0000')); }
function resolveHarnessRoot(repoRoot: string): string {
  let cursor = path.resolve(repoRoot);
  while (true) { if (fs.existsSync(path.join(cursor, 'rules', 'manifest.yaml'))) return cursor; const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent; }
  return findBundledHarnessRoot() ?? path.resolve(repoRoot);
}
function selectedModel(request: NativeTurnRequest): string | null { const model = request.host_facts?.model; return typeof model === 'string' ? model : model ? `${model.provider}/${model.model_id}` : null; }
function readSelectedSkills(root: string, skills: readonly SkillRoute[]): { rendered: string; estimatedTokens: number } {
  const rendered = skills.map((skill) => `## Skill: ${skill.id}\n${fs.readFileSync(path.resolve(root, skill.source), 'utf8')}`).join('\n\n');
  return { rendered, estimatedTokens: Math.ceil(rendered.length / 3.6) };
}
function integrations(route: RouteResult): RouteCapsuleIntegration[] { return [...Object.entries(route.providers).map(([capability, provider]) => ({ capability, provider })), ...route.suppressed.map((item) => ({ capability: item.id, provider: null, suppressed_reason: item.reason }))]; }

/** Resolve skills and integrations once. Native host plan/progress remains authoritative. */
export function routeNativeTurn(request: NativeTurnRequest, options: NativeTurnRouteOptions = {}): RoutedTurn {
  if (!request.prompt?.trim()) throw new NativeTurnRouterError('native turn prompt must not be empty');
  if (!request.host?.trim() || !request.session_id?.trim() || !request.turn_id?.trim()) throw new NativeTurnRouterError('host, session_id and turn_id are required');
  const workspaceRoot = path.resolve(request.repo_root ?? request.cwd);
  const root = options.harnessRoot ? path.resolve(options.harnessRoot) : resolveHarnessRoot(workspaceRoot);
  if (!fs.existsSync(path.join(root, 'generated', 'context-graph.json'))) throw new NativeTurnRouterError(`native routing assets are missing: ${root}`);
  const generation = options.generation ?? 0;
  const promptHash = sha256(request.prompt);
  const key = nativeTurnIdempotencyKey(request, promptHash, generation);
  const repositoryFacts = collectRepositoryFacts(workspaceRoot, request.project_facts?.changed_files ?? []);
  const brokerRoute = createStandardCapabilityBroker(root).route({ prompt: request.prompt, requestedMode: request.requested_mode, explicitSkills: request.explicit?.skills, explicitProviders: request.explicit?.capability_providers, activeProjectScope: request.explicit?.active_project_scope ?? request.project_facts?.domain_pack, affectedScope: request.explicit?.affected_scope, repositoryFacts });
  const context = readSelectedSkills(root, brokerRoute.skills);
  const routeId = `RT-${key.slice(0, 24)}`;
  const capsule: RouteCapsule = {
    schema: 'agent-rules/route-capsule', version: 1, route_id: routeId, generation, idempotency_key: key, protocol_version: request.protocol_version,
    host: request.host, session_id: request.session_id, turn_id: request.turn_id, status: 'READY', model: { requested: selectedModel(request), observed: null },
    skills: brokerRoute.skills, integrations: integrations(brokerRoute), context: { estimated_tokens: context.estimatedTokens, rendered: context.rendered },
    proof: { selected: ['native-route-readback'], omitted: [] }, identity: { prompt_sha256: promptHash, context_sha256: sha256(context.rendered) },
    observed: { routed_at: (options.now ?? (() => new Date()))().toISOString(), router_version: NATIVE_TURN_ROUTER_VERSION },
  };
  return { capsule, brokerRoute };
}
