import { createHash, randomUUID } from 'node:crypto';
import { EVIDENCE_STAGES, type EvidenceStage } from '../claim-registry.js';

const EVIDENCE_STAGES_VALUES: readonly string[] = EVIDENCE_STAGES;

export const NORTH_STAR_PROTOCOL_VERSION = '2.0' as const;

export type WorkSource = 'cli' | 'issue' | 'pr' | 'ci' | 'webhook' | 'schedule' | 'plan' | 'other';
export type WorkAdapter = 'conversation' | 'command' | 'cli' | 'api' | 'native_host';
export type RiskClass = 'S0' | 'S1' | 'S2' | 'S3';
export type RunStatus = 'ready' | 'running' | 'blocked' | 'failed' | 'passed' | 'partial';
export type TaskStatus = 'ready' | 'active' | 'done' | 'failed' | 'blocked' | 'superseded';
export type TaskPhase = 'research' | 'design' | 'implement' | 'verify' | 'review' | 'release' | 'operate';
export type EvidenceKind = 'static' | 'test' | 'integration' | 'api' | 'browser' | 'visual' | 'mobile' | 'security' | 'scope' | 'semantic' | 'other';
export type EvidenceStatus = 'pass' | 'fail' | 'blocked';


export interface CapabilityManifestProvider {
  id: string;
  capability: string;
  mode: 'builtin' | 'cli' | 'mcp' | 'host';
  explicit_only?: boolean;
  required?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CapabilityManifest {
  protocol_version: string;
  manifest_id: string;
  providers: CapabilityManifestProvider[];
}

export interface WorkRequest {
  protocol_version: string;
  work_id: string;
  raw_intent: string;
  source: WorkSource;
  /** Optional host adapter identity that compiled this request (S1 entrypoint contract). */
  adapter?: WorkAdapter;
  explicit_constraints?: string[];
  explicit_non_goals?: string[];
  reference_inputs?: string[];
  risk_hint?: RiskClass;
  /**
   * Append-only effective-intent events. `raw_intent` remains the immutable
   * raw source; these events record how later exchanges amended it
   * (ADD/CORRECT/CONFIRM/REJECT/SUPERSEDE). Consumers must never mutate the
   * array in place: derivation appends via `appendIntentEvent`.
   */
  intent_events?: IntentEvent[];
}

/**
 * Effective-intent event kinds. The request's raw intent is never rewritten;
 * effective meaning is the ordered application of these events.
 */
export type IntentEventKind = 'ADD' | 'CORRECT' | 'CONFIRM' | 'REJECT' | 'SUPERSEDE';

export interface IntentEvent {
  /** Stable event id (e.g. `IE-<sha256[0:12]>`). */
  id: string;
  kind: IntentEventKind;
  /** Subject of the event: requirement/constraint/decision/non-goal/assumption statement or id. */
  subject: string;
  /** Provenance of the event (who/what produced it, e.g. `operator`, `planner`, `reviewer`). */
  provenance: string;
  rationale?: string;
  /** Reference sources backing this event (paths/URLs/ids). */
  references?: string[];
  /** Id of the event (or item) this event corrects/rejects/supersedes. */
  replaces?: string;
  /** ISO timestamp of the event. */
  at?: string;
}


/**
 * Provider-neutral entrypoint that normal prompts, optional slash commands,
 * CLI/API calls, and native host actions compile into. The semantic payload
 * (intent + constraints + non-goals + references + risk) is adapter-neutral;
 * only `adapter` records which host surface produced it.
 */
export interface WorkRequestEntrypoint {
  adapter: WorkAdapter;
  intent: string;
  plan_id?: string;
  explicit_constraints?: string[];
  explicit_non_goals?: string[];
  reference_inputs?: string[];
  risk_hint?: RiskClass;
  source_id?: string;
}

export interface EntrypointParityReceipt {
  schema: 'harness/entrypoint-parity-receipt';
  version: 1;
  adapter: WorkAdapter;
  work_id: string;
  plan_id?: string;
  /** Adapter-neutral semantic fingerprint of the compiled payload. */
  semantic_sha256: string;
  request: WorkRequest;
  receipt_sha256: string;
}

export interface WorkSpecRequirement {
  id: string;
  statement: string;
  mandatory: boolean;
  claims: string[];
  /** Effective-state status; legacy entries without it are ACTIVE. */
  status?: WorkItemStatus;
  /** Id of the requirement/item that replaced this one (when SUPERSEDED). */
  replaced_by?: string;
}

/**
 * Machine-checkable item status in the effective WorkSpec. REJECTED/SUPERSEDED
 * items are never executed; UNRESOLVED items block execution until resolved.
 */
export type WorkItemStatus = 'ACTIVE' | 'REJECTED' | 'SUPERSEDED' | 'UNRESOLVED';

export type WorkItemKind = 'requirement' | 'constraint' | 'non_goal' | 'decision' | 'assumption' | 'unresolved' | 'reference';

/**
 * One effective-state item of the WorkSpec. Canonical truth is this structured
 * form (and the legacy string arrays for backward compatibility); Markdown or
 * projections are never parsed back into canonical truth.
 */
export interface WorkSpecItem {
  id: string;
  kind: WorkItemKind;
  statement: string;
  status: WorkItemStatus;
  rationale?: string;
  replaced_by?: string;
  references?: string[];
}

/** Manifest-bound reference used by the work; not copied into the project. */
export interface WorkReference {
  /** Manifest-bound path inside the harness/bundled source. */
  path: string;
  anchor?: string;
  sha256?: string;
  /** Components/behaviors this reference actually supports. */
  used_by?: string[];
}

export interface WorkSpecImpact {
  owning_modules: string[];
  dependency_breadth: string;
  public_api: string[];
  schema_data: string[];
  security_boundaries: string[];
  reference_dependencies: string[];
  relevant_tests: string[];
  active_decisions: string[];
}

export interface WorkSpec {
  protocol_version: string;
  spec_id: string;
  revision: number;
  work_id: string;
  requirements: WorkSpecRequirement[];
  constraints?: string[];
  non_goals?: string[];
  known?: string[];
  assumed?: string[];
  decisions?: string[];
  unresolved?: string[];
  requires_user?: string[];
  /**
   * Machine-checkable effective state for non-requirement categories. Legacy
   * string arrays remain readable and normalize into ACTIVE items; items here
   * carry the authoritative status.
   */
  items?: WorkSpecItem[];
  /** Manifest-bound references sufficient for a worker; never guess-again. */
  references?: WorkReference[];
  impact?: WorkSpecImpact;
  risk_class?: RiskClass;
  /** Generation captured when this spec is bound to current owner work. */
  execution_generation?: number;
}


export interface TaskPacket {
  protocol_version: string;
  task_id: string;
  spec_id: string;
  spec_revision: number;
  /** Redundant by design: executable packets must carry their owner identity. */
  work_id?: string;
  execution_generation?: number;
  /** Explicit planner output; routing must not infer a phase from keywords alone. */
  phase?: TaskPhase;
  goal: string;
  requirements: string[];
  scope: {
    owned: string[];
    forbidden: string[];
  };
  context?: {
    entrypoints?: string[];
    symbols?: string[];
    decisions?: string[];
    references?: string[];
  };
  constraints?: string[];
  acceptance: Array<{
    claim_id: string;
    verifier_id?: string | null;
  }>;
  skills?: string[];
  capabilities?: string[];
  stop_if?: string[];
  repair?: {
    attempt?: number;
    previous_failure?: string | null;
  };
  /** Machine-checkable execution policy (North-Star vNext). */
  policy?: TaskExecutionPolicy;
}

/**
 * Execution phases (policy-bound). Distinct from the legacy planner `phase`
 * vocabulary: policy.phase is the machine-checkable execution stage.
 */
export type ExecutionPhase = 'DISCOVER' | 'PLAN' | 'IMPLEMENT' | 'VERIFY' | 'REPAIR' | 'CLOSE';

/** Effect categories the execution policy can allow/forbid per task. */
export type EffectKind = 'read' | 'filesystem_mutation' | 'command_execution' | 'network' | 'mcp' | 'external_write' | 'destructive';

export interface TaskNetworkPolicy {
  /** Remote MCPs may only be reached inside a task that routed them. */
  require_routed_mcp_only?: boolean;
  forbidden_hosts?: string[];
}

export interface TaskEffectPolicy {
  allowed: EffectKind[];
  forbidden: EffectKind[];
  /** Integration ids the task may activate (task-scoped MCP set). */
  mcp_integration_ids?: string[];
  network?: TaskNetworkPolicy;
}

export interface TaskBudgets {
  wall_clock_ms?: number;
  max_steps?: number;
  max_tool_calls?: number;
  max_retries?: number;
  max_repair_rounds?: number;
  max_cost_usd?: number;
}

export interface TaskConcurrencyPolicy {
  /** True: no other mutating task may overlap this one. */
  exclusive?: boolean;
  /** True: shared mutations must be serialized with other tasks. */
  shared_mutation_serialized?: boolean;
}

export interface TaskExecutionPolicy {
  phase: ExecutionPhase;
  effects: TaskEffectPolicy;
  /** Allowed capability ids (subset the broker may route for this task). */
  capabilities?: string[];
  resources?: {
    memory_mb?: number;
    cpu_share?: number;
  };
  budgets?: TaskBudgets;
  concurrency?: TaskConcurrencyPolicy;
  proof?: {
    /** Proof categories that must be recorded for this task (evidence A-K ids). */
    required_categories?: string[];
  };
  recovery?: {
    resume_allowed?: boolean;
    restartable?: boolean;
    checkpoint_interval_ms?: number;
  };
  /** Machine-checkable stop conditions (in addition to stop_if prose). */
  stop_conditions?: string[];
  requires_strong_planner?: boolean;
  requires_strong_reviewer?: boolean;
}


export interface RunState {
  protocol_version: string;
  run_id: string;
  spec_id: string;
  spec_revision: number;
  work_id?: string;
  execution_generation?: number;
  status: RunStatus;
  tasks: Record<string, TaskStatus>;
  current_task?: string | null;
  checkpoint?: string | null;
  unresolved_claims?: string[];
}

export interface EvidenceCommand {
  executable: string;
  args: string[];
  timeout_ms?: number;
}

export interface EvidenceRecord {
  protocol_version: string;
  evidence_id: string;
  claim_id: string;
  task_id: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  command?: EvidenceCommand | null;
  summary?: string;
  artifact_path?: string | null;
  sha256?: string | null;
  observed_at?: string;
  work_id?: string;
  execution_generation?: number;
  /** Runtime binding used to reject stale or foreign proof during acceptance. */
  spec_id?: string;
  spec_revision?: number;
  candidate_epoch?: number;
  platform?: string;
  /** Identity of the concrete verifier that produced this observation. */
  verifier_id?: string;
  /** Independent oracle lineage. Multiple verifiers in the same group count as one channel. */
  oracle_group?: string;
  /** AM-0005: evidence stage this observation actually reached. Test-only observations are TEST_VERIFIED and never satisfy live/dogfood claims. */
  evidence_stage?: EvidenceStage;
}

export interface TraceabilityProblem {
  code:
    | 'ORPHAN_REQUIREMENT'
    | 'UNKNOWN_REQUIREMENT'
    | 'UNKNOWN_CLAIM'
    | 'UNROUTED_CLAIM'
    | 'TASK_WITHOUT_REQUIREMENT'
    | 'DUPLICATE_REQUIREMENT'
    | 'DUPLICATE_CLAIM'
    | 'DUPLICATE_TASK';
  id: string;
  message: string;
}

export interface TraceabilityResult {
  valid: boolean;
  problems: TraceabilityProblem[];
  requirement_to_tasks: Record<string, string[]>;
  claim_to_tasks: Record<string, string[]>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function assertStringArray(value: unknown, field: string, options: { min?: number; pattern?: RegExp } = {}): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  if ((options.min ?? 0) > value.length) throw new Error(`${field} must contain at least ${options.min} item(s)`);
  if (options.pattern) {
    const invalid = value.find((item) => !options.pattern!.test(item));
    if (invalid !== undefined) throw new Error(`${field} contains invalid id: ${invalid}`);
  }
}

function assertNoExtraKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const set = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !set.has(key));
  if (extras.length > 0) throw new Error(`${field} contains unknown field(s): ${extras.join(', ')}`);
}


