/**
 * harness/planning/plan-contract.ts — transient PlanContractInput validator.
 *
 * Structural closure only. An accepted plan must carry an outcome, a locked
 * contract, requirements with a unique ID and an explicit change kind, a
 * preservation contract for destructive/replacement work, acceptance claims
 * with unique IDs, dependency-ready slices (each with requirements,
 * acceptance, source proof and runtime proof), classified unknowns with their
 * affected slices, and an escalation boundary. The validator never persists
 * anything and never claims semantic correctness of the plan content.
 *
 * Change-kind is authoritative via the explicit `change_kind` field; no prose
 * regex is ever treated as change-kind authority.
 */

export type ChangeKind =
  | 'CREATE'
  | 'MODIFY'
  | 'REPLACE'
  | 'RETIRE'
  | 'MIGRATE'
  | 'PRESERVE';

export type UnknownClass =
  | 'OWNER_DECISION'
  | 'SOURCE_DISCOVERABLE'
  | 'IMPLEMENTATION_LOCAL'
  | 'EXTERNAL_BLOCKER';

export type PreservationDimension =
  | 'behavior'
  | 'contracts_data'
  | 'consumers'
  | 'operational_capability'
  | 'user_visible_states';

export const CHANGE_KINDS: readonly ChangeKind[] = ['CREATE', 'MODIFY', 'REPLACE', 'RETIRE', 'MIGRATE', 'PRESERVE'];
export const UNKNOWN_CLASSES: readonly UnknownClass[] = ['OWNER_DECISION', 'SOURCE_DISCOVERABLE', 'IMPLEMENTATION_LOCAL', 'EXTERNAL_BLOCKER'];
export const PRESERVATION_DIMENSIONS: readonly PreservationDimension[] = [
  'behavior', 'contracts_data', 'consumers', 'operational_capability', 'user_visible_states',
];

/** Optional source identity / revalidation condition. */
export interface PlanSourceIdentity {
  /** Condition under which the implementer must revalidate source identity. */
  readonly revalidation_condition?: string;
  /** Original source identity (repo/commit/tree/hash) when known at plan time. */
  readonly source_ref?: string;
}

export interface PlanRequirement {
  readonly id: string;
  /** Explicit change kind — the only change-kind authority. */
  readonly change_kind: ChangeKind;
  readonly statement: string;
  /** Acceptance claim IDs this requirement maps to. */
  readonly acceptance: readonly string[];
}

export interface PlanPreservationEntry {
  readonly dimension: PreservationDimension;
  readonly detail: string;
}

export interface PlanAcceptanceClaim {
  readonly id: string;
  readonly claim: string;
  /** Required proof for this acceptance (observable). */
  readonly proof: string;
}

export interface PlanUnknown {
  readonly id: string;
  readonly class: UnknownClass;
  readonly detail: string;
  readonly affected_slices: readonly string[];
}

export interface PlanContractSlice {
  readonly id: string;
  /** What changes in this slice; empty means a verification-only slice. */
  readonly change: string;
  /** Explicit change kind (authoritative; never inferred from prose). */
  readonly change_kind: ChangeKind;
  /** Slices that must complete before this one becomes dependency-ready. */
  readonly depends_on?: readonly string[];
  /** Requirement IDs this slice implements. */
  readonly requirements?: readonly string[];
  /** Acceptance claim IDs this slice maps to. */
  readonly acceptance?: readonly string[];
  /** Source proof: observable evidence produced by inspecting the changed source. */
  readonly source_proof?: readonly string[];
  /** Runtime proof: observable evidence from running the changed behavior. */
  readonly runtime_proof?: readonly string[];
}

export interface PlanContractInput {
  readonly outcome: string;
  readonly locked_contract: string;
  /** Optional source identity / revalidation condition. */
  readonly source_identity?: PlanSourceIdentity;
  /** Requirements with unique ID, explicit change kind, acceptance mapping. */
  readonly requirements: readonly PlanRequirement[];
  /** Preservation entries for destructive/replacement work. */
  readonly preservation?: readonly PlanPreservationEntry[];
  /** Acceptance claims with unique ID. */
  readonly acceptance: readonly PlanAcceptanceClaim[];
  readonly slices: readonly PlanContractSlice[];
  /** Classified unknowns and their affected slices. */
  readonly unknowns?: readonly PlanUnknown[];
  /** Where the implementer must stop and ask the owner. */
  readonly escalation_boundary: readonly string[];
  /** Heavy planning fields are required only for critical/destructive work. */
  readonly planning_depth?: 'FAST' | 'PLANNED' | 'CRITICAL';
  readonly alternatives_considered?: readonly { readonly id: string; readonly approach: string; readonly tradeoff: string; readonly reversible: boolean }[];
  readonly counterexamples?: readonly string[];
  readonly impact_map?: Readonly<Record<'code' | 'behavior' | 'data' | 'operational' | 'user_visible', readonly string[]>>;
}

