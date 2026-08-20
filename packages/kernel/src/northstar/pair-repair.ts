import { createHash } from 'node:crypto';
import type { WorkSpec } from './protocol.js';
import { computeClaimImpact, type ClaimImpact, type RepairClassification } from './claim-impact.js';

export interface FindingBindingFacts {
  ledger_ref: string;
  diff_ref: string;
  head_sha: string;
  evidence_refs: string[];
}

export interface RepairFinding {
  schema: 'harness/repair-finding';
  version: 1;
  finding_id: string;
  raw_text: string;
  plan_id: string;
  candidate_epoch: number;
  repository_state: { head_sha: string; worktree_dirty: boolean };
  observed_surface: string;
  classification: RepairClassification;
  binding: {
    ledger_ref: string;
    diff_ref: string;
    evidence_refs: string[];
    authority_facts_agree: boolean;
  };
  ambiguity?: { several_plans_candidate: boolean; needs_user: boolean };
  created_at: string;
}

export interface PairRepairInput {
  raw_finding: string;
  /** Candidate plans that could own the finding (from repo/ledger/diff facts). */
  candidate_plans: Array<{ plan_id: string; head_sha: string; worktree_dirty: boolean; ledger_ref: string; diff_ref: string; evidence_refs: string[] }>;
  /** Optional explicit plan binding from repository/ledger/diff facts. */
  selected_plan_id?: string;
  /** Current candidate epoch of the selected plan. */
  current_epoch?: number;
  spec?: WorkSpec;
  claim_to_requirements?: Record<string, string[]>;
  accepted_claims?: string[];
  observed_surface?: string;
}

export interface PairRepairOutcome {
  finding: RepairFinding;
  needs_user: boolean;
  reason?: string;
  impact?: ClaimImpact;
  packet?: RepairPacket;
}

export interface StaleEvidenceEntry {
  evidence_id: string;
  claim_id: string;
  epoch: number;
  status: 'stale';
}

export interface RepairPacket {
  schema: 'harness/repair-packet';
  version: 1;
  packet_id: string;
  plan_id: string;
  finding_id: string;
  candidate_epoch: number;
  reopened_claims: string[];
  unaffected_claims: string[];
  stale_evidence: StaleEvidenceEntry[];
  repair_steps: string[];
  proof_requirements: {
    fresh_proof_required: true;
    regression_scope: string;
    historical_pass_preserved: true;
  };
  created_at: string;
}

const CLASSIFIERS: Array<{ re: RegExp; classification: RepairClassification }> = [
  { re: /\b(changed|new|different) (owner )?(requirement|intent|scope|decision)\b|\bowner (\w+ )?(wants|requires|changed)\b|\bthay đổi yêu cầu\b/i, classification: 'changed_owner_intent' },
  { re: /\b(unrelated|not part of|out of scope|different plan|không liên quan)\b/i, classification: 'unrelated' },
  { re: /\b(evidence|proof|test|fixture|receipt|chứng cứ|bằng chứng)\b/i, classification: 'evidence_defect' },
  { re: /\b(provider|environment|docker|device|browser|mcp|timeout|network|elevation|không có màn hình|display)\b/i, classification: 'environment_provider_issue' },
  { re: /\b(missing|thiếu|chưa có|không có) (requirement|yêu cầu)\b/i, classification: 'missing_requirement' },
  { re: /\b(bug|defect|lỗi|sai|broken|wrong|fails?|crash|regression)\b/i, classification: 'implementation_defect' },
];

export function classifyFinding(raw: string): RepairClassification {
  for (const entry of CLASSIFIERS) {
    if (entry.re.test(raw)) return entry.classification;
  }
  return 'implementation_defect';
}

export function findingId(raw: string, planId: string, epoch: number): string {
  return `F-${createHash('sha256').update(`${planId}:${epoch}:${raw.trim()}`).digest('hex').slice(0, 12)}`;
}

export function packetId(findingId: string, planId: string, epoch: number): string {
  return `P-${createHash('sha256').update(`${planId}:${epoch}:${findingId}`).digest('hex').slice(0, 12)}`;
}

/**
 * Prompt-first pair repair (AM-0003 / REQ-022). The raw finding is preserved
 * verbatim, bound to the exact plan/repository state, classified, and only the
 * impacted claims are reopened in a new candidate epoch. Historical PASS
 * records are never rewritten; affected evidence is marked stale instead.
 * When several plans could own the finding, or owner intent changed, the
 * outcome is NEEDS_USER — prompt wording alone never chooses authority.
 */
