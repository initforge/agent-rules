/**
 * Reachable-progress and complete-set reconciliation contracts.
 *
 * These contracts deliberately sit beside the existing North-Star protocol. They
 * add implementation/proof separation without changing the legacy PASS/MATCH
 * reducer or the paused closure denominator.
 */

export const IMPLEMENTATION_STATES = [
  'TODO',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'IMPLEMENTED_FAILING',
  'BLOCKED_AUTHORITY',
] as const;
export type ImplementationState = (typeof IMPLEMENTATION_STATES)[number];

export const VERIFICATION_STATES = ['NOT_RUN', 'RUNNING', 'PASS', 'FAIL', 'UNAVAILABLE'] as const;
export type ProgressVerificationState = (typeof VERIFICATION_STATES)[number];

export const EVIDENCE_STATES = ['NONE', 'LOCAL', 'EXTERNAL', 'STALE', 'COMPLETE'] as const;
export type ProgressEvidenceState = (typeof EVIDENCE_STATES)[number];

export const CERTIFICATION_STATES = ['MATCH', 'PARTIAL', 'GAP'] as const;
export type ProgressCertificationState = (typeof CERTIFICATION_STATES)[number];

export const BLOCKER_KINDS = [
  null,
  'DEPENDENCY',
  'VERIFY_UNAVAILABLE',
  'AUTHORITY',
  'SPEC',
  'CAPABILITY',
  'ENVIRONMENT',
  'FAILURE',
] as const;
export type ProgressBlockerKind = Exclude<(typeof BLOCKER_KINDS)[number], null>;

export const VERIFICATION_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const TERMINAL_EXECUTION_STATES = ['RUNNABLE', 'TERMINAL_PARTIAL', 'TERMINAL_BLOCKED', 'COMPLETE'] as const;
export type TerminalExecutionState = (typeof TERMINAL_EXECUTION_STATES)[number];

export const RELATION_TYPES = [
  'COMPATIBLE',
  'DUPLICATE',
  'OVERLAPPING_SAME_OUTCOME',
  'CONFLICTING_POLICY',
  'CONFLICTING_SPEC',
  'SUPERSEDING',
  'DEPENDENCY_CHANGE',
  'PROVIDER_VARIANT',
  'DEFERRED_BOUNDARY',
] as const;
export type PlanRelationType = (typeof RELATION_TYPES)[number];

export const ADMISSION_STATES = ['PROPOSED', 'ADMITTED', 'BLOCKED', 'DEFERRED', 'REJECTED', 'SUPERSEDED'] as const;
export type AdmissionState = (typeof ADMISSION_STATES)[number];

export type ProgressItemKind = 'requirement' | 'claim' | 'task' | 'source-item';

export interface ProgressItem {
  readonly id: string;
  readonly kind: ProgressItemKind;
  readonly activeScope: boolean;
  readonly implementationState: ImplementationState;
  readonly verificationState: ProgressVerificationState;
  readonly evidenceState: ProgressEvidenceState;
  readonly certificationState: ProgressCertificationState;
  readonly blockerKind: ProgressBlockerKind | null;
  readonly blockerReason?: string;
  readonly minimumRequiredLevel: VerificationLevel;
  readonly strongestAvailableLevel: VerificationLevel;
  readonly dependents: readonly string[];
  readonly dependencies: readonly string[];
  readonly nextLocalAction: string;
  readonly resumeCondition?: string;
}

export interface ProgressCounts {
  readonly total: number;
  readonly implementationTodo: number;
  readonly implementationInProgress: number;
  readonly implemented: number;
  readonly implementedFailing: number;
  readonly blockedAuthority: number;
  readonly verificationPass: number;
  readonly verificationUnavailable: number;
  readonly certificationMatch: number;
  readonly certificationPartial: number;
  readonly certificationGap: number;
}

export interface ProgressSnapshot {
  readonly schema: 'harness/reachable-progress/v1';
  readonly sourceIdentity: string;
  readonly planId: string;
  readonly planRevision: number;
  readonly items: readonly ProgressItem[];
  readonly counts: ProgressCounts;
  readonly activeScopeIds: readonly string[];
  readonly candidateIds: readonly string[];
}

