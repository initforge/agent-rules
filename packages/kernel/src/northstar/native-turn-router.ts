import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NORTH_STAR_PROTOCOL_VERSION, type TaskPacket, type WorkRequest, type WorkSpec } from './protocol.js';
import { compileContext } from './context.js';
import { createWorkRequest, compileWorkSpec, compileTaskPackets } from './compiler.js';
import {
  createStandardCapabilityBroker,
  findBundledHarnessRoot,
  routeSkills,
  type SkillRoute,
  type RouteResult,
} from './routing.js';
import { RunStore } from './run-store.js';

/**
 * routeNativeTurn — THE canonical native turn router.
 *
 * Single entry that every host adapter with a pre-model seam must call before
 * the model turn. It reuses the exact managed-path components (WorkRequest →
 * compileWorkSpec → compileTaskPackets → CapabilityBroker.route →
 * compileContext, with the IntegrationRegistry surfaced through
 * createStandardCapabilityBroker) so native chat and `agent-rules run` cannot
 * diverge (AC-01). Host adapters contain zero semantic logic: they serialize a
 * NativeTurnRequest and surface the returned context.
 *
 * Semantics:
 * - One route per (host, session, turn, prompt hash, generation). Compaction,
 *   model retries and tool events reuse the capsule (REQ-003).
 * - Raw prompt lives only in the canonical WorkRequest; every external
 *   receipt carries hashes, never the prompt text (REQ-004).
 * - Capsule materializes bounded context via compileContext; the host injects
 *   the rendered block before the model call (REQ-006 point 4).
 */

export const NATIVE_TURN_ROUTER_VERSION = '1.0.0';

export type RouteStatus =
  | 'PASS'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'PRE-EXISTING'
  | 'NEEDS_USER';

export interface NativeTurnRequest {
  protocol_version: string;
  host: string;
  session_id: string;
  turn_id: string;
  cwd: string;
  prompt: string;
  host_facts: {
    client?: string;
    environment?: string;
    profile?: string | null;
    provider?: string | null;
    model?: string | NativeTurnModelRef | null;
  };
  /** Explicit skill/provider selection supplied by the host; never inferred. */
  explicit?: {
    skills?: string[];
    capability_providers?: string[];
    active_project_scope?: string | null;
  };
  /** Structured authorization; default: no effectful rights. */
  authorization?: {
    task_scope_approved?: boolean;
    owner_approved?: boolean;
  };
  /** Target repo for routing/workspace facts; defaults to cwd. */
  repo_root?: string;
}

export interface NativeTurnModelRef {
  provider: string;
  model_id: string;
}

export interface RouteCapsuleSkill {
  id: string;
  role?: string;
  primary: boolean;
  reason: string;
  source?: string;
  source_hash?: string;
  graph_hash?: string;
}

export interface RouteCapsuleIntegration {
  capability: string;
  provider: string | null;
  mode?: string;
  effect_level?: string;
  suppressed_reason?: string;
}

export interface RouteCapsuleProof {
  selected: string[];
  omitted: Array<{ proof: string; reason: string }>;
}

export interface RouteCapsuleContextItem {
  kind: string;
  source: string;
  priority: number;
  sha256: string;
}

export interface RouteCapsule {
  schema: 'agent-rules/route-capsule';
  version: 1;
  route_id: string;
  generation: number;
  idempotency_key: string;
  protocol_version: string;
  host: string;
  session_id: string;
  turn_id: string;
  status: RouteStatus;
  hashes: {
    prompt: string;
    workspace: string;
    graph: string;
    registry: string;
    context: string;
  };
  skills: RouteCapsuleSkill[];
  integrations: RouteCapsuleIntegration[];
  context: {
    items: RouteCapsuleContextItem[];
    estimated_tokens: number;
    /** Rendered pre-model block; host injects verbatim, no local edits. */
    rendered: string;
  };
  proof: RouteCapsuleProof;
  work_packet: {
    work_id: string;
    spec_id: string;
    spec_revision: number;
    task_id: string;
    prompt_sha256: string;
  };
  observed: {
    routed_at: string;
    router_version: string;
  };
}

export class NativeTurnRouterError extends Error {
  readonly status: RouteStatus;
  constructor(message: string, status: RouteStatus = 'BLOCKED') {
    super(message);
    this.name = 'NativeTurnRouterError';
    this.status = status;
  }
}

