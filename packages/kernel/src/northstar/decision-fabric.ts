import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskPacket, TaskPhase, WorkSpec } from './protocol.js';
import type { TraceabilityManifest } from './compiler.js';

export type DecisionFabricMode = 'shadow' | 'active';
export type AutonomyMode = 'EXPLORE' | 'DELIVER';
export type FactStatus = 'observed' | 'conflict' | 'unknown';

export interface FactSource {
  path: string;
  sha256: string;
}

export interface RepoFact {
  fact_id: string;
  value: string | string[];
  detector_id: string;
  confidence: number;
  status: FactStatus;
  sources: FactSource[];
  notes?: string[];
}

export interface RepoFacts {
  schema: 'harness/repo-facts/v1';
  version: 1;
  workspace_root: string;
  hierarchy?: {
    root: string;
    package_scopes: string[];
    source_scopes: string[];
    test_scopes: string[];
  };
  facts: RepoFact[];
  /** Stable content revision. It is derived from detector output, not chat state. */
  revision?: string;
}

export interface ChangeFacts {
  modules: string[];
  symbols: string[];
  kinds: string[];
  impact: {
    dependency_breadth: string;
    public_api: boolean;
    schema: boolean;
    security_boundary: boolean;
    destructive: boolean;
  };
  effects: {
    repo_write: boolean;
    external_write: boolean;
  };
  design_baseline_changed: boolean;
  /** Planned facts become observed facts only when a concrete diff is supplied. */
  observed_paths: string[];
  observation: 'planned' | 'observed';
  source: string[];
}

export interface TaskFacts {
  phase: TaskPhase;
  domains: string[];
  stack: Record<string, boolean>;
  change_kinds: string[];
  impact: ChangeFacts['impact'];
  change_observation: ChangeFacts['observation'];
  observed_paths: string[];
  risk: { class: string; security_boundary: boolean; destructive: boolean };
  effects: ChangeFacts['effects'];
  claims: string[];
  fact_ids: string[];
}

export interface DecisionFabricDecision {
  schema: 'harness/decision-fabric/v1';
  mode: DecisionFabricMode;
  autonomy_mode: AutonomyMode;
  promotion_gate: {
    scratch_allowed: boolean;
    durable_writes_allowed: boolean;
    requires_scope_proof: true;
  };
  phase: TaskPhase;
  skills: string[];
  policies: string[];
  capabilities: string[];
  verifiers: string[];
  reviewers: string[];
  task_facts: TaskFacts;
  rationale: string[];
  fact_revision: string | null;
  /** Model/provider workaround retirement evidence (AM-0001 / REQ-019). */
  workarounds?: Array<{
    id: string;
    owner: string;
    trigger: string;
    scope: string;
    expires_at?: string;
    retired: boolean;
    retirement_evidence?: string;
  }>;
  legacy?: {
    skills: string[];
    capabilities: string[];
  };
  differences?: string[];
}

export interface DecisionFabricInput {
  packet: TaskPacket;
  spec: WorkSpec;
  manifest?: TraceabilityManifest;
  repoFacts?: RepoFacts | null;
  mode?: DecisionFabricMode;
  autonomy_mode?: AutonomyMode;
  /** Optional post-change paths; routing remains planned when omitted. */
  observedPaths?: readonly string[];
  /** Active model/provider workarounds with expiry/retirement evidence. */
  workarounds?: DecisionFabricDecision['workarounds'];
}

function asValues(fact: RepoFact | undefined): string[] {
  if (!fact) return [];
  return Array.isArray(fact.value) ? [...fact.value] : [fact.value];
}

function hasFact(facts: RepoFacts | null | undefined, factId: string, expected?: string): boolean {
  const fact = facts?.facts.find((candidate) => candidate.fact_id === factId && candidate.status === 'observed');
  return !!fact && (expected === undefined || asValues(fact).includes(expected));
}

function factIds(facts: RepoFacts | null | undefined, ids: string[]): string[] {
  return ids.filter((id) => facts?.facts.some((fact) => fact.fact_id === id) ?? false);
}

function phaseFor(packet: TaskPacket): TaskPhase {
  return packet.phase ?? 'implement';
}

export function repoFactsRevision(facts: Pick<RepoFacts, 'facts'>): string {
  return crypto.createHash('sha256').update(JSON.stringify(facts.facts)).digest('hex');
}

