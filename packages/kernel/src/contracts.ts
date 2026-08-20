import { createHash } from 'node:crypto';

export type Sha256 = string;
export type CapabilityStatus = 'HOST_NATIVE' | 'ADAPTER_ENFORCED' | 'EMULATED' | 'UNSUPPORTED' | 'UNVERIFIED';
export type PlanArtifactStatus = 'DRAFT' | 'APPROVED' | 'ADOPTED' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
export type LineageResolution = 'CARRIED' | 'SUPERSEDED' | 'REJECTED_OBSOLETE';
export type VerificationOutcome = 'PASS' | 'FAIL' | 'BLOCKED' | 'UNVERIFIED';
export type ReconciliationStatus = 'MATCH' | 'PARTIAL' | 'MISSING' | 'DEVIATED' | 'EXTRA' | 'SUPERSEDED';

/** Shared graph edge types (C2 dispatch-ready-set, plan-readiness). Single source of truth. */
export const DEPENDENCY_TYPES = [
  'HARD', 'SOFT', 'VERIFY_AFTER', 'SEMANTIC_CONFLICT', 'INTEGRATION', 'GLOBAL_GATE', 'EXTERNAL',
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** Recoverable (nonterminal) scheduler states shared by readiness + dispatch. */
export const RECOVERABLE_STATES = [
  'WAITING_EXTERNAL', 'WAITING_AUTHORITY', 'WAITING_RESOURCE', 'RETRY_SCHEDULED', 'NEEDS_REMEDIATION',
] as const;
export type RecoverableState = (typeof RECOVERABLE_STATES)[number];

export type WorkLedgerStatus =
  | 'ADOPTED' | 'DISCOVERING' | 'PLANNED' | 'VALIDATED' | 'DISPATCHING' | 'EXECUTING' | 'VERIFYING' | 'REVIEWING'
  | 'needs-remediation' | 'needs-replan' | 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface RepositoryBaseline { readonly commit: string; readonly branch: string; readonly dirtyFingerprint: Sha256; }
export interface HostTaskRef { readonly host: string; readonly taskRef: string; readonly sessionRef: string; }
export interface PlanDecision { readonly decisionId: string; readonly decision: string; readonly rationale: string; readonly tradeOffs: readonly string[]; }
export interface PlanTaskNode { readonly taskId: string; readonly requirementIds: readonly string[]; readonly criterionIds: readonly string[]; readonly dependencies: readonly string[]; }
export interface PlanHandoff { readonly recipientRole: string; readonly requiredArtifacts: readonly string[]; readonly nextSafeAction: string; }

export interface PlanArtifactRef {
  readonly artifactId: string;
  readonly planId: string;
  readonly sourceKind: 'chat_plan_artifact' | 'file_plan_artifact' | 'prompt_fallback';
  readonly sourceRef: string;
  readonly rawPath: string;
  readonly sha256: Sha256;
  readonly bytes: number;
  readonly capturedAt: string;
  readonly status: PlanArtifactStatus;
  readonly repositoryIdentity: string;
  readonly repositoryBaseline: RepositoryBaseline;
  readonly hostTask: HostTaskRef;
  readonly authorIdentity: string;
  readonly ownerIdentity: string;
  readonly approvalEvent?: string;
  readonly supersedes: readonly string[];
  readonly supplements: readonly string[];
  readonly derivedFrom: readonly string[];
}

export interface PlanLineageResolution {
  readonly requirementId: string;
  readonly sourceArtifactId: string;
  readonly resolution: LineageResolution;
  readonly targetRequirementId?: string;
  readonly rationale: string;
}

export interface PlanLineage {
  readonly head: PlanArtifactRef;
  readonly ancestors: readonly PlanArtifactRef[];
  readonly resolutionMatrix: readonly PlanLineageResolution[];
  readonly verified: boolean;
  readonly reconciliationResult: 'PASS' | 'FAIL';
  readonly reconciliationSha256: Sha256;
}

export interface PlanAnchor {
  readonly planSha256: Sha256;
  readonly sectionHeading: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly anchorTextSha256: Sha256;
  readonly requirementId: string;
  readonly chunkIndex: number;
}

export interface PlanRequirement { readonly requirementId: string; readonly statement: string; readonly acceptanceCriteria: readonly AcceptanceCriterion[]; }
export interface PortablePlan {
  readonly schema: 'harness/portable-plan';
  readonly version: 3;
  readonly planId: string;
  readonly original: PlanArtifactRef;
  readonly projectionSha256: Sha256;
  readonly objective: string;
  readonly scope: { readonly in: readonly string[]; readonly out: readonly string[] };
  readonly decisions: readonly PlanDecision[];
  readonly assumptions: readonly string[];
  readonly knownUnknowns: readonly string[];
  readonly taskDag: readonly PlanTaskNode[];
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly evidenceProfiles: readonly string[];
  readonly rollback: readonly string[];
  readonly handoff: PlanHandoff;
  readonly lineage: PlanLineage;
  readonly requirements: readonly PlanRequirement[];
  readonly anchors: readonly PlanAnchor[];
}

export interface CommandInvocation { readonly executable: string; readonly args: readonly string[]; readonly cwd?: string; }
export type AcceptanceCriterionBinding =
  | { readonly kind: 'plan-anchor'; readonly anchor: PlanAnchor }
  | { readonly kind: 'approved-amendment'; readonly amendmentId: string };
export interface AcceptanceCriterion {
  readonly criterionId: string;
  readonly claim: string;
  readonly evidenceProfile: string;
  readonly binding: AcceptanceCriterionBinding;
}
export interface TaskAssignment {
  readonly assignmentId: string;
  readonly taskId: string;
  readonly requirementIds: readonly string[];
  readonly anchors: readonly PlanAnchor[];
  readonly dependencies: readonly string[];
  readonly sourceOfTruthPaths: readonly string[];
  readonly ownedPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly allowedTools: readonly string[];
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly modelTier: 'economy' | 'standard' | 'expert';
  readonly riskTier: 'low' | 'medium' | 'high' | 'critical';
  readonly tokenBudget: number;
  readonly timeBudgetMs: number;
  readonly costBudgetUsd: number;
  readonly verificationCommands: readonly CommandInvocation[];
  readonly escalationConditions: readonly string[];
  readonly receiptContractSha256: Sha256;
}

export interface WorkerReceipt {
  readonly receiptId: string;
  readonly assignmentId: string;
  readonly workerIdentity: string;
  readonly host: string;
  readonly model: string;
  readonly diffSha256?: Sha256;
  readonly artifactUris: readonly string[];
  readonly artifactHashes: readonly Sha256[];
  readonly filesChanged: readonly string[];
  readonly commands: readonly CommandInvocation[];
  readonly exitCodes: readonly number[];
  readonly logUris: readonly string[];
  readonly logHashes: readonly Sha256[];
  readonly testEvidenceUris: readonly string[];
  readonly testEvidenceHashes: readonly Sha256[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface ExecutedProbe { readonly command: CommandInvocation; readonly exitCode: number; readonly durationMs: number; }
export interface VerificationClaim {
  readonly claimId: string;
  readonly claim: string;
  readonly requirementId: string;
  readonly criterionId: string;
  readonly receiptId: string;
  readonly verificationProfile: string;
  readonly probe: ExecutedProbe;
  readonly host: string;
  readonly platform: string;
  readonly platformVersion: string;
  readonly evidenceUris: readonly string[];
  readonly evidenceHashes: readonly Sha256[];
  readonly verifierIdentity: string;
  readonly reducerIdentity: string;
  readonly reducerResult: VerificationOutcome;
  readonly outcome: VerificationOutcome;
}

export type HostAttestationEvidenceRole = 'version' | 'capabilities' | 'requestedModel' | 'resolvedModel' | 'observedModel';
export const HOST_ATTESTATION_EVIDENCE_ROLES: readonly HostAttestationEvidenceRole[] = [
  'version', 'capabilities', 'requestedModel', 'resolvedModel', 'observedModel',
];

/**
 * A content-addressed observation used to support one attestation claim.
 *
 * `evidenceRef` is deliberately deterministic: it identifies the host, the
 * attested commit, the role, and the immutable evidence content hash. The
 * `subjectSha256` separately binds that evidence to the attestation field it
 * purports to prove, preventing a valid record from another host or model
 * claim being replayed here.
 */
export interface HostAttestationEvidenceRef {
  readonly role: HostAttestationEvidenceRole;
  readonly host: HostAttestation['host'];
  readonly commitSha: string;
  readonly evidenceRef: string;
  readonly evidenceSha256: Sha256;
  readonly subjectSha256: Sha256;
  readonly observedAt: string;
}

export interface HostAttestation {
  readonly host: 'codex' | 'claude' | 'cursor' | 'antigravity' | 'grok' | 'opencode';
  readonly hostVersion: string;
  readonly commitSha: string;
  readonly capabilityStatus: CapabilityStatus;
  readonly capabilityIds: readonly string[];
  readonly contractSetSha256: Sha256;
  readonly requestedModel: string;
  readonly resolvedModel: string;
  readonly observedModel: string;
  /** Required to certify. One content-addressed record is required for each role. */
  readonly evidenceRefs?: readonly HostAttestationEvidenceRef[];
  /** @deprecated Legacy hash-only evidence cannot satisfy certification. */
  readonly evidenceHashes?: readonly Sha256[];
  readonly nativeRunnerIdentity: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** Supported host identity union (all known hosts). Certification requires only the subset below. */
export type SupportedHost = HostAttestation['host'];
/** Hosts that MUST produce attestations for certification. Cursor remains deferred. */
export const CERTIFICATION_REQUIRED_HOSTS: readonly SupportedHost[] = ['codex', 'claude', 'grok', 'opencode', 'antigravity'];

export interface ManifestSubsystem { readonly subsystemId: string; readonly owner: string; readonly capabilities: readonly string[]; }
export interface ManifestCapability { readonly capabilityId: string; readonly dependencies: readonly string[]; readonly requiredEvidence: readonly string[]; readonly routingMetadata: Readonly<Record<string, string>>; }
export interface ManifestRegistryEntry { readonly id: string; readonly path: string; readonly sha256: Sha256; readonly lazy: boolean; }
export interface ManifestModelClass { readonly classId: string; readonly approvedModels: readonly string[]; readonly riskTiers: readonly TaskAssignment['riskTier'][]; }
export interface ManifestSourceIntegrity { readonly sourceId: string; readonly uri: string; readonly commit: string; readonly sha256: Sha256; }
export interface HarnessManifestV3 {
  readonly schema: 'harness/manifest';
  readonly version: 3;
  readonly manifestSha256: Sha256;
  readonly subsystems: readonly ManifestSubsystem[];
  readonly registries: {
    readonly skills: readonly ManifestRegistryEntry[];
    readonly behaviors: readonly ManifestRegistryEntry[];
    readonly profiles: readonly ManifestRegistryEntry[];
  };
  readonly capabilities: readonly ManifestCapability[];
  readonly contextBudgets: Readonly<Record<string, number>>;
  readonly modelClasses: readonly ManifestModelClass[];
  readonly approvedRouting: Readonly<Record<string, string>>;
  readonly platformSupport: Readonly<Record<HostAttestation['host'], CapabilityStatus>>;
  readonly sourceIntegrity: readonly ManifestSourceIntegrity[];
}

export interface ReconciliationEntry { readonly requirementId: string; readonly status: ReconciliationStatus; readonly anchorIds: readonly string[]; readonly verificationClaimIds: readonly string[]; readonly repairSliceId?: string; }
export interface LedgerBatch { readonly batchId: string; readonly status: 'PENDING' | 'RUNNING' | 'PARTIAL' | 'PASSED' | 'BLOCKED'; readonly taskIds: readonly string[]; }
export interface AmendmentRecord { readonly amendmentId: string; readonly approved: boolean; readonly sha256: Sha256; readonly sourceRef: string; }
export interface SourceAcquisitionReceipt { readonly receiptId: string; readonly planAnchor: PlanAnchor; readonly source: string; readonly contentSha256: Sha256; }
export interface OrphanFinding { readonly findingId: string; readonly status: 'OPEN' | 'QUARANTINED' | 'REVALIDATED' | 'RESOLVED'; readonly path: string; readonly reason: string; }
export interface ReviewReceipt {
  readonly reviewId: string; readonly stale: boolean; readonly originalSha256: Sha256; readonly amendmentsSha256: Sha256;
  readonly diffFingerprint: Sha256; readonly receiptEvidenceFingerprint: Sha256; readonly evidenceHashes: readonly Sha256[];
  readonly shadowRevision: number; readonly reviewerIdentity: string;
}
export interface RepairSlice { readonly repairSliceId: string; readonly status: 'PENDING' | 'RUNNING' | 'PENDING_REVIEW' | 'PASSED' | 'BLOCKED'; readonly findingIds: readonly string[]; readonly reopenedCriterionIds: readonly string[]; }

export interface WorkLedger {
  readonly status: WorkLedgerStatus;
  readonly plan: PortablePlan;
  readonly planAnchors: readonly PlanAnchor[];
  readonly batches: readonly LedgerBatch[];
  readonly amendments: readonly AmendmentRecord[];
  readonly assignments: readonly TaskAssignment[];
  readonly receipts: readonly WorkerReceipt[];
  readonly verificationClaims: readonly VerificationClaim[];
  readonly attestations: readonly HostAttestation[];
  readonly reconciliations: readonly ReconciliationEntry[];
  readonly repairSlices: readonly RepairSlice[];
  readonly sourceAcquisitionReceipts: readonly SourceAcquisitionReceipt[];
  readonly orphanFindings: readonly OrphanFinding[];
  readonly shadowRevision: number;
  readonly shadowHashes: Readonly<Record<string, Sha256>>;
  readonly latestReview: ReviewReceipt;
}

export function isSha256(value: string): value is Sha256 { return /^[a-f0-9]{64}$/.test(value); }
export function sha256Bytes(value: Uint8Array): Sha256 { return createHash('sha256').update(value).digest('hex'); }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function requireSha(value: string, field: string): void { requireValue(isSha256(value), `${field} requires SHA-256`); }
function requireArray(value: unknown, field: string): asserts value is readonly unknown[] { requireValue(Array.isArray(value), `WorkLedger missing ${field}`); }
function requireUniqueNonEmpty(values: readonly string[], field: string): void {
  requireValue(values.length > 0 && values.every(Boolean), `${field} must be non-empty`);
  requireValue(new Set(values).size === values.length, `${field} must not contain duplicates`);
}
function requireStrings(values: readonly string[], field: string, allowEmpty = true): void {
  requireValue(allowEmpty || values.length > 0, `${field} must be non-empty`);
  requireValue(values.every((value) => value.trim().length > 0), `${field} contains an empty value`);
}
function requireSameMembers(actual: readonly string[], expected: readonly string[], field: string): void {
  requireValue(actual.length === expected.length && actual.every((value) => expected.includes(value)), `${field} does not match the plan DAG`);
}
function requireAcyclicGraph(dependenciesByNode: ReadonlyMap<string, readonly string[]>, field: string): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    requireValue(!visiting.has(nodeId), `${field} contains a cycle`);
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const dependency of dependenciesByNode.get(nodeId) ?? []) visit(dependency);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of dependenciesByNode.keys()) visit(nodeId);
}
function aggregateRows(rows: readonly string[]): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify([...rows].sort())));
}
function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  const actualValues = [...new Set(actual)].sort();
  const expectedValues = [...new Set(expected)].sort();
  return actualValues.length === actual.length
    && expectedValues.length === expected.length
    && actualValues.length === expectedValues.length
    && actualValues.every((value, index) => value === expectedValues[index]);
}
const WINDOWS_RESERVED_PATH_SEGMENT = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;
function normalizeRepoPath(value: string, field: string): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${field} must be a non-empty relative repository path`);
  requireValue(!/[\u0000-\u001f\u007f-\u009f]/.test(value), `${field} contains control characters`);
  const slashed = value.replace(/\\/g, '/');
  requireValue(!slashed.startsWith('/'), `${field} must not be an absolute, UNC, or device path`);
  requireValue(!/^[A-Za-z]:/.test(slashed), `${field} must not be a Windows drive path`);
  const segments = slashed.split('/');
  requireValue(segments.length > 0, `${field} must identify a repository path`);
  requireValue(!segments.includes(''), `${field} must not contain empty path segments`);
  requireValue(!segments.includes('.'), `${field} must not contain dot path segments`);
  requireValue(!segments.includes('..'), `${field} must not contain traversal`);
  for (const segment of segments) {
    requireValue(!/[<>:"|?*]/.test(segment), `${field} contains a character that is invalid in a portable repository path`);
    requireValue(!/[ .]$/.test(segment), `${field} contains a Windows trailing-dot or trailing-space alias`);
    requireValue(!WINDOWS_RESERVED_PATH_SEGMENT.test(segment), `${field} contains a Windows reserved device name`);
  }
  return segments.map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US')).join('/');
}
function pathWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}
function normalizedPathContract(paths: readonly string[], field: string, allowEmpty: boolean): readonly string[] {
  requireValue(allowEmpty || paths.length > 0, `${field} must be non-empty`);
  const normalized = paths.map((value) => normalizeRepoPath(value, field));
  requireValue(new Set(normalized).size === normalized.length, `${field} contains duplicate normalized paths`);
  return normalized;
}
function canonicalCommand(command: CommandInvocation): readonly [string, readonly string[], string | null] {
  return [command.executable, [...command.args], command.cwd ?? null];
}
function canonicalEvidencePairs(uris: readonly string[], hashes: readonly Sha256[]): readonly (readonly [string, Sha256])[] {
  return uris
    .map((uri, index) => [uri, hashes[index]] as const)
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

export function reviewedStateFingerprint(receipts: readonly WorkerReceipt[], claims: readonly VerificationClaim[]): Sha256 {
  const receiptRows = receipts.map((receipt) => JSON.stringify([
    'worker-receipt',
    receipt.receiptId,
    receipt.assignmentId,
    receipt.workerIdentity,
    receipt.host,
    receipt.model,
    receipt.diffSha256 ?? null,
    [...normalizedPathContract(receipt.filesChanged, 'WorkerReceipt.filesChanged', !receipt.diffSha256)].sort(),
    canonicalEvidencePairs(receipt.artifactUris, receipt.artifactHashes),
    receipt.commands.map((command, index) => [canonicalCommand(command), receipt.exitCodes[index]]),
    canonicalEvidencePairs(receipt.logUris, receipt.logHashes),
    canonicalEvidencePairs(receipt.testEvidenceUris, receipt.testEvidenceHashes),
    receipt.startedAt,
    receipt.completedAt,
  ]));
  const claimRows = claims.map((claim) => JSON.stringify([
    'verification-claim',
    claim.claimId,
    claim.claim,
    claim.requirementId,
    claim.criterionId,
    claim.receiptId,
    claim.verificationProfile,
    [canonicalCommand(claim.probe.command), claim.probe.exitCode, claim.probe.durationMs],
    claim.host,
    claim.platform,
    claim.platformVersion,
    canonicalEvidencePairs(claim.evidenceUris, claim.evidenceHashes),
    claim.verifierIdentity,
    claim.reducerIdentity,
    claim.reducerResult,
    claim.outcome,
  ]));
  return aggregateRows([...receiptRows, ...claimRows]);
}

function physicalLines(bytes: Uint8Array, start: number, end: number): Uint8Array {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.match(/[^\n]*(?:\n|$)/g)?.filter((line, index, all) => line.length > 0 || index < all.length - 1) ?? [];
  requireValue(end <= lines.length, 'PlanAnchor exceeds physical plan bytes');
  return new TextEncoder().encode(lines.slice(start - 1, end).join(''));
}

export function assertPlanAnchor(anchor: PlanAnchor, expectedPlanSha256: Sha256, originalBytes: Uint8Array): void {
  requireValue(originalBytes instanceof Uint8Array, 'PlanAnchor physical original bytes are required');
  requireSha(anchor.planSha256, 'PlanAnchor.planSha256');
  requireSha(anchor.anchorTextSha256, 'PlanAnchor.anchorTextSha256');
  requireValue(Boolean(anchor.sectionHeading && anchor.requirementId) && Number.isInteger(anchor.lineStart) && Number.isInteger(anchor.lineEnd) && anchor.lineStart >= 1 && anchor.lineEnd >= anchor.lineStart, 'PlanAnchor has invalid location or requirement');
  requireValue(Number.isInteger(anchor.chunkIndex) && anchor.chunkIndex >= 0, 'PlanAnchor chunkIndex must be a non-negative integer');
  requireValue(anchor.planSha256 === expectedPlanSha256, 'PlanAnchor plan SHA mismatch');
  requireValue(sha256Bytes(originalBytes) === anchor.planSha256, 'Original physical bytes do not match plan SHA');
  requireValue(sha256Bytes(physicalLines(originalBytes, anchor.lineStart, anchor.lineEnd)) === anchor.anchorTextSha256, 'PlanAnchor physical bytes mismatch');
}

export function assertPortablePlanIdentity(plan: PortablePlan, originalBytes: Uint8Array): void {
  requireValue(originalBytes instanceof Uint8Array, 'PortablePlan physical original bytes are required');
  requireValue(plan.original.status === 'APPROVED' || plan.original.status === 'ADOPTED' || plan.original.status === 'ACTIVE', 'PortablePlan original must be APPROVED, ADOPTED, or ACTIVE');
  requireValue(plan.planId === plan.original.planId && plan.lineage.head.artifactId === plan.original.artifactId, 'PortablePlan identity must bind original artifact and lineage head');
  requireValue(plan.lineage.verified && plan.lineage.reconciliationResult === 'PASS', 'PortablePlan lineage is unverified');
  requireValue(Boolean(plan.original.approvalEvent && plan.original.repositoryIdentity && plan.original.authorIdentity && plan.original.ownerIdentity), 'PortablePlan original lacks approval or repository identity');
  requireSha(plan.original.sha256, 'PortablePlan.original.sha256'); requireSha(plan.projectionSha256, 'PortablePlan.projectionSha256'); requireSha(plan.lineage.reconciliationSha256, 'PortablePlan.lineage.reconciliationSha256');
  requireValue(plan.original.bytes === originalBytes.byteLength && sha256Bytes(originalBytes) === plan.original.sha256, 'PortablePlan physical bytes mismatch');
  requireValue(Boolean(plan.objective.trim()), 'PortablePlan objective must be non-empty');
  requireStrings(plan.scope.in, 'PortablePlan scope.in', false);
  requireStrings(plan.scope.out, 'PortablePlan scope.out');
  requireStrings(plan.assumptions, 'PortablePlan assumptions');
  requireStrings(plan.knownUnknowns, 'PortablePlan knownUnknowns');
  requireStrings(plan.ownedPaths, 'PortablePlan ownedPaths', false);
  requireStrings(plan.forbiddenPaths, 'PortablePlan forbiddenPaths');
  const normalizedOwnedPaths = normalizedPathContract(plan.ownedPaths, 'PortablePlan ownedPaths', false);
  const normalizedForbiddenPaths = normalizedPathContract(plan.forbiddenPaths, 'PortablePlan forbiddenPaths', true);
  requireValue(normalizedOwnedPaths.every((ownedPath) => !normalizedForbiddenPaths.some((forbiddenPath) => pathWithin(ownedPath, forbiddenPath))), 'PortablePlan owned path is fully forbidden');
  requireStrings(plan.evidenceProfiles, 'PortablePlan evidenceProfiles', false);
  requireStrings(plan.rollback, 'PortablePlan rollback', false);
  requireValue(Boolean(plan.handoff.recipientRole && plan.handoff.nextSafeAction), 'PortablePlan handoff is incomplete');
  const requirementIds = plan.requirements.map((item) => item.requirementId);
  requireUniqueNonEmpty(requirementIds, 'PortablePlan requirements');
  requireValue(plan.requirements.every((item) => item.statement.trim() && item.acceptanceCriteria.length > 0), 'PortablePlan requirement acceptance is empty');
  const planCriteria = plan.requirements.flatMap((requirement) => requirement.acceptanceCriteria.map((criterion) => ({ requirementId: requirement.requirementId, criterion })));
  requireUniqueNonEmpty(planCriteria.map(({ criterion }) => criterion.criterionId), 'PortablePlan criterion IDs');
  requireValue(planCriteria.every(({ criterion }) => criterion.claim.trim() && criterion.evidenceProfile.trim()), 'PortablePlan acceptance criterion is incomplete');
  const sourceArtifactIds = new Set([plan.lineage.head.artifactId, ...plan.lineage.ancestors.map((item) => item.artifactId)]);
  const resolvedRequirementIds = plan.lineage.resolutionMatrix.map((item) => item.requirementId);
  requireValue(new Set(resolvedRequirementIds).size === resolvedRequirementIds.length, 'PortablePlan lineage has duplicate requirement resolutions');
  requireValue(plan.lineage.resolutionMatrix.every((item) => sourceArtifactIds.has(item.sourceArtifactId) && item.rationale.trim()), 'PortablePlan lineage references an unknown artifact');
  requireValue(requirementIds.every((requirementId) => resolvedRequirementIds.includes(requirementId)), 'PortablePlan lineage has a requirement gap');
  requireValue(plan.anchors.length > 0, 'PortablePlan anchors must be non-empty');
  requireValue(new Set(plan.anchors.map(planAnchorKey)).size === plan.anchors.length, 'PortablePlan anchors must not contain duplicates');
  for (const anchor of plan.anchors) {
    assertPlanAnchor(anchor, plan.original.sha256, originalBytes);
    requireValue(requirementIds.includes(anchor.requirementId), 'PlanAnchor references unknown requirement');
  }
  requireValue(requirementIds.every((requirementId) => plan.anchors.some((anchor) => anchor.requirementId === requirementId)), 'PortablePlan requirement lacks PlanAnchor');
  const canonicalAnchorKeys = new Set(plan.anchors.map(planAnchorKey));
  requireValue(planCriteria.every(({ requirementId, criterion }) => criterion.binding.kind === 'plan-anchor'
    && criterion.binding.anchor.requirementId === requirementId
    && canonicalAnchorKeys.has(planAnchorKey(criterion.binding.anchor))), 'PortablePlan criterion lacks a canonical requirement PlanAnchor');
  const taskIds = plan.taskDag.map((task) => task.taskId);
  requireUniqueNonEmpty(taskIds, 'PortablePlan task DAG');
  requireValue(plan.taskDag.every((task) => task.requirementIds.length > 0 && new Set(task.requirementIds).size === task.requirementIds.length && task.requirementIds.every((requirementId) => requirementIds.includes(requirementId))), 'PortablePlan task DAG has orphan or duplicate requirements');
  const criterionRequirement = new Map(planCriteria.map(({ requirementId, criterion }) => [criterion.criterionId, requirementId]));
  requireValue(plan.taskDag.every((task) => task.criterionIds.length > 0
    && new Set(task.criterionIds).size === task.criterionIds.length
    && task.criterionIds.every((criterionId) => criterionRequirement.has(criterionId) && task.requirementIds.includes(criterionRequirement.get(criterionId)!))), 'PortablePlan task DAG has orphan or duplicate criteria');
  requireValue(plan.taskDag.every((task) => new Set(task.dependencies).size === task.dependencies.length && task.dependencies.every((dependency) => taskIds.includes(dependency) && dependency !== task.taskId)), 'PortablePlan task DAG has invalid dependencies');
  requireValue(requirementIds.every((requirementId) => plan.taskDag.some((task) => task.requirementIds.includes(requirementId))), 'PortablePlan task DAG does not cover every requirement');
  requireValue([...criterionRequirement.keys()].every((criterionId) => plan.taskDag.some((task) => task.criterionIds.includes(criterionId))), 'PortablePlan task DAG does not cover every acceptance criterion');
  requireAcyclicGraph(new Map(plan.taskDag.map((task) => [task.taskId, task.dependencies])), 'PortablePlan task DAG');
}

function hostAttestationEvidenceSubject(role: HostAttestationEvidenceRole, attestation: HostAttestation): string | readonly string[] {
  switch (role) {
    case 'version': return attestation.hostVersion;
    case 'capabilities': return [...attestation.capabilityIds].sort();
    case 'requestedModel': return attestation.requestedModel;
    case 'resolvedModel': return attestation.resolvedModel;
    case 'observedModel': return attestation.observedModel;
  }
}

/** SHA-256 binding for the attestation field represented by an evidence role. */
export function hostAttestationEvidenceSubjectSha256(role: HostAttestationEvidenceRole, attestation: HostAttestation): Sha256 {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(hostAttestationEvidenceSubject(role, attestation))));
}

/** Canonical, content-addressed reference for an attestation evidence record. */
export function hostAttestationEvidenceRef(
  host: HostAttestation['host'],
  commitSha: string,
  role: HostAttestationEvidenceRole,
  evidenceSha256: Sha256,
): string {
  return `evidence://${host}/${commitSha}/${role}/${evidenceSha256}`;
}

