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
    'protocol_version', 'work_id', 'raw_intent', 'source', 'adapter', 'explicit_constraints', 'explicit_non_goals', 'reference_inputs', 'risk_hint',
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
}

export function assertWorkSpec(value: unknown): asserts value is WorkSpec {
  if (!isObject(value)) throw new Error('WorkSpec must be an object');
  assertNoExtraKeys(value, [
    'protocol_version', 'spec_id', 'revision', 'work_id', 'requirements', 'constraints', 'non_goals', 'known', 'assumed', 'decisions', 'unresolved', 'requires_user', 'impact', 'risk_class', 'execution_generation',
  ], 'WorkSpec');
  asString(value.protocol_version, 'WorkSpec.protocol_version');
  asString(value.spec_id, 'WorkSpec.spec_id');
  asString(value.work_id, 'WorkSpec.work_id');
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) throw new Error('WorkSpec.revision must be an integer >= 1');
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) throw new Error('WorkSpec.requirements must be non-empty');
  for (const [index, requirement] of value.requirements.entries()) {
    if (!isObject(requirement)) throw new Error(`WorkSpec.requirements[${index}] must be an object`);
    assertNoExtraKeys(requirement, ['id', 'statement', 'mandatory', 'claims'], `WorkSpec.requirements[${index}]`);
    const id = asString(requirement.id, `WorkSpec.requirements[${index}].id`);
    if (!/^R-/.test(id)) throw new Error(`WorkSpec.requirements[${index}].id must start with R-`);
    asString(requirement.statement, `WorkSpec.requirements[${index}].statement`);
    if (typeof requirement.mandatory !== 'boolean') throw new Error(`WorkSpec.requirements[${index}].mandatory must be boolean`);
    assertStringArray(requirement.claims, `WorkSpec.requirements[${index}].claims`, { pattern: /^C-/ });
  }
  if (value.constraints !== undefined) assertStringArray(value.constraints, 'WorkSpec.constraints');
  if (value.non_goals !== undefined) assertStringArray(value.non_goals, 'WorkSpec.non_goals');
  if (value.known !== undefined) assertStringArray(value.known, 'WorkSpec.known');
  if (value.assumed !== undefined) assertStringArray(value.assumed, 'WorkSpec.assumed');
  if (value.decisions !== undefined) assertStringArray(value.decisions, 'WorkSpec.decisions');
  if (value.unresolved !== undefined) assertStringArray(value.unresolved, 'WorkSpec.unresolved');
  if (value.requires_user !== undefined) assertStringArray(value.requires_user, 'WorkSpec.requires_user');
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

export function assertTaskPacket(value: unknown): asserts value is TaskPacket {
  if (!isObject(value)) throw new Error('TaskPacket must be an object');
  assertNoExtraKeys(value, [
    'protocol_version', 'task_id', 'spec_id', 'spec_revision', 'work_id', 'execution_generation', 'phase', 'goal', 'requirements', 'scope', 'context', 'constraints', 'acceptance', 'skills', 'capabilities', 'stop_if', 'repair',
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

export function newId(prefix: 'W' | 'S' | 'R' | 'C' | 'T' | 'E' | 'RUN', seed?: string): string {
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
