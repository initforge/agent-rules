/**
 * m11-terminal-evidence.ts — canonical engine-generated terminal evidence
 * envelope loader (AM-0020 terminal candidate).
 *
 * The envelope lives at ledger top-level `m11_terminal_evidence` and is written
 * ONLY by the engine evidence producer. The CLI never synthesizes it: this
 * loader validates every required field, verifies headCommit/identity/epoch
 * binding, and forwards the resulting M11Evidence to the terminal evaluator.
 * Absent/incomplete/unbound envelopes fail closed.
 */
import { candidateEpochHash, type CandidateEpoch } from './candidate-epoch.js';
import type { M11Evidence, M11Review } from './terminal-gate.js';

/**
 * Canonical engine-generated terminal evidence envelope (AM-0020 terminal
 * candidate). Produced ONLY by the engine evidence producer; the CLI merely
 * reads it, verifies head/id/epoch basics, and forwards it to the evaluator.
 * No CLI flag or prose can synthesize a PASS.
 */
export interface M11TerminalEvidenceEnvelope {
  headCommit: string;
  effectivePlanIdentity: string;
  envelopeSha256: string;
  observedAt: string;
  fresh: boolean;
  ciSha: string;
  certifiedArtifactSha256: string;
  installedArtifactSha256: string;
  installedFrom: string;
  reconciliationHeadCommit: string;
  parity: 'COMPLETE' | 'SKIPPED';
  topology: 'COMPLETE' | 'SKIPPED';
  reviews: M11Review[];
  candidate_epoch_hash: string;
}

export type M11EnvelopeLoadResult =
  | { ok: true; evidence: M11Evidence }
  | { ok: false; reason: string };

const M11_ENVELOPE_REQUIRED_FIELDS: Array<keyof M11TerminalEvidenceEnvelope> = [
  'headCommit', 'effectivePlanIdentity', 'envelopeSha256', 'observedAt', 'fresh',
  'ciSha', 'certifiedArtifactSha256', 'installedArtifactSha256', 'installedFrom',
  'reconciliationHeadCommit', 'parity', 'topology', 'reviews', 'candidate_epoch_hash',
];

/**
 * Load the ledger's engine-generated `m11_terminal_evidence` envelope. Strict
 * fail-closed validation: every required field must be present and typed;
 * headCommit must equal the ledger head; effectivePlanIdentity must equal the
 * ledger identity; candidate_epoch_hash must match candidateEpochHash() of the
 * ledger candidate_epoch. Anything else — missing envelope, incomplete fields,
 * head/identity/epoch mismatch — returns ok:false with a reason.
 */
export function loadM11TerminalEvidenceEnvelope(ledger: Record<string, unknown>): M11EnvelopeLoadResult {
  const l = ledger as Record<string, any>;
  const env = l.m11_terminal_evidence as Partial<M11TerminalEvidenceEnvelope> | undefined;
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return { ok: false, reason: 'ledger has no engine-generated m11_terminal_evidence envelope' };
  }
  for (const field of M11_ENVELOPE_REQUIRED_FIELDS) {
    const v = env[field];
    if (v === undefined || v === null) {
      return { ok: false, reason: `m11_terminal_evidence missing required field '${field}'` };
    }
  }
  const head = l.headCommit ?? l.commitSha ?? '';
  const identity = l.effective_plan_identity?.sha256 ?? l.effectivePlanIdentity ?? '';
  if (!head || env.headCommit !== head) {
    return { ok: false, reason: `m11_terminal_evidence headCommit ${env.headCommit} does not bind ledger HEAD ${head}` };
  }
  if (!identity || env.effectivePlanIdentity !== identity) {
    return { ok: false, reason: 'm11_terminal_evidence effectivePlanIdentity does not bind ledger identity' };
  }
  const epoch = l.candidate_epoch as CandidateEpoch | undefined;
  if (!epoch || typeof epoch !== 'object' || Array.isArray(epoch)) {
    return { ok: false, reason: 'ledger has no candidate_epoch — evidence cannot bind an immutable candidate epoch' };
  }
  let epochHash: string;
  try {
    epochHash = candidateEpochHash(epoch);
  } catch {
    return { ok: false, reason: 'ledger candidate_epoch is invalid — candidateEpochHash failed' };
  }
  if (env.candidate_epoch_hash !== epochHash) {
    return { ok: false, reason: `m11_terminal_evidence candidate_epoch_hash does not bind candidateEpochHash(ledger.candidate_epoch) ${epochHash.slice(0, 12)}` };
  }
  const evidence: M11Evidence = {
    headCommit: env.headCommit as string,
    effectivePlanIdentity: env.effectivePlanIdentity as string,
    envelopeSha256: env.envelopeSha256 as string,
    observedAt: env.observedAt as string,
    fresh: env.fresh === true,
    ciSha: env.ciSha as string,
    certifiedArtifactSha256: env.certifiedArtifactSha256 as string,
    installedArtifactSha256: env.installedArtifactSha256 as string,
    installedFrom: env.installedFrom as string,
    reconciliationHeadCommit: env.reconciliationHeadCommit as string,
    parity: env.parity as M11Evidence['parity'],
    topology: env.topology as M11Evidence['topology'],
    reviews: (env.reviews as M11Review[]) ?? [],
    candidate_epoch_hash: epochHash,
  };
  return { ok: true, evidence };
}
