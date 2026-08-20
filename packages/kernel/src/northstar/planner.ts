import { classifyRisk, compileTaskPackets, compileWorkSpec, type ClaimDefinition, type CompiledSpec, type RequirementDraft, type TaskDraft } from './compiler.js';
import { NORTH_STAR_PROTOCOL_VERSION, validateTraceability, type EvidenceKind, type RiskClass, type TaskPacket, type WorkRequest, type WorkSpecImpact } from './protocol.js';
import type { ClaimAcceptancePolicy } from './evidence-ledger.js';
import type { VerifierDefinition } from './runtime.js';

export interface PlannerVerifier {
  id: string;
  kind: EvidenceKind;
  argv: { executable: string; args: string[]; cwd?: string; timeout_ms?: number };
  description?: string;
}

export interface PlannerContract {
  protocol_version: string;
  raw_intent: string;
  risk_class: RiskClass;
  requirements: RequirementDraft[];
  tasks: TaskDraft[];
  verifiers: PlannerVerifier[];
  known: string[];
  assumed: string[];
  unresolved: string[];
  requires_user: string[];
  impact: WorkSpecImpact;
  decisions?: string[];
  claim_policies?: ClaimAcceptancePolicy[];
}

export interface CompiledPlannerContract {
  compiled: CompiledSpec;
  packets: TaskPacket[];
  verifiers: VerifierDefinition[];
  claimPolicies: ClaimAcceptancePolicy[];
}

const RISK_RANK: Record<RiskClass, number> = { S0: 0, S1: 1, S2: 2, S3: 3 };
const EVIDENCE_KINDS = new Set<EvidenceKind>(['static','test','integration','api','browser','visual','mobile','security','scope','semantic','other']);