export interface FrontierTask {
  readonly id: string;
  readonly activeScope: boolean;
  readonly implementationState: ImplementationState;
  readonly dependencies: readonly string[];
  readonly dependencyStates: Readonly<Record<string, ImplementationState | 'MISSING'>>;
  readonly authorityAvailable: boolean;
  readonly capabilityAvailable: boolean;
  readonly nextLocalAction: string;
}

export interface FrontierResult {
  readonly executableTaskIds: readonly string[];
  readonly blockedTaskIds: readonly string[];
  readonly candidateTaskIds: readonly string[];
  readonly rejectedCandidates: readonly CandidateRejection[];
}

export interface CandidateRejection {
  readonly taskId: string;
  readonly code: 'NOT_IN_ACTIVE_SCOPE';
  readonly reason: string;
  readonly resumable: false;
}

export interface TerminalResult {
  readonly executionState: TerminalExecutionState;
  readonly localImplementation: 'COMPLETE' | 'PARTIAL';
  readonly localVerification: 'COMPLETE' | 'PARTIAL';
  readonly canonicalCertification: ProgressCertificationState;
  readonly resumeConditions: readonly string[];
  readonly frontier: readonly string[];
  readonly terminalReason: string;
}

export interface VerificationAssessment {
  readonly minimumRequiredLevel: VerificationLevel;
  readonly strongestAvailableLevel: VerificationLevel;
  readonly sufficient: boolean;
  readonly state: ProgressVerificationState;
  readonly blockerKind: ProgressBlockerKind | null;
}

export type ChangeSurface =
  | 'source'
  | 'test'
  | 'schema'
  | 'runtime'
  | 'integration'
  | 'host'
  | 'plan-metadata'
  | 'evidence'
  | 'projection'
  | 'docs';

export interface EvidenceDependency {
  readonly evidenceId: string;
  readonly dependsOn: readonly ChangeSurface[];
}

export interface FreshnessAssessment {
  readonly invalidatedEvidenceIds: readonly string[];
  readonly preservedEvidenceIds: readonly string[];
  readonly reason: string;
}

export interface CompactProgressReceipt {
  readonly schema: 'harness/compact-progress-receipt/v1';
  readonly sourceIdentity: string;
  readonly planId: string;
  readonly planRevision: number;
  readonly affectedScope: readonly string[];
  readonly claimCoverage: readonly string[];
  readonly counts: ProgressCounts;
  readonly strongestVerificationLevel: VerificationLevel;
  readonly fresh: boolean;
  readonly blocker: ProgressBlockerKind | null;
  readonly artifactUri: string;
  readonly terminalReason?: string;
  readonly resumeConditions: readonly string[];
}

export interface AdmissionRecord {
  readonly additionId: string;
  readonly sourceIntent: string;
  readonly owner: string;
  readonly authorityBoundary: string;
  readonly affectedItems: readonly string[];
  readonly requestedEffect: string;
  readonly acceptance: readonly string[];
  readonly proposedPhase: string;
  readonly dependencies: readonly string[];
  readonly status: AdmissionState;
}

export interface RelationInput {
  readonly sameOutcome?: boolean;
  readonly duplicateCanonicalOwner?: boolean;
  readonly conflictsWithPolicy?: boolean;
  readonly conflictsWithSpec?: boolean;
  readonly replacesOld?: boolean;
  readonly dependencyChanged?: boolean;
  readonly providerSpecific?: boolean;
  readonly deferredByBoundary?: boolean;
}