export function assertCertificationAttestation(attestation: HostAttestation, commitSha: string, now = new Date()): void {
  requireValue(attestation.capabilityStatus === 'HOST_NATIVE' && Boolean(attestation.nativeRunnerIdentity), 'Certification requires native host attestation');
  requireValue(attestation.commitSha === commitSha, 'Host attestation commit mismatch');
  const issuedAt = new Date(attestation.issuedAt);
  const expiresAt = new Date(attestation.expiresAt);
  requireValue(!isNaN(issuedAt.getTime()), 'Host attestation issuedAt is not parseable');
  requireValue(!isNaN(expiresAt.getTime()), 'Host attestation expiresAt is not parseable');
  requireValue(issuedAt.getTime() <= now.getTime(), 'Host attestation issuedAt is in the future');
  requireValue(expiresAt.getTime() > now.getTime(), 'Host attestation is stale');
  const MAX_TTL_MS = 86_400_000;
  const ttl = expiresAt.getTime() - issuedAt.getTime();
  requireValue(ttl > 0 && ttl <= MAX_TTL_MS, `Host attestation TTL ${ttl}ms exceeds maximum ${MAX_TTL_MS}ms`);
  requireSha(attestation.contractSetSha256, 'HostAttestation.contractSetSha256');
  requireValue(Array.isArray(attestation.capabilityIds) && attestation.capabilityIds.length > 0
    && attestation.capabilityIds.every((capabilityId) => typeof capabilityId === 'string' && capabilityId.trim().length > 0)
    && new Set(attestation.capabilityIds).size === attestation.capabilityIds.length, 'Host attestation capabilities are invalid');
  requireValue(Array.isArray(attestation.evidenceRefs), 'Host attestation evidence must use explicit per-role content-addressed references');
  requireValue(attestation.evidenceHashes === undefined, 'Host attestation hash-only evidence is not certifiable');
  const evidenceRefs = attestation.evidenceRefs;
  requireValue(evidenceRefs.length === HOST_ATTESTATION_EVIDENCE_ROLES.length, 'Host attestation evidence roles are incomplete');
  const observedRoles = new Set<HostAttestationEvidenceRole>();
  for (const evidence of evidenceRefs) {
    requireValue(HOST_ATTESTATION_EVIDENCE_ROLES.includes(evidence.role), 'Host attestation evidence has an unknown role');
    requireValue(!observedRoles.has(evidence.role), `Host attestation evidence has duplicate role ${evidence.role}`);
    observedRoles.add(evidence.role);
    requireValue(evidence.host === attestation.host, `Host attestation evidence for ${evidence.role} is foreign to host ${attestation.host}`);
    requireValue(evidence.commitSha === commitSha, `Host attestation evidence for ${evidence.role} does not bind HEAD`);
    requireSha(evidence.evidenceSha256, `Host attestation ${evidence.role} evidence SHA`);
    requireSha(evidence.subjectSha256, `Host attestation ${evidence.role} subject SHA`);
    requireValue(evidence.evidenceRef === hostAttestationEvidenceRef(attestation.host, commitSha, evidence.role, evidence.evidenceSha256), `Host attestation evidence for ${evidence.role} has a mismatched content reference`);
    const observedAt = new Date(evidence.observedAt);
    requireValue(!isNaN(observedAt.getTime()), `Host attestation evidence for ${evidence.role} observedAt is not parseable`);
    requireValue(observedAt.getTime() >= issuedAt.getTime() && observedAt.getTime() <= expiresAt.getTime() && observedAt.getTime() <= now.getTime(), `Host attestation evidence for ${evidence.role} is stale or outside the attestation window`);
    requireValue(evidence.subjectSha256 === hostAttestationEvidenceSubjectSha256(evidence.role, attestation), `Host attestation evidence for ${evidence.role} does not match the attested value`);
  }
  requireValue(HOST_ATTESTATION_EVIDENCE_ROLES.every((role) => observedRoles.has(role)), 'Host attestation evidence roles are incomplete');
}

