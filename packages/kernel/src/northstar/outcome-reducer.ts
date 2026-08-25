/**
 * outcome-reducer.ts — the SINGLE outcome reducer (closure phase
 * global-agent-behavior-native-live-closure-v1, REQ-112).
 *
 * Only this module derives claim outcomes and final run outcomes from
 * verifier evidence. Workers, the orchestrator, closure services and receipt
 * generators never author PASS: they call into this reducer.
 *
 * Truth path: EvidenceLedger → AcceptanceAudit → OutcomeReducer → OutcomeReceipt
 *
 * claim_outcome vocabulary: PASS | PARTIAL | BLOCKED | UNSUPPORTED |
 * PRE-EXISTING | NEEDS_USER (REQ-105).
 */
import type { AcceptanceResult } from './evidence-ledger.js';
import type { AcceptanceAudit } from './acceptance-audit.js';
import type { SemanticAuditResult } from './semantic-auditor.js';
import type { ClaimOutcome } from './behavior-runtime.js';

export interface OutcomeReducerInput {
  acceptance: AcceptanceResult;
  audit: AcceptanceAudit;
  convergence?: { converged: boolean };
  semanticReview?: SemanticAuditResult | null;
  /** Hard fail-closed block reasons (e.g. semantic-state violations). */
  hardBlockReasons?: readonly string[];
  run_id: string;
  spec_id: string;
  spec_revision: number;
  candidate_epoch: number;
  platform: string;
}

export interface ReducedOutcome {
  claim_outcome: ClaimOutcome;
  /** Machine reason for the outcome; never prose PASS. */
  reasons: string[];
  /** The single acceptance channel that produced the outcome. */
  derived_from: 'acceptance-audit';
  run_id: string;
  spec_id: string;
  spec_revision: number;
  candidate_epoch: number;
  platform: string;
}

const OUTCOMES: readonly ClaimOutcome[] = ['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER'];

/** Reject unknown/ambiguous outcome labels at the reducer boundary. */
export function assertClaimOutcome(value: string): ClaimOutcome {
  if (!(OUTCOMES as readonly string[]).includes(value)) {
    throw new Error(`OutcomeReducer: ${value} is not a canonical claim_outcome (${OUTCOMES.join('|')})`);
  }
  return value as ClaimOutcome;
}

/**
 * Derive the final claim outcome. PASS requires acceptance PASS, an accepted
 * audit, and converged convergence. Everything else degrades FAILED evidence
 * to PARTIAL/BLOCKED per the vocabulary; semantic review can only block,
 * never upgrade.
 */
export function reduceOutcome(input: OutcomeReducerInput): ReducedOutcome {
  const reasons: string[] = [...input.acceptance.reasons];
  if (!input.audit.accepted) reasons.push(`acceptance audit rejected: ${input.audit.findings.join('; ')}`);
  if (input.convergence && !input.convergence.converged) reasons.push('convergence audit not converged');
  if (input.semanticReview && input.semanticReview.verdict === 'BLOCKED') {
    reasons.push(`blocked by independent semantic review: ${input.semanticReview.findings.map((f) => `${f.code}: ${f.message}`).join('; ')}`);
  }
  if (input.hardBlockReasons?.length) reasons.push(...input.hardBlockReasons.map((r) => `hard block: ${r}`));
  const blockedByReview = input.semanticReview?.verdict === 'BLOCKED';
  const hardBlocked = (input.hardBlockReasons?.length ?? 0) > 0;
  const converged = input.convergence?.converged !== false;
  const accepted = input.acceptance.outcome === 'PASS' && input.audit.accepted && converged && !blockedByReview && !hardBlocked;

  let claim_outcome: ClaimOutcome;
  if (accepted) {
    claim_outcome = 'PASS';
  } else if (hardBlocked || input.acceptance.outcome === 'BLOCKED' || (input.acceptance.unresolved_claims.length > 0 && input.acceptance.failed_claims.length === 0)) {
    // Hard blocks and acceptance BLOCKED stay BLOCKED. A blocked independent
    // semantic review only downgrades deterministic PASS to PARTIAL (the audit
    // rejection is recorded in acceptance-audit), matching pre-closure truth.
    claim_outcome = 'BLOCKED';
  } else if (blockedByReview && input.acceptance.outcome === 'PASS') {
    claim_outcome = 'PARTIAL';
  } else if (input.acceptance.outcome === 'FAILED' || input.acceptance.failed_claims.length > 0) {
    // Evidence-based partial: failed claims without scope/policy hard failure
    // degrade to PARTIAL; hard scope/policy violations are FAILED → BLOCKED.
    claim_outcome = input.acceptance.reasons.some((r) => r.includes('forbidden-scope') || r.startsWith('policy:')) ? 'BLOCKED' : 'PARTIAL';
  } else {
    claim_outcome = 'PARTIAL';
  }
  reasons.push(`acceptance outcome was ${input.acceptance.outcome} with audit accepted=${input.audit.accepted} converged=${converged}`);
  return {
    claim_outcome,
    reasons,
    derived_from: 'acceptance-audit',
    run_id: input.run_id,
    spec_id: input.spec_id,
    spec_revision: input.spec_revision,
    candidate_epoch: input.candidate_epoch,
    platform: input.platform,
  };
}

/** Map a reduced claim outcome to the existing AcceptanceResult.outcome shape. */
export function outcomeToAcceptanceShape(claim_outcome: ClaimOutcome, acceptance?: AcceptanceResult): AcceptanceResult['outcome'] {
  switch (claim_outcome) {
    case 'PASS': return 'PASS';
    case 'BLOCKED':
    case 'PARTIAL':
      // Hard evidence failure (scope/policy violation, bypass) keeps FAILED in
      // the run-level shape; the six-state claim_outcome uses BLOCKED/PARTIAL.
      return acceptance?.outcome === 'FAILED' ? 'FAILED' : claim_outcome === 'BLOCKED' ? 'BLOCKED' : 'PARTIAL';
    case 'PRE-EXISTING': case 'UNSUPPORTED': case 'NEEDS_USER': return 'PARTIAL';
  }
}