const FORBIDDEN_VERIFIER_EXECUTABLES = new Set(['rm','rmdir','del','erase','mv','move','cp','copy','bash','sh','zsh','fish','cmd','cmd.exe','powershell','powershell.exe','pwsh']);
const GIT_READ_ONLY = new Set(['status','diff','grep','ls-files','rev-parse','show','log']);
function executableBase(value: string): string {
  return value.replace(/\\/g, '/').split('/').at(-1)!.toLowerCase();
}
function assertPlannerVerifierSafety(verifier: PlannerVerifier): void {
  const base = executableBase(verifier.argv.executable);
  if (FORBIDDEN_VERIFIER_EXECUTABLES.has(base)) throw new Error(`planner verifier ${verifier.id} uses forbidden executable ${base}`);
  if (verifier.argv.cwd !== undefined) {
    const normalized = verifier.argv.cwd.replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`planner verifier ${verifier.id} cwd must remain relative to the target workspace`);
    }
  }
  if (base === 'node' || base === 'node.exe') {
    if (verifier.argv.args.some((arg) => arg === '-e' || arg === '--eval' || arg.startsWith('--eval='))) throw new Error(`planner verifier ${verifier.id} may not inject Node eval code`);
  }
  if (base === 'python' || base === 'python3' || base === 'python.exe' || base === 'python3.exe') {
    if (verifier.argv.args.includes('-c')) throw new Error(`planner verifier ${verifier.id} may not inject Python -c code`);
  }
  if (base === 'git' || base === 'git.exe') {
    const sub = verifier.argv.args.find((arg) => !arg.startsWith('-'));
    if (!sub || !GIT_READ_ONLY.has(sub)) throw new Error(`planner verifier ${verifier.id} git subcommand must be read-only`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keysOnly(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} has unknown field(s): ${extras.join(', ')}`);
}
function stringArray(value: unknown, label: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string[]`);
  }
  return [...value] as string[];
}
function parseRequirement(value: unknown, index: number): RequirementDraft {
  if (!isObject(value)) throw new Error(`requirements[${index}] must be an object`);
  keysOnly(value, ['id','statement','mandatory','claims'], `requirements[${index}]`);
  if (typeof value.statement !== 'string' || !value.statement.trim()) throw new Error(`requirements[${index}].statement must be non-empty`);
  if (value.id !== undefined && (typeof value.id !== 'string' || !/^R-/.test(value.id))) throw new Error(`requirements[${index}].id must start with R-`);
  if (value.mandatory !== undefined && typeof value.mandatory !== 'boolean') throw new Error(`requirements[${index}].mandatory must be boolean`);
  if (!Array.isArray(value.claims) || value.claims.length === 0) throw new Error(`requirements[${index}].claims must be non-empty`);
  const claims = value.claims.map((claim, claimIndex) => {
    if (!isObject(claim)) throw new Error(`requirements[${index}].claims[${claimIndex}] must be an object`);
    keysOnly(claim, ['claim_id','statement','class','required_kinds','verifier_id'], `requirements[${index}].claims[${claimIndex}]`);
    if (typeof claim.statement !== 'string' || !claim.statement.trim()) throw new Error(`requirements[${index}].claims[${claimIndex}].statement must be non-empty`);
    if (!['mechanical','runtime','semantic'].includes(String(claim.class))) throw new Error(`requirements[${index}].claims[${claimIndex}].class is invalid`);
    if (claim.claim_id !== undefined && (typeof claim.claim_id !== 'string' || !/^C-/.test(claim.claim_id))) throw new Error(`requirements[${index}].claims[${claimIndex}].claim_id must start with C-`);
    const requiredKinds = claim.required_kinds === undefined ? undefined : stringArray(claim.required_kinds, `requirements[${index}].claims[${claimIndex}].required_kinds`).map((kind) => {
      if (!EVIDENCE_KINDS.has(kind as EvidenceKind)) throw new Error(`unknown evidence kind: ${kind}`);
      return kind as EvidenceKind;
    });
    if (claim.verifier_id !== undefined && claim.verifier_id !== null && typeof claim.verifier_id !== 'string') throw new Error(`requirements[${index}].claims[${claimIndex}].verifier_id must be string|null`);
    return {
      ...(typeof claim.claim_id === 'string' ? { claim_id: claim.claim_id } : {}),
      statement: claim.statement,
      class: claim.class as ClaimDefinition['class'],
      ...(requiredKinds?.length ? { required_kinds: requiredKinds } : {}),
      ...(claim.verifier_id !== undefined ? { verifier_id: claim.verifier_id as string | null } : {}),
    };
  });
  return {
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    statement: value.statement,
    ...(typeof value.mandatory === 'boolean' ? { mandatory: value.mandatory } : {}),
    claims,
  };
}
function parseTask(value: unknown, index: number): TaskDraft {
  if (!isObject(value)) throw new Error(`tasks[${index}] must be an object`);
  keysOnly(value, ['goal','requirement_ids','owned','forbidden','claim_ids','entrypoints','symbols','references','decisions','constraints','skills','capabilities','phase','stop_if','verifier_by_claim','verifiers_by_claim'], `tasks[${index}]`);
  if (typeof value.goal !== 'string' || !value.goal.trim()) throw new Error(`tasks[${index}].goal must be non-empty`);
  if (value.phase !== undefined && !['research','design','implement','verify','review','release','operate'].includes(String(value.phase))) {
    throw new Error(`tasks[${index}].phase is invalid`);
  }
  const parseOptional = (key: string): string[] | undefined => value[key] === undefined ? undefined : stringArray(value[key], `tasks[${index}].${key}`);
  const single: Record<string,string|null> = {};
  if (value.verifier_by_claim !== undefined) {
    if (!isObject(value.verifier_by_claim)) throw new Error(`tasks[${index}].verifier_by_claim must be an object`);
    for (const [claim, verifier] of Object.entries(value.verifier_by_claim)) {
      if (verifier !== null && typeof verifier !== 'string') throw new Error(`tasks[${index}].verifier_by_claim.${claim} must be string|null`);
      single[claim] = verifier as string | null;
    }
  }
  const many: Record<string,string[]> = {};
  if (value.verifiers_by_claim !== undefined) {
    if (!isObject(value.verifiers_by_claim)) throw new Error(`tasks[${index}].verifiers_by_claim must be an object`);
    for (const [claim, verifiers] of Object.entries(value.verifiers_by_claim)) many[claim] = stringArray(verifiers, `tasks[${index}].verifiers_by_claim.${claim}`, false);
  }
  return {
    goal: value.goal,
    requirement_ids: stringArray(value.requirement_ids, `tasks[${index}].requirement_ids`, false),
    owned: stringArray(value.owned, `tasks[${index}].owned`),
    claim_ids: stringArray(value.claim_ids, `tasks[${index}].claim_ids`, false),
    ...(parseOptional('forbidden') ? { forbidden: parseOptional('forbidden')! } : {}),
    ...(parseOptional('entrypoints') ? { entrypoints: parseOptional('entrypoints')! } : {}),
    ...(parseOptional('symbols') ? { symbols: parseOptional('symbols')! } : {}),
    ...(parseOptional('references') ? { references: parseOptional('references')! } : {}),
    ...(parseOptional('decisions') ? { decisions: parseOptional('decisions')! } : {}),
    ...(parseOptional('constraints') ? { constraints: parseOptional('constraints')! } : {}),
    ...(parseOptional('skills') ? { skills: parseOptional('skills')! } : {}),
    ...(parseOptional('capabilities') ? { capabilities: parseOptional('capabilities')! } : {}),
    ...(typeof value.phase === 'string' ? { phase: value.phase as TaskDraft['phase'] } : {}),
    ...(parseOptional('stop_if') ? { stop_if: parseOptional('stop_if')! } : {}),
    ...(Object.keys(single).length ? { verifier_by_claim: single } : {}),
    ...(Object.keys(many).length ? { verifiers_by_claim: many } : {}),
  };
}
function parseVerifier(value: unknown, index: number): PlannerVerifier {
  if (!isObject(value)) throw new Error(`verifiers[${index}] must be an object`);
  keysOnly(value, ['id','kind','argv','description'], `verifiers[${index}]`);
  if (typeof value.id !== 'string' || !value.id.trim()) throw new Error(`verifiers[${index}].id must be non-empty`);
  if (!EVIDENCE_KINDS.has(value.kind as EvidenceKind)) throw new Error(`verifiers[${index}].kind is invalid`);
  if (!isObject(value.argv)) throw new Error(`verifiers[${index}].argv must be an object`);
  keysOnly(value.argv, ['executable','args','cwd','timeout_ms'], `verifiers[${index}].argv`);
  if (typeof value.argv.executable !== 'string' || !value.argv.executable.trim()) throw new Error(`verifiers[${index}].argv.executable must be non-empty`);
  const args = stringArray(value.argv.args, `verifiers[${index}].argv.args`);
  if (value.argv.cwd !== undefined && typeof value.argv.cwd !== 'string') throw new Error(`verifiers[${index}].argv.cwd must be string`);
  if (value.argv.timeout_ms !== undefined && (!Number.isInteger(value.argv.timeout_ms) || Number(value.argv.timeout_ms) < 1)) throw new Error(`verifiers[${index}].argv.timeout_ms must be integer >= 1`);
  if (value.description !== undefined && typeof value.description !== 'string') throw new Error(`verifiers[${index}].description must be string`);
  const parsed: PlannerVerifier = { id: value.id, kind: value.kind as EvidenceKind, argv: { executable: value.argv.executable, args, ...(typeof value.argv.cwd === 'string' ? { cwd: value.argv.cwd } : {}), ...(value.argv.timeout_ms !== undefined ? { timeout_ms: Number(value.argv.timeout_ms) } : {}) }, ...(typeof value.description === 'string' ? { description: value.description } : {}) };
  assertPlannerVerifierSafety(parsed);
  return parsed;
}

