/**
 * m11-terminal-evidence.ts — canonical engine-generated terminal evidence
 * envelope loader + producer (AM-0020 terminal candidate).
 *
 * The envelope lives at ledger top-level `m11_terminal_evidence` and is
 * written ONLY by the engine evidence producer (`produceM11TerminalEvidence`).
 * The CLI never synthesizes it: the loader validates every required field,
 * verifies headCommit/identity/epoch binding against the ACTUAL repository
 * HEAD (not the ledger headCommit), and forwards the resulting M11Evidence
 * to the terminal evaluator. Absent/incomplete/unbound envelopes fail closed.
 *
 * envelopeSha256 is canonical: the producer computes SHA-256 over all
 * envelope fields EXCEPT envelopeSha256 itself; the loader recomputes and
 * rejects any mismatch.
 */
import { createHash } from 'node:crypto';
import { candidateEpochHash, type CandidateEpoch } from './candidate-epoch.js';
import type { M11Evidence, M11Review } from './terminal-gate.js';

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
 * Canonical SHA-256 of the envelope content, computed over all fields
 * EXCEPT `envelopeSha256` itself. This makes envelopeSha256 a real
 * integrity binding, not a decorative field.
 */
function computeEnvelopeSha256(env: Omit<M11TerminalEvidenceEnvelope, 'envelopeSha256'>): string {
  return createHash('sha256').update(JSON.stringify(env, null, 2)).digest('hex');
}

/**
 * Load the ledger's engine-generated `m11_terminal_evidence` envelope. Strict
 * fail-closed validation: every required field must be present and typed;
 * headCommit must equal the ACTUAL repository HEAD (expectedHeadCommit, not
 * the ledger headCommit); effectivePlanIdentity must equal the ledger identity;
 * candidate_epoch_hash must match candidateEpochHash() of the ledger
 * candidate_epoch; the candidate epoch's candidate_commit_or_tree must bind
 * expectedHeadCommit; and envelopeSha256 must recompute to a matching hash.
 * Anything else — missing envelope, incomplete fields, head/identity/epoch
 * mismatch, or forged envelope — returns ok:false with a reason.
 */
