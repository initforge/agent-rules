import {
  NORTH_STAR_PROTOCOL_VERSION,
  assertTaskPacket,
  assertWorkRequest,
  assertWorkSpec,
  newId,
  type EvidenceKind,
  type RiskClass,
  type TaskPacket,
  type WorkRequest,
  type WorkSource,
  type WorkSpec,
  type WorkSpecImpact,
} from './protocol.js';

export type ClaimClass = 'mechanical' | 'runtime' | 'semantic';

export interface ClaimDefinition {
  claim_id: string;
  statement: string;
  class: ClaimClass;
  required_kinds?: EvidenceKind[];
  verifier_id?: string | null;
  /** Explicit proof dependencies between claims. */
  depends_on?: string[];
  /** Default oracle lineage when verifier-level metadata is unavailable. */
  oracle_group?: string;
}

export interface TraceabilityManifest {
  protocol_version: string;
  spec_id: string;
  spec_revision: number;
  claims: ClaimDefinition[];
}

export interface RequirementDraft {
  id?: string;
  statement: string;
  mandatory?: boolean;
  claims?: Array<Omit<ClaimDefinition, 'claim_id'> & { claim_id?: string }>;
}

export interface SpecDraft {
  requirements?: RequirementDraft[];
  known?: string[];
  assumed?: string[];
  decisions?: string[];
  unresolved?: string[];
  requires_user?: string[];
  impact?: WorkSpecImpact;
  risk_class?: RiskClass;
  execution_generation?: number;
}

export interface TaskDraft {
  goal: string;
  requirement_ids: string[];
  owned: string[];
  forbidden?: string[];
  claim_ids: string[];
  entrypoints?: string[];
  symbols?: string[];
  references?: string[];
  decisions?: string[];
  constraints?: string[];
  skills?: string[];
  capabilities?: string[];
  phase?: import('./protocol.js').TaskPhase;
  stop_if?: string[];
  verifier_by_claim?: Record<string, string | null>;
  /** Multiple independent verifier channels for one claim (required for S2/S3 trust). */
  verifiers_by_claim?: Record<string, string[]>;
}

export interface CompiledSpec {
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  requires_planner: boolean;
}

const DESTRUCTIVE = /\b(drop|truncate|delete\s+(?:all|database|production)|prod(?:uction)?\s+data|payment|billing|secret|credential|auth(?:entication|orization)?|security|rls|permission|migration)\b/i;
const CROSS_CUTTING = /\b(refactor|migration|migrate|rewrite|architecture|cross[- ]?platform|parity|harness|multi[- ]?module|monorepo|schema|protocol|orchestrat|runtime|engine)\b/i;
const TRIVIAL = /\b(typo|spelling|comment|readme|docs?\s+only|rename\s+(?:a|one)\s+(?:variable|file)|format(?:ting)?)\b/i;

/** Deterministic first-pass risk classification. Strong planners may raise, never silently lower, risk. */
export function classifyRisk(rawIntent: string): RiskClass {
  if (DESTRUCTIVE.test(rawIntent)) return 'S3';
  if (CROSS_CUTTING.test(rawIntent)) return 'S2';
  if (TRIVIAL.test(rawIntent) && rawIntent.length < 1000) return 'S0';
  return 'S1';
}

export function createWorkRequest(input: {
  raw_intent: string;
  source?: WorkSource;
  explicit_constraints?: string[];
  explicit_non_goals?: string[];
  reference_inputs?: string[];
  risk_hint?: RiskClass;
  work_id?: string;
}): WorkRequest {
  const raw = input.raw_intent.trim();
  if (!raw) throw new Error('raw_intent must not be empty');
  const request: WorkRequest = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    work_id: input.work_id ?? newId('W', raw),
    raw_intent: input.raw_intent,
    source: input.source ?? 'cli',
    ...(input.explicit_constraints?.length ? { explicit_constraints: input.explicit_constraints } : {}),
    ...(input.explicit_non_goals?.length ? { explicit_non_goals: input.explicit_non_goals } : {}),
    ...(input.reference_inputs?.length ? { reference_inputs: input.reference_inputs } : {}),
    ...(input.risk_hint ? { risk_hint: input.risk_hint } : {}),
  };
  assertWorkRequest(request);
  return request;
}

function defaultClaim(statement: string): Omit<ClaimDefinition, 'claim_id'> {
  return {
    statement: `Delivered behavior satisfies: ${statement}`,
    class: 'mechanical',
  };
}

/**
 * Compile an explicit draft without inventing business requirements. When no draft is
 * supplied, raw intent becomes one requirement verbatim. S2/S3 work is marked as
 * planner-required so this conservative fallback cannot be executed by accident.
 */