export function assertCapabilityManifest(value: unknown): asserts value is CapabilityManifest {
  if (!isObject(value)) throw new Error('CapabilityManifest must be an object');
  assertNoExtraKeys(value, ['protocol_version', 'manifest_id', 'providers'], 'CapabilityManifest');
  asString(value.protocol_version, 'CapabilityManifest.protocol_version');
  asString(value.manifest_id, 'CapabilityManifest.manifest_id');
  if (!Array.isArray(value.providers)) throw new Error('CapabilityManifest.providers must be an array');
  const keys = new Set<string>();
  for (const [index, provider] of value.providers.entries()) {
    if (!isObject(provider)) throw new Error(`CapabilityManifest.providers[${index}] must be an object`);
    assertNoExtraKeys(provider, ['id', 'capability', 'mode', 'explicit_only', 'required', 'metadata'], `CapabilityManifest.providers[${index}]`);
    const id = asString(provider.id, `CapabilityManifest.providers[${index}].id`);
    const capability = asString(provider.capability, `CapabilityManifest.providers[${index}].capability`);
    if (!['builtin', 'cli', 'mcp', 'host'].includes(String(provider.mode))) throw new Error(`CapabilityManifest.providers[${index}].mode is invalid`);
    if (provider.explicit_only !== undefined && typeof provider.explicit_only !== 'boolean') throw new Error(`CapabilityManifest.providers[${index}].explicit_only must be boolean`);
    if (provider.required !== undefined && typeof provider.required !== 'boolean') throw new Error(`CapabilityManifest.providers[${index}].required must be boolean`);
    if (provider.metadata !== undefined && !isObject(provider.metadata)) throw new Error(`CapabilityManifest.providers[${index}].metadata must be object`);
    const key = `${id}\u0000${capability}`;
    if (keys.has(key)) throw new Error(`CapabilityManifest duplicate provider/capability: ${id}/${capability}`);
    keys.add(key);
  }
}

