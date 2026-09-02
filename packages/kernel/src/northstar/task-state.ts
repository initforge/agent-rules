export const TASK_OWNER_SCHEMA = 'agent-rules/task-owner/v1' as const;
export const TASK_STATE_SCHEMA = 'agent-rules/task-state/v1' as const;
export const TASK_START_SCHEMA = 'agent-rules/task-start/v1' as const;

export type TaskStatus = 'ACTIVE' | 'PARTIAL' | 'BLOCKED' | 'NEEDS_USER' | 'PASS';
export type SliceStatus = 'PENDING' | 'READY' | 'IN_PROGRESS' | 'PROVED' | 'BLOCKED';
export type ProofStrength = 'STATIC' | 'UNIT' | 'INTEGRATION' | 'LIVE' | 'USER_VISIBLE_E2E';
export type AssumptionStatus = 'OPEN' | 'CONFIRMED' | 'INVALIDATED';
export type FailureCategory = 'IMPLEMENTATION' | 'PLAN' | 'SOURCE_UNDERSTANDING' | 'PROOF' | 'ENVIRONMENT' | 'DEPENDENCY' | 'CONTEXT_ROUTING' | 'EXTERNAL';

export interface AgentTaskOwner {
  readonly schema: typeof TASK_OWNER_SCHEMA;
  readonly repository_realpath: string;
  readonly repository_identity: string;
  readonly created_by: '@initforge/agent-rules';
}

export interface DecisionSnapshot {
  readonly id: string;
  readonly decision: string;
  readonly reason: string;
  readonly rejected_alternatives?: readonly string[];
  readonly reopen_if: readonly string[];
}

export interface AssumptionSnapshot {
  readonly id: string;
  readonly statement: string;
  readonly evidence: readonly string[];
  readonly confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly kill_conditions: readonly string[];
  readonly status: AssumptionStatus;
  readonly source_binding?: string;
}

export interface ProofSummary {
  readonly acceptance_id: string;
  readonly strength: ProofStrength;
  readonly status: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'NEEDS_USER' | 'PRE-EXISTING';
  readonly evidence: string;
  readonly source_binding?: string;
  readonly environment_binding?: string;
  readonly proof_contract?: string;
}

export interface TaskSliceState {
  readonly id: string;
  readonly depends_on: readonly string[];
  readonly status: SliceStatus;
  readonly requirement_ids: readonly string[];
  readonly acceptance_ids: readonly string[];
  readonly expected_delta: string;
  readonly preserve: readonly string[];
  readonly proof_summary: readonly ProofSummary[];
}

export interface AcceptanceState {
  readonly id: string;
  readonly claim: string;
  readonly required_strength: ProofStrength;
  readonly status: 'PENDING' | 'PROVED' | 'BLOCKED' | 'NEEDS_USER' | 'PRE-EXISTING';
}

export interface ScopedBlocker {
  readonly id: string;
  readonly reason: string;
  readonly affected_slices: readonly string[];
}

export interface FailureState {
  readonly fingerprint: string;
  readonly category: FailureCategory;
  readonly source_binding: string;
  readonly repeat_count: number;
  readonly evidence_delta: readonly string[];
}

export interface SourceIdentity {
  readonly repository: string;
  readonly branch?: string;
  readonly head?: string;
  readonly worktree_hash?: string;
  readonly revalidate_when: readonly string[];
}

export interface SkillProjectionState {
  readonly host: string;
  readonly target_root: string;
  readonly catalog_hash: string;
  readonly status: 'ACTIVE' | 'PARTIAL' | 'UNSUPPORTED' | 'NEEDS_USER';
  readonly owned_hashes?: Readonly<Record<string, string>>;
  readonly reused_skill_ids?: readonly string[];
}

export interface AgentTaskState {
  readonly schema: typeof TASK_STATE_SCHEMA;
  readonly task_id: string;
  readonly revision: number;
  readonly plan_sha256: string;
  readonly source_identity: SourceIdentity;
  readonly status: TaskStatus;
  readonly outcome: string;
  readonly locked_constraints: readonly string[];
  readonly decisions: readonly DecisionSnapshot[];
  readonly assumptions: readonly AssumptionSnapshot[];
  readonly slices: readonly TaskSliceState[];
  readonly acceptance: readonly AcceptanceState[];
  readonly current_slice: string | null;
  readonly blockers: readonly ScopedBlocker[];
  readonly selected_skill_ids: readonly string[];
  readonly projected_skill_ids: readonly string[];
  readonly skill_projection: SkillProjectionState | null;
  readonly do_not_repeat: readonly string[];
  readonly next_action: string | null;
  readonly stop_condition: string;
  readonly last_failure?: FailureState;
  readonly updated_at: string;
}