/** Canonical provenance timestamp contract: parseable, not future, within issuedAt..expiresAt. */
export function assertProvenanceTimestamp(provenanceTimestamp: string, issuedAt: string, expiresAt: string, now = new Date(), maxClockSkewMs = 5000): void {
  const provTs = new Date(provenanceTimestamp);
  requireValue(!isNaN(provTs.getTime()), `Provenance timestamp '${provenanceTimestamp}' is not parseable`);
  requireValue(provTs.getTime() <= now.getTime() + maxClockSkewMs, `Provenance timestamp '${provenanceTimestamp}' is in the future`);
  const issTs = new Date(issuedAt);
  requireValue(!isNaN(issTs.getTime()), 'issuedAt is not parseable');
  requireValue(provTs.getTime() >= issTs.getTime() - maxClockSkewMs, `Provenance timestamp '${provenanceTimestamp}' is before issuedAt '${issuedAt}'`);
  const expTs = new Date(expiresAt);
  requireValue(!isNaN(expTs.getTime()), 'expiresAt is not parseable');
  requireValue(provTs.getTime() <= expTs.getTime() + maxClockSkewMs, `Provenance timestamp '${provenanceTimestamp}' is after expiresAt '${expiresAt}'`);
}

function planAnchorKey(anchor: PlanAnchor): string {
  return [anchor.planSha256, anchor.sectionHeading, anchor.lineStart, anchor.lineEnd, anchor.anchorTextSha256, anchor.requirementId, anchor.chunkIndex].join(':');
}