export function openPairRepair(input: PairRepairInput): PairRepairOutcome {
  if (!input.raw_finding || input.raw_finding.trim().length === 0) {
    throw new Error('raw finding must be a non-empty string');
  }
  if (input.candidate_plans.length === 0) {
    throw new Error('pair repair requires at least one candidate plan from repository/ledger/diff facts');
  }

  const selected = input.candidate_plans.find((plan) => plan.plan_id === input.selected_plan_id) ?? input.candidate_plans[0];
  const severalPlans = input.candidate_plans.length > 1 && !input.selected_plan_id;
  const epoch = input.current_epoch ?? 0;
  const classification = classifyFinding(input.raw_finding);

  const finding: RepairFinding = {
    schema: 'harness/repair-finding',
    version: 1,
    finding_id: findingId(input.raw_finding, selected.plan_id, epoch),
    raw_text: input.raw_finding,
    plan_id: selected.plan_id,
    candidate_epoch: epoch,
    repository_state: { head_sha: selected.head_sha, worktree_dirty: selected.worktree_dirty },
    observed_surface: input.observed_surface ?? 'conversation-report',
    classification,
    binding: {
      ledger_ref: selected.ledger_ref,
      diff_ref: selected.diff_ref,
      evidence_refs: [...selected.evidence_refs],
      authority_facts_agree: true,
    },
    ...(severalPlans ? { ambiguity: { several_plans_candidate: true, needs_user: true } } : {}),
    created_at: new Date().toISOString(),
  };

  // Fail-closed ambiguity handling: prompt wording alone cannot choose plan
  // authority; several active plans require owner input.
  if (severalPlans) {
    return { finding, needs_user: true, reason: 'several active plans could own the finding; repository/ledger/diff facts must agree before authority is chosen' };
  }

  // Changed owner intent becomes an amendment, never a disguised defect.
  if (classification === 'changed_owner_intent') {
    return { finding, needs_user: true, reason: 'the finding changes approved owner intent; convert it into an amendment rather than a code defect' };
  }

  if (!input.spec || !input.claim_to_requirements) {
    return { finding, needs_user: true, reason: 'missing requirement/claim facts; cannot bound impact without repository and ledger truth' };
  }

  const impact = computeClaimImpact({
    spec: input.spec,
    claim_to_requirements: input.claim_to_requirements,
    finding_files: [],
    finding_providers: [],
    finding_evidence: [],
    accepted_claims: input.accepted_claims ?? [],
    classification,
  });

  if (classification === 'unrelated' || classification === 'environment_provider_issue') {
    return { finding, needs_user: false, impact, reason: classification === 'unrelated' ? 'classified unrelated; no implementation claims reopened' : 'environment/provider issue; exact missing provider evidence required before reopening' };
  }

  if (impact.affected_claims.length === 0) {
    return { finding, needs_user: false, impact, reason: 'no accepted claim is impacted by this finding; unaffected claims remain terminal' };
  }

  const packet: RepairPacket = {
    schema: 'harness/repair-packet',
    version: 1,
    packet_id: packetId(finding.finding_id, selected.plan_id, epoch),
    plan_id: selected.plan_id,
    finding_id: finding.finding_id,
    candidate_epoch: epoch + 1,
    reopened_claims: impact.affected_claims,
    unaffected_claims: impact.unaffected_claims,
    stale_evidence: impact.affected_evidence.map((evidence_id) => ({
      evidence_id,
      claim_id: (input.accepted_claims ?? []).find((claim) => impact.affected_claims.includes(claim)) ?? impact.affected_claims[0] ?? '',
      epoch,
      status: 'stale' as const,
    })),
    repair_steps: [
      `Re-run claim-matched proof for ${impact.affected_claims.join(', ')}`,
      `Re-run risk-triggered regression scope for ${impact.affected_requirements.join(', ') || 'affected requirements'}`,
      'Acceptance reduction and reconciliation before a new terminal result',
    ],
    proof_requirements: {
      fresh_proof_required: true,
      regression_scope: impact.affected_requirements.join(', ') || 'impacted claims only',
      historical_pass_preserved: true,
    },
    created_at: new Date().toISOString(),
  };

  return { finding, needs_user: false, impact, packet };
}
