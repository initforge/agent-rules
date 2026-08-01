/**
 * evidence-dag.ts — M11-R28 evidence provenance + freshness DAG (AM-0020 §4, §8).
 *
 * Every evidence record carries the full AM-0020 §4 envelope. Promotion is a
 * 7-state machine the engine enforces — reviewers/reports cannot skip a rung:
 *
 *   PRESENT → PARSEABLE → SEMANTICALLY_VALID → BINDS_FINAL_CANDIDATE
 *   → CAPABILITY_VALID → INDEPENDENTLY_REPRODUCED → TERMINAL_ELIGIBLE
 *
 * Engine-enforced example rules (§4):
 *   - a screenshot alone proves PRESENT, never visual parity (needs paired
 *     reference states at SEMANTICALLY_VALID and the vision capability);
 *   - Playwright Chromium without a real CDP session cannot prove RAW_CDP;
 *   - a test log produced before the final fix cannot bind the final candidate
 *     unless artifact digest equivalence is demonstrated (R32 bindEvidence).
 *
 * The freshness DAG edges `evidence_id → depends_on`: evidence that must
 * predate this record / the claims it feeds. `invalidateEvidence(base)` marks
 * only transitive dependents stale — siblings stay fresh (AM-0020 §3). The
 * final candidate always receives a full convergence run regardless.
 *
 * Claim-registry seam (kept out of claim-registry.ts): `deriveClaimEvidenceInputs`
 * maps the promotion ladder onto the existing `ClaimEvidenceInput` contract so
 * `evaluateClaimFormulas` maturity is derived from the DAG, not prose.
 */
import { createHash } from 'node:crypto';
import type { CandidateEpoch, EvidenceBinding } from './candidate-epoch.js';
import { bindEvidence, candidateEpochHash } from './candidate-epoch.js';
import type { ClaimDefinition, ClaimEvidenceInput } from './claim-registry.js';

export const EVIDENCE_ENVELOPE_SCHEMA = 'evidence/envelope/v1';

export const EVIDENCE_PROMOTION_STATES = [
  'PRESENT', 'PARSEABLE', 'SEMANTICALLY_VALID', 'BINDS_FINAL_CANDIDATE',
  'CAPABILITY_VALID', 'INDEPENDENTLY_REPRODUCED', 'TERMINAL_ELIGIBLE',
] as const;
export type EvidencePromotionState = (typeof EVIDENCE_PROMOTION_STATES)[number];

/** Evidence that is silently retried by its own producer is never independent. */
export const DEFAULT_FRESHNESS_TTL_MS = 24 * 60 * 60 * 1000;

export class EvidenceDagError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EvidenceDagError';
    this.code = code;
  }
}

// ── §4 evidence envelope ─────────────────────────────────────────────────────

/** Payload facts the promotion machine reads. Raw logs/artifacts stay canonical. */
export interface EvidencePayload {
  /** Kind of raw artifact: 'test-log' | 'screenshot' | 'playwright' | 'cdp-session' | … */
  kind: string;
  /** true when the raw payload can be parsed against its declared schema. */
  parseable: boolean;
  /** Result of the schema/meaning check (wrong reference state fails this). */
  semanticallyValid: boolean;
  /** Claim category the payload is offered as proof of (§4 example rules). */
  claimKind?: 'visual-parity' | 'raw-cdp' | 'fix' | string;
  /** raw-cdp claims: a real CDP session was used (Playwright-only fails). */
  cdpSessionUsed?: boolean;
  /** visual-parity claims: deterministic diff of a paired reference/target state. */
  pairedReferenceStates?: boolean;
}

/** Independent reproduction: different producer in a different session. */
export interface Reproduction {
  producer: string;
  session: string;
  finished_at: string;
}