export function nativeTurnIdempotencyKey(request: NativeTurnRequest, promptHash: string, generation: number): string {
  return createHash('sha256')
    .update([request.host, request.session_id, request.turn_id, promptHash, String(generation)].join('\u0000'))
    .digest('hex');
}

export interface NativeTurnRouteOptions {
  /** RunStore root; when set, a hash-only route receipt is persisted. */
  runsRoot?: string;
  generation?: number;
  now?: () => Date;
}

export interface RoutedTurn {
  capsule: RouteCapsule;
  brokerRoute: RouteResult;
}


/**
 * Route one native model turn. Deterministic in every input; the same request
 * routed twice yields the same selections and hashes (receipt route_id is the
 * stable idempotency identity, not a random one).
 */
export function routeNativeTurn(request: NativeTurnRequest, options: NativeTurnRouteOptions = {}): RoutedTurn {
  const prompt = request.prompt?.trim();
  if (!prompt) throw new NativeTurnRouterError('native turn prompt must not be empty');
  if (!request.host?.trim()) throw new NativeTurnRouterError('native turn request requires host');
  if (!request.session_id?.trim()) throw new NativeTurnRouterError('native turn request requires session_id');
  if (!request.turn_id?.trim()) throw new NativeTurnRouterError('native turn request requires turn_id');

  const repoRoot = path.resolve(request.repo_root ?? request.cwd);
  const generation = options.generation ?? 0;
  const promptHash = createHash('sha256').update(request.prompt, 'utf8').digest('hex');
  const idempotencyKey = nativeTurnIdempotencyKey(request, promptHash, generation);
  const routeId = `RT-${idempotencyKey.slice(0, 24)}`;

  // Canonical managed-path compilation. The prompt is the raw intent; the
  // risk classification and spec compilation are the exact ones `agent-rules
  // run` performs.
  const workRequest: WorkRequest = createWorkRequest({
    raw_intent: prompt,
    source: 'other',
    work_id: `W-${idempotencyKey.slice(0, 20)}`,
  });
  // Native chat routes context only; execution stays with the host model.
  // One explicit S0 requirement/claim keeps the packet compilable without a
  // strong planner — the goal text stays verbatim, nothing semantic is added.
  const compiled = compileWorkSpec(workRequest, {
    risk_class: 'S0',
    requirements: [{
      statement: prompt,
      claims: [{ statement: prompt, class: 'mechanical', verifier_id: 'V-native-turn' }],
    }],
  });
  const [packet]: TaskPacket[] = compileTaskPackets(compiled, [{
    goal: prompt,
    requirement_ids: ['R-001'],
    claim_ids: ['C-001a'],
    owned: ['.'],
    ...(request.explicit?.skills?.length ? { skills: request.explicit.skills } : {}),
    verifier_by_claim: { 'C-001a': 'V-native-turn' },
  }]);

  // Exact managed-path resolver surface: routeSkills is the canonical
  // SkillResolver consulting the generated context graph; CapabilityBroker
  // manages capability and MCP lifecycle/gating.
  const harnessRoot = resolveAgentRulesRoot();
  const skillOptions = {
    ...(request.explicit?.active_project_scope ? { activeProjectScope: request.explicit.active_project_scope } : {}),
    taskScopeApproved: request.authorization?.task_scope_approved,
    ownerApproved: request.authorization?.owner_approved,
  };
  const routedSkills = routeSkills(packet, harnessRoot, skillOptions);
  const broker = createStandardCapabilityBroker(harnessRoot);
  const explicitProviders = request.explicit?.capability_providers ?? [];
  const routed = broker.route(packet, explicitProviders, skillOptions);

  // Materialize the bounded pre-model context from the routed selections.
  const ctx = compileContext(packet, compiled.spec, compiled.manifest, {
    repoRoot,
    skillRoot: harnessRoot,
    skills: routedSkills,
    tokenBudget: 8_000,
  });

  const contextItems = ctx.items.map((item) => ({
    kind: item.kind,
    source: item.source,
    priority: item.priority,
    sha256: createHash('sha256').update(item.content, 'utf8').digest('hex'),
  }));
  const contextHash = createHash('sha256')
    .update(contextItems.map((item) => `${item.kind}\u0000${item.source}\u0000${item.sha256}`).join('\n'))
    .digest('hex');
  const registryHash = createHash('sha256')
    .update(JSON.stringify(broker.manifest(`CAP-${routeId}`)))
    .digest('hex');

  const capsule: RouteCapsule = {
    schema: 'agent-rules/route-capsule',
    version: 1,
    route_id: routeId,
    generation,
    idempotency_key: idempotencyKey,
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    host: request.host,
    session_id: request.session_id,
    turn_id: request.turn_id,
    status: 'PASS',
    hashes: {
      prompt: promptHash,
      workspace: createHash('sha256').update(path.resolve(repoRoot)).digest('hex'),
      graph: contextGraphHash(harnessRoot),
      registry: registryHash,
      context: contextHash,
    },
    skills: routedSkills.map(toCapsuleSkill),
    integrations: toCapsuleIntegrations(routed),
    context: {
      items: contextItems,
      estimated_tokens: ctx.estimated_tokens,
      rendered: renderCapsuleContext(routeId, ctx.items),
    },
    proof: {
      selected: ['route-capsule.materialized', 'route-parity.managed-vs-native'],
      omitted: [],
    },
    work_packet: {
      work_id: workRequest.work_id,
      spec_id: compiled.spec.spec_id,
      spec_revision: compiled.spec.revision,
      task_id: packet.task_id,
      prompt_sha256: promptHash,
    },
    observed: {
      routed_at: (options.now ?? defaultNow)().toISOString(),
      router_version: NATIVE_TURN_ROUTER_VERSION,
    },
  };

  if (options.runsRoot) writeRouteReceipt(options.runsRoot, capsule);
  return { capsule, brokerRoute: routed };
}