export function planAnchorId(anchor: PlanAnchor): Sha256 {
  return sha256Bytes(new TextEncoder().encode(planAnchorKey(anchor)));
}

export function assertTaskAssignment(assignment: TaskAssignment, plan: PortablePlan, originalBytes: Uint8Array, approvedAmendmentIds: ReadonlySet<string> = new Set()): void {
  assertPortablePlanIdentity(plan, originalBytes);
  requireValue(Boolean(assignment.assignmentId && assignment.taskId), 'TaskAssignment identity is missing');
  const taskNode = plan.taskDag.find((task) => task.taskId === assignment.taskId);
  requireValue(taskNode, 'TaskAssignment taskId is absent from the plan DAG');
  requireUniqueNonEmpty(assignment.requirementIds, 'TaskAssignment requirements');
  const planRequirementIds = new Set(plan.requirements.map((requirement) => requirement.requirementId));
  requireValue(assignment.requirementIds.every((requirementId) => planRequirementIds.has(requirementId)), 'TaskAssignment has an orphan requirement');
  requireValue(assignment.anchors.length > 0, 'TaskAssignment anchors must be non-empty');
  for (const anchor of assignment.anchors) {
    assertPlanAnchor(anchor, plan.original.sha256, originalBytes);
    requireValue(assignment.requirementIds.includes(anchor.requirementId), 'TaskAssignment anchor is orphaned');
  }
  requireValue(assignment.requirementIds.every((requirementId) => assignment.anchors.some((anchor) => anchor.requirementId === requirementId)), 'TaskAssignment requirement lacks PlanAnchor');
  requireValue(new Set(assignment.dependencies).size === assignment.dependencies.length, 'TaskAssignment dependencies must not contain duplicates');
  requireSameMembers(assignment.requirementIds, taskNode.requirementIds, 'TaskAssignment requirements');
  requireSameMembers(assignment.dependencies, taskNode.dependencies, 'TaskAssignment dependencies');
  requireStrings(assignment.sourceOfTruthPaths, 'TaskAssignment sourceOfTruthPaths', false);
  requireStrings(assignment.ownedPaths, 'TaskAssignment ownedPaths', false);
  requireStrings(assignment.forbiddenPaths, 'TaskAssignment forbiddenPaths');
  const normalizedOwnedPaths = normalizedPathContract(assignment.ownedPaths, 'TaskAssignment ownedPaths', false);
  const normalizedForbiddenPaths = normalizedPathContract(assignment.forbiddenPaths, 'TaskAssignment forbiddenPaths', true);
  requireValue(normalizedOwnedPaths.every((ownedPath) => !normalizedForbiddenPaths.some((forbiddenPath) => pathWithin(ownedPath, forbiddenPath))), 'TaskAssignment owned path is fully forbidden');
  requireStrings(assignment.allowedTools, 'TaskAssignment allowedTools', false);
  requireValue(assignment.acceptanceCriteria.length > 0, 'TaskAssignment acceptance criteria must be non-empty');
  requireUniqueNonEmpty(assignment.acceptanceCriteria.map((criterion) => criterion.criterionId), 'TaskAssignment criterion IDs');
  requireSameMembers(assignment.acceptanceCriteria.map((criterion) => criterion.criterionId), taskNode.criterionIds, 'TaskAssignment criterion IDs');
  requireValue(assignment.acceptanceCriteria.every((criterion) => criterion.claim.trim() && criterion.evidenceProfile.trim()), 'TaskAssignment acceptance criterion is incomplete');
  const canonicalAnchorKeys = new Set(plan.anchors.map(planAnchorKey));
  const expectedCriteria = new Map(plan.requirements.flatMap((requirement) => requirement.acceptanceCriteria).map((criterion) => [criterion.criterionId, criterion]));
  for (const criterion of assignment.acceptanceCriteria) {
    const expectedCriterion = expectedCriteria.get(criterion.criterionId);
    requireValue(expectedCriterion && criterion.claim === expectedCriterion.claim && criterion.evidenceProfile === expectedCriterion.evidenceProfile, 'TaskAssignment criterion semantics do not match the plan');
    if (criterion.binding.kind === 'plan-anchor') {
      const criterionAnchor = criterion.binding.anchor;
      assertPlanAnchor(criterionAnchor, plan.original.sha256, originalBytes);
      requireValue(assignment.requirementIds.includes(criterionAnchor.requirementId), 'TaskAssignment criterion anchor is orphaned');
      requireValue(canonicalAnchorKeys.has(planAnchorKey(criterionAnchor)), 'TaskAssignment criterion anchor is not canonical');
      requireValue(expectedCriterion.binding.kind === 'plan-anchor' && planAnchorKey(criterionAnchor) === planAnchorKey(expectedCriterion.binding.anchor), 'TaskAssignment criterion anchor does not match the plan criterion');
    } else {
      requireValue(Boolean(criterion.binding.amendmentId), 'TaskAssignment criterion amendment is missing');
      requireValue(approvedAmendmentIds.has(criterion.binding.amendmentId), 'TaskAssignment criterion amendment is unapproved');
    }
  }
  requireValue(assignment.tokenBudget > 0 && assignment.timeBudgetMs > 0 && assignment.costBudgetUsd >= 0, 'TaskAssignment budget is invalid');
  requireValue(assignment.verificationCommands.length > 0 && assignment.verificationCommands.every((command) => command.executable.trim()), 'TaskAssignment verification commands are invalid');
  requireSha(assignment.receiptContractSha256, 'TaskAssignment.receiptContractSha256');
}