export interface EvidenceRecord {
  schema: typeof EVIDENCE_ENVELOPE_SCHEMA;
  evidence_id: string;
  claim_ids: string[];
  /** Epoch the record was stamped with; null until bound to the final candidate. */
  candidate_epoch: CandidateEpoch | null;
  candidate_epoch_hash: string | null;
  /** Producing worker/session identity. A rerun by the same producer is not independent. */
  producer: string;
  session: string;
  tool_and_runner_hash: string;
  command: string;
  exit_code: number | null;
  started_at: string;
  finished_at: string;
  raw_artifact_hashes: string[];
  environment_and_fixture: Record<string, string>;
  coverage: Record<string, unknown>;
  limitations: string[];
  freshness: { ttl_ms?: number; observed_at?: string };
  /** DAG edges: evidence that must predate this record / the claims it feeds. */
  depends_on: string[];
  required_capabilities: string[];
  payload: EvidencePayload;
  /** Independent reproductions (produced outside the original producer session). */
  reproduction: Reproduction[];
}

export interface PromotionStepResult {
  state: EvidencePromotionState;
  satisfied: boolean;
  reason: string;
}

export interface PromotionResult {
  /** The rung promotion stopped at: the first unsatisfied precondition, or TERMINAL_ELIGIBLE. */
  state: EvidencePromotionState;
  terminalEligible: boolean;
  /** Blocking reason at the first unsatisfied rung, or the success message. */
  reason: string;
  steps: PromotionStepResult[];
}

export interface PromoteOptions {
  /** The final candidate epoch the evidence must bind to. */
  epoch: CandidateEpoch;
  /** Capabilities actually observed on the host that produced the evidence. */
  capabilities?: string[];
  /** Independent reproductions; defaults to `record.reproduction`. */
  reproduced?: Reproduction[];
  /** Millisecond timestamp for the freshness check; defaults to Date.now(). */
  now?: number;
  /** Freshness window; defaults to `record.freshness.ttl_ms` then DEFAULT_FRESHNESS_TTL_MS. */
  ttlMs?: number;
  /** Optional DAG; TERMINAL_ELIGIBLE refuses records stale in the DAG. */
  dag?: FreshnessDag;
}

// ── promotion ────────────────────────────────────────────────────────────────

function step(state: EvidencePromotionState, satisfied: boolean, reason: string): PromotionStepResult {
  return { state, satisfied, reason };
}

function recordTimeMs(record: EvidenceRecord): number | undefined {
  for (const k of ['finished_at', 'started_at'] as const) {
    const t = Date.parse(record[k]);
    if (!Number.isNaN(t)) return t;
  }
  const o = record.freshness.observed_at;
  if (o) { const t = Date.parse(o); if (!Number.isNaN(t)) return t; }
  return undefined;
}

export function assertFresh(record: EvidenceRecord, now: number, ttlMs?: number, dag?: FreshnessDag): { fresh: boolean; reason: string } {
  const ttl = ttlMs ?? record.freshness.ttl_ms ?? DEFAULT_FRESHNESS_TTL_MS;
  const at = recordTimeMs(record);
  if (at === undefined) return { fresh: false, reason: 'evidence carries no parseable timestamp — freshness cannot be proven' };
  if (at > now) return { fresh: false, reason: `evidence future-dated (${new Date(at).toISOString()}) relative to now` };
  if (now - at > ttl) return { fresh: false, reason: `evidence stale: ${now - at}ms elapsed exceeds ttl ${ttl}ms` };
  if (dag) {
    if (dag.stale.has(record.evidence_id)) return { fresh: false, reason: `evidence ${record.evidence_id} invalidated in freshness DAG` };
    const staleDep = firstStaleDependency(dag, record.evidence_id);
    if (staleDep !== null) {
      return { fresh: false, reason: `dependent on stale evidence ${staleDep} (invalidation only propagates to dependents)` };
    }
  }
  return { fresh: true, reason: `evidence fresh within ${ttl}ms window` };
}

/** Walk transitive dependencies; return the first stale base, or null. */
function firstStaleDependency(dag: FreshnessDag, id: string): string | null {
  const seen = new Set<string>();
  const visit = (cur: string): string | null => {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const deps = dag.dependsOn.get(cur) ?? [];
    for (const d of deps) {
      if (dag.stale.has(d)) return d;
      const deeper = visit(d);
      if (deeper !== null) return deeper;
    }
    return null;
  };
  return visit(id);
}