export interface RelationDecision {
  readonly relation: PlanRelationType;
  readonly requiresOwnerDecision: boolean;
  readonly affectedDecisionSurface: boolean;
  readonly handling: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isInOrder(value: VerificationLevel): number {
  return VERIFICATION_LEVELS.indexOf(value);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

export function assessVerification(input: {
  minimumRequiredLevel: VerificationLevel;
  strongestAvailableLevel: VerificationLevel;
  verificationState: ProgressVerificationState;
  capabilityAvailable?: boolean;
}): VerificationAssessment {
  const unavailable = input.capabilityAvailable === false || input.verificationState === 'UNAVAILABLE';
  if (unavailable) {
    return {
      minimumRequiredLevel: input.minimumRequiredLevel,
      strongestAvailableLevel: input.strongestAvailableLevel,
      sufficient: false,
      state: 'UNAVAILABLE',
      blockerKind: 'VERIFY_UNAVAILABLE',
    };
  }
  const sufficient = isInOrder(input.strongestAvailableLevel) >= isInOrder(input.minimumRequiredLevel)
    && input.verificationState === 'PASS';
  return {
    minimumRequiredLevel: input.minimumRequiredLevel,
    strongestAvailableLevel: input.strongestAvailableLevel,
    sufficient,
    state: input.verificationState,
    blockerKind: sufficient ? null : input.verificationState === 'FAIL' ? 'FAILURE' : null,
  };
}

export function deriveLegacyCertification(item: Pick<ProgressItem, 'implementationState' | 'verificationState' | 'evidenceState' | 'certificationState'>): ProgressCertificationState {
  if (item.certificationState === 'MATCH') return 'MATCH';
  if (item.implementationState === 'IMPLEMENTED_FAILING' || item.verificationState === 'FAIL') return 'GAP';
  if (item.evidenceState === 'STALE' || item.verificationState === 'UNAVAILABLE') return 'PARTIAL';
  return item.certificationState;
}

export function countProgress(items: readonly ProgressItem[]): ProgressCounts {
  return {
    total: items.length,
    implementationTodo: items.filter((item) => item.implementationState === 'TODO').length,
    implementationInProgress: items.filter((item) => item.implementationState === 'IN_PROGRESS').length,
    implemented: items.filter((item) => item.implementationState === 'IMPLEMENTED').length,
    implementedFailing: items.filter((item) => item.implementationState === 'IMPLEMENTED_FAILING').length,
    blockedAuthority: items.filter((item) => item.implementationState === 'BLOCKED_AUTHORITY').length,
    verificationPass: items.filter((item) => item.verificationState === 'PASS').length,
    verificationUnavailable: items.filter((item) => item.verificationState === 'UNAVAILABLE').length,
    certificationMatch: items.filter((item) => deriveLegacyCertification(item) === 'MATCH').length,
    certificationPartial: items.filter((item) => deriveLegacyCertification(item) === 'PARTIAL').length,
    certificationGap: items.filter((item) => deriveLegacyCertification(item) === 'GAP').length,
  };
}

export function buildProgressSnapshot(input: {
  sourceIdentity: string;
  planId: string;
  planRevision: number;
  items: readonly ProgressItem[];
  candidateIds?: readonly string[];
}): ProgressSnapshot {
  assert(input.sourceIdentity.trim().length > 0, 'sourceIdentity must be non-empty');
  assert(Number.isInteger(input.planRevision) && input.planRevision >= 0, 'planRevision must be a non-negative integer');
  const ids = input.items.map((item) => item.id);
  assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'progress item ids must be unique and non-empty');
  return {
    schema: 'harness/reachable-progress/v1',
    sourceIdentity: input.sourceIdentity,
    planId: input.planId,
    planRevision: input.planRevision,
    items: input.items,
    counts: countProgress(input.items),
    activeScopeIds: unique(input.items.filter((item) => item.activeScope).map((item) => item.id)),
    candidateIds: unique(input.candidateIds ?? input.items.filter((item) => !item.activeScope).map((item) => item.id)),
  };
}

export function rejectCandidateTask(taskId: string, reason = 'candidate work is not explicitly activated in the effective contract'): CandidateRejection {
  assert(taskId.trim().length > 0, 'taskId must be non-empty');
  return { taskId, code: 'NOT_IN_ACTIVE_SCOPE', reason, resumable: false };
}

export function computeReachableFrontier(tasks: readonly FrontierTask[]): FrontierResult {
  const executableTaskIds: string[] = [];
  const blockedTaskIds: string[] = [];
  const candidateTaskIds: string[] = [];
  const rejectedCandidates: CandidateRejection[] = [];
  const known = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    assert(task.id.trim().length > 0, 'frontier task id must be non-empty');
    if (!task.activeScope) {
      candidateTaskIds.push(task.id);
      rejectedCandidates.push(rejectCandidateTask(task.id));
      continue;
    }
    if (task.implementationState === 'IMPLEMENTED' || task.implementationState === 'IMPLEMENTED_FAILING' || task.implementationState === 'BLOCKED_AUTHORITY') {
      continue;
    }
    const dependencyBlocked = task.dependencies.some((dependency) => {
      if (!known.has(dependency)) return true;
      const state = task.dependencyStates[dependency] ?? 'MISSING';
      return state === 'MISSING' || state === 'IMPLEMENTED_FAILING' || state === 'BLOCKED_AUTHORITY';
    });
    if (dependencyBlocked || !task.authorityAvailable || !task.capabilityAvailable) {
      blockedTaskIds.push(task.id);
      continue;
    }
    executableTaskIds.push(task.id);
  }