export interface PlanContractIssue {
  readonly field: string;
  readonly slice?: string;
  readonly message: string;
}

export interface PlanContractValidation {
  readonly ok: boolean;
  /** True when an OWNER_DECISION unknown makes the plan unrunnable. */
  readonly unrunnable: boolean;
  /** Slices blocked by EXTERNAL_BLOCKER unknowns (only their dependency closure). */
  readonly blocked_slices: readonly string[];
  readonly issues: readonly PlanContractIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const KINDS_SET = new Set<string>(CHANGE_KINDS);
const UNKNOWN_SET = new Set<string>(UNKNOWN_CLASSES);
const DIMENSION_SET = new Set<string>(PRESERVATION_DIMENSIONS);
const DESTRUCTIVE_KINDS = new Set<string>(['REPLACE', 'RETIRE', 'MIGRATE']);

export function validatePlanContract(input: unknown): PlanContractValidation {
  const issues: PlanContractIssue[] = [];
  const add = (field: string, message: string, slice?: string) => issues.push({ field, message, slice });
  const failClosed: PlanContractValidation = { ok: false, unrunnable: false, blocked_slices: [], issues };

  if (!isObject(input)) {
    return { ok: false, unrunnable: false, blocked_slices: [], issues: [{ field: '<root>', message: 'plan contract must be an object' }] };
  }
  const plan = input;

  if (!str(plan.outcome)) add('outcome', 'outcome is required');
  if (!str(plan.locked_contract)) add('locked_contract', 'locked contract is required');
  if (!Array.isArray(plan.escalation_boundary) || plan.escalation_boundary.length === 0) {
    add('escalation_boundary', 'escalation boundary is required: where the implementer stops and asks the owner');
  }

  // ── requirements: unique IDs, explicit change kinds, acceptance mapping.
  const requirementIds = new Set<string>();
  if (!Array.isArray(plan.requirements)) {
    add('requirements', 'requirements is required');
  } else {
    plan.requirements.forEach((raw, index) => {
      if (!isObject(raw)) { add('requirements', `requirement #${index} is not an object`); return; }
      const id = str(raw.id);
      if (!id) { add('requirements', `requirement #${index} is missing id`); return; }
      if (requirementIds.has(id)) add('requirements', `duplicate requirement id: ${id}`, id);
      requirementIds.add(id);
      if (typeof raw.change_kind !== 'string' || !KINDS_SET.has(raw.change_kind)) {
        add('requirements', `requirement ${id} has invalid or missing change_kind (${JSON.stringify(raw.change_kind)})`, id);
      }
      if (!str(raw.statement)) add('requirements', `requirement ${id} has no statement`, id);
      if (!Array.isArray(raw.acceptance) || raw.acceptance.length === 0) {
        add('requirements', `requirement ${id} must map to at least one acceptance claim`, id);
      }
    });
  }

  // ── acceptance claims: unique IDs, each with an observable proof.
  const acceptanceIds = new Set<string>();
  if (!Array.isArray(plan.acceptance)) {
    add('acceptance', 'acceptance is required');
  } else {
    plan.acceptance.forEach((raw, index) => {
      if (!isObject(raw)) { add('acceptance', `acceptance #${index} is not an object`); return; }
      const id = str(raw.id);
      if (!id) { add('acceptance', `acceptance #${index} is missing id`); return; }
      if (acceptanceIds.has(id)) add('acceptance', `duplicate acceptance id: ${id}`, id);
      acceptanceIds.add(id);
      if (!str(raw.claim)) add('acceptance', `acceptance ${id} has no claim`, id);
      if (!str(raw.proof)) add('acceptance', `acceptance ${id} must name an observable proof`, id);
    });
  }

  // ── preservation: entries must reference known dimensions.
  const preservationDimensions = new Set<PreservationDimension>();
  if (plan.preservation !== undefined && !Array.isArray(plan.preservation)) {
    add('preservation', 'preservation must be an array');
  } else {
    for (const raw of (plan.preservation ?? []) as unknown[]) {
      if (!isObject(raw)) { add('preservation', 'preservation entry is not an object'); continue; }
      const dimension = str(raw.dimension) as PreservationDimension;
      if (!DIMENSION_SET.has(dimension)) add('preservation', `invalid preservation dimension: ${JSON.stringify(raw.dimension)}`);
      else preservationDimensions.add(dimension);
      if (!str(raw.detail)) add('preservation', `preservation entry for ${dimension} has no detail`);
    }
  }

  // ── slices: unique IDs, explicit change kinds, closed + acyclic deps.
  const sliceIds = new Set<string>();
  const slices: Array<Record<string, unknown>> = [];
  if (!Array.isArray(plan.slices) || plan.slices.length === 0) {
    add('slices', 'at least one dependency-ready slice is required');
    return { ok: issues.length === 0, unrunnable: false, blocked_slices: [], issues };
  }
  plan.slices.forEach((raw, index) => {
    if (!isObject(raw)) { add('slices', `slice #${index} is not an object`); return; }
    const id = str(raw.id);
    if (!id) { add('slices', `slice #${index} is missing id`); return; }
    if (sliceIds.has(id)) add('slices', `duplicate slice id: ${id}`, id);
    sliceIds.add(id);
    if (typeof raw.change_kind !== 'string' || !KINDS_SET.has(raw.change_kind)) {
      add('slices', `slice ${id} has invalid or missing change_kind (${JSON.stringify(raw.change_kind)})`, id);
    }
    if (!Array.isArray(raw.depends_on) && raw.depends_on !== undefined) add('slices', `slice ${id} depends_on must be an array`, id);
    if (!Array.isArray(raw.requirements) && raw.requirements !== undefined) add('slices', `slice ${id} requirements must be an array`, id);
    if (!Array.isArray(raw.acceptance) && raw.acceptance !== undefined) add('slices', `slice ${id} acceptance must be an array`, id);
    slices.push(raw);
  });

  // Dependency closure + acyclicity.
  for (const slice of slices) {
    for (const dep of (slice.depends_on ?? []) as unknown[]) {
      if (!sliceIds.has(str(dep))) add('slices', `unknown dependency: ${str(dep)}`, str(slice.id));
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: readonly string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) { add('slices', `dependency cycle: ${[...trail, id].join(' -> ')}`, id); return; }
    visiting.add(id);
    const slice = slices.find((s) => str(s.id) === id);
    for (const dep of (slice?.depends_on ?? []) as unknown[]) visit(str(dep), [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const slice of slices) visit(str(slice.id), []);

  // Every requirement maps to existing acceptance; every acceptance is mapped
  // to at least one slice and is backed by source and/or runtime proof.
  for (const raw of (plan.requirements ?? []) as unknown[]) {
    if (!isObject(raw)) continue;
    const id = str(raw.id);
    for (const acceptanceId of (raw.acceptance ?? []) as unknown[]) {
      if (!acceptanceIds.has(str(acceptanceId))) add('requirements', `requirement ${id} maps to unknown acceptance ${str(acceptanceId)}`, id);
    }
  }
  const acceptanceToSlice = new Map<string, string[]>();
  const requirementToSlice = new Map<string, string[]>();
  const slicesWithProof = new Set<string>();
  for (const slice of slices) {
    const sliceId = str(slice.id);
    const sourceProof = (slice.source_proof ?? []) as unknown[];
    const runtimeProof = (slice.runtime_proof ?? []) as unknown[];
    if (!Array.isArray(slice.source_proof) || !Array.isArray(slice.runtime_proof)) {
      add('slices', `slice ${sliceId} source_proof and runtime_proof must be arrays`, sliceId);
    }
    if (sourceProof.length > 0 || runtimeProof.length > 0) slicesWithProof.add(sliceId);
    for (const reqId of (slice.requirements ?? []) as unknown[]) {
      const rId = str(reqId);
      if (!requirementIds.has(rId)) {
        add('slices', `slice ${sliceId} references unknown requirement ${rId}`, sliceId);
      } else {
        const owners = requirementToSlice.get(rId) ?? [];
        owners.push(sliceId);
        requirementToSlice.set(rId, owners);
      }
    }
    for (const acceptanceId of (slice.acceptance ?? []) as unknown[]) {
      if (!acceptanceIds.has(str(acceptanceId))) add('slices', `slice ${sliceId} maps to unknown acceptance ${str(acceptanceId)}`, sliceId);
      else {
        const owners = acceptanceToSlice.get(str(acceptanceId)) ?? [];
        owners.push(sliceId);
        acceptanceToSlice.set(str(acceptanceId), owners);
      }
    }
    if (((slice.requirements ?? []) as unknown[]).length > 0 && ((slice.acceptance ?? []) as unknown[]).length === 0) {
      add('slices', `slice ${sliceId} implements requirements but maps to no acceptance`, sliceId);
    }
  }
  for (const id of requirementIds) {
    const owners = requirementToSlice.get(id) ?? [];
    if (owners.length === 0) add('requirements', `requirement ${id} is not mapped to any slice`, id);
  }
  for (const id of acceptanceIds) {
    const owners = acceptanceToSlice.get(id) ?? [];
    if (owners.length === 0) add('acceptance', `acceptance ${id} is not mapped to any slice`, id);
  }
  // Every acceptance maps to proof: acceptance claims must be backed by a
  // slice that carries source and/or runtime proof.
  for (const [acceptanceId, owners] of acceptanceToSlice) {
    if (!owners.some((owner) => slicesWithProof.has(owner))) {
      add('acceptance', `acceptance ${acceptanceId} is mapped only to slices with no source or runtime proof`, acceptanceId);
    }
  }

  // ── destructive/replacement work requires preservation covering all five
  //    dimensions: behavior, contracts/data, consumers, operational
  //    capability, user-visible states.
  const requiredPreservation = (slice: Record<string, unknown>): boolean => {
    const kind = str(slice.change_kind) as ChangeKind;
    const opClass = str(slice.operation_class).toLowerCase();
    return DESTRUCTIVE_KINDS.has(kind) || opClass === 'refactor' || opClass === 'redesign';
  };
  for (const slice of slices) {
    if (!requiredPreservation(slice)) continue;
    const sliceId = str(slice.id);
    if (plan.preservation === undefined) {
      add('slices', `slice ${sliceId} replaces/retires/migrates/refactors; the plan must carry a preservation contract`, sliceId);
      continue;
    }
    const missing = PRESERVATION_DIMENSIONS.filter((dimension) => !preservationDimensions.has(dimension));
    if (missing.length > 0) {
      add('slices', `slice ${sliceId} has a preservation contract but it does not cover: ${missing.join(', ')}`, sliceId);
    }
  }

  const critical = plan.planning_depth === 'CRITICAL' || slices.some(requiredPreservation);
  if (critical) {
    if (!Array.isArray(plan.alternatives_considered) || plan.alternatives_considered.length < 2) add('alternatives_considered', 'critical/destructive work requires at least two materially different approaches');
    if (!Array.isArray(plan.counterexamples) || plan.counterexamples.length === 0) add('counterexamples', 'critical/destructive work requires a counterexample pass');
    if (!isObject(plan.impact_map)) add('impact_map', 'critical/destructive work requires a five-dimensional impact map');
    else for (const dimension of ['code', 'behavior', 'data', 'operational', 'user_visible'] as const) if (!Array.isArray(plan.impact_map[dimension])) add('impact_map', `impact_map.${dimension} must be an array`);
  }

  // ── unknowns: unique IDs, valid classes; OWNER_DECISION makes the plan
  //    unrunnable; EXTERNAL_BLOCKER blocks only the dependency closure;
  //    IMPLEMENTATION_LOCAL is never a blocker.
  const unknowns: Array<{ id: string; class: string; affected_slices: string[] }> = [];
  const unknownIds = new Set<string>();
  for (const raw of (plan.unknowns ?? []) as unknown[]) {
    if (!isObject(raw)) { add('unknowns', 'unknown entry is not an object'); continue; }
    const id = str(raw.id);
    if (!id) { add('unknowns', 'unknown entry is missing id'); continue; }
    if (unknownIds.has(id)) add('unknowns', `duplicate unknown id: ${id}`, id);
    unknownIds.add(id);
    const unknownClass = str(raw.class);
    if (!UNKNOWN_SET.has(unknownClass)) {
      add('unknowns', `unknown ${id} has invalid class ${JSON.stringify(raw.class)}`, id);
      continue;
    }
    for (const sliceId of (raw.affected_slices ?? []) as unknown[]) {
      if (!sliceIds.has(str(sliceId))) add('unknowns', `unknown ${id} affects unknown slice ${str(sliceId)}`, id);
    }
    unknowns.push({ id, class: unknownClass, affected_slices: ((raw.affected_slices ?? []) as unknown[]).map((s) => str(s)) });
  }

  const unrunnable = unknowns.some((unknown) => unknown.class === 'OWNER_DECISION');
  if (unrunnable) add('unknowns', 'plan is unrunnable: an OWNER_DECISION unknown requires the owner before execution');

  // EXTERNAL_BLOCKER blocks only the dependency closure of its affected slices.
  const blocked = new Set<string>();
  const blockedStack = unknowns.filter((unknown) => unknown.class === 'EXTERNAL_BLOCKER').flatMap((unknown) => unknown.affected_slices);
  while (blockedStack.length > 0) {
    const sliceId = blockedStack.pop()!;
    if (blocked.has(sliceId)) continue;
    blocked.add(sliceId);
    for (const slice of slices) {
      if (str(slice.id) === sliceId) {
        for (const dependent of slices) {
          if (((dependent.depends_on ?? []) as unknown[]).some((dep) => str(dep) === sliceId)) blockedStack.push(str(dependent.id));
        }
      }
    }
  }

  return { ok: issues.length === 0, unrunnable, blocked_slices: [...blocked], issues };
}
