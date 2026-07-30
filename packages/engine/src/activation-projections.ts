import { createHash } from 'node:crypto';
import type { Sha256, WorkLedger, TaskAssignment, WorkerReceipt, LedgerBatch, ReviewReceipt } from './contracts.js';
import { sha256Bytes, payloadBytes, canonicalJsonIdentity, fullAnchorKey, type Ns0To9Mapping, type AuditEventShape } from './activation-semantics.js';

export { type Sha256 } from './contracts.js';

// ── ProjectionArtifact ────────────────────────────────────────────────────────
// bytes serializes payload excluding digest; payload reconstructs bytes

export interface ProjectionArtifact<T = unknown> {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly sha256: Sha256;
  readonly payload: T;
}

function artifactFor<T extends Record<string, unknown>>(id: string, payload: T): ProjectionArtifact<T> {
  const bytes = payloadBytes(payload);
  const sha = sha256Bytes(bytes);
  return { id, bytes, sha256: sha, payload: { ...payload, sha256: sha } as T };
}

// ── 1. Execution state projection ────────────────────────────────────────────

export interface ExecutionStatePayload {
  readonly execution_state: string;
  readonly needs_remediation: boolean;
  readonly open_repair_slices: number;
  readonly latest_review_revision: number;
  readonly shadow_revision: number;
  readonly sha256: Sha256;
}

export function projectExecutionState(ledger: WorkLedger): ProjectionArtifact<ExecutionStatePayload> {
  const openSlices = ledger.repairSlices.filter((s) => s.status !== 'PASSED' && s.status !== 'BLOCKED');
  return artifactFor('execution-state', {
    execution_state: ledger.status,
    needs_remediation: ledger.status === 'needs-remediation',
    open_repair_slices: openSlices.length,
    latest_review_revision: ledger.latestReview?.shadowRevision ?? 0,
    shadow_revision: ledger.shadowRevision,
    sha256: '' as Sha256,
  });
}

// ── 2. Audit event projection ────────────────────────────────────────────────

export interface AuditEventPayload {
  readonly events: readonly AuditEventShape[];
  readonly sha256: Sha256;
}

export function projectAuditEvents(ledger: WorkLedger): ProjectionArtifact<AuditEventPayload> {
  const events: AuditEventShape[] = [];
  if (ledger.status === 'needs-remediation') {
    for (const slice of ledger.repairSlices) {
      if (slice.status !== 'PASSED' && slice.status !== 'BLOCKED') {
        events.push({
          eventType: 'needs-remediation', actor: 'system',
          detail: `Repair slice ${slice.repairSliceId}`,
          sha256: sha256Bytes(new TextEncoder().encode(JSON.stringify(slice))),
        });
      }
    }
  }
  if (ledger.status === 'COMPLETED') {
    events.push({
      eventType: 'completed', actor: 'system',
      detail: `Shadow revision ${ledger.shadowRevision}`,
      sha256: sha256Bytes(new TextEncoder().encode(`completed:${ledger.shadowRevision}`)),
    });
  }
  if (ledger.batches.length > 0) {
    for (const batch of ledger.batches) {
      events.push({
        eventType: `batch:${batch.status}`, actor: 'system',
        detail: `Batch ${batch.batchId}`,
        sha256: sha256Bytes(new TextEncoder().encode(JSON.stringify(batch))),
      });
    }
  }
  return artifactFor('audit-events', { events, sha256: '' as Sha256 });
}

// ── 3. Identity projection ───────────────────────────────────────────────────

export interface IdentityPayload {
  readonly planId: string;
  readonly originalSha256: Sha256;
  readonly effectiveSha256: Sha256;
  readonly amendmentIds: readonly string[];
  readonly assignmentIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly sha256: Sha256;
}

export function projectIdentity(
  ledger: WorkLedger,
  effectiveSha256: Sha256,
): ProjectionArtifact<IdentityPayload> {
  return artifactFor('identity', {
    planId: ledger.plan.planId,
    originalSha256: ledger.plan.original.sha256,
    effectiveSha256,
    amendmentIds: ledger.amendments.map((a) => a.amendmentId),
    assignmentIds: ledger.assignments.map((a) => a.assignmentId),
    receiptIds: ledger.receipts.map((r) => r.receiptId),
    claimIds: ledger.verificationClaims.map((c) => c.claimId),
    sha256: '' as Sha256,
  });
}

// ── 4. NS structures projection ──────────────────────────────────────────────

export interface NsAnchorFlat {
  readonly nsId: string;
  readonly acIds: readonly string[];
  readonly anchorKeys: readonly string[];
}

export interface NsStructuresPayload {
  readonly sections: readonly NsAnchorFlat[];
  readonly assignmentNsMap: Record<string, string>;
  readonly sha256: Sha256;
}