/** Parse a strong-planner output as data. Unknown fields and shell strings fail closed. */
export function parsePlannerContract(value: unknown): PlannerContract {
  if (!isObject(value)) throw new Error('planner contract must be an object');
  keysOnly(value, ['protocol_version','raw_intent','risk_class','requirements','tasks','verifiers','known','assumed','decisions','unresolved','requires_user','impact','claim_policies'], 'planner contract');
  if (value.protocol_version !== NORTH_STAR_PROTOCOL_VERSION) throw new Error(`planner contract protocol must be ${NORTH_STAR_PROTOCOL_VERSION}`);
  if (typeof value.raw_intent !== 'string' || !value.raw_intent) throw new Error('planner contract raw_intent must be non-empty');
  if (!['S0','S1','S2','S3'].includes(String(value.risk_class))) throw new Error('planner contract risk_class is invalid');
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) throw new Error('planner contract requirements must be non-empty');
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) throw new Error('planner contract tasks must be non-empty');
  if (!Array.isArray(value.verifiers) || value.verifiers.length === 0) throw new Error('planner contract verifiers must be non-empty');
  const known = stringArray(value.known, 'planner contract known');
  const assumed = stringArray(value.assumed, 'planner contract assumed');
  const unresolved = stringArray(value.unresolved, 'planner contract unresolved');
  const requiresUser = stringArray(value.requires_user, 'planner contract requires_user');
  if (!isObject(value.impact)) throw new Error('planner contract impact must be an object');
  keysOnly(value.impact, ['owning_modules','dependency_breadth','public_api','schema_data','security_boundaries','reference_dependencies','relevant_tests','active_decisions'], 'planner contract impact');
  const impact: WorkSpecImpact = {
    owning_modules: stringArray(value.impact.owning_modules, 'planner contract impact.owning_modules', false),
    dependency_breadth: typeof value.impact.dependency_breadth === 'string' && value.impact.dependency_breadth.trim() ? value.impact.dependency_breadth : (() => { throw new Error('planner contract impact.dependency_breadth must be non-empty'); })(),
    public_api: stringArray(value.impact.public_api, 'planner contract impact.public_api'),
    schema_data: stringArray(value.impact.schema_data, 'planner contract impact.schema_data'),
    security_boundaries: stringArray(value.impact.security_boundaries, 'planner contract impact.security_boundaries'),
    reference_dependencies: stringArray(value.impact.reference_dependencies, 'planner contract impact.reference_dependencies'),
    relevant_tests: stringArray(value.impact.relevant_tests, 'planner contract impact.relevant_tests'),
    active_decisions: stringArray(value.impact.active_decisions, 'planner contract impact.active_decisions'),
  };
  const claimPolicies: ClaimAcceptancePolicy[] = [];
  if (value.claim_policies !== undefined) {
    if (!Array.isArray(value.claim_policies)) throw new Error('planner contract claim_policies must be an array');
    for (const [index, policy] of value.claim_policies.entries()) {
      if (!isObject(policy)) throw new Error(`claim_policies[${index}] must be an object`);
      keysOnly(policy, ['claim_id','required_kinds','minimum_channels'], `claim_policies[${index}]`);
      if (typeof policy.claim_id !== 'string' || !/^C-/.test(policy.claim_id)) throw new Error(`claim_policies[${index}].claim_id must start with C-`);
      const required = policy.required_kinds === undefined ? undefined : stringArray(policy.required_kinds, `claim_policies[${index}].required_kinds`).map((kind) => {
        if (!EVIDENCE_KINDS.has(kind as EvidenceKind)) throw new Error(`unknown evidence kind: ${kind}`);
        return kind as EvidenceKind;
      });
      if (policy.minimum_channels !== undefined && (!Number.isInteger(policy.minimum_channels) || Number(policy.minimum_channels) < 1)) throw new Error(`claim_policies[${index}].minimum_channels must be integer >= 1`);
      claimPolicies.push({ claim_id: policy.claim_id, ...(required?.length ? { required_kinds: required } : {}), ...(policy.minimum_channels !== undefined ? { minimum_channels: Number(policy.minimum_channels) } : {}) });
    }
  }
  return {
    protocol_version: NORTH_STAR_PROTOCOL_VERSION,
    raw_intent: value.raw_intent,
    risk_class: value.risk_class as RiskClass,
    requirements: value.requirements.map(parseRequirement),
    tasks: value.tasks.map(parseTask),
    verifiers: value.verifiers.map(parseVerifier),
    known,
    assumed,
    unresolved,
    requires_user: requiresUser,
    impact,
    ...(value.decisions !== undefined ? { decisions: stringArray(value.decisions, 'planner contract decisions') } : {}),
    ...(claimPolicies.length ? { claim_policies: claimPolicies } : {}),
  };
}

