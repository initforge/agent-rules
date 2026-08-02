import { createHash } from 'node:crypto';
import {
  sha256Bytes,
  isSha256,
  type AcceptanceCriterion,
  type AmendmentRecord,
  type LedgerBatch,
  type PlanAnchor,
  type PlanArtifactRef,
  type PlanRequirement,
  type PlanTaskNode,
  type PortablePlan,
  type RepairSlice,
  type ReviewReceipt,
  type WorkLedger,
} from './contracts.js';

/**
 * The pre-v3 ledger was deliberately not treated as a WorkLedger.  Its
 * assertions and receipts had different contracts, so silently coercing them
 * into a v3 receipt would manufacture evidence.  This adapter only promotes
 * facts that can be checked physically and keeps the complete input under a
 * non-canonical provenance field for a later, explicit review.
 */
export interface LegacyLedgerMigrationInput {
  readonly legacy: unknown;
  readonly originalBytes: Uint8Array;
  readonly ownerIdentity: string;
  readonly authorIdentity: string;
  readonly hostTask: { readonly host: string; readonly taskRef: string; readonly sessionRef: string };
  /** Required when the legacy source kind is not already a v3 source kind. */
  readonly sourceKind?: PlanArtifactRef['sourceKind'];
  readonly repositoryIdentity?: string;
}

export interface MigratedWorkLedger extends WorkLedger {
  /**
   * Provenance is intentionally outside the canonical contract.  It is
   * retained so a migration can be audited without pretending that old
   * assignments, reviews, or findings satisfy v3 contracts.
   */
  readonly legacyMigration: {
    readonly adapterVersion: 'legacy-ledger-to-v3/1';
    readonly sourceSchema: string;
    readonly sourceSha256: string;
    readonly preservedLegacy: Record<string, unknown>;
    readonly nonPromotedFields: readonly string[];
    readonly requiresFreshVerification: true;
  };
}

export interface MigrationResult {
  readonly ledger: MigratedWorkLedger;
  readonly originalBytes: Uint8Array;
  readonly shadows: Readonly<Record<string, Uint8Array>>;
  readonly idempotencyKey: string;
}

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Legacy ledger migration rejected: ${message}`);
}

function record(value: unknown, field: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object`);
  return value as JsonRecord;
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function stringValue(value: unknown, field: string, required = true): string {
  if (typeof value !== 'string' || (required && value.trim().length === 0)) fail(`${field} must be a non-empty string`);
  return value;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

/** Reject JavaScript-only values before snapshotting legacy provenance. */
function jsonSnapshot(value: unknown, field: string, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${field} contains a non-finite number`);
    return value;
  }
  if (typeof value !== 'object') fail(`${field} contains a non-JSON value`);
  if (seen.has(value)) fail(`${field} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    const copied = value.map((item, index) => jsonSnapshot(item, `${field}[${index}]`, seen));
    seen.delete(value);
    return copied;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(`${field} must contain plain JSON objects`);
  const copied: JsonRecord = {};
  for (const [key, item] of Object.entries(value as JsonRecord)) copied[key] = jsonSnapshot(item, `${field}.${key}`, seen);
  seen.delete(value);
  return copied;
}

function parsePlanLines(bytes: Uint8Array): readonly string[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return text.match(/[^\n]*(?:\n|$)/g)?.filter((line, index, all) => line.length > 0 || index < all.length - 1) ?? [];
}

function canonicalSourceKind(value: unknown, supplied: PlanArtifactRef['sourceKind'] | undefined): PlanArtifactRef['sourceKind'] {
  const source = stringValue(value, 'original_plan.source_kind');
  if (source === 'chat_plan_artifact' || source === 'file_plan_artifact' || source === 'prompt_fallback') return source;
  if (supplied) return supplied;
  fail(`unsupported original_plan.source_kind '${source}'; provide sourceKind explicitly rather than accepting a lossy inference`);
}

function legacyRequirementIds(legacy: JsonRecord): readonly string[] {
  const anchors = array(legacy.plan_anchors, 'plan_anchors');
  const ids = anchors.map((value, index) => stringValue(record(value, `plan_anchors[${index}]`).requirement_id, `plan_anchors[${index}].requirement_id`));
  const unique = [...new Set(ids)];
  if (unique.length === 0) fail('plan_anchors is empty; cannot compile requirements');
  return unique;
}

function makeAnchor(value: unknown, index: number, expectedSha: string, originalBytes: Uint8Array, lines: readonly string[]): PlanAnchor {
  const source = record(value, `plan_anchors[${index}]`);
  const planSha = stringValue(source.plan_sha256, `plan_anchors[${index}].plan_sha256`);
  if (planSha !== expectedSha) fail(`plan_anchors[${index}] is bound to ${planSha}, expected original SHA ${expectedSha}`);
  const lineStart = Number(source.line_start);
  const lineEnd = Number(source.line_end);
  if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd) || lineStart < 1 || lineEnd < lineStart || lineEnd > lines.length) {
    fail(`plan_anchors[${index}] has invalid physical line range`);
  }
  const requirementId = stringValue(source.requirement_id, `plan_anchors[${index}].requirement_id`);
  const text = lines.slice(lineStart - 1, lineEnd).join('');
  const anchorTextSha256 = sha256(text);
  if (source.anchor_text_sha256 !== anchorTextSha256) fail(`plan_anchors[${index}] anchor bytes do not match original.md`);
  // Keep the physical verification here even though the hash check above
  // covers it: it documents that migration is byte-boundary aware.
  if (sha256Bytes(originalBytes) !== expectedSha) fail('original plan bytes do not match original_plan.sha256');
  return {
    planSha256: expectedSha,
    sectionHeading: stringValue(source.section_heading, `plan_anchors[${index}].section_heading`),
    lineStart,
    lineEnd,
    anchorTextSha256,
    requirementId,
    chunkIndex: 0,
  };
}