function bindToEpoch(record: EvidenceRecord, epoch: CandidateEpoch): EvidenceBinding {
  // Reuse R32 bindEvidence semantics: evidence before the epoch binds only when
  // artifact_digest/raw_artifact_hashes equivalence is demonstrated.
  const shaped = { finished_at: record.finished_at, raw_artifact_hashes: record.raw_artifact_hashes };
  return bindEvidence(shaped as unknown as Record<string, unknown>, epoch);
}

/**
 * Promote an evidence record up the AM-0020 §4 ladder. Each rung requires its
 * precondition; the result reports the first blocking reason.
 */
export function promoteEvidence(record: EvidenceRecord, opts: PromoteOptions): PromotionResult {
  const { epoch, capabilities = [], reproduced } = opts;
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs;
  const dag = opts.dag;
  const steps: PromotionStepResult[] = [];
  const repros = reproduced ?? record.reproduction;

  // 1. PRESENT — the record exists.
  if (typeof record.evidence_id !== 'string' || record.evidence_id.length === 0) {
    return { state: 'PRESENT', terminalEligible: false, reason: 'no evidence_id — evidence not present', steps: [step('PRESENT', false, 'no evidence_id — evidence not present')] };
  }
  steps.push(step('PRESENT', true, 'evidence record present'));

  // 2. PARSEABLE — the raw payload parses against its declared schema.
  if (record.payload.parseable !== true) {
    steps.push(step('PARSEABLE', false, 'payload not parseable'));
    return { state: 'PARSEABLE', terminalEligible: false, reason: 'payload not parseable', steps };
  }
  steps.push(step('PARSEABLE', true, `payload (${record.payload.kind}) parses`));

  // 3. SEMANTICALLY_VALID — schema/meaning check plus the §4 example rules.
  const semanticBlock = semanticBlockReason(record);
  if (semanticBlock) {
    steps.push(step('SEMANTICALLY_VALID', false, semanticBlock));
    return { state: 'SEMANTICALLY_VALID', terminalEligible: false, reason: semanticBlock, steps };
  }
  steps.push(step('SEMANTICALLY_VALID', true, 'semantically valid (schema + meaning check)'));

  // 4. BINDS_FINAL_CANDIDATE — record within the epoch or digest-equivalent.
  if (record.candidate_epoch !== null && candidateEpochHash(record.candidate_epoch) !== candidateEpochHash(epoch)) {
    const reason = `record bound to a different candidate epoch than the final candidate`;
    steps.push(step('BINDS_FINAL_CANDIDATE', false, reason));
    return { state: 'BINDS_FINAL_CANDIDATE', terminalEligible: false, reason, steps };
  }
  const binding = bindToEpoch(record, epoch);
  if (!binding.bound) {
    steps.push(step('BINDS_FINAL_CANDIDATE', false, binding.reason));
    return { state: 'BINDS_FINAL_CANDIDATE', terminalEligible: false, reason: binding.reason, steps };
  }
  steps.push(step('BINDS_FINAL_CANDIDATE', true, binding.reason));

  // 5. CAPABILITY_VALID — every required capability observed (no silent
  //    substitution); visual parity additionally needs vision, raw-CDP needs cdp.
  const caps = new Set(capabilities);
  const missing = record.required_capabilities.filter((c) => !caps.has(c));
  if (record.payload.claimKind === 'visual-parity' && !caps.has('vision')) missing.push('vision');
  if (record.payload.claimKind === 'raw-cdp' && !caps.has('cdp')) missing.push('cdp');
  if (missing.length > 0) {
    const reason = `capability-invalid: missing ${[...new Set(missing)].sort().join(', ')}`;
    steps.push(step('CAPABILITY_VALID', false, reason));
    return { state: 'CAPABILITY_VALID', terminalEligible: false, reason, steps };
  }
  steps.push(step('CAPABILITY_VALID', true, 'all required capabilities observed'));

  // 6. INDEPENDENTLY_REPRODUCED — a different producer in a different session.
  const independent = repros.some((r) => r.producer !== record.producer && r.session !== record.session);
  if (!independent) {
    const reason = 'not independently reproduced: rerun by the same producer/session does not prove reproduction';
    steps.push(step('INDEPENDENTLY_REPRODUCED', false, reason));
    return { state: 'INDEPENDENTLY_REPRODUCED', terminalEligible: false, reason, steps };
  }
  steps.push(step('INDEPENDENTLY_REPRODUCED', true, `independently reproduced (${repros.length} reproduction(s) outside original session)`));

  // 7. TERMINAL_ELIGIBLE — fresh within TTL and not stale in the DAG.
  const fresh = assertFresh(record, now, ttlMs, dag);
  if (!fresh.fresh) {
    steps.push(step('TERMINAL_ELIGIBLE', false, fresh.reason));
    return { state: 'TERMINAL_ELIGIBLE', terminalEligible: false, reason: fresh.reason, steps };
  }
  steps.push(step('TERMINAL_ELIGIBLE', true, 'evidence fresh and not invalidated by the freshness DAG'));
  return { state: 'TERMINAL_ELIGIBLE', terminalEligible: true, reason: 'evidence terminal-eligible', steps };
}

