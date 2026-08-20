import type { WorkSpec } from './protocol.js';

export type RepairClassification =
  | 'implementation_defect'
  | 'missing_requirement'
  | 'changed_owner_intent'
  | 'evidence_defect'
  | 'environment_provider_issue'
  | 'unrelated';

export interface ClaimImpactInput {
  spec: WorkSpec;
  /** Full requirement/claim coverage before any selective reopen. */
  claim_to_requirements: Record<string, string[]>;
  /** Files the finding references (repo-relative). */
  finding_files: string[];
  /** Providers the finding references. */
  finding_providers: string[];
  /** Evidence ids the finding references. */
  finding_evidence: string[];
  /** All accepted claims in the current epoch (with fresh evidence). */
  accepted_claims: string[];
  classification: RepairClassification;
}

export interface ClaimImpact {
  affected_claims: string[];
  unaffected_claims: string[];
  affected_requirements: string[];
  affected_tasks: string[];
  affected_files: string[];
  affected_providers: string[];
  affected_evidence: string[];
  rationale: string[];
}

function isAmbiguousClassification(classification: RepairClassification): boolean {
  return classification === 'unrelated' || classification === 'environment_provider_issue' || classification === 'changed_owner_intent';
}

/**
 * Compute the claim impact of a classified finding. Only claims whose
 * requirement, file, provider, or evidence surface the finding touches are
 * reopened; everything else stays terminal (AM-0003 §3). Prompt wording alone
 * never selects impact scope — the classification and binding facts do.
 */
export function computeClaimImpact(input: ClaimImpactInput): ClaimImpact {
  const affected = new Set<string>();
  const affectedRequirements = new Set<string>();
  const affectedTasks = new Set<string>();
  const rationale: string[] = [];

  if (isAmbiguousClassification(input.classification)) {
    // changed owner intent is an amendment, not a defect; unrelated and
    // environment findings do not reopen implementation claims by themselves.
    return {
      affected_claims: [],
      unaffected_claims: [...input.accepted_claims],
      affected_requirements: [],
      affected_tasks: [],
      affected_files: input.finding_files,
      affected_providers: input.finding_providers,
      affected_evidence: input.finding_evidence,
      rationale: [
        `classification=${input.classification} does not reopen implementation claims by itself`,
        ...(input.classification === 'changed_owner_intent' ? ['changed owner intent becomes an amendment, not a disguised defect'] : []),
      ],
    };
  }

  for (const [claimId, requirementIds] of Object.entries(input.claim_to_requirements)) {
    const requirementHit = requirementIds.some((req) => input.spec.requirements.some((r) => r.id === req && r.claims.includes(claimId)));
    // A claim is impacted when any of its owned surface is referenced.
    const claimHit = requirementHit || input.finding_files.length > 0 || input.finding_evidence.length > 0;
    if (!claimHit) continue;
    affected.add(claimId);
    for (const req of requirementIds) affectedRequirements.add(req);
    if (input.accepted_claims.includes(claimId)) {
      rationale.push(`claim ${claimId} reopened in the new candidate epoch (finding references its surface)`);
    }
  }

  for (const claimId of input.accepted_claims) {
    if (affected.has(claimId)) continue;
    affectedTasks.add(`T-${claimId.replace('C-', '')}`);
  }

  return {
    affected_claims: [...affected].sort(),
    unaffected_claims: input.accepted_claims.filter((claim) => !affected.has(claim)).sort(),
    affected_requirements: [...affectedRequirements].sort(),
    affected_tasks: [...affectedTasks].sort(),
    affected_files: [...new Set(input.finding_files)].sort(),
    affected_providers: [...new Set(input.finding_providers)].sort(),
    affected_evidence: [...new Set(input.finding_evidence)].sort(),
    rationale,
  };
}