function aggregateRows(rows: readonly string[]): string {
  return sha256(JSON.stringify([...rows].sort()));
}

function projectionHash(plan: Omit<PortablePlan, 'projectionSha256'>): string {
  return sha256(stable(plan));
}

function buildShadows(ledger: WorkLedger, migration: MigratedWorkLedger['legacyMigration']): Readonly<Record<string, Uint8Array>> {
  const encode = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  return {
    'tasks.md': encode({ tasks: ledger.plan.taskDag, batches: ledger.batches }),
    'requirements.md': encode({ requirements: ledger.plan.requirements, anchors: ledger.plan.anchors }),
    'reconciliation.md': encode({
      status: ledger.status,
      reconciliations: ledger.reconciliations,
      repairSlices: ledger.repairSlices,
      reason: 'Legacy evidence was not promoted; fresh v3 review is required.',
    }),
    'migration.md': encode({
      adapterVersion: migration.adapterVersion,
      sourceSchema: migration.sourceSchema,
      sourceSha256: migration.sourceSha256,
      nonPromotedFields: migration.nonPromotedFields,
      requiresFreshVerification: migration.requiresFreshVerification,
    }),
  };
}

/**
 * Convert a rescued v1 ledger into a truthful v3 ledger.
 *
 * This function is deterministic for the same input.  It intentionally emits
 * no receipts, verification claims, attestations, or CI checks: those are
 * runtime facts and must be recreated by the v3 engine.
 */