export interface TaskStateSeed extends Omit<AgentTaskState, 'schema' | 'task_id' | 'revision' | 'plan_sha256' | 'updated_at'> {
  readonly task_id?: string;
}

export interface TaskStartInput {
  readonly schema: typeof TASK_START_SCHEMA;
  readonly plan_markdown: string;
  readonly state: TaskStateSeed;
}

export interface TaskStateValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface EvidenceBindings {
  readonly source_binding?: string;
  readonly environment_binding?: string;
  readonly proof_contract?: string;
}

export interface FailureProgress {
  readonly failure: FailureState;
  readonly replan_required: boolean;
}

const TASK_STATUSES = new Set<TaskStatus>(['ACTIVE', 'PARTIAL', 'BLOCKED', 'NEEDS_USER', 'PASS']);
const SLICE_STATUSES = new Set<SliceStatus>(['PENDING', 'READY', 'IN_PROGRESS', 'PROVED', 'BLOCKED']);
const PROOF_STRENGTHS = new Set<ProofStrength>(['STATIC', 'UNIT', 'INTEGRATION', 'LIVE', 'USER_VISIBLE_E2E']);

const uniqueIds = (items: readonly { id: string }[], label: string, issues: string[]): Set<string> => {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item?.id?.trim()) issues.push(`${label} contains an empty id`);
    else if (ids.has(item.id)) issues.push(`${label} contains duplicate id ${item.id}`);
    else ids.add(item.id);
  }
  return ids;
};

export function validateTaskState(value: unknown): TaskStateValidation {
  const issues: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, issues: ['task state must be an object'] };
  const state = value as AgentTaskState;
  if (state.schema !== TASK_STATE_SCHEMA) issues.push(`schema must be ${TASK_STATE_SCHEMA}`);
  if (!state.task_id?.trim()) issues.push('task_id is required');
  if (!Number.isInteger(state.revision) || state.revision < 1) issues.push('revision must be a positive integer');
  if (!/^[a-f0-9]{64}$/i.test(state.plan_sha256 ?? '')) issues.push('plan_sha256 must be sha256 hex');
  if (!TASK_STATUSES.has(state.status)) issues.push('invalid task status');
  if (!state.outcome?.trim()) issues.push('outcome is required');
  if (!state.stop_condition?.trim()) issues.push('stop_condition is required');
  for (const field of ['locked_constraints', 'decisions', 'assumptions', 'slices', 'acceptance', 'blockers', 'do_not_repeat'] as const) {
    if (!Array.isArray(state[field])) issues.push(`${field} must be an array`);
  }
  if (!Array.isArray(state.selected_skill_ids) || !Array.isArray(state.projected_skill_ids)) issues.push('selected_skill_ids and projected_skill_ids must be arrays');
  else {
    if (new Set(state.selected_skill_ids).size !== state.selected_skill_ids.length) issues.push('selected_skill_ids contains duplicates');
    if (new Set(state.projected_skill_ids).size !== state.projected_skill_ids.length) issues.push('projected_skill_ids contains duplicates');
    for (const id of state.projected_skill_ids) if (!state.selected_skill_ids.includes(id)) issues.push(`projected skill ${id} is not selected`);
  }
  if (state.skill_projection !== null) {
    const unsupported = state.skill_projection?.status === 'UNSUPPORTED';
    if (!state.skill_projection?.host || (!unsupported && !state.skill_projection.target_root) || !/^[a-f0-9]{64}$/i.test(state.skill_projection.catalog_hash ?? '')) issues.push('skill_projection is malformed');
  }
  if (!Array.isArray(state.slices) || !Array.isArray(state.acceptance)) return { ok: false, issues };
  const sliceIds = uniqueIds(state.slices, 'slices', issues);
  const acceptanceIds = uniqueIds(state.acceptance, 'acceptance', issues);
  uniqueIds(state.decisions ?? [], 'decisions', issues);
  uniqueIds(state.assumptions ?? [], 'assumptions', issues);
  uniqueIds(state.blockers ?? [], 'blockers', issues);
  for (const slice of state.slices) {
    if (!SLICE_STATUSES.has(slice.status)) issues.push(`slice ${slice.id} has invalid status`);
    if (!slice.expected_delta?.trim()) issues.push(`slice ${slice.id} has no expected_delta`);
    for (const dep of slice.depends_on ?? []) if (!sliceIds.has(dep)) issues.push(`slice ${slice.id} depends on unknown slice ${dep}`);
    for (const id of slice.acceptance_ids ?? []) if (!acceptanceIds.has(id)) issues.push(`slice ${slice.id} references unknown acceptance ${id}`);
    for (const proof of slice.proof_summary ?? []) {
      if (!acceptanceIds.has(proof.acceptance_id)) issues.push(`slice ${slice.id} proof references unknown acceptance ${proof.acceptance_id}`);
      if (!PROOF_STRENGTHS.has(proof.strength)) issues.push(`slice ${slice.id} proof has invalid strength`);
    }
  }
  for (const acceptance of state.acceptance) if (!PROOF_STRENGTHS.has(acceptance.required_strength)) issues.push(`acceptance ${acceptance.id} has invalid proof strength`);
  if (state.current_slice !== null && !sliceIds.has(state.current_slice)) issues.push(`current_slice ${state.current_slice} does not exist`);
  if (state.status === 'PASS' && state.acceptance.some((entry) => entry.status !== 'PROVED' && entry.status !== 'PRE-EXISTING')) issues.push('PASS requires every acceptance to be PROVED or PRE-EXISTING');
  if (state.last_failure && state.last_failure.repeat_count < 1) issues.push('last_failure.repeat_count must be positive');
  return { ok: issues.length === 0, issues };
}