export function assertWorkerReceipt(receipt: WorkerReceipt, assignment: TaskAssignment): void {
  requireValue(Boolean(receipt.receiptId && receipt.workerIdentity && receipt.host && receipt.model), 'WorkerReceipt identity is missing');
  requireValue(receipt.assignmentId === assignment.assignmentId, 'WorkerReceipt assignment mismatch');
  requireValue(Boolean(receipt.diffSha256) || receipt.artifactUris.length > 0, 'WorkerReceipt requires an integrated diff or artifact');
  if (receipt.diffSha256) requireSha(receipt.diffSha256, 'WorkerReceipt.diffSha256');
  requireValue(receipt.artifactUris.length === receipt.artifactHashes.length && receipt.artifactHashes.every(isSha256), 'WorkerReceipt artifact evidence is invalid');
  requireValue(receipt.commands.length > 0 && receipt.commands.length === receipt.exitCodes.length, 'WorkerReceipt command results are invalid');
  requireValue(receipt.logUris.length === receipt.logHashes.length && receipt.logHashes.every(isSha256), 'WorkerReceipt logs are invalid');
  requireValue(receipt.testEvidenceUris.length === receipt.testEvidenceHashes.length && receipt.testEvidenceHashes.every(isSha256), 'WorkerReceipt test evidence is invalid');
  requireValue(Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt), 'WorkerReceipt timestamps are invalid');
  const normalizedOwnedPaths = normalizedPathContract(assignment.ownedPaths, 'TaskAssignment ownedPaths', false);
  const normalizedForbiddenPaths = normalizedPathContract(assignment.forbiddenPaths, 'TaskAssignment forbiddenPaths', true);
  requireValue(normalizedOwnedPaths.every((ownedPath) => !normalizedForbiddenPaths.some((forbiddenPath) => pathWithin(ownedPath, forbiddenPath))), 'TaskAssignment owned path is fully forbidden');
  const normalizedChangedPaths = normalizedPathContract(receipt.filesChanged, 'WorkerReceipt.filesChanged', !receipt.diffSha256);
  requireValue(normalizedChangedPaths.every((changedPath) => normalizedOwnedPaths.some((ownedPath) => pathWithin(changedPath, ownedPath))), 'WorkerReceipt changed path is outside assignment ownership');
  requireValue(normalizedChangedPaths.every((changedPath) => !normalizedForbiddenPaths.some((forbiddenPath) => pathWithin(changedPath, forbiddenPath))), 'WorkerReceipt changed path is forbidden');
}

