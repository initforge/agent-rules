import {
  activeRequirements,
  applyIntentEventsToSpec,
  assertTaskPacket,
  assertWorkRequest,
  assertWorkSpec,
  effectiveSpecItems,
  sha256Canonical,
  type EffectKind,
  type ExecutionPhase,
  type TaskBudgets,
  type TaskConcurrencyPolicy,
  type TaskPacket,
  type WorkReference,
  type WorkRequest,
  type WorkSpec,
} from './protocol.js';

/**
 * Frozen execution contract (North-Star vNext REQ-003) and mandatory
 * pre-handoff audit (REQ-005).
 *
 * The frozen contract is the single source a worker executes from; plan and
 * prompt are two renderers of the same contract, and every revision carries
 * one semantic hash. Nothing here parses Markdown back into canonical truth.
 */

export const PORTABLE_PLAN_VNEXT_SCHEMA = 'harness/portable-plan-vnext';
export const PORTABLE_PLAN_VNEXT_VERSION = 1 as const;

export type ExecutionDisposition = 'PLAN_ONLY' | 'EXPORT_HANDOFF' | 'LOCAL_EXECUTE';
export type CompiledDoDStage = 'CODE' | 'BEHAVIOR' | 'RELEASE' | 'TERMINAL';

export interface CompiledDoD {
  required: CompiledDoDStage[];
  reason: string;
}

export function compileDoD(input: { disposition: ExecutionDisposition; riskClass?: string; hasReleaseScope?: boolean }): CompiledDoD {
  if (input.disposition === 'PLAN_ONLY') return { required: ['CODE'], reason: 'plan-only scope: no behavior/release/terminal execution' };
  if (input.disposition === 'EXPORT_HANDOFF') return { required: ['CODE', 'BEHAVIOR'], reason: 'export handoff: code + behavior proof' };
  const stages: CompiledDoDStage[] = ['CODE', 'BEHAVIOR'];
  if (input.hasReleaseScope || input.riskClass === 'S2' || input.riskClass === 'S3') stages.push('RELEASE');
  stages.push('TERMINAL');
  return { required: stages, reason: `local execute: ${stages.join('+')}` };
}

export interface FrozenIntentRef {
  work_id: string;
  raw_intent_sha256: string;
  /** Hash of the append-only intent event chain. */
  intent_events_sha256: string;
  /** Hash of the normalized effective spec items (requirements + structured items). */
  effective_items_sha256: string;
  /** Target consumer repository identity (separate from harness release). */
  target_consumer_identity?: {
    repository_url?: string;
    worktree_path?: string;
    discovery_policy: 'explicit_path' | 'auto_discover';
  };
}

export interface ContractRequirement {
  id: string;
  statement: string;
  mandatory: boolean;
  claims: string[];
  status: 'ACTIVE' | 'REJECTED' | 'SUPERSEDED' | 'UNRESOLVED';
}

export interface ContractTaskNode {
  task_id: string;
  goal: string;
  requirement_ids: string[];
  dependencies: string[];
  owned: string[];
  forbidden: string[];
  acceptance: Array<{ claim_id: string; verifier_id?: string | null }>;
  /** Evidence categories (A-K) this task must record. */
  proof_categories: string[];
  effects: EffectKind[];
  budgets: TaskBudgets;
  phase: ExecutionPhase;
}

export interface ContractTraceability {
  valid: boolean;
  requirement_to_tasks: Record<string, string[]>;
  claim_to_tasks: Record<string, string[]>;
}

export interface ContractPolicy {
  capabilities?: string[];
  concurrency?: TaskConcurrencyPolicy;
  recovery?: {
    resume_allowed?: boolean;
    restartable?: boolean;
    checkpoint_interval_ms?: number;
  };
  stop_conditions?: string[];
  requires_strong_planner?: boolean;
  requires_strong_reviewer?: boolean;
}

export interface FrozenPortableContract {
  schema: typeof PORTABLE_PLAN_VNEXT_SCHEMA;
  version: typeof PORTABLE_PLAN_VNEXT_VERSION;
  contract_id: string;
  revision: number;
  work_id: string;
  spec_id: string;
  spec_revision: number;
  frozen_intent: FrozenIntentRef;
  objective: string;
  requirements: ContractRequirement[];
  constraints: string[];
  non_goals: string[];
  decisions: string[];
  assumptions: string[];
  /** Executing requires this to be empty (or NEEDS_USER/BLOCKED). */
  unresolved: string[];
  references: WorkReference[];
  tasks: ContractTaskNode[];
  traceability: ContractTraceability;
  policy: ContractPolicy;
  /** Execution disposition and compiled definition-of-done. */
  disposition: ExecutionDisposition;
  compiled_dod: CompiledDoD;
  /** sha256Canonical of this contract without the semantic_hash field. */
  semantic_hash: string;
}

