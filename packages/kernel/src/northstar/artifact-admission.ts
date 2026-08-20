import { createHash, randomUUID } from 'node:crypto';

/**
 * REQ-018/REQ-019 — adaptive artifact lifecycle.
 *
 * Artifact admission runs before any persistence. Nothing is persisted by
 * default: persistence is admitted only when it is actually needed (restart/
 * resume, coordination, audit/replay, evidence, external filesystem input or
 * owner policy). Classes:
 *   EPHEMERAL    — small/one-shot task: no durable support files.
 *   CHECKPOINTED — long-running or restart/resume: minimal checkpoint.
 *   COORDINATED  — multi-agent/process: only coordination state.
 *   AUDITED      — high-risk: provenance/evidence retention; never purged.
 */

export type ArtifactAdmissionClass = 'EPHEMERAL' | 'CHECKPOINTED' | 'COORDINATED' | 'AUDITED';

export type PersistenceReason = 'restart_resume' | 'coordination' | 'audit_replay' | 'evidence' | 'external_input' | 'owner_policy';

export interface ArtifactAdmissionInput {
  class: ArtifactAdmissionClass;
  reasons: PersistenceReason[];
  owner?: string;
  purpose?: string;
  /** TTL after which a regenerable artifact becomes PURGE_ELIGIBLE. */
  ttl_ms?: number;
  /** Host-native compaction must never be assumed (REQ-019). */
  compaction_available?: boolean;
  regeneration_rule?: string;
}

export interface ArtifactAdmissionReceipt {
  schema: 'agent-rules/artifact-admission-receipt';
  version: 1;
  admission: 'ADMIT' | 'REFUSE';
  class: ArtifactAdmissionClass;
  persist: boolean;
  reasons: PersistenceReason[];
  expires_at?: string;
  regeneration_rule?: string;
  compact: 'native' | 'minimal_checkpoint' | 'unsupported';
  admission_id: string;
  receipt_sha256: string;
}

/** The only reasons that justify persistence for a class. */
export function persistenceReasonsForClass(admissionClass: ArtifactAdmissionClass): ReadonlySet<PersistenceReason> {
  switch (admissionClass) {
    case 'EPHEMERAL':
      return new Set(['audit_replay', 'evidence', 'owner_policy']);
    case 'CHECKPOINTED':
      return new Set(['restart_resume', 'evidence', 'owner_policy']);
    case 'COORDINATED':
      return new Set(['coordination', 'evidence', 'owner_policy']);
    case 'AUDITED':
      return new Set(['audit_replay', 'evidence', 'owner_policy', 'restart_resume', 'coordination', 'external_input']);
  }
}

/** Classify a task into the smallest sufficient artifact class. */
export function classifyArtifact(input: {
  risk: 'low' | 'medium' | 'high' | 'critical';
  duration_hint_ms?: number;
  multi_agent?: boolean;
  evidence_required?: boolean;
}): ArtifactAdmissionClass {
  if (input.risk === 'high' || input.risk === 'critical' || input.evidence_required) return 'AUDITED';
  if (input.multi_agent) return 'COORDINATED';
  if ((input.duration_hint_ms ?? 0) >= 4 * 60 * 60 * 1000) return 'CHECKPOINTED';
  return 'EPHEMERAL';
}

/**
 * Admit (or refuse) persistence for an artifact. REFUSE means the artifact
 * stays in-memory/ephemeral and is not written as a durable support file.
 */
export function admitArtifact(input: ArtifactAdmissionInput): ArtifactAdmissionReceipt {
  const allowed = persistenceReasonsForClass(input.class);
  const reasons = [...new Set(input.reasons)].filter((reason) => allowed.has(reason));
  const persist = reasons.length > 0;
  const compact: ArtifactAdmissionReceipt['compact'] = input.compaction_available === true ? 'native' : input.class === 'AUDITED' ? 'unsupported' : 'minimal_checkpoint';
  const admission: ArtifactAdmissionReceipt['admission'] = persist ? 'ADMIT' : 'REFUSE';
  const admissionId = `adm-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const expiresAt = input.ttl_ms !== undefined && input.regeneration_rule ? new Date(Date.now() + input.ttl_ms).toISOString() : undefined;
  const body = {
    schema: 'agent-rules/artifact-admission-receipt' as const,
    version: 1 as const,
    admission,
    class: input.class,
    persist,
    reasons,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(input.regeneration_rule ? { regeneration_rule: input.regeneration_rule } : {}),
    compact,
    admission_id: admissionId,
  };
  return { ...body, receipt_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/**
 * Recommended persistence mode for a task given its class. AUDITED always
 * persists (provenance/evidence); EPHEMERAL persists only with a strong reason.
 */
export function recommendedPersistence(admissionClass: ArtifactAdmissionClass, reasons: PersistenceReason[]): boolean {
  return admitArtifact({ class: admissionClass, reasons }).persist;
}

/** Guard for runtime writes: returns true only when persistence is admitted. */
export function isPersistenceAdmitted(classification: ArtifactAdmissionClass, reasons: PersistenceReason[]): boolean {
  return admitArtifact({ class: classification, reasons }).persist;
}

/** Default: no persistence reason; EPHEMERAL tasks stay ephemeral unless owner policy or evidence requires it. */
export function noPersistenceReason(): PersistenceReason[] {
  return [];
}
