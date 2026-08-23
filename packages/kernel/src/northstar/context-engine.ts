import {
  sha256Canonical,
  type WorkRequest,
  type WorkSpec,
  type TaskPacket,
} from './protocol.js';
import {
  type SkillRoute,
  type SkillRole,
  type SkillCatalogItem,
  describeSkillCatalog,
  createStandardCapabilityBroker,
  inferSkillRole,
  routeSkills,
} from './routing.js';
import type { RepairTaxonomyResult } from './pair-repair.js';

export type ContextExecutionPhase =
  | 'INTAKE'
  | 'PLAN'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REPAIR'
  | 'REPLAN'
  | 'SETTLEMENT';

export type ContextTransitionTrigger =
  | 'INITIAL_INTAKE'
  | 'TRANSITION_PLANNING'
  | 'TRANSITION_IMPLEMENTATION'
  | 'NEW_WORKSPACE_FACT'
  | 'BROWSER_OR_REFERENCE_NEEDED'
  | 'VERIFIER_START'
  | 'VERIFIER_FAILURE'
  | 'LOCAL_REPAIR'
  | 'PLAN_AMENDMENT'
  | 'STRUCTURAL_REPLAN'
  | 'TASK_SETTLED'
  | 'RUN_FINALIZED';

export interface WorkspaceFacts {
  readonly repoRoot: string;
  readonly detectedStack?: readonly string[];
  readonly hasMobile?: boolean;
  readonly hasDatabase?: boolean;
  readonly hasFrontend?: boolean;
  readonly hasBackend?: boolean;
  readonly hasTerraformOrKube?: boolean;
  readonly discoveredFiles?: readonly string[];
}

export interface HostSurfaceContext {
  readonly host: string;
  readonly surface: 'cli' | 'ide' | 'desktop' | 'agent-driver' | 'headless';
  readonly version?: string;
  readonly mode?: string;
  readonly supportsNativeSkills?: boolean;
  readonly supportsNativeMcp?: boolean;
}

export interface RuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'safety' | 'scope' | 'authority' | 'preservation' | 'migration' | 'security' | 'verification' | 'quality';
  readonly enforcePhase: readonly ContextExecutionPhase[];
  readonly appliesWhen: (state: Readonly<ContextState>) => boolean;
  readonly enforcementAction: 'FAIL_CLOSED' | 'QUARANTINE_MUTATION' | 'REQUIRE_USER_APPROVAL' | 'APPLY_PREDICATE';
}

export type ProviderHealth = 'HEALTHY' | 'UNHEALTHY' | 'UNVERIFIED';

export interface ActiveProviderBinding {
  readonly providerId: string;
  readonly capability: string;
  readonly lifecycleStage: 'REGISTERED' | 'CONNECTED_HEALTHY' | 'NATIVE_DISCOVERED' | 'SESSION_VISIBLE' | 'PERMITTED_AUTHORIZED' | 'INVOKED' | 'EFFECT_PROVEN' | 'IDLE_CLEANUP';
  readonly health: ProviderHealth;
  readonly permitted: boolean;
  readonly evidence?: readonly string[];
}