function toCapsuleSkill(skill: SkillRoute): RouteCapsuleSkill {
  return {
    id: skill.id,
    primary: skill.primary,
    ...(skill.role ? { role: skill.role } : {}),
    reason: skill.reason,
    ...(skill.source ? { source: skill.source } : {}),
    ...(skill.source_hash ? { source_hash: skill.source_hash } : {}),
    ...(skill.graph_hash ? { graph_hash: skill.graph_hash } : {}),
  };
}

/** Resolve the agent-rules checkout root that owns the generated context graph. */
function resolveAgentRulesRoot(): string {
  let current = path.resolve(process.cwd());
  while (current) {
    if (fs.existsSync(path.join(current, 'generated', 'context-graph.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const bundled = findBundledHarnessRoot();
  if (bundled) return bundled;
  return path.resolve(process.cwd());
}

function toCapsuleIntegrations(routed: { providers: Record<string, string | null>; suppressed: Array<{ id: string; reason: string }> }): RouteCapsuleIntegration[] {
  const integrations: RouteCapsuleIntegration[] = [];
  for (const [capability, provider] of Object.entries(routed.providers)) {
    integrations.push({ capability, provider });
  }
  for (const entry of routed.suppressed) {
    integrations.push({ capability: entry.id, provider: null, suppressed_reason: entry.reason });
  }
  return integrations;
}

interface CompiledContextItemLike {
  kind: string;
  source: string;
  content: string;
  priority: number;
}

/** Render the deterministic pre-model block the host must inject verbatim. */
function renderCapsuleContext(routeId: string, items: readonly CompiledContextItemLike[]): string {
  const lines: string[] = [
    `# agent-rules native turn routing (route_id: ${routeId})`,
    '',
    'Selections below were made by the canonical router before this model turn.',
    'Treat them as the task delta; the host already loaded the base rules natively.',
    '',
  ];
  for (const item of items) {
    lines.push(`## [${item.kind}] ${item.source} (priority ${item.priority})`);
    lines.push(item.content);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The canonical context-graph file hash. Recorded even with no skill match so
 * stale-graph detection has a stable value for every capsule.
 */
function contextGraphHash(harnessRoot: string): string {
  const file = path.join(harnessRoot, 'generated', 'context-graph.json');
  if (!fs.existsSync(file)) return '';
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function defaultNow(): Date {
  return new Date();
}

/** Persist a hash-only receipt through the single artifact writer (REQ-004). */
function writeRouteReceipt(runsRoot: string, capsule: RouteCapsule): void {
  const store = new RunStore(runsRoot);
  const receipt = {
    route_id: capsule.route_id,
    idempotency_key: capsule.idempotency_key,
    host: capsule.host,
    session_id: capsule.session_id,
    turn_id: capsule.turn_id,
    generation: capsule.generation,
    status: capsule.status,
    hashes: capsule.hashes,
    skills: capsule.skills.map((skill) => ({ id: skill.id, source_hash: skill.source_hash ?? null })),
    prompt_sha256: capsule.work_packet.prompt_sha256,
    routed_at: capsule.observed.routed_at,
  };
  store.putState(`route-${capsule.route_id}`, receipt);
}