export function assertWorkRequest(value: unknown): asserts value is WorkRequest {
  if (!isObject(value)) throw new Error('WorkRequest must be an object');
  assertNoExtraKeys(value, [
    'protocol_version', 'work_id', 'raw_intent', 'source', 'adapter', 'explicit_constraints', 'explicit_non_goals', 'reference_inputs', 'risk_hint', 'intent_events',
  ], 'WorkRequest');
  asString(value.protocol_version, 'WorkRequest.protocol_version');
  asString(value.work_id, 'WorkRequest.work_id');
  asString(value.raw_intent, 'WorkRequest.raw_intent');
  if (!['cli', 'issue', 'pr', 'ci', 'webhook', 'schedule', 'plan', 'other'].includes(String(value.source))) {
    throw new Error(`WorkRequest.source is invalid: ${String(value.source)}`);
  }
  if (value.adapter !== undefined && !['conversation', 'command', 'cli', 'api', 'native_host'].includes(String(value.adapter))) {
    throw new Error(`WorkRequest.adapter is invalid: ${String(value.adapter)}`);
  }
  if (value.explicit_constraints !== undefined) assertStringArray(value.explicit_constraints, 'WorkRequest.explicit_constraints');
  if (value.explicit_non_goals !== undefined) assertStringArray(value.explicit_non_goals, 'WorkRequest.explicit_non_goals');
  if (value.reference_inputs !== undefined) assertStringArray(value.reference_inputs, 'WorkRequest.reference_inputs');
  if (value.risk_hint !== undefined && !['S0', 'S1', 'S2', 'S3'].includes(String(value.risk_hint))) {
    throw new Error(`WorkRequest.risk_hint is invalid: ${String(value.risk_hint)}`);
  }
  if (value.intent_events !== undefined) {
    if (!Array.isArray(value.intent_events)) throw new Error('WorkRequest.intent_events must be an array');
    const seen = new Set<string>();
    for (const [index, event] of value.intent_events.entries()) {
      assertIntentEvent(event, `WorkRequest.intent_events[${index}]`);
      const id = (event as unknown as Record<string, unknown>).id as string;
      if (seen.has(id)) throw new Error(`WorkRequest.intent_events contains duplicate event id ${id}`);
      seen.add(id);
    }
  }
}

function assertIntentEvent(value: unknown, field: string): asserts value is IntentEvent {
  if (!isObject(value)) throw new Error(`${field} must be an object`);
  assertNoExtraKeys(value, ['id', 'kind', 'subject', 'provenance', 'rationale', 'references', 'replaces', 'at'], field);
  asString(value.id, `${field}.id`);
  if (!['ADD', 'CORRECT', 'CONFIRM', 'REJECT', 'SUPERSEDE'].includes(String(value.kind))) {
    throw new Error(`${field}.kind is invalid: ${String(value.kind)}`);
  }
  asString(value.subject, `${field}.subject`);
  asString(value.provenance, `${field}.provenance`);
  if (value.rationale !== undefined) asString(value.rationale, `${field}.rationale`);
  if (value.references !== undefined) assertStringArray(value.references, `${field}.references`);
  if (value.replaces !== undefined) asString(value.replaces, `${field}.replaces`);
  if (value.at !== undefined) asString(value.at, `${field}.at`);
}

/**
 * Append one intent event to the append-only event chain. Returns a new
 * WorkRequest (never mutates the input). An event without an id gets a
 * deterministic `IE-` id derived from its content.
 */
export function appendIntentEvent(request: WorkRequest, event: Omit<IntentEvent, 'id' | 'at'> & { id?: string; at?: string }): WorkRequest {
  assertWorkRequest(request);
  const stamped: IntentEvent = {
    ...event,
    id: event.id ?? newId('IE', stableStringify(event)),
    at: event.at ?? new Date().toISOString(),
  };
  assertIntentEvent(stamped, 'IntentEvent');
  const next: WorkRequest = { ...request, intent_events: [...(request.intent_events ?? []), stamped] };
  assertWorkRequest(next);
  return next;
}

/** Plan relation when a new request arrives against the one active authority. */
export type ProtocolPlanRelation = 'CONTINUATION' | 'COMPATIBLE_AMENDMENT' | 'SUPERSESSION' | 'CONFLICT' | 'INDEPENDENT';

export function classifyProtocolPlanRelation(input: {
  activeObjectives: string[];
  incomingObjective: string;
  activeRequirementIds: string[];
  incomingRequirementIds: string[];
  activeConstraints: string[];
  incomingConstraints: string[];
}): ProtocolPlanRelation {
  const { activeObjectives, incomingObjective, activeRequirementIds, incomingRequirementIds, activeConstraints, incomingConstraints } = input;
  const sameObjective = activeObjectives.some((o) => incomingObjective.includes(o) || o.includes(incomingObjective));
  const requirementOverlap = incomingRequirementIds.filter((id) => activeRequirementIds.includes(id)).length;
  const constraintConflict = incomingConstraints.some((c) => activeConstraints.includes(c) && incomingConstraints.some((ic) => ic.includes(c) && ic !== c));
  if (constraintConflict) return 'CONFLICT';
  if (incomingRequirementIds.every((id) => activeRequirementIds.includes(id)) && requirementOverlap === incomingRequirementIds.length) return 'CONTINUATION';
  if (sameObjective && requirementOverlap > 0) return 'COMPATIBLE_AMENDMENT';
  if (!sameObjective && incomingRequirementIds.every((id) => !activeRequirementIds.includes(id)) && activeRequirementIds.length > 0) return 'SUPERSESSION';
  return 'INDEPENDENT';
}

/**
 * Apply the append-only intent event chain to a WorkSpec. ADD events require
 * new items to be appended; CORRECT events supersede the replaced item;
 * REJECT events mark the subject as REJECTED; SUPERSEDE events mark the
 * replaced item SUPERSEDED and add the new one as ACTIVE. This is the only
 * place intent_events produce effective state — Markdown is never parsed.
 */
export function applyIntentEventsToSpec(spec: WorkSpec, request: WorkRequest): WorkSpec {
  assertWorkSpec(spec);
  assertWorkRequest(request);
  const events = request.intent_events ?? [];
  if (events.length === 0) return spec;
  const next: WorkSpec = { ...spec, items: [...(spec.items ?? [])] };
  const itemById = new Map<string, WorkSpecItem>();
  for (const item of next.items ?? []) itemById.set(item.id, item);
  for (const event of events) {
    if (event.kind === 'REJECT') {
      const existing = itemById.get(event.subject) ?? (spec.requirements.find((r) => r.id === event.subject) ? { id: event.subject, kind: 'requirement' as const, statement: event.subject, status: 'ACTIVE' as const } : null);
      if (existing) {
        const idx = next.items!.findIndex((i) => i.id === existing.id);
        const updated: WorkSpecItem = { ...existing, status: 'REJECTED' as const, rationale: event.rationale ?? event.subject };
        if (idx >= 0) next.items![idx] = updated;
        else next.items!.push(updated);
        itemById.set(existing.id, updated);
      }
    } else if (event.kind === 'SUPERSEDE' && event.replaces) {
      const replaced = itemById.get(event.replaces) ?? (spec.requirements.find((r) => r.id === event.replaces) ? { id: event.replaces, kind: 'requirement' as const, statement: spec.requirements.find((r) => r.id === event.replaces)!.statement, status: 'ACTIVE' as const } : null);
      if (replaced) {
        const idx = next.items!.findIndex((i) => i.id === event.replaces);
        const superseded: WorkSpecItem = { ...replaced, status: 'SUPERSEDED' as const, replaced_by: event.subject };
        if (idx >= 0) next.items![idx] = superseded;
        else next.items!.push(superseded);
        itemById.set(event.replaces, superseded);
      }
      const newItem: WorkSpecItem = { id: event.subject, kind: 'requirement', statement: event.subject, status: 'ACTIVE', rationale: event.rationale };
      if (!itemById.has(event.subject)) {
        next.items!.push(newItem);
        itemById.set(event.subject, newItem);
      }
    } else if (event.kind === 'CORRECT' && event.replaces) {
      const replaced = itemById.get(event.replaces);
      if (replaced) {
        const idx = next.items!.findIndex((i) => i.id === event.replaces);
        const corrected: WorkSpecItem = { ...replaced, status: 'SUPERSEDED' as const, replaced_by: event.subject };
        if (idx >= 0) next.items![idx] = corrected;
        itemById.set(event.replaces, corrected);
      }
    }
  }
  assertWorkSpec(next);
  return next;
}