export interface ContextObservation {
  readonly id: string;
  readonly observedAt: string;
  readonly source: 'tool_output' | 'runtime_event' | 'file_change' | 'verifier_output' | 'user_guidance';
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

export interface VerifierEvidence {
  readonly verifierId: string;
  readonly claimId: string;
  readonly status: 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED';
  readonly outputSha256: string;
  readonly observedAt: string;
  readonly failureReason?: string;
}

export interface ContextHistoryEntry {
  readonly transition: ContextTransitionTrigger;
  readonly at: string;
  readonly stateHash: string;
  readonly changesSummary: string;
}

export interface ContextState {
  readonly stateId: string;
  readonly stateHash: string;
  readonly request: WorkRequest;
  readonly spec: WorkSpec;
  readonly packet?: TaskPacket;
  readonly workspaceFacts: WorkspaceFacts;
  readonly hostSurface: HostSurfaceContext;
  readonly phase: ContextExecutionPhase;
  readonly activeRules: readonly RuleDefinition[];
  readonly activeSkills: readonly SkillRoute[];
  readonly skillCatalog: readonly SkillCatalogItem[];
  readonly activeProviders: readonly ActiveProviderBinding[];
  readonly observations: readonly ContextObservation[];
  readonly verifierEvidence: readonly VerifierEvidence[];
  readonly repairState?: RepairTaxonomyResult;
  readonly history: readonly ContextHistoryEntry[];
}

export const CANONICAL_HARNESS_RULES: readonly RuleDefinition[] = [
  {
    id: 'RULE-01-RAW-INTENT-PRESERVATION',
    name: 'Raw User Intent & Traceability Preservation',
    description: 'Raw user intent must be preserved byte-for-byte; tasks must remain traceable to requirements and claims.',
    category: 'preservation',
    enforcePhase: ['INTAKE', 'PLAN', 'IMPLEMENT', 'VERIFY', 'REPAIR', 'REPLAN', 'SETTLEMENT'],
    appliesWhen: () => true,
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-02-FORBIDDEN-SCOPE-FAIL-CLOSED',
    name: 'Forbidden & Out-of-Scope Mutation Fail-Closed',
    description: 'Any edit touching forbidden paths or files outside owned scope is rejected immediately before verification.',
    category: 'scope',
    enforcePhase: ['IMPLEMENT', 'REPAIR'],
    appliesWhen: () => true,
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-03-WORKERS-NEVER-AUTHOR-PASS',
    name: 'Workers Never Author PASS',
    description: 'Completion verdict is strictly derived by the harness from verifier evidence and acceptance audit.',
    category: 'verification',
    enforcePhase: ['VERIFY', 'REPAIR', 'SETTLEMENT'],
    appliesWhen: () => true,
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-04-VERIFICATION-INTEGRITY',
    name: 'Verification Bypass & Hard-Disable Prevention',
    description: 'Never weaken, skip, delete, or hard-disable verification commands or test assertions to make a run green.',
    category: 'verification',
    enforcePhase: ['IMPLEMENT', 'VERIFY', 'REPAIR'],
    appliesWhen: () => true,
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-05-PRESERVE-LEGACY-BEHAVIOR',
    name: 'Preserve Proven Legacy Behavior',
    description: 'Do not delete proven legacy behavior until its replacement has verified parity.',
    category: 'preservation',
    enforcePhase: ['PLAN', 'IMPLEMENT', 'REPAIR', 'REPLAN'],
    appliesWhen: (state) => (state.request.risk_hint ?? 'S1') === 'S2' || (state.request.risk_hint ?? 'S1') === 'S3',
    enforcementAction: 'REQUIRE_USER_APPROVAL',
  },
  {
    id: 'RULE-06-BOUNDED-REPAIR',
    name: 'Bounded Repair Taxonomy & Max Retries',
    description: 'Repair attempts are strictly classified and bounded. Missing truth becomes BLOCKED/NEEDS_USER, not invention.',
    category: 'safety',
    enforcePhase: ['REPAIR', 'REPLAN'],
    appliesWhen: (state) => Boolean(state.repairState),
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-07-DATABASE-MIGRATION-SAFETY',
    name: 'Database Migration & Rollback Evidence Gate',
    description: 'Schema changes require explicit migration rollback verification evidence before production mutation.',
    category: 'migration',
    enforcePhase: ['PLAN', 'IMPLEMENT', 'VERIFY'],
    appliesWhen: (state) => Boolean(state.workspaceFacts.hasDatabase || state.activeSkills.some((s) => s.id.includes('database') || s.id.includes('migration'))),
    enforcementAction: 'FAIL_CLOSED',
  },
  {
    id: 'RULE-08-SECURITY-BOUNDARY-CHECK',
    name: 'Security Boundary & Threat Surface Review',
    description: 'Cross-cutting changes touching auth, credentials, or public API require independent security verification.',
    category: 'security',
    enforcePhase: ['PLAN', 'IMPLEMENT', 'VERIFY'],
    appliesWhen: (state) => Boolean(state.activeSkills.some((s) => s.id.includes('security') || s.id.includes('trail-of-bits'))),
    enforcementAction: 'FAIL_CLOSED',
  },
];

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function assertValidCatalogHashes(catalog: readonly SkillCatalogItem[]): void {
  for (const item of catalog) {
    if (!item.source_hash || !SHA256_HEX_RE.test(item.source_hash)) {
      throw new Error(`skill ${item.id} has missing or malformed catalog source_hash`);
    }
  }
}

export function createContextState(input: {
  request: WorkRequest;
  spec: WorkSpec;
  packet?: TaskPacket;
  workspaceFacts: WorkspaceFacts;
  hostSurface: HostSurfaceContext;
  initialPhase?: ContextExecutionPhase;
}): ContextState {
  const phase = input.initialPhase ?? 'INTAKE';
  const skillCatalog = describeSkillCatalog(input.workspaceFacts.repoRoot);
  assertValidCatalogHashes(skillCatalog);

  const initialDigest = sha256Canonical({
    work_id: input.request.work_id,
    spec_id: input.spec.spec_id,
    spec_revision: input.spec.revision,
    phase,
    trigger: 'INITIAL_INTAKE',
    repo_root: input.workspaceFacts.repoRoot,
    host: input.hostSurface.host,
  });

  const stateId = `CTX-${initialDigest.slice(0, 12)}`;

  const rawState: ContextState = {
    stateId,
    stateHash: initialDigest,
    request: input.request,
    spec: input.spec,
    packet: input.packet,
    workspaceFacts: input.workspaceFacts,
    hostSurface: input.hostSurface,
    phase,
    skillCatalog,
    activeRules: [],
    activeSkills: [],
    activeProviders: [],
    observations: [],
    verifierEvidence: [],
    history: [],
  };

  return evaluateContextState(rawState, 'INITIAL_INTAKE');
}

/**
 * The Canonical Context Engine evaluation cycle.
 * Re-evaluates Rules, Skills, and MCP/Tools on meaningful context state transitions.
 */
export function evaluateContextState(
  currentState: ContextState,
  trigger: ContextTransitionTrigger,
  delta?: {
    nextPhase?: ContextExecutionPhase;
    newObservations?: readonly ContextObservation[];
    newVerifierEvidence?: readonly VerifierEvidence[];
    repairResult?: RepairTaxonomyResult;
    updatedPacket?: TaskPacket;
    updatedWorkspaceFacts?: Partial<WorkspaceFacts>;
  }
): ContextState {
  const phase = delta?.nextPhase ?? currentState.phase;
  const workspaceFacts: WorkspaceFacts = {
    ...currentState.workspaceFacts,
    ...(delta?.updatedWorkspaceFacts ?? {}),
  };
  const packet = delta?.updatedPacket ?? currentState.packet;
  const observations = [...currentState.observations, ...(delta?.newObservations ?? [])];
  const verifierEvidence = [...currentState.verifierEvidence, ...(delta?.newVerifierEvidence ?? [])];
  const repairState = delta?.repairResult ?? currentState.repairState;

  // 1. RULE RE-EVALUATION: Determine all deterministic rules currently applicable
  const draftState: ContextState = {
    ...currentState,
    phase,
    packet,
    workspaceFacts,
    observations,
    verifierEvidence,
    repairState,
  };

  // 2. SKILL RE-EVALUATION: Dynamic semantic discovery from broker, context graph & facts
  const activeSkills = evaluateSkillsForState(draftState);

  const draftWithSkills: ContextState = {
    ...draftState,
    activeSkills,
  };

  const activeRules = CANONICAL_HARNESS_RULES.filter((rule) => {
    return rule.enforcePhase.includes(phase) && rule.appliesWhen(draftWithSkills);
  });

  // 3. MCP / TOOL RE-EVALUATION: Derive required capabilities, resolve healthy providers, gate authorization
  const activeProviders = evaluateMcpProvidersForState(draftWithSkills, activeSkills);

  // Compute immutable semantic state hash
  const semanticDigest = sha256Canonical({
    work_id: currentState.request.work_id,
    phase,
    rules: activeRules.map((r) => r.id),
    skills: activeSkills.map((s) => `${s.id}:${s.source_hash}`),
    providers: activeProviders.map((p) => `${p.providerId}:${p.lifecycleStage}:${p.health}:${p.permitted}`),
    observations_count: observations.length,
    evidence_count: verifierEvidence.length,
    repair_category: repairState?.category,
  });

  const stateId = `CTX-${semanticDigest.slice(0, 12)}`;
  const changesSummary = `Trigger [${trigger}] -> Phase [${phase}] (Rules: ${activeRules.length}, Skills: ${activeSkills.length}, MCP: ${activeProviders.filter((p) => p.permitted).length} permitted)`;

  const history: ContextHistoryEntry[] = [
    ...currentState.history,
    {
      transition: trigger,
      at: new Date().toISOString(),
      stateHash: semanticDigest,
      changesSummary,
    },
  ];

  return {
    stateId,
    stateHash: semanticDigest,
    request: currentState.request,
    spec: currentState.spec,
    packet,
    workspaceFacts,
    hostSurface: currentState.hostSurface,
    phase,
    activeRules,
    activeSkills,
    skillCatalog: currentState.skillCatalog,
    activeProviders,
    observations,
    verifierEvidence,
    repairState,
    history,
  };
}

/**
 * Derives the active skill set for the current context state using Minimum Sufficient Coverage.
 * Uses CapabilityBroker / context graph when available, supplemented by workspace facts and observations.
 */
function evaluateSkillsForState(state: ContextState): SkillRoute[] {
  const selectedSlugs = new Set<string>();

  // If a packet exists, use the canonical routeSkills
  if (state.packet) {
    const packetRoutes = routeSkills(state.packet, state.workspaceFacts.repoRoot, { spec: state.spec });
    for (const r of packetRoutes) {
      selectedSlugs.add(r.id);
    }
  }

  // Explicit packet skills always take precedence
  for (const s of state.packet?.skills ?? []) {
    selectedSlugs.add(s);
  }

  // Semantic domain derivation from workspace facts & observations
  const obsText = state.observations.map((o) => o.content).join('\n');

  if (state.workspaceFacts.hasFrontend) {
    selectedSlugs.add('frontend-architect');
    if (state.phase === 'VERIFY' || /\b(responsive|browser|playwright|e2e|visual|screenshot)\b/i.test(state.request.raw_intent)) {
      selectedSlugs.add('browser-qa');
      selectedSlugs.add('parity-verification');
    }
  }
  if (state.workspaceFacts.hasBackend) {
    selectedSlugs.add('backend-composition');
  }
  if (state.workspaceFacts.hasDatabase) {
    selectedSlugs.add('database-stack');
  }
  if (state.workspaceFacts.hasMobile) {
    selectedSlugs.add('mobile-composition');
  }

  // Semantic discovery from observations
  if (/\b(prisma|drizzle|sql|postgres|migration|schema\.prisma)\b/i.test(obsText)) {
    selectedSlugs.add('database-stack');
    if (/\bmigrat/i.test(obsText)) {
      selectedSlugs.add('schema-migration');
    }
  }
  if (/\b(security|oauth|jwt|auth|threat|vulnerability)\b/i.test(obsText)) {
    selectedSlugs.add('security-review');
  }
  if (/\b(browser|playwright|e2e|visual regression|screenshot)\b/i.test(obsText)) {
    selectedSlugs.add('browser-qa');
    selectedSlugs.add('parity-verification');
  }
  if (state.phase === 'VERIFY' || state.phase === 'REPAIR') {
    selectedSlugs.add('quality');
  }

  // Intent-based fallback / supplementation when no packet is attached
  if (!state.packet) {
    const intent = state.request.raw_intent;
    const isBackendIntent = /\b(api|backend|endpoint|webhook|idempotency|rest|graphql|database|sql)\b/i.test(intent);
    const isFrontendIntent = /\b(frontend|ui|user interface|dashboard|redesign|layout|css|tailwind|theme)\b/i.test(intent) && !isBackendIntent;

    if (isFrontendIntent) {
      selectedSlugs.add('frontend-architect');
      if (/\b(responsive|browser|playwright|e2e|visual|screenshot)\b/i.test(intent)) {
        selectedSlugs.add('browser-qa');
        selectedSlugs.add('parity-verification');
      }
    }
    if (isBackendIntent) {
      selectedSlugs.add('backend-composition');
    }
  }

  const routes: SkillRoute[] = [];
  let index = 0;
  for (const slug of selectedSlugs) {
    const catalogItem = state.skillCatalog.find((item) => item.id === slug);
    const role: SkillRole = catalogItem?.role ?? inferSkillRole(slug);
    const source = catalogItem?.source ?? `skills/${slug}/SKILL.md`;
    const source_hash = catalogItem?.source_hash;
    if (!source_hash || !SHA256_HEX_RE.test(source_hash)) {
      throw new Error(`cannot activate skill ${slug}: missing or invalid catalog source_hash`);
    }
    routes.push({
      id: slug,
      primary: index === 0,
      role,
      reason: `derived via Context Engine Minimum Sufficient Coverage for ${slug}`,
      source,
      source_hash,
      requirement_strength: 'REQUIRED',
      tier: catalogItem?.tier ?? 2,
    });
    index++;
  }

  return routes;
}

/**
 * Derives active MCP capabilities, gates authorization, and manages registered-idle lifecycle.
 * Queries CapabilityBroker rather than hardcoding provider IDs.
 */
function evaluateMcpProvidersForState(state: ContextState, activeSkills: readonly SkillRoute[]): ActiveProviderBinding[] {
  const broker = createStandardCapabilityBroker(state.workspaceFacts.repoRoot);
  const manifest = broker.manifest(`CAP-${state.stateId}`);

  const requiredCapabilities = new Set<string>();

  const needsBrowser = activeSkills.some((s) => s.id === 'browser-qa' || s.id === 'parity-verification') ||
    state.observations.some((o) => /\b(browser|playwright|screenshot|devtools|cdp)\b/i.test(o.content));

  const needsPencil = activeSkills.some((s) => s.id === 'pencil-mcp') ||
    /\bpencil\b/i.test(state.request.raw_intent);

  const needsDocs = activeSkills.some((s) => s.id === 'context7' || s.id === 'researcher') ||
    state.observations.some((o) => /\b(documentation|api docs|library docs)\b/i.test(o.content));

  const needsCodeSemantic = activeSkills.some((s) => s.id === 'codebase-memory-mcp') ||
    state.observations.some((o) => /\b(symbol|graph|caller|reference)\b/i.test(o.content));

  if (needsBrowser) {
    requiredCapabilities.add('browser.verify');
    requiredCapabilities.add('browser.explore');
    requiredCapabilities.add('browser.debug');
  }
  if (needsPencil) {
    requiredCapabilities.add('design.inspect');
    requiredCapabilities.add('design.compose');
  }
  if (needsDocs) {
    requiredCapabilities.add('docs.lookup');
  }
  if (needsCodeSemantic) {
    requiredCapabilities.add('code.semantic');
  }

  const bindings: ActiveProviderBinding[] = [];
  const processedProviders = new Set<string>();

  for (const prov of manifest.providers) {
    if (prov.mode !== 'mcp') continue;
    if (processedProviders.has(prov.id)) continue;
    processedProviders.add(prov.id);

    const isCapabilityRequired = requiredCapabilities.has(prov.capability);
    let stage: ActiveProviderBinding['lifecycleStage'] = 'REGISTERED';
    let permitted = false;

    if (isCapabilityRequired) {
      if (state.phase === 'VERIFY' || state.phase === 'IMPLEMENT') {
        stage = 'PERMITTED_AUTHORIZED';
        permitted = true;
      } else {
        stage = 'SESSION_VISIBLE';
        permitted = false;
      }
    }

    // Health derivation: three-valued state (HEALTHY | UNHEALTHY | UNVERIFIED)
    // Health=HEALTHY only with real live observation/evidence, never assumed from host surface alone
    let health: ProviderHealth = 'UNVERIFIED';
    const provPrefix = prov.id.replace(/-mcp$/, '');
    const matchingObs = state.observations.filter((o) => o.content.toLowerCase().includes(prov.id.toLowerCase()) || o.content.toLowerCase().includes(provPrefix.toLowerCase()));
    const matchingEv = state.verifierEvidence.filter((e) => e.verifierId.toLowerCase().includes(prov.id.toLowerCase()) || e.verifierId.toLowerCase().includes(provPrefix.toLowerCase()));
    if (matchingObs.length > 0 || matchingEv.length > 0) {
      const hasFailure = matchingObs.some((o) => /error|fail|crash|unhealthy|refused|timeout/i.test(o.content)) ||
                         matchingEv.some((e) => e.status !== 'PASS');
      health = hasFailure ? 'UNHEALTHY' : 'HEALTHY';
    }

    bindings.push({
      providerId: prov.id,
      capability: prov.capability,
      lifecycleStage: stage,
      health,
      permitted,
    });
  }

  return bindings;
}