  return {
    executableTaskIds: unique(executableTaskIds),
    blockedTaskIds: unique(blockedTaskIds),
    candidateTaskIds: unique(candidateTaskIds),
    rejectedCandidates,
  };
}

export function evaluateTerminal(input: {
  items: readonly ProgressItem[];
  frontier: FrontierResult;
  resumeConditions?: readonly string[];
}): TerminalResult {
  const active = input.items.filter((item) => item.activeScope);
  const implementationComplete = active.every((item) => item.implementationState === 'IMPLEMENTED');
  const verificationComplete = active.every((item) => item.verificationState === 'PASS');
  const certification = active.some((item) => deriveLegacyCertification(item) === 'GAP')
    ? 'GAP'
    : active.some((item) => deriveLegacyCertification(item) === 'PARTIAL') ? 'PARTIAL' : 'MATCH';
  const conditions = unique(input.resumeConditions ?? active.flatMap((item) => item.resumeCondition ? [item.resumeCondition] : []));

  if (input.frontier.executableTaskIds.length > 0) {
    return {
      executionState: 'RUNNABLE',
      localImplementation: implementationComplete ? 'COMPLETE' : 'PARTIAL',
      localVerification: verificationComplete ? 'COMPLETE' : 'PARTIAL',
      canonicalCertification: certification,
      resumeConditions: conditions,
      frontier: input.frontier.executableTaskIds,
      terminalReason: 'reachable implementation frontier remains executable',
    };
  }
  if (!implementationComplete || input.frontier.blockedTaskIds.length > 0) {
    return {
      executionState: 'TERMINAL_BLOCKED',
      localImplementation: implementationComplete ? 'COMPLETE' : 'PARTIAL',
      localVerification: verificationComplete ? 'COMPLETE' : 'PARTIAL',
      canonicalCertification: certification,
      resumeConditions: conditions,
      frontier: [],
      terminalReason: 'no executable task remains and an active implementation dependency or authority blocker is present',
    };
  }
  if (!verificationComplete || certification !== 'MATCH') {
    return {
      executionState: 'TERMINAL_PARTIAL',
      localImplementation: 'COMPLETE',
      localVerification: verificationComplete ? 'COMPLETE' : 'PARTIAL',
      canonicalCertification: certification,
      resumeConditions: conditions,
      frontier: [],
      terminalReason: 'reachable implementation frontier is exhausted; remaining work is verification/certification or external proof',
    };
  }
  return {
    executionState: 'COMPLETE',
    localImplementation: 'COMPLETE',
    localVerification: 'COMPLETE',
    canonicalCertification: 'MATCH',
    resumeConditions: conditions,
    frontier: [],
    terminalReason: 'reachable implementation and verification frontiers are exhausted',
  };
}

export function assessFreshness(input: {
  changedSurfaces: readonly ChangeSurface[];
  dependencies: readonly EvidenceDependency[];
}): FreshnessAssessment {
  const changed = new Set(input.changedSurfaces);
  const invalidatedEvidenceIds: string[] = [];
  const preservedEvidenceIds: string[] = [];
  for (const dependency of input.dependencies) {
    if (dependency.dependsOn.some((surface) => changed.has(surface))) invalidatedEvidenceIds.push(dependency.evidenceId);
    else preservedEvidenceIds.push(dependency.evidenceId);
  }
  return {
    invalidatedEvidenceIds: unique(invalidatedEvidenceIds),
    preservedEvidenceIds: unique(preservedEvidenceIds),
    reason: changed.size === 0 ? 'no change surface changed' : 'only evidence with a declared dependency on the changed surface is invalidated',
  };
}