export function assertWorkSpec(value: unknown): asserts value is WorkSpec {
  if (!isObject(value)) throw new Error('WorkSpec must be an object');
  assertNoExtraKeys(value, [
    'protocol_version', 'spec_id', 'revision', 'work_id', 'requirements', 'constraints', 'non_goals', 'known', 'assumed', 'decisions', 'unresolved', 'requires_user', 'items', 'references', 'impact', 'risk_class', 'execution_generation',
  ], 'WorkSpec');
  asString(value.protocol_version, 'WorkSpec.protocol_version');
  asString(value.spec_id, 'WorkSpec.spec_id');
  asString(value.work_id, 'WorkSpec.work_id');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) throw new Error('WorkSpec.revision must be an integer >= 1');
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) throw new Error('WorkSpec.requirements must be non-empty');
  for (const [index, requirement] of value.requirements.entries()) {
    if (!isObject(requirement)) throw new Error(`WorkSpec.requirements[${index}] must be an object`);
    assertNoExtraKeys(requirement, ['id', 'statement', 'mandatory', 'claims', 'status', 'replaced_by'], `WorkSpec.requirements[${index}]`);
    const id = asString(requirement.id, `WorkSpec.requirements[${index}].id`);
    if (!/^R-/.test(id)) throw new Error(`WorkSpec.requirements[${index}].id must start with R-`);
    asString(requirement.statement, `WorkSpec.requirements[${index}].statement`);
    if (typeof requirement.mandatory !== 'boolean') throw new Error(`WorkSpec.requirements[${index}].mandatory must be boolean`);
    assertStringArray(requirement.claims, `WorkSpec.requirements[${index}].claims`, { pattern: /^C-/ });
    if (requirement.status !== undefined && !['ACTIVE', 'REJECTED', 'SUPERSEDED', 'UNRESOLVED'].includes(String(requirement.status))) {
      throw new Error(`WorkSpec.requirements[${index}].status is invalid: ${String(requirement.status)}`);
    }
    if (requirement.replaced_by !== undefined) asString(requirement.replaced_by, `WorkSpec.requirements[${index}].replaced_by`);
  }
  if (value.constraints !== undefined) assertStringArray(value.constraints, 'WorkSpec.constraints');
  if (value.non_goals !== undefined) assertStringArray(value.non_goals, 'WorkSpec.non_goals');
  if (value.known !== undefined) assertStringArray(value.known, 'WorkSpec.known');
  if (value.assumed !== undefined) assertStringArray(value.assumed, 'WorkSpec.assumed');
  if (value.decisions !== undefined) assertStringArray(value.decisions, 'WorkSpec.decisions');
  if (value.unresolved !== undefined) assertStringArray(value.unresolved, 'WorkSpec.unresolved');
  if (value.requires_user !== undefined) assertStringArray(value.requires_user, 'WorkSpec.requires_user');
  if (value.items !== undefined) {
    if (!Array.isArray(value.items)) throw new Error('WorkSpec.items must be an array');
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      assertWorkSpecItem(item, `WorkSpec.items[${index}]`);
      const itemId = (item as unknown as Record<string, unknown>).id as string;
      if (seen.has(itemId)) throw new Error(`WorkSpec.items contains duplicate id ${itemId}`);
      seen.add(itemId);
    }
  }
  if (value.references !== undefined) {
    if (!Array.isArray(value.references)) throw new Error('WorkSpec.references must be an array');
    for (const [index, reference] of value.references.entries()) {
      if (!isObject(reference)) throw new Error(`WorkSpec.references[${index}] must be an object`);
      assertNoExtraKeys(reference, ['path', 'anchor', 'sha256', 'used_by'], `WorkSpec.references[${index}]`);
      asString(reference.path, `WorkSpec.references[${index}].path`);
      if (reference.anchor !== undefined) asString(reference.anchor, `WorkSpec.references[${index}].anchor`);
      if (reference.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(String(reference.sha256))) {
        throw new Error(`WorkSpec.references[${index}].sha256 must be a lowercase SHA-256`);
      }
      if (reference.used_by !== undefined) assertStringArray(reference.used_by, `WorkSpec.references[${index}].used_by`);
    }
  }
  if (value.impact !== undefined) {
    if (!isObject(value.impact)) throw new Error('WorkSpec.impact must be an object');
    assertNoExtraKeys(value.impact, ['owning_modules', 'dependency_breadth', 'public_api', 'schema_data', 'security_boundaries', 'reference_dependencies', 'relevant_tests', 'active_decisions'], 'WorkSpec.impact');
    assertStringArray(value.impact.owning_modules, 'WorkSpec.impact.owning_modules', { min: 1 });
    asString(value.impact.dependency_breadth, 'WorkSpec.impact.dependency_breadth');
    for (const key of ['public_api', 'schema_data', 'security_boundaries', 'reference_dependencies', 'relevant_tests', 'active_decisions'] as const) {
      assertStringArray(value.impact[key], `WorkSpec.impact.${key}`);
    }
  }
  if (value.risk_class !== undefined && !['S0', 'S1', 'S2', 'S3'].includes(String(value.risk_class))) {
    throw new Error(`WorkSpec.risk_class is invalid: ${String(value.risk_class)}`);
  }
  if (value.execution_generation !== undefined && (!Number.isSafeInteger(value.execution_generation) || Number(value.execution_generation) < 0)) throw new Error('WorkSpec.execution_generation must be an integer >= 0');
}

function assertWorkSpecItem(value: unknown, field: string): asserts value is WorkSpecItem {
  if (!isObject(value)) throw new Error(`${field} must be an object`);
  assertNoExtraKeys(value, ['id', 'kind', 'statement', 'status', 'rationale', 'replaced_by', 'references'], field);
  asString(value.id, `${field}.id`);
  if (!['requirement', 'constraint', 'non_goal', 'decision', 'assumption', 'unresolved', 'reference'].includes(String(value.kind))) {
    throw new Error(`${field}.kind is invalid: ${String(value.kind)}`);
  }
  asString(value.statement, `${field}.statement`);
  if (!['ACTIVE', 'REJECTED', 'SUPERSEDED', 'UNRESOLVED'].includes(String(value.status))) {
    throw new Error(`${field}.status is invalid: ${String(value.status)}`);
  }
  if (value.rationale !== undefined) asString(value.rationale, `${field}.rationale`);
  if (value.replaced_by !== undefined) asString(value.replaced_by, `${field}.replaced_by`);
  if (value.references !== undefined) assertStringArray(value.references, `${field}.references`);
}

