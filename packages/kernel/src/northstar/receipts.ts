import crypto from 'node:crypto';
import type { EvidenceKind } from './protocol.js';
import type { HostId } from './host-adapters.js';

export type CapabilitySurfaceKind =
  | 'skill'
  | 'instruction_rule'
  | 'mcp'
  | 'hook_plugin'
  | 'subagent'
  | 'planner'
  | 'reference_input'
  | 'permission'
  | 'sandbox'
  | 'session'
  | 'compaction'
  | 'model_observability'
  | 'verifier'
  | 'plan_compiler'
  | 'decision_enforcement';

export type StageRequirement = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';
export type StageObservation = 'SATISFIED' | 'FAILED' | 'UNKNOWN';

export type ReachabilityStatus =
  | 'LIVE_VERIFIED'
  | 'NATIVE_DISCOVERED'
  | 'ADVERTISED'
  | 'SELECTED'
  | 'ACTIVATED'
  | 'PERMISSION_HIDDEN'
  | 'DISCOVERY_ERROR'
  | 'ACTIVATION_FAILED'
  | 'EFFECT_UNPROVEN'
  | 'STALE_SESSION'
  | 'RELOAD_REQUIRED'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'UNPROBED'
  | 'REMOVED';

export interface StageEvidenceRecord {
  requirement: StageRequirement;
  observation: StageObservation;
  evidence_ref?: string;
  evaluated_at?: string;
}

export type LifecycleStageName =
  | 'defined'
  | 'built'
  | 'projected'
  | 'native_discovered'
  | 'advertised'
  | 'selected'
  | 'activated'
  | 'actually_used'
  | 'effect_observed'
  | 'verified';

export type SurfaceStageProfile = Record<LifecycleStageName, StageRequirement>;