/** §4 example rules: screenshot≠parity, Playwright≠CDP, semantic validity. */
function semanticBlockReason(record: EvidenceRecord): string | null {
  const p = record.payload;
  if (p.semanticallyValid !== true) return 'semantically invalid: no passing schema/meaning check';
  if (p.claimKind === 'visual-parity') {
    if (p.kind === 'screenshot' && p.pairedReferenceStates !== true) {
      return 'screenshot-only evidence cannot prove visual parity (needs paired reference states and a vision-capable review)';
    }
  }
  if (p.claimKind === 'raw-cdp') {
    if (p.kind === 'playwright' && p.cdpSessionUsed !== true) {
      return 'Playwright-only evidence cannot prove RAW_CDP (needs a real CDP session)';
    }
  }
  return null;
}

// ── freshness DAG ────────────────────────────────────────────────────────────

export interface FreshnessDag {
  records: Map<string, EvidenceRecord>;
  /** evidence_id → ids it depends on. */
  dependsOn: Map<string, string[]>;
  /** evidence_id → ids that depend on it (transitive targets of invalidation). */
  dependents: Map<string, string[]>;
  /** evidence invalidated (its dependents must not reach TERMINAL_ELIGIBLE). */
  stale: Set<string>;
}

/** Build the DAG from `depends_on` edges; refuse unknown/self/cyclic edges. */
export function buildFreshnessDag(records: EvidenceRecord[]): FreshnessDag {
  const map = new Map<string, EvidenceRecord>();
  for (const r of records) {
    if (map.has(r.evidence_id)) throw new EvidenceDagError('DUP_EVIDENCE_ID', `duplicate evidence_id ${r.evidence_id}`);
    map.set(r.evidence_id, r);
  }
  const dependsOn = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const r of records) {
    const deps = r.depends_on;
    if (deps.includes(r.evidence_id)) throw new EvidenceDagError('SELF_DEPENDENCY', `evidence ${r.evidence_id} depends on itself`);
    for (const d of deps) {
      if (!map.has(d)) throw new EvidenceDagError('UNKNOWN_DEPENDENCY', `evidence ${r.evidence_id} depends on unknown ${d}`);
    }
    dependsOn.set(r.evidence_id, [...deps]);
    for (const d of deps) dependents.set(d, [...(dependents.get(d) ?? []), r.evidence_id]);
  }
  // cycle check (deterministic DFS over sorted ids)
  const sorted = [...map.keys()].sort();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new EvidenceDagError('CYCLE', `freshness DAG cycle at ${id}`);
    visiting.add(id);
    for (const d of (dependsOn.get(id) ?? []).sort()) visit(d);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of sorted) visit(id);
  return { records: map, dependsOn, dependents, stale: new Set() };
}