export function assertVerificationClaim(
  claim: VerificationClaim,
  receipt: WorkerReceipt,
  assignment: TaskAssignment,
  plan: PortablePlan,
  originalBytes: Uint8Array,
  approvedAmendmentIds: ReadonlySet<string> = new Set(),
): void {
  assertTaskAssignment(assignment, plan, originalBytes, approvedAmendmentIds);
  requireValue(Boolean(claim.claimId && claim.claim && claim.verificationProfile && claim.verifierIdentity && claim.reducerIdentity), 'VerificationClaim identity is missing');
  requireValue(claim.receiptId === receipt.receiptId && assignment.requirementIds.includes(claim.requirementId), 'VerificationClaim lineage is invalid');
  const selectedCriterion = assignment.acceptanceCriteria.find((criterion) => criterion.criterionId === claim.criterionId);
  requireValue(selectedCriterion, 'VerificationClaim criterion is orphaned');
  const criterionOwner = plan.requirements.find((requirement) => requirement.acceptanceCriteria.some((criterion) => criterion.criterionId === claim.criterionId));
  requireValue(criterionOwner?.requirementId === claim.requirementId, 'VerificationClaim criterion and requirement are cross-bound');
  requireValue(claim.verificationProfile === selectedCriterion.evidenceProfile, 'VerificationClaim verification profile does not match the selected criterion');
  requireValue(claim.verifierIdentity !== receipt.workerIdentity, 'VerificationClaim verifier must be independent');
  requireValue(claim.reducerIdentity !== receipt.workerIdentity, 'VerificationClaim reducer must be independent');
  requireValue(claim.reducerIdentity !== claim.verifierIdentity, 'VerificationClaim reducer must be distinct from verifier');
  const outcomes: readonly VerificationOutcome[] = ['PASS', 'FAIL', 'BLOCKED', 'UNVERIFIED'];
  requireValue(outcomes.includes(claim.outcome) && outcomes.includes(claim.reducerResult), 'VerificationClaim outcome and reducer result must use closed enums');
  requireValue(claim.reducerResult === claim.outcome, 'VerificationClaim reducer result must match outcome');
  requireValue(Boolean(claim.probe.command.executable) && claim.probe.durationMs >= 0, 'VerificationClaim probe is invalid');
  requireValue(claim.evidenceUris.length > 0 && claim.evidenceUris.length === claim.evidenceHashes.length && claim.evidenceHashes.every(isSha256), 'VerificationClaim evidence is invalid');
  if (claim.outcome === 'PASS') requireValue(claim.probe.exitCode === 0, 'VerificationClaim PASS requires a successful probe');
}

export function assertHarnessManifestV3(manifest: HarnessManifestV3): void {
  requireValue(manifest.schema === 'harness/manifest' && manifest.version === 3, 'HarnessManifestV3 schema/version mismatch');
  requireSha(manifest.manifestSha256, 'HarnessManifestV3.manifestSha256');
  requireUniqueNonEmpty(manifest.subsystems.map((subsystem) => subsystem.subsystemId), 'HarnessManifestV3 subsystems');
  requireUniqueNonEmpty(manifest.capabilities.map((capability) => capability.capabilityId), 'HarnessManifestV3 capabilities');
  const capabilityIds = new Set(manifest.capabilities.map((capability) => capability.capabilityId));
  requireValue(manifest.subsystems.every((subsystem) => subsystem.owner.trim() && subsystem.capabilities.every((capability) => capabilityIds.has(capability))), 'HarnessManifestV3 subsystem ownership is invalid');
  requireValue(manifest.capabilities.every((capability) => capability.dependencies.every((dependency) => capabilityIds.has(dependency) && dependency !== capability.capabilityId)), 'HarnessManifestV3 capability graph is invalid');
  const dependenciesByCapability = new Map(manifest.capabilities.map((capability) => [capability.capabilityId, capability.dependencies]));
  requireAcyclicGraph(dependenciesByCapability, 'HarnessManifestV3 capability graph');
  for (const [name, entries] of Object.entries(manifest.registries)) {
    requireValue(new Set(entries.map((entry) => entry.id)).size === entries.length, `HarnessManifestV3 ${name} registry has duplicates`);
    requireValue(entries.every((entry) => entry.id && entry.path && isSha256(entry.sha256)), `HarnessManifestV3 ${name} registry is invalid`);
  }
  requireValue(Object.values(manifest.contextBudgets).every((budget) => Number.isInteger(budget) && budget > 0), 'HarnessManifestV3 context budget is invalid');
  requireUniqueNonEmpty(manifest.modelClasses.map((modelClass) => modelClass.classId), 'HarnessManifestV3 model classes');
  requireValue(manifest.modelClasses.every((modelClass) => modelClass.approvedModels.length > 0 && modelClass.riskTiers.length > 0), 'HarnessManifestV3 approved model routing is empty');
  const modelClassIds = new Set(manifest.modelClasses.map((modelClass) => modelClass.classId));
  requireValue(Object.values(manifest.approvedRouting).every((modelClassId) => modelClassIds.has(modelClassId)), 'HarnessManifestV3 routing references an unknown model class');
  const riskTiers: readonly TaskAssignment['riskTier'][] = ['low', 'medium', 'high', 'critical'];
  const routeTiers = Object.keys(manifest.approvedRouting);
  requireValue(routeTiers.every((tier): tier is TaskAssignment['riskTier'] => riskTiers.includes(tier as TaskAssignment['riskTier'])), 'HarnessManifestV3 routing has an unknown risk tier');
  requireValue(riskTiers.every((tier) => Object.hasOwn(manifest.approvedRouting, tier)), 'HarnessManifestV3 routing coverage is incomplete');
  requireValue(routeTiers.every((tier) => {
    const modelClass = manifest.modelClasses.find((candidate) => candidate.classId === manifest.approvedRouting[tier]);
    return modelClass?.riskTiers.includes(tier as TaskAssignment['riskTier']);
  }), 'HarnessManifestV3 routing is incoherent with model class risk tiers');
  requireValue(manifest.sourceIntegrity.every((source) => source.sourceId && source.uri && source.commit && isSha256(source.sha256)), 'HarnessManifestV3 source integrity is invalid');
}