export const SURFACE_STAGE_PROFILES: Record<CapabilitySurfaceKind, SurfaceStageProfile> = {
  skill: {
    defined: 'REQUIRED',
    built: 'REQUIRED',
    projected: 'REQUIRED',
    native_discovered: 'REQUIRED',
    advertised: 'REQUIRED',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  instruction_rule: {
    defined: 'REQUIRED',
    built: 'REQUIRED',
    projected: 'REQUIRED',
    native_discovered: 'REQUIRED',
    advertised: 'REQUIRED',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  mcp: {
    defined: 'REQUIRED',
    built: 'OPTIONAL',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'REQUIRED',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  hook_plugin: {
    defined: 'REQUIRED',
    built: 'OPTIONAL',
    projected: 'OPTIONAL',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  subagent: {
    defined: 'REQUIRED',
    built: 'OPTIONAL',
    projected: 'OPTIONAL',
    native_discovered: 'REQUIRED',
    advertised: 'REQUIRED',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  planner: {
    defined: 'REQUIRED',
    built: 'OPTIONAL',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  reference_input: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'NOT_APPLICABLE',
    advertised: 'NOT_APPLICABLE',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  permission: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  sandbox: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  session: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  compaction: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  model_observability: {
    defined: 'REQUIRED',
    built: 'NOT_APPLICABLE',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'NOT_APPLICABLE',
    activated: 'NOT_APPLICABLE',
    actually_used: 'NOT_APPLICABLE',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  verifier: {
    defined: 'REQUIRED',
    built: 'OPTIONAL',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'REQUIRED',
    advertised: 'NOT_APPLICABLE',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  plan_compiler: {
    defined: 'REQUIRED',
    built: 'REQUIRED',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'NOT_APPLICABLE',
    advertised: 'NOT_APPLICABLE',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
  decision_enforcement: {
    defined: 'REQUIRED',
    built: 'REQUIRED',
    projected: 'NOT_APPLICABLE',
    native_discovered: 'NOT_APPLICABLE',
    advertised: 'NOT_APPLICABLE',
    selected: 'REQUIRED',
    activated: 'REQUIRED',
    actually_used: 'REQUIRED',
    effect_observed: 'REQUIRED',
    verified: 'REQUIRED',
  },
};

export interface UniversalCapabilityReceipt {
  schema: 'agent-rules/universal-capability-receipt/v1';
  version: 1;
  receipt_sha256: string;
  host: HostId;
  host_surface: 'ide' | 'cli' | 'app_server' | 'headless' | 'sdk';
  host_version?: string;
  binary_path?: string;
  observed_model?: string;
  workspace_root: string;
  capability_type: CapabilitySurfaceKind;
  capability_id: string;
  source_hash: string;

  projection?: {
    scope: 'global' | 'workspace';
    target_path: string;
    target_hash: string;
    representation_format: 'directory_skill_md' | 'single_file_overlay' | 'manifest_entry' | 'custom_package';
    ownership_manifest_ref: string;
  };

  native_binding?: {
    effective_root: string;
    effective_precedence_rank: number;
    winning_definition_hash: string;
    shadowed_definitions?: Array<{ root: string; hash: string }>;
  };

  stages: Record<LifecycleStageName, StageEvidenceRecord>;

  native_discovery_evidence?: {
    discovery_method: 'app_server_api' | 'cli_catalog' | 'native_directory_scan' | 'hook_event' | 'session_event';
    catalog_snapshot_hash: string;
    details?: Record<string, unknown>;
  };

  selection_evidence?: {
    router_id: string;
    matched_roles: string[];
    requirement_strength: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
    minimal_set_reason: string;
  };

  activation_evidence?: {
    activation_phase: 'planning' | 'execution' | 'verification';
    transport: 'native_tool' | 'prompt_body' | 'hook_injection' | 'mcp_handshake' | 'approval_interception';
    context_tokens?: number;
  };

  effect_evidence?: {
    evidence_kind: EvidenceKind;
    artifact_hash?: string;
    diff_sha256?: string;
    task_changeset_ref?: string;
    verdict?: string;
  };

  status: ReachabilityStatus;
  evaluated_at: string;
}

export function computeReceiptSha256(receipt: Omit<UniversalCapabilityReceipt, 'receipt_sha256'>): string {
  const serialized = JSON.stringify(receipt, Object.keys(receipt).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export function createUniversalReceipt(input: {
  host: HostId;
  host_surface: UniversalCapabilityReceipt['host_surface'];
  host_version?: string;
  binary_path?: string;
  observed_model?: string;
  workspace_root: string;
  capability_type: CapabilitySurfaceKind;
  capability_id: string;
  source_hash: string;
  projection?: UniversalCapabilityReceipt['projection'];
  native_binding?: UniversalCapabilityReceipt['native_binding'];
  stage_observations?: Partial<Record<LifecycleStageName, { observation: StageObservation; evidence_ref?: string }>>;
  native_discovery_evidence?: UniversalCapabilityReceipt['native_discovery_evidence'];
  selection_evidence?: UniversalCapabilityReceipt['selection_evidence'];
  activation_evidence?: UniversalCapabilityReceipt['activation_evidence'];
  effect_evidence?: UniversalCapabilityReceipt['effect_evidence'];
  status?: ReachabilityStatus;
}): UniversalCapabilityReceipt {
  const profile = SURFACE_STAGE_PROFILES[input.capability_type];
  const evaluated_at = new Date().toISOString();

  const stages = (Object.keys(profile) as LifecycleStageName[]).reduce<Record<LifecycleStageName, StageEvidenceRecord>>(
    (acc, stageName) => {
      const requirement = profile[stageName];
      const observed = input.stage_observations?.[stageName];
      acc[stageName] = {
        requirement,
        observation: observed?.observation ?? 'UNKNOWN',
        evidence_ref: observed?.evidence_ref,
        evaluated_at,
      };
      return acc;
    },
    {} as Record<LifecycleStageName, StageEvidenceRecord>
  );

  let status = input.status;
  if (!status) {
    const allRequiredSatisfied = (Object.keys(stages) as LifecycleStageName[]).every((stage) => {
      if (stages[stage].requirement !== 'REQUIRED') return true;
      return stages[stage].observation === 'SATISFIED';
    });
    const anyRequiredFailed = (Object.keys(stages) as LifecycleStageName[]).some((stage) => {
      return stages[stage].requirement === 'REQUIRED' && stages[stage].observation === 'FAILED';
    });

    if (allRequiredSatisfied) {
      status = 'LIVE_VERIFIED';
    } else if (anyRequiredFailed) {
      status = 'BLOCKED';
    } else if (stages.native_discovered.observation === 'SATISFIED') {
      status = 'NATIVE_DISCOVERED';
    } else if (stages.built.observation === 'SATISFIED' || stages.defined.observation === 'SATISFIED') {
      status = 'UNPROBED';
    } else {
      status = 'BLOCKED';
    }
  }

  const base: Omit<UniversalCapabilityReceipt, 'receipt_sha256'> = {
    schema: 'agent-rules/universal-capability-receipt/v1',
    version: 1,
    host: input.host,
    host_surface: input.host_surface,
    host_version: input.host_version,
    binary_path: input.binary_path,
    observed_model: input.observed_model,
    workspace_root: input.workspace_root,
    capability_type: input.capability_type,
    capability_id: input.capability_id,
    source_hash: input.source_hash,
    projection: input.projection,
    native_binding: input.native_binding,
    stages,
    native_discovery_evidence: input.native_discovery_evidence,
    selection_evidence: input.selection_evidence,
    activation_evidence: input.activation_evidence,
    effect_evidence: input.effect_evidence,
    status,
    evaluated_at,
  };

  const receipt_sha256 = computeReceiptSha256(base);
  const receipt: UniversalCapabilityReceipt = {
    ...base,
    receipt_sha256,
  };

  assertUniversalCapabilityReceipt(receipt);
  return receipt;
}

export function assertUniversalCapabilityReceipt(receipt: unknown): asserts receipt is UniversalCapabilityReceipt {
  if (!receipt || typeof receipt !== 'object') throw new Error('UniversalCapabilityReceipt must be an object');
  const r = receipt as Partial<UniversalCapabilityReceipt>;
  if (r.schema !== 'agent-rules/universal-capability-receipt/v1') throw new Error(`Invalid receipt schema: ${r.schema}`);
  if (r.version !== 1) throw new Error(`Invalid receipt version: ${r.version}`);
  if (!r.receipt_sha256 || typeof r.receipt_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(r.receipt_sha256)) {
    throw new Error('Receipt missing valid sha256 digest');
  }
  if (!r.capability_type || !SURFACE_STAGE_PROFILES[r.capability_type]) {
    throw new Error(`Unknown capability_type: ${r.capability_type}`);
  }
  if (!r.stages || typeof r.stages !== 'object') {
    throw new Error('Receipt missing lifecycle stages object');
  }

  const profile = SURFACE_STAGE_PROFILES[r.capability_type];
  const VALID_REQUIREMENTS = new Set<StageRequirement>(['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE']);
  const VALID_OBSERVATIONS = new Set<StageObservation>(['SATISFIED', 'FAILED', 'UNKNOWN']);

  for (const stage of Object.keys(profile) as LifecycleStageName[]) {
    const s = r.stages[stage];
    if (!s) throw new Error(`Missing stage record for ${stage}`);
    if (!VALID_REQUIREMENTS.has(s.requirement)) {
      throw new Error(`Invalid stage requirement for ${stage}: ${s.requirement}`);
    }
    if (!VALID_OBSERVATIONS.has(s.observation)) {
      throw new Error(`Invalid stage observation for ${stage}: ${s.observation}. Observation must be SATISFIED | FAILED | UNKNOWN (NOT_APPLICABLE is forbidden as an observation value).`);
    }
    if (s.requirement !== profile[stage]) {
      throw new Error(`Stage ${stage} requirement mismatch: got ${s.requirement}, expected ${profile[stage]}`);
    }
  }

  // Schema Invariant: LIVE_VERIFIED requires all REQUIRED stages to be SATISFIED
  if (r.status === 'LIVE_VERIFIED') {
    for (const [stage, expectedReq] of Object.entries(profile)) {
      if (expectedReq === 'REQUIRED') {
        const obs = r.stages[stage as LifecycleStageName]?.observation;
        if (obs !== 'SATISFIED') {
          throw new Error(`Inadmissible LIVE_VERIFIED receipt: stage ${stage} is REQUIRED but observation is ${obs}`);
        }
      }
    }
    if (profile.effect_observed === 'REQUIRED' && !r.effect_evidence) {
      throw new Error('Inadmissible LIVE_VERIFIED receipt: missing effect_evidence');
    }
  }

  // Schema Invariant: File-projected capabilities must have projection record when projected stage is SATISFIED
  if (profile.projected === 'REQUIRED' && r.stages.projected?.observation === 'SATISFIED' && !r.projection) {
    throw new Error(`Capability type ${r.capability_type} has SATISFIED projection but missing projection metadata`);
  }

  // Schema Invariant: Stale or reload status cannot be verified
  if ((r.status === 'STALE_SESSION' || r.status === 'RELOAD_REQUIRED') && r.stages.verified?.observation === 'SATISFIED') {
    throw new Error(`Status ${r.status} cannot have verified observation SATISFIED`);
  }
}

export type TruthLevel =
  | 'IMPLEMENTED'
  | 'PROJECTED'
  | 'NATIVE_DISCOVERED'
  | 'SESSION_VISIBLE'
  | 'ACTIVATED'
  | 'USED'
  | 'EFFECT_PROVEN'
  | 'LIVE_CERTIFIED';

export const TRUTH_LEVEL_ORDER: readonly TruthLevel[] = [
  'IMPLEMENTED',
  'PROJECTED',
  'NATIVE_DISCOVERED',
  'SESSION_VISIBLE',
  'ACTIVATED',
  'USED',
  'EFFECT_PROVEN',
  'LIVE_CERTIFIED',
];

export function deriveTruthLevel(receipt: UniversalCapabilityReceipt): TruthLevel {
  const s = receipt.stages;
  if (receipt.status === 'LIVE_VERIFIED' && s.verified?.observation === 'SATISFIED' && receipt.effect_evidence) {
    return 'LIVE_CERTIFIED';
  }
  if (s.effect_observed?.observation === 'SATISFIED' && receipt.effect_evidence) {
    return 'EFFECT_PROVEN';
  }
  if (s.actually_used?.observation === 'SATISFIED') {
    return 'USED';
  }
  if (s.activated?.observation === 'SATISFIED' || receipt.activation_evidence) {
    return 'ACTIVATED';
  }
  if (s.advertised?.observation === 'SATISFIED' || receipt.selection_evidence) {
    return 'SESSION_VISIBLE';
  }
  if (s.native_discovered?.observation === 'SATISFIED' || receipt.native_discovery_evidence) {
    return 'NATIVE_DISCOVERED';
  }
  if (s.projected?.observation === 'SATISFIED' || receipt.projection) {
    return 'PROJECTED';
  }
  return 'IMPLEMENTED';
}

export function isTruthLevelAtLeast(level: TruthLevel, required: TruthLevel): boolean {
  return TRUTH_LEVEL_ORDER.indexOf(level) >= TRUTH_LEVEL_ORDER.indexOf(required);
}

export function assertValidTruthTransition(
  fromLevel: TruthLevel,
  toLevel: TruthLevel,
  evidence: {
    nativeDiscoveryEvidence?: boolean;
    activationEvidence?: boolean;
    effectEvidence?: boolean;
    liveEnvironmentVerified?: boolean;
    isFresh?: boolean;
  }
): void {
  if (evidence.isFresh === false) {
    throw new Error(`Stale session or git HEAD mismatch cannot advance truth level from ${fromLevel} to ${toLevel}`);
  }

  const fromIdx = TRUTH_LEVEL_ORDER.indexOf(fromLevel);
  const toIdx = TRUTH_LEVEL_ORDER.indexOf(toLevel);

  if (toIdx <= fromIdx) return; // Same level or downgrade is always permitted

  if (toLevel === 'NATIVE_DISCOVERED' && !evidence.nativeDiscoveryEvidence) {
    throw new Error('Static config / projected state cannot mint NATIVE_DISCOVERED without native host discovery evidence');
  }

  if (toLevel === 'ACTIVATED' && !evidence.activationEvidence) {
    throw new Error('NATIVE_DISCOVERED or SESSION_VISIBLE cannot mint ACTIVATED without runtime activation evidence');
  }

  if ((toLevel === 'USED' || toLevel === 'EFFECT_PROVEN') && !evidence.effectEvidence) {
    throw new Error('ACTIVATED cannot mint USED or EFFECT_PROVEN without verified effect evidence and content-hashed diffs');
  }

  if (toLevel === 'LIVE_CERTIFIED' && (!evidence.liveEnvironmentVerified || !evidence.effectEvidence)) {
    throw new Error('Unit or canary test PASS cannot mint LIVE_CERTIFIED without live environment execution evidence');
  }
}

// ── Standard Cross-Host Receipts ─────────────────────────────────────────────

export interface HostProjectionReceipt {
  schema: 'agent-rules/host-projection-receipt/v1';
  version: 1;
  receipt_sha256: string;
  target_host: HostId;
  source_plan_sha256: string;
  requested_action: 'ANSWER' | 'PLAN' | 'REVIEW' | 'EXECUTE';
  interaction_mode: 'AUTO_EXECUTE' | 'OWNER_REVIEW';
  requirement_dispositions: Array<{
    requirement_id: string;
    status: 'PRESERVED' | 'GROUNDED' | 'ENRICHED' | 'BLOCKED';
    details?: string;
  }>;
  non_goals_preserved: string[];
  owner_decisions_preserved: string[];
  acceptance_claims_preserved: string[];
  unresolved_material_items: string[];
  evaluated_at: string;
}

export function createHostProjectionReceipt(input: Omit<HostProjectionReceipt, 'schema' | 'version' | 'receipt_sha256' | 'evaluated_at'>): HostProjectionReceipt {
  const evaluated_at = new Date().toISOString();
  const base: Omit<HostProjectionReceipt, 'receipt_sha256'> = {
    schema: 'agent-rules/host-projection-receipt/v1',
    version: 1,
    target_host: input.target_host,
    source_plan_sha256: input.source_plan_sha256,
    requested_action: input.requested_action,
    interaction_mode: input.interaction_mode,
    requirement_dispositions: input.requirement_dispositions,
    non_goals_preserved: input.non_goals_preserved,
    owner_decisions_preserved: input.owner_decisions_preserved,
    acceptance_claims_preserved: input.acceptance_claims_preserved,
    unresolved_material_items: input.unresolved_material_items,
    evaluated_at,
  };
  const serialized = JSON.stringify(base, Object.keys(base).sort());
  const receipt_sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  return { ...base, receipt_sha256 };
}

export interface SelfReviewReceipt {
  schema: 'agent-rules/self-review-receipt/v1';
  version: 1;
  receipt_sha256: string;
  candidate_tree_sha256: string;
  candidate_diff_sha256: string;
  tier: 'Q0' | 'Q1' | 'Q2' | 'Q3';
  reviewer_session_id: string;
  findings: Array<{
    finding_id: string;
    severity: 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NOTE';
    claim_ref?: string;
    description: string;
    disposition: 'CORRECTED' | 'DEFERRED' | 'ACCEPTED';
  }>;
  correction_count: number;
  review_decision: 'APPROVE' | 'CONDITIONAL' | 'BLOCK';
  can_author_pass: false;
  evaluated_at: string;
}

export function createSelfReviewReceipt(input: Omit<SelfReviewReceipt, 'schema' | 'version' | 'receipt_sha256' | 'can_author_pass' | 'evaluated_at'>): SelfReviewReceipt {
  const evaluated_at = new Date().toISOString();
  const base: Omit<SelfReviewReceipt, 'receipt_sha256'> = {
    schema: 'agent-rules/self-review-receipt/v1',
    version: 1,
    candidate_tree_sha256: input.candidate_tree_sha256,
    candidate_diff_sha256: input.candidate_diff_sha256,
    tier: input.tier,
    reviewer_session_id: input.reviewer_session_id,
    findings: input.findings,
    correction_count: input.correction_count,
    review_decision: input.review_decision,
    can_author_pass: false,
    evaluated_at,
  };
  const serialized = JSON.stringify(base, Object.keys(base).sort());
  const receipt_sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  return { ...base, receipt_sha256 };
}

export interface HostUsabilityReceipt {
  schema: 'agent-rules/host-usability-receipt/v1';
  version: 1;
  receipt_sha256: string;
  host: HostId;
  host_version: string;
  host_surface: 'cli' | 'ide' | 'app_server' | 'headless';
  binary_path: string;
  config_status: 'CONFIG_ACCEPTED' | 'CONFIG_REJECTED';
  startup_status: 'STARTUP_CLEAN' | 'STARTUP_FAILED';
  auth_status: 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'NOT_REQUIRED';
  mcp_status: 'MCP_CONNECTED' | 'MCP_DISCONNECTED';
  canary_tool_call: {
    executed: boolean;
    nonce_matched: boolean;
    tool_name: string;
    latency_ms?: number;
  };
  restart_persistent: boolean;
  arbitrary_cwd_verified: boolean;
  overall_usability: 'HOST_USABLE_PASS' | 'HOST_USABLE_PARTIAL' | 'HOST_UNUSABLE' | 'NEEDS_USER';
  evaluated_at: string;
}

export function createHostUsabilityReceipt(input: Omit<HostUsabilityReceipt, 'schema' | 'version' | 'receipt_sha256' | 'evaluated_at'>): HostUsabilityReceipt {
  const evaluated_at = new Date().toISOString();
  const base: Omit<HostUsabilityReceipt, 'receipt_sha256'> = {
    schema: 'agent-rules/host-usability-receipt/v1',
    version: 1,
    host: input.host,
    host_version: input.host_version,
    host_surface: input.host_surface,
    binary_path: input.binary_path,
    config_status: input.config_status,
    startup_status: input.startup_status,
    auth_status: input.auth_status,
    mcp_status: input.mcp_status,
    canary_tool_call: input.canary_tool_call,
    restart_persistent: input.restart_persistent,
    arbitrary_cwd_verified: input.arbitrary_cwd_verified,
    overall_usability: input.overall_usability,
    evaluated_at,
  };
  const serialized = JSON.stringify(base, Object.keys(base).sort());
  const receipt_sha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  return { ...base, receipt_sha256 };
}