const WORK_ITEM_KIND_TO_LEGACY: Readonly<Record<WorkItemKind, keyof WorkSpec>> = {
  constraint: 'constraints',
  non_goal: 'non_goals',
  decision: 'decisions',
  assumption: 'assumed',
  unresolved: 'unresolved',
  requirement: 'requirements',
  reference: 'references',
};

/**
 * Normalize the effective WorkSpec into one machine-checkable item list.
 * Legacy string arrays become ACTIVE items; structured `items` carry the
 * authoritative status. Never the reverse: Markdown/projections are not
 * parsed into canonical truth.
 */
export function effectiveSpecItems(spec: WorkSpec): WorkSpecItem[] {
  assertWorkSpec(spec);
  const byId = new Map<string, WorkSpecItem>();
  for (const item of spec.items ?? []) byId.set(item.id, item);
  const out: WorkSpecItem[] = [...(spec.items ?? [])];
  const pushLegacy = (kind: WorkItemKind, statements: string[] | undefined): void => {
    if (!statements) return;
    for (const statement of statements) {
      const exists = out.some((item) => item.kind === kind && item.statement === statement);
      if (!exists) out.push({ id: newId(kind === 'requirement' ? 'R' : 'I', `${kind}:${statement}`), kind, statement, status: 'ACTIVE' });
    }
  };
  pushLegacy('constraint', spec.constraints);
  pushLegacy('non_goal', spec.non_goals);
  pushLegacy('decision', spec.decisions);
  pushLegacy('assumption', spec.assumed);
  pushLegacy('unresolved', spec.unresolved);
  for (const requirement of spec.requirements) {
    if (!byId.has(requirement.id)) {
      out.push({ id: requirement.id, kind: 'requirement', statement: requirement.statement, status: requirement.status ?? 'ACTIVE', replaced_by: requirement.replaced_by });
    }
  }
  for (const reference of spec.references ?? []) {
    const statement = reference.anchor ? `${reference.path}#${reference.anchor}` : reference.path;
    const exists = out.some((item) => item.kind === 'reference' && item.statement === statement);
    if (!exists) out.push({ id: newId('I', `reference:${statement}`), kind: 'reference', statement, status: 'ACTIVE', references: [reference.path] });
  }
  return out;
}

/** Requirements that are currently ACTIVE (REJECTED/SUPERSEDED are never executed). */
export function activeRequirements(spec: WorkSpec): WorkSpecRequirement[] {
  assertWorkSpec(spec);
  return spec.requirements.filter((requirement) => (requirement.status ?? 'ACTIVE') === 'ACTIVE');
}

/**
 * Items that still block execution: legacy `unresolved`/`requires_user`
 * strings plus structured items with status UNRESOLVED (or rejected
 * requirements that carry claims still routed). Used by the runtime's
 * "cannot execute unresolved WorkSpec" gate.
 */
export function unresolvedItems(spec: WorkSpec): string[] {
  assertWorkSpec(spec);
  const out = [...(spec.unresolved ?? []), ...(spec.requires_user ?? [])];
  for (const item of spec.items ?? []) {
    if (item.status === 'UNRESOLVED' && !out.includes(item.statement)) out.push(item.statement);
  }
  for (const requirement of spec.requirements) {
    if ((requirement.status ?? 'ACTIVE') === 'UNRESOLVED') out.push(requirement.statement);
  }
  return out;
}

/** Fail-closed gate: a WorkSpec with unresolved items must not execute. */
export function assertSpecExecutable(spec: WorkSpec): void {
  const blockers = unresolvedItems(spec);
  if (blockers.length > 0) throw new Error(`cannot execute unresolved WorkSpec: ${blockers.join('; ')}`);
}


export function assertTaskPacket(value: unknown): asserts value is TaskPacket {
  if (!isObject(value)) throw new Error('TaskPacket must be an object');
  assertNoExtraKeys(value, [
    'protocol_version', 'task_id', 'spec_id', 'spec_revision', 'work_id', 'execution_generation', 'phase', 'goal', 'requirements', 'scope', 'context', 'constraints', 'acceptance', 'skills', 'capabilities', 'stop_if', 'repair', 'policy',
  ], 'TaskPacket');
  asString(value.protocol_version, 'TaskPacket.protocol_version');
  const taskId = asString(value.task_id, 'TaskPacket.task_id');
  if (!/^T-/.test(taskId)) throw new Error('TaskPacket.task_id must start with T-');
  asString(value.spec_id, 'TaskPacket.spec_id');
  if (!Number.isInteger(value.spec_revision) || Number(value.spec_revision) < 1) throw new Error('TaskPacket.spec_revision must be an integer >= 1');
  if (value.work_id !== undefined) asString(value.work_id, 'TaskPacket.work_id');
  if (value.execution_generation !== undefined && (!Number.isSafeInteger(value.execution_generation) || Number(value.execution_generation) < 0)) throw new Error('TaskPacket.execution_generation must be an integer >= 0');
  if (value.phase !== undefined && !['research', 'design', 'implement', 'verify', 'review', 'release', 'operate'].includes(String(value.phase))) throw new Error(`TaskPacket.phase is invalid: ${String(value.phase)}`);
  asString(value.goal, 'TaskPacket.goal');
  assertStringArray(value.requirements, 'TaskPacket.requirements', { min: 1, pattern: /^R-/ });
  if (!isObject(value.scope)) throw new Error('TaskPacket.scope must be an object');
  assertNoExtraKeys(value.scope, ['owned', 'forbidden'], 'TaskPacket.scope');
  assertStringArray(value.scope.owned, 'TaskPacket.scope.owned');
  assertStringArray(value.scope.forbidden, 'TaskPacket.scope.forbidden');
  if (!Array.isArray(value.acceptance) || value.acceptance.length === 0) throw new Error('TaskPacket.acceptance must be non-empty');
  for (const [index, acceptance] of value.acceptance.entries()) {
    if (!isObject(acceptance)) throw new Error(`TaskPacket.acceptance[${index}] must be an object`);
    assertNoExtraKeys(acceptance, ['claim_id', 'verifier_id'], `TaskPacket.acceptance[${index}]`);
    const claimId = asString(acceptance.claim_id, `TaskPacket.acceptance[${index}].claim_id`);
    if (!/^C-/.test(claimId)) throw new Error(`TaskPacket.acceptance[${index}].claim_id must start with C-`);
    if (acceptance.verifier_id !== undefined && acceptance.verifier_id !== null && typeof acceptance.verifier_id !== 'string') {
      throw new Error(`TaskPacket.acceptance[${index}].verifier_id must be string|null`);
    }
  }
  if (value.constraints !== undefined) assertStringArray(value.constraints, 'TaskPacket.constraints');
  if (value.skills !== undefined) assertStringArray(value.skills, 'TaskPacket.skills');
  if (value.capabilities !== undefined) assertStringArray(value.capabilities, 'TaskPacket.capabilities');
  if (value.stop_if !== undefined) assertStringArray(value.stop_if, 'TaskPacket.stop_if');
  if (value.context !== undefined) {
    if (!isObject(value.context)) throw new Error('TaskPacket.context must be an object');
    assertNoExtraKeys(value.context, ['entrypoints', 'symbols', 'decisions', 'references'], 'TaskPacket.context');
    for (const key of ['entrypoints', 'symbols', 'decisions', 'references'] as const) {
      if (value.context[key] !== undefined) assertStringArray(value.context[key], `TaskPacket.context.${key}`);
    }
  }
  if (value.repair !== undefined) {
    if (!isObject(value.repair)) throw new Error('TaskPacket.repair must be an object');
    assertNoExtraKeys(value.repair, ['attempt', 'previous_failure'], 'TaskPacket.repair');
    if (value.repair.attempt !== undefined && (!Number.isInteger(value.repair.attempt) || Number(value.repair.attempt) < 0)) {
      throw new Error('TaskPacket.repair.attempt must be an integer >= 0');
    }
    if (value.repair.previous_failure !== undefined && value.repair.previous_failure !== null && typeof value.repair.previous_failure !== 'string') {
      throw new Error('TaskPacket.repair.previous_failure must be string|null');
    }
  }
  if (value.policy !== undefined) assertTaskExecutionPolicy(value.policy);
}