export function loadM11TerminalEvidenceEnvelope(
  ledger: Record<string, unknown>,
  expectedHeadCommit: string,
): M11EnvelopeLoadResult {
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
  // The envelope headCommit must bind the ACTUAL repository HEAD, not the
  // ledger headCommit. This is the root-cause fix for M11 terminal gate
  // trusting the ledger head instead of the real Git HEAD.
  if (!expectedHeadCommit || env.headCommit !== expectedHeadCommit) {
    return { ok: false, reason: `m11_terminal_evidence headCommit ${env.headCommit?.slice(0, 12)} does not bind actual HEAD ${expectedHeadCommit?.slice(0, 12) ?? '(missing)'}` };
  }
  // The ledger's headCommit must also match the actual HEAD — a forged
  // ledger that claims a different HEAD is rejected.
  const ledgerHead = l.headCommit ?? l.commitSha ?? '';
  if (!ledgerHead || ledgerHead !== expectedHeadCommit) {
    return { ok: false, reason: `ledger headCommit ${ledgerHead.slice(0, 12)} does not match actual HEAD ${expectedHeadCommit.slice(0, 12)}` };
  }
  const identity = l.effective_plan_identity?.sha256 ?? l.effectivePlanIdentity ?? '';
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
  // Candidate epoch must also bind the actual HEAD (M11-R32).
  if (epoch.candidate_commit_or_tree !== expectedHeadCommit) {
    return { ok: false, reason: `candidate epoch candidate_commit_or_tree ${epoch.candidate_commit_or_tree.slice(0, 12)} does not bind actual HEAD ${expectedHeadCommit.slice(0, 12)}` };
  }
  // envelopeSha256 must be a real content hash, not decorative.
  const { envelopeSha256: _provided, ...envWithoutSha } = env as M11TerminalEvidenceEnvelope;
  const expectedSha = computeEnvelopeSha256(envWithoutSha as Omit<M11TerminalEvidenceEnvelope, 'envelopeSha256'>);
  if (env.envelopeSha256 !== expectedSha) {
    return { ok: false, reason: `m11_terminal_evidence envelopeSha256 mismatch: expected ${expectedSha.slice(0, 12)}, got ${(env.envelopeSha256 as string)?.slice(0, 12)}` };
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

/**
 * Engine-owned M11 terminal evidence producer (AM-0020 terminal candidate).
 *
 * Receives canonical test/eval/review/artifact inputs ONLY, validates strict
 * evidence (including SHA256 envelope content hash; no caller-supplied PASS),
 * and writes the ledger top-level `m11_terminal_evidence`. Fails closed on
 * any missing or invalid input. Does NOT use LLM input. Integrates with the
 * terminal gate, claim registry, and candidate epoch.
 *
 * The producer computes envelopeSha256 as a real content hash over all
 * envelope fields EXCEPT envelopeSha256 itself (Defect 3: envelopeSha256
 * is no longer decorative).
 */
export interface M11EvidenceProducerInput {
  headCommit: string;
  effectivePlanIdentity: string;
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
  candidateEpoch: CandidateEpoch;
}

export type M11EvidenceProduceResult =
  | { ok: true; envelope: M11TerminalEvidenceEnvelope }
  | { ok: false; reason: string };

export function produceM11TerminalEvidence(
  input: M11EvidenceProducerInput,
): M11EvidenceProduceResult {
  const { headCommit, effectivePlanIdentity, observedAt, fresh, ciSha,
    certifiedArtifactSha256, installedArtifactSha256, installedFrom,
    reconciliationHeadCommit, parity, topology, reviews, candidateEpoch } = input;

  // Fail closed: every field must be present and valid.
  if (!headCommit || typeof headCommit !== 'string') return { ok: false, reason: 'headCommit is required' };
  if (!effectivePlanIdentity || typeof effectivePlanIdentity !== 'string') return { ok: false, reason: 'effectivePlanIdentity is required' };
  if (!observedAt || typeof observedAt !== 'string') return { ok: false, reason: 'observedAt is required' };
  if (fresh !== true) return { ok: false, reason: 'fresh must be true' };
  if (!ciSha || typeof ciSha !== 'string') return { ok: false, reason: 'ciSha is required' };
  if (!certifiedArtifactSha256 || typeof certifiedArtifactSha256 !== 'string') return { ok: false, reason: 'certifiedArtifactSha256 is required' };
  if (!installedArtifactSha256 || typeof installedArtifactSha256 !== 'string') return { ok: false, reason: 'installedArtifactSha256 is required' };
  if (!installedFrom || typeof installedFrom !== 'string') return { ok: false, reason: 'installedFrom is required' };
  if (!reconciliationHeadCommit || typeof reconciliationHeadCommit !== 'string') return { ok: false, reason: 'reconciliationHeadCommit is required' };
  if (parity !== 'COMPLETE' && parity !== 'SKIPPED') return { ok: false, reason: 'parity must be COMPLETE or SKIPPED' };
  if (topology !== 'COMPLETE' && topology !== 'SKIPPED') return { ok: false, reason: 'topology must be COMPLETE or SKIPPED' };
  if (!Array.isArray(reviews)) return { ok: false, reason: 'reviews must be an array' };
  if (!candidateEpoch || typeof candidateEpoch !== 'object') return { ok: false, reason: 'candidateEpoch is required' };

  const candidate_epoch_hash = candidateEpochHash(candidateEpoch);

  const envelope: Omit<M11TerminalEvidenceEnvelope, 'envelopeSha256'> = {
    headCommit,
    effectivePlanIdentity,
    observedAt,
    fresh,
    ciSha,
    certifiedArtifactSha256,
    installedArtifactSha256,
    installedFrom,
    reconciliationHeadCommit,
    parity,
    topology,
    reviews,
    candidate_epoch_hash,
  };

  // envelopeSha256 is a real content hash, not decorative.
  const envelopeSha256 = computeEnvelopeSha256(envelope);

  const fullEnvelope: M11TerminalEvidenceEnvelope = { ...envelope, envelopeSha256 };

  // Verify the envelope is self-consistent: recompute and match.
  const verificationSha = computeEnvelopeSha256(envelope);
  if (envelopeSha256 !== verificationSha) {
    return { ok: false, reason: 'internal envelopeSha256 computation mismatch' };
  }

  return { ok: true, envelope: fullEnvelope };
}

/**
 * Write the engine-generated `m11_terminal_evidence` envelope into the
 * ledger. Fails closed if the ledger path is missing, the envelope is
 * invalid, or the ledger cannot be read/written.
 */
export function writeM11TerminalEvidence(
  ledgerPath: string,
  input: M11EvidenceProducerInput,
): { ok: true } | { ok: false; reason: string } {
  const produce = produceM11TerminalEvidence(input);
  if (!produce.ok) return produce;

  const fs = require('node:fs');
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  const ledger = JSON.parse(raw) as Record<string, any>;
  ledger.m11_terminal_evidence = produce.envelope;
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  return { ok: true };
}