export function compileWorkSpec(request: WorkRequest, draft: SpecDraft = {}): CompiledSpec {
  assertWorkRequest(request);
  const detected = request.risk_hint ?? classifyRisk(request.raw_intent);
  const risk = draft.risk_class && riskRank(draft.risk_class) >= riskRank(detected) ? draft.risk_class : detected;
  const requirementDrafts = draft.requirements?.length
    ? draft.requirements
    : [{ statement: request.raw_intent, mandatory: true, claims: [defaultClaim(request.raw_intent)] }];

  const specId = newId('S', `${request.work_id}:${request.raw_intent}`);
  const manifestClaims: ClaimDefinition[] = [];
  const requirements = requirementDrafts.map((req, reqIndex) => {
    const id = ('id' in req && req.id) ? req.id : `R-${String(reqIndex + 1).padStart(3, '0')}`;
    if (!/^R-/.test(id)) throw new Error(`invalid requirement id: ${id}`);
    const claimDrafts: Array<Omit<ClaimDefinition, 'claim_id'> & { claim_id?: string }> = req.claims?.length ? req.claims : [defaultClaim(req.statement)];
    const claims = claimDrafts.map((claim, claimIndex) => {
      const claimId = claim.claim_id ?? `C-${String(reqIndex + 1).padStart(3, '0')}${String.fromCharCode(97 + claimIndex)}`;
      manifestClaims.push({
        claim_id: claimId,
        statement: claim.statement,
        class: claim.class,
        ...(claim.required_kinds?.length ? { required_kinds: claim.required_kinds } : {}),
        ...(claim.verifier_id !== undefined ? { verifier_id: claim.verifier_id } : {}),
        ...(claim.depends_on?.length ? { depends_on: [...claim.depends_on] } : {}),
        ...(claim.oracle_group ? { oracle_group: claim.oracle_group } : {}),
      });
      return claimId;
    });
    return { id, statement: req.statement, mandatory: req.mandatory ?? true, claims };
  });

  // The owner contract requires a strong planner for every S1+ slice. Explicit
  // requirements are already the planner's compiled output; only the implicit
  // raw-intent fallback must be stopped here.
  const plannerRequired = risk !== 'S0' && !draft.requirements?.length;
  const unresolved = [...(draft.unresolved ?? [])];
  if (plannerRequired && !unresolved.includes('Strong planner must compile explicit requirements/claims before execution.')) {
    unresolved.push('Strong planner must compile explicit requirements/claims before execution.');
  }

  const spec: WorkSpec = {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    spec_id: specId,
    revision: 1,
    work_id: request.work_id,
    requirements,
    ...(request.explicit_constraints?.length ? { constraints: request.explicit_constraints } : {}),
    ...(request.explicit_non_goals?.length ? { non_goals: request.explicit_non_goals } : {}),
    ...(draft.known?.length ? { known: draft.known } : {}),
    ...(draft.assumed?.length ? { assumed: draft.assumed } : {}),
    ...(draft.decisions?.length ? { decisions: draft.decisions } : {}),
    ...(unresolved.length ? { unresolved } : {}),
    ...(draft.requires_user?.length ? { requires_user: draft.requires_user } : {}),
    ...(draft.impact ? { impact: draft.impact } : {}),
    risk_class: risk,
    ...(draft.execution_generation !== undefined ? { execution_generation: draft.execution_generation } : {}),
  };
  assertWorkSpec(spec);
  return {
    request,
    spec,
    manifest: { protocol_version: NORTH_STAR_PROTOCOL_VERSION, spec_id: specId, spec_revision: 1, claims: manifestClaims },
    requires_planner: plannerRequired,
  };
}