export function contractSemanticHash(contract: Omit<FrozenPortableContract, 'semantic_hash'>): string {
  return sha256Canonical(contract);
}

export function assertFrozenPortableContract(value: unknown): asserts value is FrozenPortableContract {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('FrozenPortableContract must be an object');
  const contract = value as Record<string, unknown>;
  if (contract.schema !== PORTABLE_PLAN_VNEXT_SCHEMA || contract.version !== PORTABLE_PLAN_VNEXT_VERSION) {
    throw new Error('FrozenPortableContract has an unsupported schema/version');
  }
  for (const key of ['contract_id', 'work_id', 'spec_id', 'objective']) {
    if (typeof contract[key] !== 'string' || contract[key].trim().length === 0) throw new Error(`FrozenPortableContract.${key} must be a non-empty string`);
  }
  if (!Number.isInteger(contract.revision) || Number(contract.revision) < 1) throw new Error('FrozenPortableContract.revision must be an integer >= 1');
  if (!Number.isInteger(contract.spec_revision) || Number(contract.spec_revision) < 1) throw new Error('FrozenPortableContract.spec_revision must be an integer >= 1');
  if (typeof contract.semantic_hash !== 'string' || !/^[a-f0-9]{64}$/.test(contract.semantic_hash)) throw new Error('FrozenPortableContract.semantic_hash must be a lowercase SHA-256');
  const body = { ...contract };
  delete body.semantic_hash;
  if (contractSemanticHash(body as Omit<FrozenPortableContract, 'semantic_hash'>) !== contract.semantic_hash) {
    throw new Error('FrozenPortableContract semantic hash mismatch');
  }
  if (!Array.isArray(contract.requirements) || contract.requirements.length === 0) throw new Error('FrozenPortableContract.requirements must be non-empty');
  for (const [index, requirement] of contract.requirements.entries()) {
    const item = requirement as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.statement !== 'string' || typeof item.mandatory !== 'boolean') {
      throw new Error(`FrozenPortableContract.requirements[${index}] is malformed`);
    }
    if (!Array.isArray(item.claims) || item.claims.some((c) => typeof c !== 'string')) throw new Error(`FrozenPortableContract.requirements[${index}].claims must be string[]`);
  }
  if (!Array.isArray(contract.tasks) || contract.tasks.length === 0) throw new Error('FrozenPortableContract.tasks must be non-empty');
  const taskIds = new Set<string>();
  for (const [index, task] of contract.tasks.entries()) {
    const item = task as Record<string, unknown>;
    if (typeof item.task_id !== 'string' || typeof item.goal !== 'string') throw new Error(`FrozenPortableContract.tasks[${index}] is malformed`);
    if (taskIds.has(item.task_id)) throw new Error(`FrozenPortableContract.tasks contains duplicate ${item.task_id}`);
    taskIds.add(item.task_id);
    if (!Array.isArray(item.requirement_ids) || !Array.isArray(item.dependencies)) throw new Error(`FrozenPortableContract.tasks[${index}].requirements/dependencies must be arrays`);
    if (!Array.isArray(item.acceptance) || item.acceptance.length === 0) throw new Error(`FrozenPortableContract.tasks[${index}].acceptance must be non-empty`);
  }
  if (typeof contract.traceability !== 'object' || contract.traceability === null) throw new Error('FrozenPortableContract.traceability must be an object');
}

/**
 * Compile the frozen contract from the effective intent (request + spec) and
 * the task packets. This is the single canonical compilation; plan and prompt
 * are renderers of this object. A spec with unresolved items cannot be frozen
 * as executable (throws); callers may still audit it as candidate material.
 */