export function migrateLegacyLedger(input: LegacyLedgerMigrationInput): MigrationResult {
  if (!(input.originalBytes instanceof Uint8Array)) fail('originalBytes must be a Uint8Array');
  const legacy = record(jsonSnapshot(input.legacy, 'legacy'), 'legacy');
  const original = record(legacy.original_plan, 'original_plan');
  const planId = stringValue(legacy.plan_id, 'plan_id');
  const expectedOriginalSha = stringValue(original.sha256, 'original_plan.sha256');
  const actualOriginalSha = sha256Bytes(input.originalBytes);
  if (expectedOriginalSha !== actualOriginalSha) fail(`original plan SHA mismatch: ${expectedOriginalSha} != ${actualOriginalSha}`);
  const ownerIdentity = stringValue(input.ownerIdentity, 'ownerIdentity');
  const authorIdentity = stringValue(input.authorIdentity, 'authorIdentity');
  const hostTask = {
    host: stringValue(input.hostTask.host, 'hostTask.host'),
    taskRef: stringValue(input.hostTask.taskRef, 'hostTask.taskRef'),
    sessionRef: stringValue(input.hostTask.sessionRef, 'hostTask.sessionRef'),
  };
  const lines = parsePlanLines(input.originalBytes);
  const sourceAnchors = array(legacy.plan_anchors, 'plan_anchors');
  const anchors = sourceAnchors.map((value, index) => makeAnchor(value, index, actualOriginalSha, input.originalBytes, lines));
  const requirementIds = legacyRequirementIds(legacy);
  const anchorByRequirement = new Map<string, PlanAnchor>();
  for (const anchor of anchors) if (!anchorByRequirement.has(anchor.requirementId)) anchorByRequirement.set(anchor.requirementId, anchor);
  const assignments = array(legacy.assignments ?? [], 'assignments').map((value, index) => record(value, `assignments[${index}]`));
  const criteriaByRequirement = new Map<string, AcceptanceCriterion[]>();
  for (const requirementId of requirementIds) criteriaByRequirement.set(requirementId, []);
  for (const assignment of assignments) {
    const requirementId = stringValue(assignment.plan_anchor_requirement_id, 'assignment.plan_anchor_requirement_id');
    if (!anchorByRequirement.has(requirementId)) fail(`assignment references unknown requirement '${requirementId}'`);
    const criteria = array(assignment.acceptance_criteria ?? [], `assignment ${String(assignment.assignment_id)}.acceptance_criteria`);
    for (const criterion of criteria) {
      const claim = stringValue(criterion, 'legacy acceptance criterion');
      const criterionId = `MIG-${requirementId}-${sha256(claim).slice(0, 16)}`;
      const existing = criteriaByRequirement.get(requirementId)!;
      if (!existing.some((item) => item.criterionId === criterionId)) {
        existing.push({
          criterionId,
          claim,
          evidenceProfile: 'fresh-independent-review',
          binding: { kind: 'plan-anchor', anchor: anchorByRequirement.get(requirementId)! },
        });
      }
    }
  }
  for (const requirementId of requirementIds) {
    const criteria = criteriaByRequirement.get(requirementId)!;
    if (criteria.length === 0) {
      const anchor = anchorByRequirement.get(requirementId)!;
      const claim = `Re-verify legacy requirement ${requirementId} against its physical plan anchor`;
      criteria.push({
        criterionId: `MIG-${requirementId}-${sha256(claim).slice(0, 16)}`,
        claim,
        evidenceProfile: 'fresh-independent-review',
        binding: { kind: 'plan-anchor', anchor },
      });
    }
  }
  const requirements: PlanRequirement[] = requirementIds.map((requirementId) => {
    const anchor = anchorByRequirement.get(requirementId)!;
    return {
      requirementId,
      statement: `Legacy requirement ${requirementId}: ${lines.slice(anchor.lineStart - 1, anchor.lineEnd).join('').trim()}`,
      acceptanceCriteria: criteriaByRequirement.get(requirementId)!,
    };
  });
  const taskDag: PlanTaskNode[] = [];
  const taskIds = new Set<string>();
  const taskIdsByRequirement = new Map<string, string[]>();
  for (const assignment of assignments) {
    const requirementId = String(assignment.plan_anchor_requirement_id);
    const base = stringValue(assignment.task_id, 'assignment.task_id').replace(/[^A-Za-z0-9._-]+/g, '-');
    const taskId = `MIG-${base || sha256(stable(assignment)).slice(0, 12)}`;
    if (taskIds.has(taskId)) fail(`assignments produce duplicate canonical task ID '${taskId}'`);
    taskIds.add(taskId);
    const criterionIds = criteriaByRequirement.get(requirementId)!.map((criterion) => criterion.criterionId);
    taskDag.push({ taskId, requirementIds: [requirementId], criterionIds, dependencies: [] });
    taskIdsByRequirement.set(requirementId, [...(taskIdsByRequirement.get(requirementId) ?? []), taskId]);
  }
  for (const requirementId of requirementIds) {
    if (taskIdsByRequirement.has(requirementId)) continue;
    const taskId = `MIG-${requirementId}`;
    if (taskIds.has(taskId)) fail(`requirements produce duplicate canonical task ID '${taskId}'`);
    taskIds.add(taskId);
    taskDag.push({ taskId, requirementIds: [requirementId], criterionIds: criteriaByRequirement.get(requirementId)!.map((criterion) => criterion.criterionId), dependencies: [] });
  }
  const legacyBatches = array(legacy.batches ?? [], 'batches');
  const batches: LedgerBatch[] = legacyBatches.length > 0
    ? legacyBatches.map((value, index) => {
      const item = record(value, `batches[${index}]`);
      const anchorRequirement = typeof item.anchor_requirement_id === 'string' ? item.anchor_requirement_id : undefined;
      if (anchorRequirement && !anchorByRequirement.has(anchorRequirement)) fail(`batches[${index}] references unknown requirement '${anchorRequirement}'`);
      const taskIds = anchorRequirement ? taskDag.filter((task) => task.requirementIds.includes(anchorRequirement)).map((task) => task.taskId) : taskDag.map((task) => task.taskId);
      // A legacy batch status is execution evidence.  It remains in provenance;
      // the canonical batch must remain blocked until v3 evidence exists.
      return { batchId: stringValue(item.batch_id, `batches[${index}].batch_id`), status: 'BLOCKED', taskIds };
    })
    : [{ batchId: 'MIGRATION-PENDING', status: 'BLOCKED', taskIds: taskDag.map((task) => task.taskId) }];
  if (new Set(batches.map((batch) => batch.batchId)).size !== batches.length) fail('batches contain duplicate batch_id values');
  const amendmentRecords: AmendmentRecord[] = array(legacy.amendments ?? [], 'amendments').map((value, index) => {
    const item = record(value, `amendments[${index}]`);
    const status = stringValue(item.status, `amendments[${index}].status`).toUpperCase();
    if (status !== 'OWNER_APPROVED_EFFECTIVE') fail(`amendment ${String(item.amendment_id)} is not explicitly approved and effective`);
    const amendmentSha256 = stringValue(item.sha256, `amendments[${index}].sha256`);
    if (!isSha256(amendmentSha256)) fail(`amendments[${index}].sha256 must be SHA-256`);
    return {
      amendmentId: stringValue(item.amendment_id, `amendments[${index}].amendment_id`),
      approved: true,
      sha256: amendmentSha256,
      sourceRef: stringValue(item.path ?? item.source_ref, `amendments[${index}].path`),
    };
  });
  if (new Set(amendmentRecords.map((amendment) => amendment.amendmentId)).size !== amendmentRecords.length) fail('amendments contain duplicate amendment_id values');
  const legacyIdentity = legacy.effective_plan_identity === undefined ? undefined : record(legacy.effective_plan_identity, 'effective_plan_identity');
  if (legacyIdentity) {
    const manifest = record(legacyIdentity.input_manifest, 'effective_plan_identity.input_manifest');
    if (stringValue(manifest.original_plan_sha256, 'effective_plan_identity.input_manifest.original_plan_sha256') !== actualOriginalSha) fail('effective_plan_identity does not preserve the original plan hash');
    const identityAmendments = array(manifest.approved_amendments, 'effective_plan_identity.input_manifest.approved_amendments').map((value, index) => {
      const item = record(value, `effective_plan_identity.input_manifest.approved_amendments[${index}]`);
      return [stringValue(item.amendment_id, `effective_plan_identity.input_manifest.approved_amendments[${index}].amendment_id`), stringValue(item.sha256, `effective_plan_identity.input_manifest.approved_amendments[${index}].sha256`)] as const;
    });
    const migratedAmendments = amendmentRecords.map((item) => [item.amendmentId, item.sha256] as const);
    if (JSON.stringify(identityAmendments) !== JSON.stringify(migratedAmendments)) fail('effective_plan_identity amendment hashes or order would be lost');
  }
  const amendmentHash = aggregateRows(amendmentRecords.map((item) => JSON.stringify([item.amendmentId, item.sha256, item.sourceRef])));
  const emptyDiff = aggregateRows([]);
  const emptyEvidence = aggregateRows([]);
  const capturedAt = stringValue(original.source_captured_at, 'original_plan.source_captured_at');
  if (Number.isNaN(Date.parse(capturedAt))) fail('original_plan.source_captured_at must be an ISO timestamp');
  const baseline = record(legacy.repository_baseline, 'repository_baseline');
  const baselineCommit = stringValue(baseline.commit, 'repository_baseline.commit');
  const baselineBranch = stringValue(baseline.branch, 'repository_baseline.branch');
  const originalBytes = Number(original.bytes);
  if (!Number.isSafeInteger(originalBytes) || originalBytes !== input.originalBytes.byteLength) fail('original_plan.bytes does not match originalBytes');
  if (stringValue(legacy.status, 'status') !== 'ADOPTED') fail('legacy status must be ADOPTED to retain canonical plan adoption');
  const approvalEvent = stringValue(record(legacy.execution_authorization, 'execution_authorization').message_id, 'execution_authorization.message_id');
  const originalRef: PlanArtifactRef = {
    artifactId: `legacy:${planId}:original`,
    planId,
    sourceKind: canonicalSourceKind(original.source_kind, input.sourceKind),
    sourceRef: stringValue(original.path, 'original_plan.path'),
    rawPath: stringValue(original.path, 'original_plan.path'),
    sha256: actualOriginalSha,
    bytes: originalBytes,
    capturedAt,
    status: 'ADOPTED',
    repositoryIdentity: input.repositoryIdentity ?? `legacy:${baselineCommit}`,
    repositoryBaseline: {
      commit: baselineCommit,
      branch: baselineBranch,
      dirtyFingerprint: sha256(stable(baseline.status ?? [])),
    },
    hostTask,
    authorIdentity,
    ownerIdentity,
    approvalEvent,
    supersedes: [],
    supplements: amendmentRecords.map((item) => item.amendmentId),
    derivedFrom: [],
  };
  const basePlan: Omit<PortablePlan, 'projectionSha256'> = {
    schema: 'harness/portable-plan',
    version: 3,
    planId,
    original: originalRef,
    objective: `Migrate rescued legacy ledger ${planId} into the v3 canonical contract`,
    scope: { in: ['legacy ledger migration and provenance preservation'], out: ['claiming legacy execution evidence as v3 evidence'] },
    decisions: [],
    assumptions: [],
    knownUnknowns: ['Legacy assignments, reviews, attestations, CI checks, and reconciliations require fresh v3 verification.'],
    taskDag,
    ownedPaths: ['.agent'],
    forbiddenPaths: ['generated'],
    evidenceProfiles: ['fresh-independent-review'],
    rollback: ['Delete the generated canonical ledger and restore the preserved legacy source.'],
    handoff: { recipientRole: 'v3 migration reviewer', requiredArtifacts: ['original.md', 'legacy ledger snapshot', 'migration shadows'], nextSafeAction: 'Create fresh receipts and independent verification claims.' },
    lineage: {
      head: originalRef,
      ancestors: [],
      resolutionMatrix: requirementIds.map((requirementId) => ({ requirementId, sourceArtifactId: originalRef.artifactId, resolution: 'CARRIED', rationale: 'Carried from the physically verified legacy plan anchor; execution evidence is not promoted.' })),
      verified: true,
      reconciliationResult: 'PASS',
      reconciliationSha256: sha256(stable({ original: actualOriginalSha, amendments: amendmentRecords })),
    },
    requirements,
    anchors,
  };
  const plan: PortablePlan = { ...basePlan, projectionSha256: projectionHash(basePlan) };
  const legacyFindings = array(legacy.findings ?? [], 'findings');
  const orphanFindings = legacyFindings.map((value, index) => {
    const item = record(value, `findings[${index}]`);
    const status = String(item.status ?? '').toUpperCase();
    return {
      findingId: stringValue(item.finding_id, `findings[${index}].finding_id`),
      // Legacy resolution is not a v3 revalidation result.
      status: 'OPEN' as const,
      path: typeof item.path === 'string' && item.path.length > 0 ? item.path : '.agent',
      reason: status ? `Legacy finding status '${status}' requires fresh v3 verification` : 'Legacy finding requires fresh v3 verification',
    };
  });
  const migrationFindingId = `MIGRATION-${sha256(stable(legacy)).slice(0, 16)}`;
  orphanFindings.push({ findingId: migrationFindingId, status: 'OPEN', path: '.agent', reason: 'Legacy execution evidence was intentionally not promoted into v3 receipts or claims.' });
  const repairSlices: RepairSlice[] = [{
    repairSliceId: `MIGRATION-REVIEW-${sha256(stable({ planId, actualOriginalSha })).slice(0, 16)}`,
    status: 'PENDING',
    findingIds: [migrationFindingId],
    reopenedCriterionIds: requirements.flatMap((requirement) => requirement.acceptanceCriteria.map((criterion) => criterion.criterionId)),
  }];
  const latestReview: ReviewReceipt = {
    reviewId: `MIGRATION-REVIEW-${sha256(stable({ planId, actualOriginalSha })).slice(0, 16)}`,
    stale: false,
    originalSha256: actualOriginalSha,
    amendmentsSha256: amendmentHash,
    diffFingerprint: emptyDiff,
    receiptEvidenceFingerprint: emptyEvidence,
    evidenceHashes: [],
    shadowRevision: 1,
    reviewerIdentity: 'legacy-ledger-migration-adapter',
  };
  const migration: MigratedWorkLedger['legacyMigration'] = {
    adapterVersion: 'legacy-ledger-to-v3/1',
    sourceSchema: String(legacy.schema_version ?? 'legacy/unknown'),
    sourceSha256: sha256(stable(legacy)),
    preservedLegacy: legacy,
    nonPromotedFields: ['assignments', 'reviews', 'findings', 'reconciliations', 'repair_slices', 'source_acquisition_receipts', 'attestations', 'ci_checks'],
    requiresFreshVerification: true,
  };
  const ledger: MigratedWorkLedger = {
    status: 'needs-remediation',
    plan,
    planAnchors: anchors,
    batches,
    amendments: amendmentRecords,
    assignments: [],
    receipts: [],
    verificationClaims: [],
    attestations: [],
    reconciliations: [],
    repairSlices,
    sourceAcquisitionReceipts: [],
    orphanFindings,
    shadowRevision: 1,
    shadowHashes: {},
    latestReview,
    legacyMigration: migration,
  };
  const shadows = buildShadows(ledger, migration);
  const shadowHashes: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(shadows)) shadowHashes[name] = sha256Bytes(bytes);
  const finalLedger: MigratedWorkLedger = { ...ledger, shadowHashes };
  const idempotencyKey = sha256(stable({ source: migration.sourceSha256, original: actualOriginalSha, plan: finalLedger.plan, amendments: finalLedger.amendments }));
  return { ledger: finalLedger, originalBytes: input.originalBytes, shadows, idempotencyKey };
}