/** Validate, bind, and compile a planner's output. The planner has no runtime authority. */
export function compilePlannerContract(request: WorkRequest, raw: unknown): CompiledPlannerContract {
  const contract = parsePlannerContract(raw);
  if (contract.raw_intent !== request.raw_intent) throw new Error('planner contract raw_intent does not exactly match WorkRequest');
  const detected = request.risk_hint ?? classifyRisk(request.raw_intent);
  if (RISK_RANK[contract.risk_class] < RISK_RANK[detected]) throw new Error(`planner contract may not lower risk ${detected} -> ${contract.risk_class}`);
  const compiled = compileWorkSpec(request, {
    requirements: contract.requirements, known: contract.known, assumed: contract.assumed,
    decisions: contract.decisions, unresolved: contract.unresolved, requires_user: contract.requires_user, impact: contract.impact, risk_class: contract.risk_class,
  });
  if (compiled.requires_planner) throw new Error('planner contract did not discharge planner requirement');
  if (compiled.spec.unresolved?.length) throw new Error(`planner contract remains unresolved: ${compiled.spec.unresolved.join('; ')}`);
  if (compiled.spec.requires_user?.length) throw new Error(`planner contract requires user input: ${compiled.spec.requires_user.join('; ')}`);
  const packets = compileTaskPackets(compiled, contract.tasks);
  const trace = validateTraceability(compiled.spec, packets);
  if (!trace.valid) throw new Error(`planner traceability failed: ${trace.problems.map((item) => item.message).join('; ')}`);
  const verifierIds = new Set(contract.verifiers.map((item) => item.id));
  if (verifierIds.size !== contract.verifiers.length) throw new Error('planner contract verifier ids must be unique');
  const verifierKind = new Map(contract.verifiers.map((item) => [item.id, item.kind]));
  for (const packet of packets) {
    for (const acceptance of packet.acceptance) {
      if (!acceptance.verifier_id || !verifierIds.has(acceptance.verifier_id)) throw new Error(`claim ${acceptance.claim_id} references unknown/missing verifier ${acceptance.verifier_id ?? 'null'}`);
    }
  }
  const mandatoryClaims = compiled.spec.requirements.filter((item) => item.mandatory).flatMap((item) => item.claims);
  const policies = new Map((contract.claim_policies ?? []).map((item) => [item.claim_id, item]));
  for (const claimId of mandatoryClaims) {
    const verifierIdsForClaim = packets.flatMap((packet) => packet.acceptance.filter((entry) => entry.claim_id === claimId).map((entry) => entry.verifier_id)).filter((id): id is string => !!id);
    const kinds = new Set(verifierIdsForClaim.map((id) => verifierKind.get(id)).filter((kind): kind is EvidenceKind => !!kind));
    const minimum = policies.get(claimId)?.minimum_channels ?? (compiled.spec.risk_class === 'S2' || compiled.spec.risk_class === 'S3' ? 2 : 1);
    if (kinds.size < minimum) throw new Error(`mandatory claim ${claimId} has ${kinds.size}/${minimum} independent verifier channel(s)`);
  }
  return { compiled, packets, verifiers: contract.verifiers, claimPolicies: contract.claim_policies ?? [] };
}