export function validateTaskStartInput(value: unknown): TaskStateValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, issues: ['task start input must be an object'] };
  const input = value as TaskStartInput;
  const issues: string[] = [];
  if (input.schema !== TASK_START_SCHEMA) issues.push(`schema must be ${TASK_START_SCHEMA}`);
  if (!input.plan_markdown?.trim()) issues.push('plan_markdown is required');
  if (typeof input.state !== 'object' || input.state === null) issues.push('state seed is required');
  return { ok: issues.length === 0, issues };
}

/** Evidence freshness is identity-based, never a wall-clock TTL. */
export function proofSummaryIsFresh(proof: ProofSummary, current: EvidenceBindings): boolean {
  if (proof.source_binding && proof.source_binding !== current.source_binding) return false;
  if (proof.environment_binding && proof.environment_binding !== current.environment_binding) return false;
  if (proof.proof_contract && proof.proof_contract !== current.proof_contract) return false;
  return proof.status === 'PASS' || proof.status === 'PRE-EXISTING';
}

/** Same failure without evidence delta twice requires root-cause/replan. */
export function advanceFailureState(previous: FailureState | undefined, next: Omit<FailureState, 'repeat_count'>): FailureProgress {
  const same = Boolean(previous && previous.fingerprint === next.fingerprint && previous.source_binding === next.source_binding);
  const evidenceDelta = [...next.evidence_delta];
  const repeatCount = same && evidenceDelta.length === 0 ? (previous?.repeat_count ?? 0) + 1 : 1;
  return { failure: { ...next, evidence_delta: evidenceDelta, repeat_count: repeatCount }, replan_required: repeatCount >= 2 };
}

/** Compact hot frontier; full plan and completed detail remain retrievable. */
export function compactTaskFrontier(state: AgentTaskState): Record<string, unknown> {
  return {
    task_id: state.task_id,
    revision: state.revision,
    status: state.status,
    outcome: state.outcome,
    locked_constraints: state.locked_constraints,
    proved_slices: state.slices.filter((slice) => slice.status === 'PROVED').map((slice) => slice.id),
    current_slice: state.current_slice,
    ready_slices: state.slices.filter((slice) => slice.status === 'READY').map((slice) => slice.id),
    blockers: state.blockers,
    selected_skill_ids: state.selected_skill_ids,
    projected_skill_ids: state.projected_skill_ids,
    skill_projection: state.skill_projection,
    open_assumptions: state.assumptions.filter((assumption) => assumption.status === 'OPEN'),
    do_not_repeat: state.do_not_repeat,
    next_action: state.next_action,
    stop_condition: state.stop_condition,
  };
}