export function compileTaskPackets(compiled: CompiledSpec, drafts: TaskDraft[]): TaskPacket[] {
  if (compiled.requires_planner) throw new Error('spec requires strong-planner compilation before TaskPackets may be emitted');
  if (compiled.spec.unresolved?.length) throw new Error(`spec has unresolved item(s): ${compiled.spec.unresolved.join('; ')}`);
  if (compiled.spec.requires_user?.length) throw new Error(`spec requires user input: ${compiled.spec.requires_user.join('; ')}`);
  if (drafts.length === 0) throw new Error('at least one explicit task draft is required');
  const reqIds = new Set(compiled.spec.requirements.map((r) => r.id));
  const claimIds = new Set(compiled.manifest.claims.map((c) => c.claim_id));

  return drafts.map((draft, index) => {
    if (draft.requirement_ids.some((id) => !reqIds.has(id))) throw new Error(`task references unknown requirement: ${draft.requirement_ids.find((id) => !reqIds.has(id))}`);
    if (draft.claim_ids.some((id) => !claimIds.has(id))) throw new Error(`task references unknown claim: ${draft.claim_ids.find((id) => !claimIds.has(id))}`);
    const packet: TaskPacket = {
      protocol_version: NORTH_STAR_PROTOCOL_VERSION,
      task_id: `T-${String(index + 1).padStart(3, '0')}`,
      spec_id: compiled.spec.spec_id,
      spec_revision: compiled.spec.revision,
      work_id: compiled.spec.work_id,
      execution_generation: compiled.spec.execution_generation ?? 0,
      ...(draft.phase ? { phase: draft.phase } : {}),
      goal: draft.goal,
      requirements: [...draft.requirement_ids],
      scope: { owned: [...draft.owned], forbidden: [...(draft.forbidden ?? [])] },
      context: {
        ...(draft.entrypoints?.length ? { entrypoints: draft.entrypoints } : {}),
        ...(draft.symbols?.length ? { symbols: draft.symbols } : {}),
        ...(draft.decisions?.length ? { decisions: draft.decisions } : {}),
        ...(draft.references?.length ? { references: draft.references } : {}),
      },
      ...(draft.constraints?.length ? { constraints: draft.constraints } : {}),
      acceptance: draft.claim_ids.flatMap((claim_id) => {
        const many = draft.verifiers_by_claim?.[claim_id];
        if (many?.length) return [...new Set(many)].map((verifier_id) => ({ claim_id, verifier_id }));
        return [{ claim_id, verifier_id: draft.verifier_by_claim?.[claim_id] ?? compiled.manifest.claims.find((c) => c.claim_id === claim_id)?.verifier_id ?? null }];
      }),
      ...(draft.skills?.length ? { skills: draft.skills } : {}),
      ...(draft.capabilities?.length ? { capabilities: draft.capabilities } : {}),
      ...(draft.stop_if?.length ? { stop_if: draft.stop_if } : {}),
      repair: { attempt: 0, previous_failure: null },
    };
    assertTaskPacket(packet);
    return packet;
  });
}

function riskRank(risk: RiskClass): number {
  return { S0: 0, S1: 1, S2: 2, S3: 3 }[risk];
}

export interface SpecImpact {
  previous_revision: number;
  next_revision: number;
  added_requirements: string[];
  removed_requirements: string[];
  changed_requirements: string[];
  added_claims: string[];
  removed_claims: string[];
  changed_claims: string[];
}

/**
 * Create a new immutable spec revision while preserving the WorkSpec identity.
 * The normal compiler remains the only place business statements are interpreted;
 * this function changes only revision identity and then computes a reproducible diff.
 */
export function compileSpecRevision(previous: CompiledSpec, draft: SpecDraft): { compiled: CompiledSpec; impact: SpecImpact } {
  if (previous.request.work_id !== previous.spec.work_id) throw new Error('previous compiled spec identity is inconsistent');
  const nextBase = compileWorkSpec(previous.request, draft);
  const next: CompiledSpec = {
    ...nextBase,
    spec: { ...nextBase.spec, spec_id: previous.spec.spec_id, revision: previous.spec.revision + 1 },
    manifest: { ...nextBase.manifest, spec_id: previous.spec.spec_id, spec_revision: previous.spec.revision + 1 },
  };
  assertWorkSpec(next.spec);
  return { compiled: next, impact: impactSpecRevision(previous, next) };
}

export function impactSpecRevision(previous: CompiledSpec, next: CompiledSpec): SpecImpact {
  if (previous.spec.spec_id !== next.spec.spec_id) throw new Error('cannot compare revisions from different specs');
  if (next.spec.revision <= previous.spec.revision) throw new Error('next spec revision must increase');
  const prevReq = new Map(previous.spec.requirements.map((item) => [item.id, item]));
  const nextReq = new Map(next.spec.requirements.map((item) => [item.id, item]));
  const addedRequirements = [...nextReq.keys()].filter((id) => !prevReq.has(id)).sort();
  const removedRequirements = [...prevReq.keys()].filter((id) => !nextReq.has(id)).sort();
  const changedRequirements = [...nextReq.entries()]
    .filter(([id, value]) => {
      const prior = prevReq.get(id);
      return !!prior && JSON.stringify(prior) !== JSON.stringify(value);
    })
    .map(([id]) => id).sort();

  const prevClaims = new Map(previous.manifest.claims.map((item) => [item.claim_id, item]));
  const nextClaims = new Map(next.manifest.claims.map((item) => [item.claim_id, item]));
  const addedClaims = [...nextClaims.keys()].filter((id) => !prevClaims.has(id)).sort();
  const removedClaims = [...prevClaims.keys()].filter((id) => !nextClaims.has(id)).sort();
  const changedClaims = [...nextClaims.entries()]
    .filter(([id, value]) => {
      const prior = prevClaims.get(id);
      return !!prior && JSON.stringify(prior) !== JSON.stringify(value);
    })
    .map(([id]) => id).sort();

  return {
    previous_revision: previous.spec.revision,
    next_revision: next.spec.revision,
    added_requirements: addedRequirements,
    removed_requirements: removedRequirements,
    changed_requirements: changedRequirements,
    added_claims: addedClaims,
    removed_claims: removedClaims,
    changed_claims: changedClaims,
  };
}
