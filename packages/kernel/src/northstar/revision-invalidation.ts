import type { SpecImpact } from './compiler.js';
import type { EvidenceRecord, TaskPacket } from './protocol.js';

export type RevisionDisposition = 'UNCHANGED' | 'REVALIDATE' | 'INVALIDATED' | 'OBSOLETE';

export interface RevisionTaskImpact {
  task_id: string;
  disposition: RevisionDisposition;
  reasons: string[];
  stale_claims: string[];
}

export interface RevisionInvalidationPlan {
  previous_revision: number;
  next_revision: number;
  tasks: RevisionTaskImpact[];
  stale_evidence_ids: string[];
  reusable_evidence_ids: string[];
}

/**
 * Propagate a WorkSpec revision through TaskPackets and evidence. Evidence is
 * reusable only when neither its claim nor its owning requirement changed.
 */
export function planRevisionInvalidation(input: {
  impact: SpecImpact;
  packets: readonly TaskPacket[];
  evidence: readonly EvidenceRecord[];
}): RevisionInvalidationPlan {
  const changedReq = new Set([...input.impact.changed_requirements, ...input.impact.removed_requirements]);
  const changedClaims = new Set([...input.impact.changed_claims, ...input.impact.removed_claims]);
  const removedClaims = new Set(input.impact.removed_claims);
  const removedReq = new Set(input.impact.removed_requirements);

  const tasks = input.packets.map((packet): RevisionTaskImpact => {
    const claimIds = packet.acceptance.map((a) => a.claim_id);
    const staleClaims = claimIds.filter((id) => changedClaims.has(id)).sort();
    const touchedReq = packet.requirements.filter((id) => changedReq.has(id)).sort();
    const allClaimsRemoved = claimIds.length > 0 && claimIds.every((id) => removedClaims.has(id));
    const allReqRemoved = packet.requirements.length > 0 && packet.requirements.every((id) => removedReq.has(id));
    const reasons: string[] = [];
    let disposition: RevisionDisposition = 'UNCHANGED';
    if (allClaimsRemoved || allReqRemoved) {
      disposition = 'OBSOLETE';
      reasons.push('all task truth anchors were removed by the new spec revision');
    } else if (staleClaims.length > 0) {
      disposition = 'INVALIDATED';
      reasons.push(`claim semantics changed/removed: ${staleClaims.join(', ')}`);
    } else if (touchedReq.length > 0) {
      disposition = 'REVALIDATE';
      reasons.push(`owning requirement changed: ${touchedReq.join(', ')}`);
    }
    return { task_id: packet.task_id, disposition, reasons, stale_claims: staleClaims };
  });

  const invalidTaskIds = new Set(tasks.filter((t) => t.disposition !== 'UNCHANGED').map((t) => t.task_id));
  const staleEvidenceIds = input.evidence
    .filter((ev) => changedClaims.has(ev.claim_id) || invalidTaskIds.has(ev.task_id))
    .map((ev) => ev.evidence_id).sort();
  const stale = new Set(staleEvidenceIds);
  const reusableEvidenceIds = input.evidence.filter((ev) => !stale.has(ev.evidence_id)).map((ev) => ev.evidence_id).sort();
  return {
    previous_revision: input.impact.previous_revision,
    next_revision: input.impact.next_revision,
    tasks,
    stale_evidence_ids: staleEvidenceIds,
    reusable_evidence_ids: reusableEvidenceIds,
  };
}