export function assertWorkLedger(ledger: WorkLedger, originalBytes: Uint8Array, shadowBytes: Readonly<Record<string, Uint8Array>>): void {
  requireValue(originalBytes instanceof Uint8Array, 'WorkLedger physical original bytes are required');
  requireValue(Boolean(shadowBytes) && !Array.isArray(shadowBytes), 'WorkLedger physical shadow bytes are required');
  assertPortablePlanIdentity(ledger.plan, originalBytes);
  for (const field of ['planAnchors', 'batches', 'amendments', 'assignments', 'receipts', 'verificationClaims', 'attestations', 'reconciliations', 'repairSlices', 'sourceAcquisitionReceipts', 'orphanFindings'] as const) requireArray(ledger[field], field);
  const ledgerStatuses: readonly WorkLedgerStatus[] = ['ADOPTED', 'DISCOVERING', 'PLANNED', 'VALIDATED', 'DISPATCHING', 'EXECUTING', 'VERIFYING', 'REVIEWING', 'needs-remediation', 'needs-replan', 'COMPLETED', 'PARTIAL', 'BLOCKED', 'FAILED', 'CANCELLED'];
  const batchStatuses: readonly LedgerBatch['status'][] = ['PENDING', 'RUNNING', 'PARTIAL', 'PASSED', 'BLOCKED'];
  requireValue(ledgerStatuses.includes(ledger.status), 'WorkLedger status is unknown');
  requireValue(ledger.batches.length > 0, 'WorkLedger batches must be non-empty');
  requireValue(ledger.batches.every((batch) => batchStatuses.includes(batch.status)), 'WorkLedger batch status is unknown');
  const canonicalAnchorKeys = new Set(ledger.plan.anchors.map(planAnchorKey));
  const ledgerAnchorKeys = new Set<string>();
  for (const anchor of ledger.planAnchors) {
    assertPlanAnchor(anchor, ledger.plan.original.sha256, originalBytes);
    const anchorKey = planAnchorKey(anchor);
    requireValue(canonicalAnchorKeys.has(anchorKey), 'WorkLedger PlanAnchor is not canonical');
    ledgerAnchorKeys.add(anchorKey);
  }
  requireValue(ledgerAnchorKeys.size === ledger.planAnchors.length && ledgerAnchorKeys.size === canonicalAnchorKeys.size, 'WorkLedger PlanAnchors do not match the plan');
  requireValue(Boolean(ledger.shadowHashes) && ledger.shadowRevision > 0 && Object.keys(ledger.shadowHashes).length > 0 && Object.values(ledger.shadowHashes).every(isSha256), 'WorkLedger shadow state is invalid');
  const declaredShadowNames = Object.keys(ledger.shadowHashes).sort();
  const actualShadowNames = Object.keys(shadowBytes).sort();
  requireValue(declaredShadowNames.length === actualShadowNames.length && declaredShadowNames.every((name, index) => name === actualShadowNames[index]), 'WorkLedger shadow bytes are incomplete');
  for (const name of declaredShadowNames) requireValue(sha256Bytes(shadowBytes[name]) === ledger.shadowHashes[name], 'WorkLedger shadow state is stale');
  requireValue(Boolean(ledger.latestReview) && !ledger.latestReview.stale && ledger.latestReview.shadowRevision === ledger.shadowRevision, 'WorkLedger review is stale');
  requireValue(ledger.latestReview.originalSha256 === ledger.plan.original.sha256, 'WorkLedger review original is stale');
  for (const value of [ledger.latestReview.amendmentsSha256, ledger.latestReview.diffFingerprint, ledger.latestReview.receiptEvidenceFingerprint, ...ledger.latestReview.evidenceHashes]) requireSha(value, 'WorkLedger review binding');
  requireValue(ledger.amendments.every((amendment) => amendment.approved && isSha256(amendment.sha256) && amendment.sourceRef), 'WorkLedger contains an unapproved amendment');
  const approvedAmendmentIds = new Set(ledger.amendments.filter((amendment) => amendment.approved).map((amendment) => amendment.amendmentId));
  requireValue(new Set(ledger.assignments.map((assignment) => assignment.assignmentId)).size === ledger.assignments.length, 'WorkLedger assignment IDs must be unique');
  requireValue(new Set(ledger.receipts.map((receipt) => receipt.receiptId)).size === ledger.receipts.length, 'WorkLedger receipt IDs must be unique');
  requireValue(new Set(ledger.verificationClaims.map((claim) => claim.claimId)).size === ledger.verificationClaims.length, 'WorkLedger verification claim IDs must be unique');
  for (const assignment of ledger.assignments) assertTaskAssignment(assignment, ledger.plan, originalBytes, approvedAmendmentIds);
  for (const receipt of ledger.receipts) {
    const assignment = ledger.assignments.find((candidate) => candidate.assignmentId === receipt.assignmentId);
    requireValue(assignment, 'WorkerReceipt references an unknown assignment');
    assertWorkerReceipt(receipt, assignment);
  }
  for (const claim of ledger.verificationClaims) {
    const receipt = ledger.receipts.find((candidate) => candidate.receiptId === claim.receiptId);
    requireValue(receipt, 'VerificationClaim references an unknown receipt');
    const assignment = ledger.assignments.find((candidate) => candidate.assignmentId === receipt.assignmentId);
    requireValue(assignment, 'VerificationClaim references an unknown assignment');
    assertVerificationClaim(claim, receipt, assignment, ledger.plan, originalBytes, approvedAmendmentIds);
  }
  const expectedAmendmentsSha256 = aggregateRows(ledger.amendments
    .filter((amendment) => amendment.approved)
    .map((amendment) => JSON.stringify([amendment.amendmentId, amendment.sha256, amendment.sourceRef])));
  const expectedDiffFingerprint = aggregateRows(ledger.receipts
    .map((receipt) => JSON.stringify([receipt.receiptId, receipt.assignmentId, receipt.diffSha256 ?? null])));
  const expectedReceiptEvidenceFingerprint = reviewedStateFingerprint(ledger.receipts, ledger.verificationClaims);
  const expectedEvidenceHashes = [...new Set(ledger.verificationClaims.flatMap((claim) => claim.evidenceHashes))].sort();
  requireValue(ledger.latestReview.amendmentsSha256 === expectedAmendmentsSha256, 'WorkLedger review amendment binding is stale');
  requireValue(ledger.latestReview.diffFingerprint === expectedDiffFingerprint, 'WorkLedger review diff binding is stale');
  requireValue(ledger.latestReview.receiptEvidenceFingerprint === expectedReceiptEvidenceFingerprint, 'WorkLedger review receipt/evidence binding is stale');
  requireValue(sameStringSet(ledger.latestReview.evidenceHashes, expectedEvidenceHashes), 'WorkLedger review evidence binding is stale');
  const reviewedIdentities = new Set([
    ...ledger.receipts.map((receipt) => receipt.workerIdentity),
    ...ledger.verificationClaims.flatMap((claim) => [claim.verifierIdentity, claim.reducerIdentity]),
  ]);
  requireValue(Boolean(ledger.latestReview.reviewerIdentity) && !reviewedIdentities.has(ledger.latestReview.reviewerIdentity), 'WorkLedger reviewer must be independent from reviewed evidence identities');
  for (const receipt of ledger.sourceAcquisitionReceipts) {
    assertPlanAnchor(receipt.planAnchor, ledger.plan.original.sha256, originalBytes);
    requireSha(receipt.contentSha256, 'SourceAcquisitionReceipt.contentSha256');
  }
  const canonicalAnchorRequirements = new Map(ledger.plan.anchors.map((anchor) => [planAnchorId(anchor), anchor.requirementId]));
  const liveClaims = new Map(ledger.verificationClaims.map((claim) => [claim.claimId, claim]));
  requireValue(ledger.reconciliations.every((entry) => {
    const requirementExists = ledger.plan.requirements.some((requirement) => requirement.requirementId === entry.requirementId);
    const anchorsAreLive = new Set(entry.anchorIds).size === entry.anchorIds.length
      && entry.anchorIds.every((anchorId) => canonicalAnchorRequirements.get(anchorId) === entry.requirementId);
    const claimsAreLive = new Set(entry.verificationClaimIds).size === entry.verificationClaimIds.length
      && entry.verificationClaimIds.every((claimId) => liveClaims.get(claimId)?.requirementId === entry.requirementId);
    return requirementExists && anchorsAreLive && claimsAreLive;
  }), 'WorkLedger reconciliation references non-canonical anchors or verification claims');
  if (ledger.status === 'needs-remediation') requireValue(ledger.repairSlices.some((item) => item.status !== 'PASSED'), 'needs-remediation requires an open repair slice');
  if (ledger.status === 'COMPLETED') {
    requireValue(ledger.batches.every((item) => item.status === 'PASSED'), 'COMPLETED requires all batches passed');
    requireValue(ledger.reconciliations.length === ledger.plan.requirements.length && ledger.plan.requirements.every((requirement) => ledger.reconciliations.some((item) => item.requirementId === requirement.requirementId && (item.status === 'MATCH' || item.status === 'SUPERSEDED'))), 'COMPLETED requires reconciled requirements');
    requireValue(ledger.plan.requirements.every((requirement) => {
      const reconciliation = ledger.reconciliations.find((entry) => entry.requirementId === requirement.requirementId);
      const expectedAnchorIds = ledger.plan.anchors.filter((anchor) => anchor.requirementId === requirement.requirementId).map(planAnchorId);
      return Boolean(reconciliation) && sameStringSet(reconciliation!.anchorIds, expectedAnchorIds);
    }), 'COMPLETED requires exact canonical reconciliation anchors');
    requireValue(ledger.assignments.length > 0, 'COMPLETED requires task assignments with acceptance criteria');
    const planTaskIds = ledger.plan.taskDag.map((task) => task.taskId);
    requireValue(sameStringSet(ledger.assignments.map((assignment) => assignment.taskId), planTaskIds), 'COMPLETED requires exact plan task assignment coverage');
    requireValue(sameStringSet(ledger.batches.flatMap((batch) => batch.taskIds), planTaskIds), 'COMPLETED requires exact plan task batch coverage');
    requireValue(ledger.verificationClaims.length > 0 && ledger.verificationClaims.every((item) => item.outcome === 'PASS'), 'COMPLETED requires passing verification claims');
    requireValue(ledger.assignments.every((assignment) => assignment.acceptanceCriteria.every((criterion) => ledger.verificationClaims.some((claim) => {
      const receipt = ledger.receipts.find((candidate) => candidate.receiptId === claim.receiptId);
      const criterionOwner = ledger.plan.requirements.find((requirement) => requirement.acceptanceCriteria.some((candidate) => candidate.criterionId === criterion.criterionId));
      return receipt?.assignmentId === assignment.assignmentId
        && claim.criterionId === criterion.criterionId
        && claim.requirementId === criterionOwner?.requirementId
        && claim.verificationProfile === criterion.evidenceProfile
        && claim.outcome === 'PASS'
        && claim.reducerResult === 'PASS'
        && claim.evidenceUris.length > 0
        && claim.evidenceHashes.length === claim.evidenceUris.length;
    }))), 'COMPLETED requires an independent passing verification claim with evidence for every acceptance criterion');
    requireValue(ledger.plan.requirements.every((requirement) => requirement.acceptanceCriteria.every((criterion) => {
      const reconciliation = ledger.reconciliations.find((entry) => entry.requirementId === requirement.requirementId);
      return ledger.verificationClaims.some((claim) => claim.requirementId === requirement.requirementId
        && claim.criterionId === criterion.criterionId
        && claim.verificationProfile === criterion.evidenceProfile
        && claim.outcome === 'PASS'
        && claim.reducerResult === 'PASS'
        && claim.evidenceHashes.length > 0
        && reconciliation?.verificationClaimIds.includes(claim.claimId));
    })), 'COMPLETED requires a reconciled PASS claim for every plan acceptance criterion');
    requireValue(ledger.orphanFindings.every((item) => item.status === 'RESOLVED' || item.status === 'REVALIDATED'), 'COMPLETED requires resolved orphan findings');
    requireValue(ledger.repairSlices.every((item) => item.status === 'PASSED'), 'COMPLETED requires reviewed repair slices');
  }
}