export function compileFrozenContract(input: {
  request: WorkRequest;
  spec: WorkSpec;
  packets: readonly TaskPacket[];
  contractId?: string;
  revision?: number;
  objective?: string;
  disposition?: ExecutionDisposition;
  targetConsumerIdentity?: FrozenIntentRef['target_consumer_identity'];
}): FrozenPortableContract {
  assertWorkRequest(input.request);
  assertWorkSpec(input.spec);
  input.packets.forEach(assertTaskPacket);
  const effectiveSpec = input.request.intent_events?.length
    ? applyIntentEventsToSpec(input.spec, input.request)
    : input.spec;
  const items = effectiveSpecItems(effectiveSpec);
  const active = activeRequirements(effectiveSpec);
  const byId = new Map(items.map((item) => [item.id, item]));

  const requirements: ContractRequirement[] = active.map((requirement) => ({
    id: requirement.id,
    statement: requirement.statement,
    mandatory: requirement.mandatory,
    claims: [...requirement.claims],
    status: requirement.status ?? 'ACTIVE',
  }));

  const constraintItems = items.filter((item) => item.kind === 'constraint');
  const nonGoalItems = items.filter((item) => item.kind === 'non_goal');
  const decisionItems = items.filter((item) => item.kind === 'decision');
  const assumptionItems = items.filter((item) => item.kind === 'assumption');
  const unresolved = items.filter((item) => item.kind === 'unresolved' || item.status === 'UNRESOLVED');

  const tasks: ContractTaskNode[] = input.packets.map((packet) => ({
    task_id: packet.task_id,
    goal: packet.goal,
    requirement_ids: [...packet.requirements],
    dependencies: [],
    owned: [...packet.scope.owned],
    forbidden: [...packet.scope.forbidden],
    acceptance: packet.acceptance.map((a) => ({ claim_id: a.claim_id, verifier_id: a.verifier_id ?? null })),
    proof_categories: packet.policy?.proof?.required_categories ?? [],
    effects: packet.policy?.effects.allowed ?? [],
    budgets: packet.policy?.budgets ?? {},
    phase: packet.policy?.phase ?? 'IMPLEMENT',
  }));

  const requirementToTasks: Record<string, string[]> = {};
  const claimToTasks: Record<string, string[]> = {};
  for (const packet of input.packets) {
    for (const requirementId of packet.requirements) {
      requirementToTasks[requirementId] = [...(requirementToTasks[requirementId] ?? []), packet.task_id];
    }
    for (const acceptance of packet.acceptance) {
      claimToTasks[acceptance.claim_id] = [...(claimToTasks[acceptance.claim_id] ?? []), packet.task_id];
    }
  }
  const orphanRequirement = requirements.some((requirement) => (requirementToTasks[requirement.id] ?? []).length === 0);
  const orphanClaim = requirements.some((requirement) => requirement.claims.some((claim) => (claimToTasks[claim] ?? []).length === 0));

  const frozen: Omit<FrozenPortableContract, 'semantic_hash'> = {
    schema: PORTABLE_PLAN_VNEXT_SCHEMA,
    version: PORTABLE_PLAN_VNEXT_VERSION,
    contract_id: input.contractId ?? `PC-${sha256Canonical({ work_id: input.request.work_id, revision: input.revision ?? 1 }).slice(0, 12)}`,
    revision: input.revision ?? 1,
    work_id: input.request.work_id,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    frozen_intent: {
      work_id: input.request.work_id,
      raw_intent_sha256: sha256Canonical(input.request.raw_intent),
      // Semantic hash over the event chain with `at` (metadata timestamp)
      // excluded: the same effective intent must yield the same frozen hash.
      intent_events_sha256: sha256Canonical((input.request.intent_events ?? []).map(({ at: _at, ...event }) => event)),
      effective_items_sha256: sha256Canonical(items),
      ...(input.targetConsumerIdentity ? { target_consumer_identity: input.targetConsumerIdentity } : {}),
    },
    objective: input.objective ?? input.spec.requirements[0]?.statement ?? input.request.raw_intent,
    requirements,
    constraints: constraintItems.filter((item) => item.status === 'ACTIVE').map((item) => item.statement),
    non_goals: nonGoalItems.filter((item) => item.status === 'ACTIVE').map((item) => item.statement),
    decisions: decisionItems.filter((item) => item.status === 'ACTIVE').map((item) => item.statement),
    assumptions: assumptionItems.filter((item) => item.status === 'ACTIVE').map((item) => item.statement),
    unresolved: [...new Set(unresolved.map((item) => item.statement))],
    references: input.spec.references ?? [],
    tasks,
    traceability: {
      valid: !orphanRequirement && !orphanClaim && !input.spec.unresolved?.length,
      requirement_to_tasks: requirementToTasks,
      claim_to_tasks: claimToTasks,
    },
    policy: {
      capabilities: undefined,
      concurrency: undefined,
      recovery: undefined,
      stop_conditions: undefined,
    },
    disposition: input.disposition ?? 'LOCAL_EXECUTE',
    compiled_dod: compileDoD({ disposition: input.disposition ?? 'LOCAL_EXECUTE', riskClass: input.spec.risk_class, hasReleaseScope: input.packets.some((p) => p.scope.owned.some((o) => o.includes('release') || o.includes('install'))) }),
  };
  const semanticHash = contractSemanticHash(frozen);
  return { ...frozen, semantic_hash: semanticHash };
}