export function assertTaskExecutionPolicy(value: unknown): asserts value is TaskExecutionPolicy {
  if (!isObject(value)) throw new Error('TaskExecutionPolicy must be an object');
  assertNoExtraKeys(value, [
    'phase', 'effects', 'capabilities', 'resources', 'budgets', 'concurrency', 'proof', 'recovery', 'stop_conditions', 'requires_strong_planner', 'requires_strong_reviewer',
  ], 'TaskExecutionPolicy');
  if (!['DISCOVER', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REPAIR', 'CLOSE'].includes(String(value.phase))) {
    throw new Error(`TaskExecutionPolicy.phase is invalid: ${String(value.phase)}`);
  }
  if (!isObject(value.effects)) throw new Error('TaskExecutionPolicy.effects must be an object');
  assertNoExtraKeys(value.effects, ['allowed', 'forbidden', 'mcp_integration_ids', 'network'], 'TaskExecutionPolicy.effects');
  const EFFECTS = ['read', 'filesystem_mutation', 'command_execution', 'network', 'mcp', 'external_write', 'destructive'];
  const assertEffects = (list: unknown, field: string): void => {
    if (!Array.isArray(list) || list.some((item) => !EFFECTS.includes(String(item)))) {
      throw new Error(`${field} must be an array of effect kinds`);
    }
  };
  assertEffects(value.effects.allowed, 'TaskExecutionPolicy.effects.allowed');
  assertEffects(value.effects.forbidden, 'TaskExecutionPolicy.effects.forbidden');
  const forbidden = value.effects.forbidden as string[];
  const allowed = value.effects.allowed as string[];
  for (const kind of forbidden) {
    if (allowed.includes(kind)) throw new Error(`TaskExecutionPolicy.effects: effect ${kind} is both allowed and forbidden`);
  }
  if (value.effects.mcp_integration_ids !== undefined) assertStringArray(value.effects.mcp_integration_ids, 'TaskExecutionPolicy.effects.mcp_integration_ids');
  if (value.effects.network !== undefined) {
    if (!isObject(value.effects.network)) throw new Error('TaskExecutionPolicy.effects.network must be an object');
    assertNoExtraKeys(value.effects.network, ['require_routed_mcp_only', 'forbidden_hosts'], 'TaskExecutionPolicy.effects.network');
    if (value.effects.network.require_routed_mcp_only !== undefined && typeof value.effects.network.require_routed_mcp_only !== 'boolean') {
      throw new Error('TaskExecutionPolicy.effects.network.require_routed_mcp_only must be boolean');
    }
    if (value.effects.network.forbidden_hosts !== undefined) assertStringArray(value.effects.network.forbidden_hosts, 'TaskExecutionPolicy.effects.network.forbidden_hosts');
  }
  if (value.capabilities !== undefined) assertStringArray(value.capabilities, 'TaskExecutionPolicy.capabilities');
  if (value.resources !== undefined) {
    if (!isObject(value.resources)) throw new Error('TaskExecutionPolicy.resources must be an object');
    assertNoExtraKeys(value.resources, ['memory_mb', 'cpu_share'], 'TaskExecutionPolicy.resources');
    if (value.resources.memory_mb !== undefined && (!Number.isInteger(value.resources.memory_mb) || Number(value.resources.memory_mb) < 1)) {
      throw new Error('TaskExecutionPolicy.resources.memory_mb must be a positive integer');
    }
    if (value.resources.cpu_share !== undefined && (typeof value.resources.cpu_share !== 'number' || !(value.resources.cpu_share > 0) || !(value.resources.cpu_share <= 1))) {
      throw new Error('TaskExecutionPolicy.resources.cpu_share must be in (0,1]');
    }
  }
  if (value.budgets !== undefined) {
    if (!isObject(value.budgets)) throw new Error('TaskExecutionPolicy.budgets must be an object');
    assertNoExtraKeys(value.budgets, ['wall_clock_ms', 'max_steps', 'max_tool_calls', 'max_retries', 'max_repair_rounds', 'max_cost_usd'], 'TaskExecutionPolicy.budgets');
    for (const key of ['wall_clock_ms', 'max_steps', 'max_tool_calls', 'max_retries', 'max_repair_rounds'] as const) {
      if (value.budgets[key] !== undefined && (!Number.isInteger(value.budgets[key]) || Number(value.budgets[key]) < 1)) {
        throw new Error(`TaskExecutionPolicy.budgets.${key} must be a positive integer`);
      }
    }
    if (value.budgets.max_cost_usd !== undefined && (typeof value.budgets.max_cost_usd !== 'number' || !(value.budgets.max_cost_usd > 0))) {
      throw new Error('TaskExecutionPolicy.budgets.max_cost_usd must be a positive number');
    }
  }
  if (value.concurrency !== undefined) {
    if (!isObject(value.concurrency)) throw new Error('TaskExecutionPolicy.concurrency must be an object');
    assertNoExtraKeys(value.concurrency, ['exclusive', 'shared_mutation_serialized'], 'TaskExecutionPolicy.concurrency');
    for (const key of ['exclusive', 'shared_mutation_serialized'] as const) {
      if (value.concurrency[key] !== undefined && typeof value.concurrency[key] !== 'boolean') {
        throw new Error(`TaskExecutionPolicy.concurrency.${key} must be boolean`);
      }
    }
  }
  if (value.proof !== undefined) {
    if (!isObject(value.proof)) throw new Error('TaskExecutionPolicy.proof must be an object');
    assertNoExtraKeys(value.proof, ['required_categories'], 'TaskExecutionPolicy.proof');
    if (value.proof.required_categories !== undefined) assertStringArray(value.proof.required_categories, 'TaskExecutionPolicy.proof.required_categories');
  }
  if (value.recovery !== undefined) {
    if (!isObject(value.recovery)) throw new Error('TaskExecutionPolicy.recovery must be an object');
    assertNoExtraKeys(value.recovery, ['resume_allowed', 'restartable', 'checkpoint_interval_ms'], 'TaskExecutionPolicy.recovery');
    for (const key of ['resume_allowed', 'restartable'] as const) {
      if (value.recovery[key] !== undefined && typeof value.recovery[key] !== 'boolean') {
        throw new Error(`TaskExecutionPolicy.recovery.${key} must be boolean`);
      }
    }
    if (value.recovery.checkpoint_interval_ms !== undefined && (!Number.isInteger(value.recovery.checkpoint_interval_ms) || Number(value.recovery.checkpoint_interval_ms) < 1)) {
      throw new Error('TaskExecutionPolicy.recovery.checkpoint_interval_ms must be a positive integer');
    }
  }
  if (value.stop_conditions !== undefined) assertStringArray(value.stop_conditions, 'TaskExecutionPolicy.stop_conditions');
  if (value.requires_strong_planner !== undefined && typeof value.requires_strong_planner !== 'boolean') {
    throw new Error('TaskExecutionPolicy.requires_strong_planner must be boolean');
  }
  if (value.requires_strong_reviewer !== undefined && typeof value.requires_strong_reviewer !== 'boolean') {
    throw new Error('TaskExecutionPolicy.requires_strong_reviewer must be boolean');
  }
}

export function assertRunState(value: unknown): asserts value is RunState {
  if (!isObject(value)) throw new Error('RunState must be an object');
  assertNoExtraKeys(value, ['protocol_version', 'run_id', 'spec_id', 'spec_revision', 'work_id', 'execution_generation', 'status', 'tasks', 'current_task', 'checkpoint', 'unresolved_claims'], 'RunState');
  asString(value.protocol_version, 'RunState.protocol_version');
  asString(value.run_id, 'RunState.run_id');
  asString(value.spec_id, 'RunState.spec_id');
  if (!Number.isInteger(value.spec_revision) || Number(value.spec_revision) < 1) throw new Error('RunState.spec_revision must be an integer >= 1');
  if (value.work_id !== undefined) asString(value.work_id, 'RunState.work_id');
  if (value.execution_generation !== undefined && (!Number.isSafeInteger(value.execution_generation) || Number(value.execution_generation) < 0)) throw new Error('RunState.execution_generation must be an integer >= 0');
  if (!['ready', 'running', 'blocked', 'failed', 'passed', 'partial'].includes(String(value.status))) throw new Error(`RunState.status is invalid: ${String(value.status)}`);
  if (!isObject(value.tasks)) throw new Error('RunState.tasks must be an object');
  for (const [taskId, status] of Object.entries(value.tasks)) {
    if (!['ready', 'active', 'done', 'failed', 'blocked', 'superseded'].includes(String(status))) {
      throw new Error(`RunState.tasks.${taskId} has invalid status ${String(status)}`);
    }
  }
  if (value.current_task !== undefined && value.current_task !== null && typeof value.current_task !== 'string') throw new Error('RunState.current_task must be string|null');
  if (value.checkpoint !== undefined && value.checkpoint !== null && typeof value.checkpoint !== 'string') throw new Error('RunState.checkpoint must be string|null');
  if (value.unresolved_claims !== undefined) assertStringArray(value.unresolved_claims, 'RunState.unresolved_claims');
}

export function assertEvidenceRecord(value: unknown): asserts value is EvidenceRecord {
  if (!isObject(value)) throw new Error('EvidenceRecord must be an object');
  assertNoExtraKeys(value, ['protocol_version', 'evidence_id', 'claim_id', 'task_id', 'kind', 'status', 'command', 'summary', 'artifact_path', 'sha256', 'observed_at', 'work_id', 'execution_generation', 'spec_id', 'spec_revision', 'candidate_epoch', 'platform', 'verifier_id', 'oracle_group', 'evidence_stage'], 'EvidenceRecord');
  asString(value.protocol_version, 'EvidenceRecord.protocol_version');
  const evidenceId = asString(value.evidence_id, 'EvidenceRecord.evidence_id');
  const claimId = asString(value.claim_id, 'EvidenceRecord.claim_id');
  const taskId = asString(value.task_id, 'EvidenceRecord.task_id');
  if (!/^E-/.test(evidenceId)) throw new Error('EvidenceRecord.evidence_id must start with E-');
  if (!/^C-/.test(claimId)) throw new Error('EvidenceRecord.claim_id must start with C-');
  if (!/^T-/.test(taskId)) throw new Error('EvidenceRecord.task_id must start with T-');
  if (!['static', 'test', 'integration', 'api', 'browser', 'visual', 'mobile', 'security', 'scope', 'semantic', 'other'].includes(String(value.kind))) {
    throw new Error(`EvidenceRecord.kind is invalid: ${String(value.kind)}`);
  }
  if (!['pass', 'fail', 'blocked'].includes(String(value.status))) throw new Error(`EvidenceRecord.status is invalid: ${String(value.status)}`);
  if (value.command !== undefined && value.command !== null) {
    if (!isObject(value.command)) throw new Error('EvidenceRecord.command must be object|null');
    assertNoExtraKeys(value.command, ['executable', 'args', 'timeout_ms'], 'EvidenceRecord.command');
    asString(value.command.executable, 'EvidenceRecord.command.executable');
    assertStringArray(value.command.args, 'EvidenceRecord.command.args');
    if (value.command.timeout_ms !== undefined && (!Number.isInteger(value.command.timeout_ms) || Number(value.command.timeout_ms) < 1)) {
      throw new Error('EvidenceRecord.command.timeout_ms must be an integer >= 1');
    }
  }
  if (value.summary !== undefined && typeof value.summary !== 'string') throw new Error('EvidenceRecord.summary must be string');
  if (value.artifact_path !== undefined && value.artifact_path !== null && typeof value.artifact_path !== 'string') throw new Error('EvidenceRecord.artifact_path must be string|null');
  if (value.sha256 !== undefined && value.sha256 !== null && typeof value.sha256 !== 'string') throw new Error('EvidenceRecord.sha256 must be string|null');
  if (value.observed_at !== undefined && typeof value.observed_at !== 'string') throw new Error('EvidenceRecord.observed_at must be string');
  if (value.work_id !== undefined) asString(value.work_id, 'EvidenceRecord.work_id');
  if (value.execution_generation !== undefined && (!Number.isSafeInteger(value.execution_generation) || Number(value.execution_generation) < 0)) throw new Error('EvidenceRecord.execution_generation must be an integer >= 0');
  if (value.spec_id !== undefined) asString(value.spec_id, 'EvidenceRecord.spec_id');
  if (value.spec_revision !== undefined && (!Number.isInteger(value.spec_revision) || Number(value.spec_revision) < 1)) throw new Error('EvidenceRecord.spec_revision must be an integer >= 1');
  if (value.candidate_epoch !== undefined && (!Number.isInteger(value.candidate_epoch) || Number(value.candidate_epoch) < 0)) throw new Error('EvidenceRecord.candidate_epoch must be an integer >= 0');
  if (value.platform !== undefined) asString(value.platform, 'EvidenceRecord.platform');
  if (value.verifier_id !== undefined) asString(value.verifier_id, 'EvidenceRecord.verifier_id');
  if (value.oracle_group !== undefined) asString(value.oracle_group, 'EvidenceRecord.oracle_group');
  if (value.evidence_stage !== undefined && !EVIDENCE_STAGES_VALUES.includes(String(value.evidence_stage))) {
    throw new Error(`EvidenceRecord.evidence_stage is invalid: ${String(value.evidence_stage)}`);
  }
}

function semanticPayload(entrypoint: WorkRequestEntrypoint): unknown {
  const payload: Record<string, unknown> = {
    intent: entrypoint.intent.trim(),
  };
  for (const key of ['explicit_constraints', 'explicit_non_goals', 'reference_inputs'] as const) {
    if (entrypoint[key] && entrypoint[key].length > 0) payload[key] = [...entrypoint[key]];
  }
  if (entrypoint.risk_hint) payload.risk_hint = entrypoint.risk_hint;
  return payload;
}

/**
 * Compile any entrypoint surface (normal prompt, optional slash command,
 * CLI/API call, native host action) into one canonical WorkRequest. The
 * semantic fingerprint is adapter-neutral: equivalent inputs produce the same
 * `semantic_sha256` and `work_id`, while `adapter` records only the host
 * surface that delivered the intent.
 */
export function compileWorkRequestEntrypoint(entrypoint: WorkRequestEntrypoint): EntrypointParityReceipt {
  if (!isObject(entrypoint)) throw new Error('entrypoint must be an object');
  if (!['conversation', 'command', 'cli', 'api', 'native_host'].includes(String(entrypoint.adapter))) {
    throw new Error(`entrypoint adapter is invalid: ${String(entrypoint.adapter)}`);
  }
  const raw = entrypoint.intent;
  if (typeof raw !== 'string' || raw.trim().length === 0) throw new Error('entrypoint intent must be a non-empty string');
  const semantic = semanticPayload(entrypoint);
  const semantic_sha256 = sha256Canonical(semantic);
  const work_id = entrypoint.source_id
    ? newId('W', `${entrypoint.source_id}:${semantic_sha256}`)
    : newId('W', semantic_sha256);
  const request: WorkRequest = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    work_id,
    raw_intent: raw,
    source: 'other',
    adapter: entrypoint.adapter,
    ...(entrypoint.explicit_constraints?.length ? { explicit_constraints: [...entrypoint.explicit_constraints] } : {}),
    ...(entrypoint.explicit_non_goals?.length ? { explicit_non_goals: [...entrypoint.explicit_non_goals] } : {}),
    ...(entrypoint.reference_inputs?.length ? { reference_inputs: [...entrypoint.reference_inputs] } : {}),
    ...(entrypoint.risk_hint ? { risk_hint: entrypoint.risk_hint } : {}),
  };
  assertWorkRequest(request);
  const body = {
    schema: 'harness/entrypoint-parity-receipt' as const,
    version: 1 as const,
    adapter: entrypoint.adapter,
    work_id,
    ...(entrypoint.plan_id ? { plan_id: entrypoint.plan_id } : {}),
    semantic_sha256,
    request,
  };
  return { ...body, receipt_sha256: sha256Canonical(body) };
}