export function projectNsStructures(
  ledger: WorkLedger,
  mapping: Ns0To9Mapping,
): ProjectionArtifact<NsStructuresPayload> {
  const sections = mapping.sections.map((s) => ({
    nsId: s.nsId,
    acIds: s.acIds,
    anchorKeys: s.anchors.map(fullAnchorKey),
  }));

  // Build a lookup from anchor key to SET of NS sections
  const allSectionAnchorNs = new Map<string, Set<string>>();
  for (const section of mapping.sections) {
    for (const anchor of section.anchors) {
      const key = fullAnchorKey(anchor);
      let nsSet = allSectionAnchorNs.get(key);
      if (!nsSet) { nsSet = new Set(); allSectionAnchorNs.set(key, nsSet); }
      nsSet.add(section.nsId);
    }
  }

  const assignmentNsMap: Record<string, string> = {};
  for (const assignment of ledger.assignments) {
    const matchedSections = new Set<string>();
    for (const anchor of assignment.anchors) {
      const nsSet = allSectionAnchorNs.get(fullAnchorKey(anchor));
      if (nsSet) for (const ns of nsSet) matchedSections.add(ns);
    }
    if (matchedSections.size === 0) {
      throw new Error(`Assignment ${assignment.assignmentId}: no matching NS section`);
    }
    if (matchedSections.size > 1) {
      throw new Error(`Assignment ${assignment.assignmentId}: matches ${matchedSections.size} NS sections (${[...matchedSections].join(',')})`);
    }
    assignmentNsMap[assignment.assignmentId] = [...matchedSections][0];
  }

  return artifactFor('ns-structures', { sections, assignmentNsMap, sha256: '' as Sha256 });
}

// ── 5. Shadow rerender projection ────────────────────────────────────────────

export interface ShadowRerenderPayload {
  readonly revision: number;
  readonly shadowCount: number;
  readonly shadows: Record<string, Sha256>;
  readonly sha256: Sha256;
}

export function projectShadowRerender(ledger: WorkLedger): ProjectionArtifact<ShadowRerenderPayload> {
  const shadows: Record<string, Sha256> = {};
  const raw = ledger.shadowHashes ?? {};
  for (const key of Object.keys(raw).sort()) {
    shadows[key] = raw[key];
  }
  return artifactFor('shadow-rerender', {
    revision: ledger.shadowRevision,
    shadowCount: Object.keys(shadows).length,
    shadows,
    sha256: '' as Sha256,
  });
}

// ── 6. Bootstrap projection ──────────────────────────────────────────────────

export interface BootstrapPayload {
  readonly batchId: string;
  readonly taskIds: readonly string[];
  readonly assignmentCount: number;
  readonly receiptCount: number;
  readonly sha256: Sha256;
}

export function projectBootstrap(
  batch: LedgerBatch,
  assignments: readonly TaskAssignment[],
  receipts: readonly WorkerReceipt[],
): ProjectionArtifact<BootstrapPayload> {
  const filteredAssignments = assignments.filter((a) => batch.taskIds.includes(a.taskId));
  const filteredReceipts = receipts.filter((r) =>
    filteredAssignments.some((a) => a.assignmentId === r.assignmentId),
  );
  return artifactFor(`bootstrap-${batch.batchId}`, {
    batchId: batch.batchId,
    taskIds: batch.taskIds,
    assignmentCount: filteredAssignments.length,
    receiptCount: filteredReceipts.length,
    sha256: '' as Sha256,
  });
}

// ── 7. Verification projection ───────────────────────────────────────────────

export interface VerificationPayload {
  readonly totalRequirements: number;
  readonly totalCriteria: number;
  readonly totalAssignments: number;
  readonly totalReceipts: number;
  readonly totalClaims: number;
  readonly passedClaims: number;
  readonly sha256: Sha256;
}

export function projectVerification(ledger: WorkLedger): ProjectionArtifact<VerificationPayload> {
  return artifactFor('verification', {
    totalRequirements: ledger.plan.requirements.length,
    totalCriteria: ledger.plan.requirements.reduce((sum, r) => sum + r.acceptanceCriteria.length, 0),
    totalAssignments: ledger.assignments.length,
    totalReceipts: ledger.receipts.length,
    totalClaims: ledger.verificationClaims.length,
    passedClaims: ledger.verificationClaims.filter((c) => c.outcome === 'PASS').length,
    sha256: '' as Sha256,
  });
}

// ── All seven projections ────────────────────────────────────────────────────

export interface AllProjections {
  readonly executionState: ProjectionArtifact<ExecutionStatePayload>;
  readonly auditEvents: ProjectionArtifact<AuditEventPayload>;
  readonly identity: ProjectionArtifact<IdentityPayload>;
  readonly nsStructures: ProjectionArtifact<NsStructuresPayload>;
  readonly shadowRerender: ProjectionArtifact<ShadowRerenderPayload>;
  readonly bootstrap: readonly ProjectionArtifact<BootstrapPayload>[];
  readonly verification: ProjectionArtifact<VerificationPayload>;
  readonly aggregateSha256: Sha256;
}

export function computeAllProjections(
  ledger: WorkLedger,
  mapping: Ns0To9Mapping,
  effectiveSha256: Sha256,
): AllProjections {
  const executionState = projectExecutionState(ledger);
  const auditEvents = projectAuditEvents(ledger);
  const identity = projectIdentity(ledger, effectiveSha256);
  const nsStructures = projectNsStructures(ledger, mapping);
  const shadowRerender = projectShadowRerender(ledger);
  const bootstrap = ledger.batches.map((batch) =>
    projectBootstrap(batch, ledger.assignments, ledger.receipts),
  );
  const verification = projectVerification(ledger);

  const aggregatePayload: Record<string, string> = {
    executionState: executionState.sha256,
    auditEvents: auditEvents.sha256,
    identity: identity.sha256,
    nsStructures: nsStructures.sha256,
    shadowRerender: shadowRerender.sha256,
    bootstrap: sha256Bytes(new TextEncoder().encode(canonicalJsonIdentity(bootstrap.map((b) => b.sha256)))),
    verification: verification.sha256,
  };
  const aggregateSha256 = sha256Bytes(new TextEncoder().encode(canonicalJsonIdentity(aggregatePayload)));

  return {
    executionState, auditEvents, identity, nsStructures, shadowRerender,
    bootstrap, verification, aggregateSha256,
  };
}