export function loadRepoFacts(repoRoot: string): RepoFacts | null {
  const candidates = [
    path.join(repoRoot, 'generated', 'repo-facts.json'),
    path.join(repoRoot, 'repo-facts.json'),
    path.join(repoRoot, '.agent', 'cache', 'repo-facts.json'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RepoFacts;
  if (parsed.schema !== 'harness/repo-facts/v1' || parsed.version !== 1 || !Array.isArray(parsed.facts)) {
    throw new Error(`repo facts artifact is malformed: ${path.relative(repoRoot, file)}`);
  }
  for (const fact of parsed.facts) {
    if (!fact.fact_id || !fact.detector_id || !Array.isArray(fact.sources) || fact.sources.length === 0) {
      throw new Error(`repo facts entry is missing provenance: ${fact.fact_id ?? '<missing>'}`);
    }
    for (const provenance of fact.sources) {
      if (!provenance || typeof provenance.path !== 'string' || !/^[0-9a-f]{64}$/.test(provenance.sha256)) {
        throw new Error(`repo facts entry has malformed provenance: ${fact.fact_id}`);
      }
      const relative = provenance.path.replace(/\\/g, '/');
      const target = path.resolve(repoRoot, relative);
      const boundary = path.resolve(repoRoot) + path.sep;
      if (path.isAbsolute(relative) || !target.startsWith(boundary) || !fs.existsSync(target)) {
        throw new Error(`repo facts provenance escapes or is missing: ${provenance.path}`);
      }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (actual !== provenance.sha256) throw new Error(`repo facts provenance is stale: ${provenance.path}`);
    }
  }
  return { ...parsed, revision: parsed.revision ?? repoFactsRevision(parsed) };
}

export function deriveChangeFacts(spec: WorkSpec, packet: TaskPacket, observedPaths: readonly string[] = []): ChangeFacts {
  const impact = spec.impact;
  const classes = packet.acceptance.map((entry) => entry.claim_id);
  const kinds = [
    ...(packet.phase === 'verify' ? ['verification'] : []),
    ...(packet.phase === 'review' ? ['review'] : []),
    ...(impact?.public_api.length ? ['public-api'] : []),
    ...(impact?.schema_data.length ? ['schema'] : []),
    ...(impact?.security_boundaries.length ? ['security'] : []),
    ...(impact?.dependency_breadth === 'cross-module' ? ['cross-module'] : []),
  ];
  if (packet.context?.references?.some((ref) => /\.(?:pen|fig)$/i.test(ref))) kinds.push('design');
  if (observedPaths.length > 0) kinds.push('observed-diff');
  return {
    modules: [...impact?.owning_modules ?? []],
    symbols: [...packet.context?.symbols ?? []],
    kinds: [...new Set(kinds.length ? kinds : ['implementation'])],
    impact: {
      dependency_breadth: impact?.dependency_breadth ?? 'local',
      public_api: Boolean(impact?.public_api.length),
      schema: Boolean(impact?.schema_data.length),
      security_boundary: Boolean(impact?.security_boundaries.length),
      destructive: spec.risk_class === 'S3',
    },
    effects: { repo_write: packet.scope.owned.length > 0, external_write: false },
    design_baseline_changed: false,
    observed_paths: [...new Set(observedPaths)],
    observation: observedPaths.length > 0 ? 'observed' : 'planned',
    source: [...new Set([...classes, ...packet.scope.owned, ...observedPaths])],
  };
}

export function deriveTaskFacts(input: { packet: TaskPacket; spec: WorkSpec; manifest?: TraceabilityManifest; repoFacts?: RepoFacts | null; observedPaths?: readonly string[] }): TaskFacts {
  const change = deriveChangeFacts(input.spec, input.packet, input.observedPaths);
  const frameworks = input.repoFacts?.facts.find((fact) => fact.fact_id === 'framework');
  const stack: Record<string, boolean> = {
    react: asValues(frameworks).includes('react'),
    vue: asValues(frameworks).includes('vue'),
    nextjs: asValues(frameworks).includes('next'),
    mobile: hasFact(input.repoFacts, 'platform.mobile', 'mobile'),
    playwright: hasFact(input.repoFacts, 'test.runner', 'playwright'),
  };
  const domains = [
    ...(stack.react || stack.vue || stack.nextjs ? ['frontend', 'web'] : []),
    ...(stack.mobile ? ['mobile'] : []),
    ...(change.impact.schema ? ['data'] : []),
    ...(change.impact.security_boundary ? ['security'] : []),
  ];
  const claims = input.manifest?.claims
    .filter((claim) => input.packet.acceptance.some((entry) => entry.claim_id === claim.claim_id))
    .map((claim) => claim.class) ?? [];
  const fact_ids = factIds(input.repoFacts, ['framework', 'platform.mobile', 'test.runner', 'package.manager', 'database.tool']);
  return {
    phase: phaseFor(input.packet),
    domains: [...new Set(domains)],
    stack,
    change_kinds: change.kinds,
    impact: change.impact,
    change_observation: change.observation,
    observed_paths: change.observed_paths,
    risk: { class: input.spec.risk_class ?? 'S1', security_boundary: change.impact.security_boundary, destructive: change.impact.destructive },
    effects: change.effects,
    claims: [...new Set(claims)],
    fact_ids,
  };
}

export function decide(input: DecisionFabricInput): DecisionFabricDecision {
  const task_facts = deriveTaskFacts(input);
  const explicitCapabilities = [...input.packet.capabilities ?? []];
  const baseCapabilities = explicitCapabilities.length
    ? explicitCapabilities
    : [
      'filesystem.read', 'filesystem.write', 'code.search', 'shell.exec', 'git.read',
      ...(task_facts.stack.playwright && task_facts.change_kinds.some((kind) => ['verification', 'design'].includes(kind)) ? ['browser.verify'] : []),
      ...(task_facts.claims.includes('semantic') ? ['code.semantic'] : []),
    ];
  const capabilities = [
    ...baseCapabilities,
    ...(task_facts.impact.schema ? ['database.disposable', 'database.migration.verify'] : []),
  ];
  const verifiers = [...new Set(input.packet.acceptance.map((entry) => entry.verifier_id).filter((id): id is string => typeof id === 'string'))];
  const reviewers = task_facts.risk.class === 'S2' || task_facts.risk.class === 'S3' || task_facts.claims.includes('semantic') ? ['independent-semantic-review'] : [];
  const policies = [
    'scope.fail-closed',
    'evidence.required',
    'worker-pass.derived-from-verifier-evidence',
    'execution.current-generation-only',
    ...(task_facts.impact.schema ? ['database.migration-proof.required', 'database.disposable.required'] : []),
    ...(task_facts.effects.external_write ? ['external-write.owner-approved'] : []),
    ...(task_facts.risk.destructive ? ['destructive.explicit-approval'] : []),
  ];
  const rationale = [
    `phase=${task_facts.phase} is planner-bound; no phase was inferred from prompt vocabulary`,
    `skills=${input.packet.skills?.length ? 'explicit' : 'empty-by-default'}`,
    `capabilities=${explicitCapabilities.length ? 'explicit' : 'typed task/repository facts'}`,
    ...(task_facts.impact.schema ? ['schema impact requires disposable database and migration proof; missing providers remain BLOCKED'] : []),
    ...(input.workarounds?.length ? [`workarounds=${input.workarounds.map((entry) => `${entry.id}${entry.retired ? ':retired' : ''}`).join(',')}`] : []),
  ];
  return {
    schema: 'harness/decision-fabric/v1',
    mode: input.mode ?? 'shadow',
    autonomy_mode: input.autonomy_mode ?? 'DELIVER',
    promotion_gate: {
      scratch_allowed: (input.autonomy_mode ?? 'DELIVER') === 'EXPLORE',
      durable_writes_allowed: (input.autonomy_mode ?? 'DELIVER') === 'DELIVER',
      requires_scope_proof: true,
    },
    phase: task_facts.phase,
    skills: [...input.packet.skills ?? []],
    policies,
    capabilities: [...new Set(capabilities)],
    verifiers,
    reviewers,
    task_facts,
    rationale,
    fact_revision: input.repoFacts ? (input.repoFacts.revision ?? repoFactsRevision(input.repoFacts)) : null,
    ...(input.workarounds?.length ? { workarounds: input.workarounds.map((entry) => ({ ...entry })) } : {}),
  };
}

export function compareDecisionFabric(
  decision: DecisionFabricDecision,
  legacy: { skills: string[]; capabilities: string[] },
): DecisionFabricDecision {
  const differences = [
    ...([...new Set([...legacy.skills, ...decision.skills])].filter((id) => legacy.skills.includes(id) !== decision.skills.includes(id)).map((id) => `skills:${id}`)),
    ...([...new Set([...legacy.capabilities, ...decision.capabilities])].filter((id) => legacy.capabilities.includes(id) !== decision.capabilities.includes(id)).map((id) => `capabilities:${id}`)),
  ];
  return { ...decision, legacy: { skills: [...legacy.skills], capabilities: [...legacy.capabilities] }, differences };
}