export function assertEntrypointParityReceipt(value: unknown): asserts value is EntrypointParityReceipt {
  if (!isObject(value)) throw new Error('EntrypointParityReceipt must be an object');
  assertNoExtraKeys(value, ['schema', 'version', 'adapter', 'work_id', 'plan_id', 'semantic_sha256', 'request', 'receipt_sha256'], 'EntrypointParityReceipt');
  if (value.schema !== 'harness/entrypoint-parity-receipt' || value.version !== 1) throw new Error('invalid entrypoint parity receipt schema');
  if (!['conversation', 'command', 'cli', 'api', 'native_host'].includes(String(value.adapter))) throw new Error('entrypoint parity receipt adapter is invalid');
  asString(value.work_id, 'EntrypointParityReceipt.work_id');
  if (value.plan_id !== undefined) asString(value.plan_id, 'EntrypointParityReceipt.plan_id');
  if (!/^[a-f0-9]{64}$/.test(String(value.semantic_sha256))) throw new Error('EntrypointParityReceipt.semantic_sha256 must be a lowercase SHA-256');
  if (!/^[a-f0-9]{64}$/.test(String(value.receipt_sha256))) throw new Error('EntrypointParityReceipt.receipt_sha256 must be a lowercase SHA-256');
  assertWorkRequest(value.request);
  if (value.request.adapter !== value.adapter) throw new Error('entrypoint parity receipt adapter drift');
  const body = { ...value } as Record<string, unknown>;
  delete body.receipt_sha256;
  if (sha256Canonical(body) !== value.receipt_sha256) throw new Error('entrypoint parity receipt hash mismatch');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function newId(prefix: 'W' | 'S' | 'R' | 'C' | 'T' | 'E' | 'RUN' | 'IE' | 'I', seed?: string): string {
  const body = seed
    ? createHash('sha256').update(seed).digest('hex').slice(0, 12)
    : randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}-${body}`;
}

export function validateTraceability(spec: WorkSpec, packets: readonly TaskPacket[]): TraceabilityResult {
  assertWorkSpec(spec);
  packets.forEach(assertTaskPacket);
  const problems: TraceabilityProblem[] = [];
  const requirementToTasks = new Map<string, string[]>();
  const claimToTasks = new Map<string, string[]>();
  const requirementIds = new Set<string>();
  const claimIds = new Set<string>();
  const taskIds = new Set<string>();

  for (const requirement of spec.requirements) {
    if (requirementIds.has(requirement.id)) problems.push({ code: 'DUPLICATE_REQUIREMENT', id: requirement.id, message: `Requirement ${requirement.id} is duplicated` });
    requirementIds.add(requirement.id);
    for (const claim of requirement.claims) {
      if (claimIds.has(claim)) problems.push({ code: 'DUPLICATE_CLAIM', id: claim, message: `Claim ${claim} is owned by more than one requirement` });
      claimIds.add(claim);
    }
  }

  for (const packet of packets) {
    if (taskIds.has(packet.task_id)) problems.push({ code: 'DUPLICATE_TASK', id: packet.task_id, message: `Task ${packet.task_id} is duplicated` });
    taskIds.add(packet.task_id);
    if (packet.requirements.length === 0) problems.push({ code: 'TASK_WITHOUT_REQUIREMENT', id: packet.task_id, message: `Task ${packet.task_id} has no requirements` });
    for (const requirementId of packet.requirements) {
      if (!requirementIds.has(requirementId)) problems.push({ code: 'UNKNOWN_REQUIREMENT', id: requirementId, message: `Task ${packet.task_id} references unknown requirement ${requirementId}` });
      requirementToTasks.set(requirementId, [...(requirementToTasks.get(requirementId) ?? []), packet.task_id]);
    }
    for (const acceptance of packet.acceptance) {
      if (!claimIds.has(acceptance.claim_id)) problems.push({ code: 'UNKNOWN_CLAIM', id: acceptance.claim_id, message: `Task ${packet.task_id} references unknown claim ${acceptance.claim_id}` });
      claimToTasks.set(acceptance.claim_id, [...(claimToTasks.get(acceptance.claim_id) ?? []), packet.task_id]);
    }
  }

  for (const requirement of spec.requirements) {
    if ((requirementToTasks.get(requirement.id) ?? []).length === 0) {
      problems.push({ code: 'ORPHAN_REQUIREMENT', id: requirement.id, message: `Requirement ${requirement.id} has no task` });
    }
    for (const claim of requirement.claims) {
      if ((claimToTasks.get(claim) ?? []).length === 0) {
        problems.push({ code: 'UNROUTED_CLAIM', id: claim, message: `Claim ${claim} has no verifying task` });
      }
    }
  }

  return {
    valid: problems.length === 0,
    problems,
    requirement_to_tasks: Object.fromEntries(requirementToTasks),
    claim_to_tasks: Object.fromEntries(claimToTasks),
  };
}