// ---------------------------------------------------------------------------
// Canonical terminal authority (convergence P1)
//
// ONE terminal authority is the single source of truth for CLI DONE / release /
// closure / attestation / deactivation / compaction. The evidence ledger,
// acceptance audit, convergence and closure-service reducers delegate to this
// type; they must not keep independent terminal semantics.
//
// `PRE_EXISTING` is an evidence/proof STATUS only — never a terminal outcome.
// Fail-closed ordering: FAILED -> NEEDS_USER -> BLOCKED -> UNSUPPORTED ->
// PARTIAL -> PASS. Exit 0 and the words "DONE"/"completed" are produced ONLY
// from PASS.
// ---------------------------------------------------------------------------

export type TrustedTerminalOutcome =
  | 'PASS'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'FAILED'
  | 'UNSUPPORTED'
  | 'NEEDS_USER';

/** Evidence/proof status only; never a terminal outcome. */
export type ProofEvidenceStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'UNVERIFIED' | 'PRE_EXISTING';

/** The five identities every proof/closure/install receipt must bind. */
export interface TerminalEvidenceBinding {
  harness_release: string;
  installed_projection: string;
  consumer_repository: string;
  consumer_candidate: string;
  host_runtime: string;
}

export interface TrustedTerminalDecision {
  outcome: TrustedTerminalOutcome;
  unresolved_requirements: readonly string[];
  reason_codes: readonly string[];
  bound_evidence: TerminalEvidenceBinding;
  release_eligible: boolean;
  closure_eligible: boolean;
  attestation_eligible: boolean;
  deactivation_eligible: boolean;
  compaction_eligible: boolean;
}

/** Fail-closed precedence: earlier entries win over later ones. */
export const TERMINAL_FAIL_CLOSED_ORDER: readonly TrustedTerminalOutcome[] = [
  'FAILED',
  'NEEDS_USER',
  'BLOCKED',
  'UNSUPPORTED',
  'PARTIAL',
  'PASS',
];

/** Return the worst (most fail-closed) outcome present in `candidates`. */
export function failClosedOutcome(candidates: readonly TrustedTerminalOutcome[]): TrustedTerminalOutcome {
  for (const outcome of TERMINAL_FAIL_CLOSED_ORDER) {
    if (candidates.includes(outcome)) return outcome;
  }
  return 'PASS';
}

/** PASS only when outcome is PASS, nothing unresolved, and release+closure eligible. */
export function isTerminalPass(decision: TrustedTerminalDecision): boolean {
  return decision.outcome === 'PASS'
    && decision.unresolved_requirements.length === 0
    && decision.release_eligible
    && decision.closure_eligible;
}

/**
 * Single source of truth for the public verb rendered to an operator. "DONE" is
 * produced ONLY from a terminal PASS; every other outcome renders a non-DONE
 * verb. Diagnostic/prepare/status paths must use PREPARED/STATUS and must never
 * claim task completion. This is the canonical guard against false-DONE.
 */
export type TerminalVerb = 'DONE' | 'NEEDS_USER' | 'BLOCKED' | 'PARTIAL' | 'FAILED' | 'UNSUPPORTED';

export function terminalVerb(decision: TrustedTerminalDecision): TerminalVerb {
  if (isTerminalPass(decision)) return 'DONE';
  const nonPass: Record<Exclude<TrustedTerminalOutcome, 'PASS'>, TerminalVerb> = {
    FAILED: 'FAILED',
    NEEDS_USER: 'NEEDS_USER',
    BLOCKED: 'BLOCKED',
    UNSUPPORTED: 'UNSUPPORTED',
    PARTIAL: 'PARTIAL',
  };
  return nonPass[decision.outcome as Exclude<TrustedTerminalOutcome, 'PASS'>];
}