/**
 * Mark an evidence id and every transitive dependent stale. Siblings (evidence
 * that neither depends on the base nor feeds it) stay fresh (AM-0020 §3).
 * Returns the ids newly marked stale in deterministic order.
 */
export function invalidateEvidence(dag: FreshnessDag, evidenceId: string): string[] {
  const out: string[] = [];
  const queue = [evidenceId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (dag.stale.has(id)) continue;
    dag.stale.add(id);
    out.push(id);
    queue.push(...(dag.dependents.get(id) ?? []));
  }
  return out;
}

// ── deterministic envelope serialization ─────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Canonical JSON: object keys sorted recursively, so identical envelopes serialize identically. */
export function serializeEvidenceRecord(record: EvidenceRecord): string {
  return JSON.stringify(record, (_k, v) => {
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    return v;
  });
}

export function evidenceEnvelopeHash(record: EvidenceRecord): string {
  return createHash('sha256').update(serializeEvidenceRecord(record)).digest('hex');
}

// ── claim-registry seam (AM-0020 §2/§4) ──────────────────────────────────────

export interface ClaimDagOptions {
  epoch: CandidateEpoch;
  capabilities?: string[];
  now?: number;
  ttlMs?: number;
  dag?: FreshnessDag;
}

const STATE_INDEX = Object.fromEntries(EVIDENCE_PROMOTION_STATES.map((s, i) => [s, i])) as Record<EvidencePromotionState, number>;

function toClaimEvidenceInput(result: PromotionResult, capabilities: string[] | undefined, stale: boolean): ClaimEvidenceInput {
  const i = STATE_INDEX[result.state];
  const base: ClaimEvidenceInput = { capabilities };
  if (i >= STATE_INDEX.PARSEABLE) base.present = true;
  if (i >= STATE_INDEX.SEMANTICALLY_VALID) base.valid = true;
  if (i >= STATE_INDEX.BINDS_FINAL_CANDIDATE) base.fresh = true;
  if (stale) base.stale = true;
  if (i >= STATE_INDEX.CAPABILITY_VALID && result.state === 'CAPABILITY_VALID') base.capability_invalid = true;
  if (i >= STATE_INDEX.INDEPENDENTLY_REPRODUCED) base.independently_reproduced = true;
  if (i >= STATE_INDEX.TERMINAL_ELIGIBLE) base.terminal_eligible = true;
  return base;
}

/**
 * Derive the `ClaimEvidenceInput` map for `evaluateClaimFormulas` from the
 * evidence DAG: each claim's maturity is the best promotion across its records.
 * This is the API seam — claim-registry itself is not rewritten.
 */
export function deriveClaimEvidenceInputs(
  claims: ClaimDefinition[],
  records: EvidenceRecord[],
  opts: ClaimDagOptions,
): Record<string, ClaimEvidenceInput> {
  const byClaim = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    for (const cid of r.claim_ids) {
      byClaim.set(cid, [...(byClaim.get(cid) ?? []), r]);
    }
  }
  const out: Record<string, ClaimEvidenceInput> = {};
  for (const claim of claims) {
    const recs = byClaim.get(claim.claim_id) ?? [];
    if (recs.length === 0) { out[claim.claim_id] = { capabilities: opts.capabilities }; continue; }
    let best: { result: PromotionResult; record: EvidenceRecord } | null = null;
    for (const r of recs) {
      const result = promoteEvidence(r, { ...opts, capabilities: opts.capabilities });
      if (best === null || STATE_INDEX[result.state] > STATE_INDEX[best.result.state]) best = { result, record: r };
    }
    const { result, record } = best as { result: PromotionResult; record: EvidenceRecord };
    // A record beyond its TTL or invalidated in the DAG is stale for the claim.
    const fresh = assertFresh(record, opts.now ?? Date.now(), opts.ttlMs, opts.dag);
    out[claim.claim_id] = toClaimEvidenceInput(result, opts.capabilities, !fresh.fresh);
  }
  return out;
}