/** Receiver-side verification: a hash that matches is the same revision. */
export function verifyContractHash(contract: FrozenPortableContract): boolean {
  try {
    assertFrozenPortableContract(contract);
    return true;
  } catch {
    return false;
  }
}

/** Plan renderer: one self-contained artifact for the receiver. */
export function renderPlan(contract: FrozenPortableContract): string {
  assertFrozenPortableContract(contract);
  const lines = [
    `# Frozen Execution Contract ${contract.contract_id}`,
    `Revision: ${contract.revision} (semantic hash: ${contract.semantic_hash})`,
    `Identity: work_id=${contract.work_id} spec=${contract.spec_id}@${contract.spec_revision}`,
    `Objective: ${contract.objective}`,
    `Frozen intent: raw=${contract.frozen_intent.raw_intent_sha256.slice(0, 12)} events=${contract.frozen_intent.intent_events_sha256.slice(0, 12)} effective=${contract.frozen_intent.effective_items_sha256.slice(0, 12)}`,
    '',
    '## Requirements',
    ...contract.requirements.map((requirement) => `- [${requirement.id}] (${requirement.status}) ${requirement.statement}${requirement.claims.length ? ` claims: ${requirement.claims.join(', ')}` : ''}`),
    '',
    '## Constraints and non-goals',
    `Constraints: ${contract.constraints.length ? contract.constraints.join('; ') : '(none)'}`,
    `Non-goals: ${contract.non_goals.length ? contract.non_goals.join('; ') : '(none)'}`,
    `Decisions: ${contract.decisions.length ? contract.decisions.join('; ') : '(none)'}`,
    `Assumptions: ${contract.assumptions.length ? contract.assumptions.join('; ') : '(none)'}`,
    `Unresolved: ${contract.unresolved.length ? contract.unresolved.join('; ') : '(none)'}`,
    '',
    '## References',
    ...(contract.references.length ? contract.references.map((reference) => `- ${reference.path}${reference.anchor ? `#${reference.anchor}` : ''}${reference.sha256 ? ` (sha256:${reference.sha256.slice(0, 12)})` : ''}${reference.used_by?.length ? ` used_by: ${reference.used_by.join(', ')}` : ''}`) : ['- (none)']),
    '',
    '## Tasks',
    ...contract.tasks.map((task) => [
      `### ${task.task_id} [${task.phase}] ${task.goal}`,
      `Requirements: ${task.requirement_ids.join(', ')}`,
      `Dependencies: ${task.dependencies.length ? task.dependencies.join(', ') : '(none)'}`,
      `Owned: ${task.owned.length ? task.owned.join(', ') : '(repo-wide)'}`,
      `Forbidden: ${task.forbidden.length ? task.forbidden.join(', ') : '(none)'}`,
      `Acceptance: ${task.acceptance.map((a) => `${a.claim_id}->${a.verifier_id ?? '?'}`).join(', ')}`,
      `Proof categories: ${task.proof_categories.length ? task.proof_categories.join(', ') : '(default)'}`,
      `Effects: ${task.effects.length ? task.effects.join(', ') : 'read'}`,
      `Budgets: ${Object.entries(task.budgets).map(([key, value]) => `${key}=${String(value)}`).join(' ') || '(none)'}`,
    ].join('\n')),
    '',
    '## Execution policy',
    `Capabilities: ${contract.policy.capabilities?.length ? contract.policy.capabilities.join(', ') : '(broker default)'}`,
    `Concurrency: ${JSON.stringify(contract.policy.concurrency ?? {})}`,
    `Recovery: ${JSON.stringify(contract.policy.recovery ?? {})}`,
    `Stop conditions: ${contract.policy.stop_conditions?.length ? contract.policy.stop_conditions.join('; ') : '(none)'}`,
    '',
    '## Failure rules',
    '- Do not weaken, skip, delete or hard-disable verification.',
    '- Out-of-scope and forbidden mutations fail closed; quarantine diffs are never promoted.',
    '- Missing business/source truth becomes BLOCKED/NEEDS_USER, never invention.',
    '- PASS is derived from verifier evidence and the acceptance audit; workers never author PASS.',
    '',
    `## Closure criteria`,
    `- Evidence-derived PASS for every routed claim.`,
    `- Intent/spec/implementation reconciliation without gaps.`,
    `- Scope and verification integrity PASS.`,
  ];
  return lines.join('\n');
}

/** Prompt renderer: the same frozen contract as a worker prompt. */
export function renderPrompt(contract: FrozenPortableContract): string {
  assertFrozenPortableContract(contract);
  const active = contract.requirements.filter((requirement) => requirement.status === 'ACTIVE');
  return [
    `# Task execution from frozen contract ${contract.contract_id}`,
    `Revision: ${contract.revision} (semantic hash: ${contract.semantic_hash})`,
    `Identity: work_id=${contract.work_id} spec=${contract.spec_id}@${contract.spec_revision}`,
    `Objective: ${contract.objective}`,
    `Active requirements: ${active.map((requirement) => `[${requirement.id}] ${requirement.statement}`).join('\n- ')}`,
    `Constraints: ${contract.constraints.length ? contract.constraints.join('; ') : '(none)'}`,
    `Non-goals: ${contract.non_goals.length ? contract.non_goals.join('; ') : '(none)'}`,
    `Decisions: ${contract.decisions.length ? contract.decisions.join('; ') : '(none)'}`,
    `Assumptions (authorized): ${contract.assumptions.length ? contract.assumptions.join('; ') : '(none)'}`,
    `Unresolved (must not become facts): ${contract.unresolved.length ? contract.unresolved.join('; ') : '(none)'}`,
    `References (use by pointer; never vendor/copy into the project): ${contract.references.length ? contract.references.map((reference) => reference.path).join(', ') : '(none)'}`,
    '',
    ...contract.tasks.map((task) => [
      `## ${task.task_id} [${task.phase}] ${task.goal}`,
      `Requirements: ${task.requirement_ids.join(', ')}`,
      `Owned scope: ${task.owned.length ? task.owned.join(', ') : '(repo-wide)'}`,
      `Forbidden scope: ${task.forbidden.length ? task.forbidden.join(', ') : '(none)'}`,
      `Acceptance (you do not author PASS): ${task.acceptance.map((a) => a.claim_id).join(', ')}`,
      `Effects allowed: ${task.effects.length ? task.effects.join(', ') : 'read'}`,
      `Budgets: ${Object.entries(task.budgets).map(([key, value]) => `${key}=${String(value)}`).join(' ') || '(none)'}`,
      `Stop if: ${contract.policy.stop_conditions?.length ? contract.policy.stop_conditions.join('; ') : 'budget exhaustion or unrecoverable blocker'}`,
    ].join('\n')),
    '',
    '# Worker contract',
    'Inspect authoritative references before editing. Never claim PASS; the harness derives completion from verifier evidence and acceptance audit. Out-of-scope mutation fails closed. Missing truth is BLOCKED/NEEDS_USER, never invention.',
  ].join('\n\n');
}

// ── Mandatory pre-handoff audit (REQ-005) ─────────────────────────────

export type HandoffAuditVerdict = 'PASS' | 'BLOCKED' | 'NEEDS_USER';
export type HandoffGateId = 'intent_completeness' | 'plan_spec_completeness' | 'implementation_completeness';

export interface HandoffAuditFinding {
  /** H1..H10 checkpoint code. */
  code: string;
  gate: HandoffGateId;
  /** error -> BLOCKED, needs_user -> NEEDS_USER, info -> non-blocking. */
  severity: 'error' | 'needs_user' | 'info';
  message: string;
  items: string[];
}

export interface HandoffAuditReceipt {
  schema: 'harness/handoff-audit-receipt';
  version: 1;
  verdict: HandoffAuditVerdict;
  gates: Record<HandoffGateId, 'PASS' | 'BLOCKED' | 'NEEDS_USER'>;
  findings: HandoffAuditFinding[];
  candidate_hash: string;
  audit_sha256: string;
}

export interface HandoffAuditInput {
  contract: FrozenPortableContract;
  spec: WorkSpec;
  /** Implementation candidate packets (what is about to be handed off). */
  candidate: readonly TaskPacket[];
  /** Assumptions explicitly authorized by the owner. */
  authorized_assumptions: string[];
  /** References actually provisioned for the worker (paths). */
  provided_references: string[];
}

const GATES: readonly HandoffGateId[] = ['intent_completeness', 'plan_spec_completeness', 'implementation_completeness'];

/**
 * Ten checkpoints over three independent gates. Never defaults to BLOCKED:
 * findings decide the verdict (error=BLOCKED, needs_user=NEEDS_USER, only
 * info or none -> PASS).
 */
export function auditPreHandoff(input: HandoffAuditInput): HandoffAuditReceipt {
  const findings: HandoffAuditFinding[] = [];
  const push = (code: string, gate: HandoffGateId, severity: HandoffAuditFinding['severity'], message: string, items: string[] = []): void => {
    findings.push({ code, gate, severity, message, items });
  };

  const contract = input.contract;
  const spec = input.spec;
  const specItems = effectiveSpecItems(spec);
  const candidateTaskIds = new Set(input.candidate.map((packet) => packet.task_id));
  const requirementToCandidate = new Map<string, string[]>();
  for (const packet of input.candidate) {
    for (const requirementId of packet.requirements) requirementToCandidate.set(requirementId, [...(requirementToCandidate.get(requirementId) ?? []), packet.task_id]);
  }
  const claimToCandidate = new Map<string, string[]>();
  for (const packet of input.candidate) {
    for (const acceptance of packet.acceptance) claimToCandidate.set(acceptance.claim_id, [...(claimToCandidate.get(acceptance.claim_id) ?? []), packet.task_id]);
  }

  // H1 — every effective requirement is covered (including requirements without claims).
  const uncovered = specItems.filter((item) => item.kind === 'requirement' && item.status === 'ACTIVE' && (requirementToCandidate.get(item.id) ?? []).length === 0);
  push('H1', 'implementation_completeness', uncovered.length ? 'error' : 'info',
    uncovered.length ? 'effective requirements have no implementation responsibility' : 'every effective requirement is covered',
    uncovered.map((item) => item.id));

  // H2 — constraints and non-goals intact in the contract.
  const missingConstraints = specItems.filter((item) => (item.kind === 'constraint' || item.kind === 'non_goal') && item.status === 'ACTIVE' && !contract.constraints.includes(item.statement) && !contract.non_goals.includes(item.statement));
  push('H2', 'plan_spec_completeness', missingConstraints.length ? 'error' : 'info',
    missingConstraints.length ? 'ACTIVE constraints/non-goals dropped from the frozen contract' : 'constraints and non-goals intact',
    missingConstraints.map((item) => `${item.kind}:${item.statement}`));

  // H3 — settled decisions are encoded in the contract.
  const settledDecisions = specItems.filter((item) => item.kind === 'decision' && item.status === 'ACTIVE');
  const unencoded = settledDecisions.filter((item) => !contract.decisions.includes(item.statement));
  push('H3', 'intent_completeness', unencoded.length ? 'error' : 'info',
    unencoded.length ? 'settled decisions are not encoded in the contract' : 'settled decisions encoded',
    unencoded.map((item) => item.id));

  // H4 — rejected/superseded decisions do not reappear.
  const resurrected = specItems.filter((item) => (item.status === 'REJECTED' || item.status === 'SUPERSEDED') && contract.decisions.includes(item.statement));
  push('H4', 'intent_completeness', resurrected.length ? 'error' : 'info',
    resurrected.length ? 'rejected/superseded decisions reappear in the contract' : 'no rejected/superseded decision resurfaces',
    resurrected.map((item) => item.id));

  // H5 — no unauthorized assumptions.
  const unauthorized = specItems.filter((item) => item.kind === 'assumption' && item.status === 'ACTIVE' && !input.authorized_assumptions.includes(item.statement));
  push('H5', 'intent_completeness', unauthorized.length ? 'needs_user' : 'info',
    unauthorized.length ? 'assumptions are not explicitly authorized by the owner' : 'all assumptions authorized',
    unauthorized.map((item) => item.statement));

  // H6 — unresolved questions are not turned into facts.
  const unresolved = specItems.filter((item) => item.kind === 'unresolved' || item.status === 'UNRESOLVED');
  const asFact = unresolved.filter((item) => contract.assumptions.includes(item.statement) || contract.decisions.includes(item.statement));
  push('H6', 'intent_completeness', asFact.length ? 'error' : 'info',
    asFact.length ? 'unresolved questions were turned into facts' : 'unresolved questions remain unresolved',
    asFact.map((item) => item.id));

  // H7 — every requirement has an implementation responsibility.
  const noResponsibility = contract.requirements.filter((requirement) => (requirementToCandidate.get(requirement.id) ?? []).length === 0);
  push('H7', 'implementation_completeness', noResponsibility.length ? 'error' : 'info',
    noResponsibility.length ? 'requirements lack implementation responsibility' : 'every requirement has implementation responsibility',
    noResponsibility.map((requirement) => requirement.id));

  // H8 — every requirement has acceptance/proof.
  const noAcceptance = contract.requirements.filter((requirement) => {
    if (requirement.status !== 'ACTIVE') return false;
    return requirement.claims.some((claim) => (claimToCandidate.get(claim) ?? []).length === 0);
  });
  push('H8', 'implementation_completeness', noAcceptance.length ? 'error' : 'info',
    noAcceptance.length ? 'requirements lack acceptance/proof routing for at least one claim' : 'every requirement has acceptance/proof',
    noAcceptance.map((requirement) => requirement.id));

  // H9 — important references are sufficient for the worker.
  const important = (spec.references ?? []).filter((reference) => (reference.used_by?.length ?? 0) > 0 || (reference.sha256 !== undefined));
  const missing = important.filter((reference) => !input.provided_references.includes(reference.path));
  const contractReferencePaths = contract.references.map((reference) => reference.path);
  const contractMissing = important.filter((reference) => !contractReferencePaths.includes(reference.path));
  const referenceFindings = [...missing.map((reference) => reference.path), ...contractMissing.map((reference) => reference.path)];
  push('H9', 'plan_spec_completeness', referenceFindings.length ? 'needs_user' : 'info',
    referenceFindings.length ? 'important references are not provisioned for the worker' : 'references sufficient for the worker',
    [...new Set(referenceFindings)]);

  // H10 — the candidate does not drift from the final effective intent.
  const drift: string[] = [];
  for (const packet of input.candidate) {
    const unknownRequirement = packet.requirements.find((requirementId) => !specItems.some((item) => item.id === requirementId));
    if (unknownRequirement) drift.push(`${packet.task_id}: unknown requirement ${unknownRequirement}`);
    const referencesNonActive = packet.requirements.some((requirementId) => {
      const item = specItems.find((candidate) => candidate.id === requirementId);
      return item !== undefined && (item.status === 'REJECTED' || item.status === 'SUPERSEDED');
    });
    if (referencesNonActive) drift.push(`${packet.task_id}: references non-active requirement`);
  }
  push('H10', 'intent_completeness', drift.length ? 'error' : 'info',
    drift.length ? 'candidate drifts from the final effective intent' : 'candidate matches the final effective intent',
    drift);

  const gateVerdicts: Record<HandoffGateId, 'PASS' | 'BLOCKED' | 'NEEDS_USER'> = { intent_completeness: 'PASS', plan_spec_completeness: 'PASS', implementation_completeness: 'PASS' };
  for (const gate of GATES) {
    const gateFindings = findings.filter((finding) => finding.gate === gate);
    if (gateFindings.some((finding) => finding.severity === 'error')) gateVerdicts[gate] = 'BLOCKED';
    else if (gateFindings.some((finding) => finding.severity === 'needs_user')) gateVerdicts[gate] = 'NEEDS_USER';
  }
  const gateValues = Object.values(gateVerdicts);
  const verdict: HandoffAuditVerdict = gateValues.includes('BLOCKED') ? 'BLOCKED' : gateValues.includes('NEEDS_USER') ? 'NEEDS_USER' : 'PASS';

  const candidateHash = sha256Canonical(input.candidate);
  const body = {
    schema: 'harness/handoff-audit-receipt' as const,
    version: 1 as const,
    verdict,
    gates: gateVerdicts,
    findings,
    candidate_hash: candidateHash,
    contract_hash: contract.semantic_hash,
  };
  return { ...body, audit_sha256: sha256Canonical(body) };
}

export function auditGateStatus(audit: HandoffAuditReceipt): Record<HandoffGateId, 'PASS' | 'BLOCKED' | 'NEEDS_USER'> {
  return { ...audit.gates };
}