export function createCompactProgressReceipt(input: {
  snapshot: ProgressSnapshot;
  affectedScope: readonly string[];
  claimCoverage: readonly string[];
  strongestVerificationLevel: VerificationLevel;
  fresh: boolean;
  blocker?: ProgressBlockerKind | null;
  artifactUri: string;
  terminal?: TerminalResult;
}): CompactProgressReceipt {
  assert(input.artifactUri.trim().length > 0, 'artifactUri must be non-empty');
  return {
    schema: 'harness/compact-progress-receipt/v1',
    sourceIdentity: input.snapshot.sourceIdentity,
    planId: input.snapshot.planId,
    planRevision: input.snapshot.planRevision,
    affectedScope: unique(input.affectedScope),
    claimCoverage: unique(input.claimCoverage),
    counts: input.snapshot.counts,
    strongestVerificationLevel: input.strongestVerificationLevel,
    fresh: input.fresh,
    blocker: input.blocker ?? null,
    artifactUri: input.artifactUri,
    terminalReason: input.terminal?.terminalReason,
    resumeConditions: unique(input.terminal?.resumeConditions ?? []),
  };
}

export function classifyPlanRelation(input: RelationInput): RelationDecision {
  const ordered: readonly [PlanRelationType, boolean, boolean, string][] = [
    ['CONFLICTING_SPEC', true, true, 'preserve both source items and block the affected decision surface until explicit owner resolution'],
    ['CONFLICTING_POLICY', true, true, 'preserve both policies and require explicit precedence plus migration evidence'],
    ['SUPERSEDING', false, true, 'retain old lineage until replacement parity, compatibility/rollback, and retirement evidence exist'],
    ['DUPLICATE', false, false, 'select one canonical owner while retaining aliases and proving no source dimension was lost'],
    ['OVERLAPPING_SAME_OUTCOME', false, false, 'consolidate execution only after mapping every source claim and evidence lineage'],
    ['DEPENDENCY_CHANGE', false, true, 'recompile the affected dependency closure and invalidate only touched claims'],
    ['PROVIDER_VARIANT', false, false, 'keep the provider-neutral claim canonical and isolate provider-specific proof'],
    ['DEFERRED_BOUNDARY', false, true, 'keep the source item visible with owner, activation condition, and next artifact'],
  ];
  const matched = ordered.find(([relation]) => {
    if (relation === 'CONFLICTING_SPEC') return input.conflictsWithSpec;
    if (relation === 'CONFLICTING_POLICY') return input.conflictsWithPolicy;
    if (relation === 'SUPERSEDING') return input.replacesOld;
    if (relation === 'DUPLICATE') return input.duplicateCanonicalOwner;
    if (relation === 'OVERLAPPING_SAME_OUTCOME') return input.sameOutcome;
    if (relation === 'DEPENDENCY_CHANGE') return input.dependencyChanged;
    if (relation === 'PROVIDER_VARIANT') return input.providerSpecific;
    return input.deferredByBoundary;
  });
  if (matched) {
    const [relation, requiresOwnerDecision, affectedDecisionSurface, handling] = matched;
    return { relation, requiresOwnerDecision, affectedDecisionSurface, handling };
  }
  return {
    relation: 'COMPATIBLE',
    requiresOwnerDecision: false,
    affectedDecisionSurface: false,
    handling: 'retain both lineages in one effective set and schedule each reachable item independently',
  };
}

export function assertAdmission(admission: AdmissionRecord): void {
  assert(admission.additionId.trim().length > 0, 'additionId must be non-empty');
  assert(admission.sourceIntent.trim().length > 0, 'sourceIntent must be non-empty');
  assert(admission.owner.trim().length > 0, 'owner must be non-empty');
  assert(admission.authorityBoundary.trim().length > 0, 'authorityBoundary must be non-empty');
  assert(admission.requestedEffect.trim().length > 0, 'requestedEffect must be non-empty');
  assert(admission.acceptance.length > 0, 'acceptance must not be empty');
  assert(ADMISSION_STATES.includes(admission.status), 'invalid admission status');
}
