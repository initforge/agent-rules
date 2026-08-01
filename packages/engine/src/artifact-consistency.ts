/**
 * artifact-consistency.ts — M11-R33 cross-artifact consistency validation (AM-0020 §8).
 *
 * The engine validator reconciles every artifact family that must agree on the
 * same truth: raw runner test totals vs the report summary, ledger status vs
 * report status, evidence timestamps vs the candidate epoch, source-tree vs
 * installed-artifact vs container digests, claimed coverage vs what was
 * actually tested, reviewer capabilities vs the verdicts they issue, and the
 * fail-closed records (PARTIAL/HIGH_DIFF/SKIPPED/UNVERIFIED/advisory) that a
 * single aggregate PASS must never hide.
 *
 * Every contradiction produces a `ConsistencyViolation` scoped to the claims it
 * affects; no finding is ever silenced by report prose. Checks are fail-closed:
 * a report that asserts totals must reconcile against raw runner output, and a
 * verification family that is present but inconsistent always fails. Absent
 * optional fields skip their check; a present field that cannot be verified is
 * a violation (TOTALS_UNRECONCILABLE).
 *
 * Evidence timing semantics follow R28/R32: evidence produced before the final
 * candidate epoch cannot bind the candidate (AM-0020 §3), so `produced_at <
 * candidate_epoch` is the violation — matching the parenthetical in AM-0020 §8
 * ("evidence older than the final epoch") and `bindEvidence`.
 */

export type WarningSeverity = 'warning' | 'error';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingDisposition = 'open' | 'accepted' | 'fixed' | 'wonfix';
export type AggregateLevel = 'PARTIAL' | 'HIGH_DIFF' | 'SKIPPED' | 'UNVERIFIED' | 'ADVISORY';

export interface ConsistencyViolation {
  /** Artifact/record the contradiction was found on (file, evidence id, digest pair, claim, …). */
  artifact: string;
  /** Machine-readable violation code, e.g. 'TOTALS_MISMATCH'. */
  kind: string;
  /** Human-readable contradiction; never prose that redefines the finding. */
  detail: string;
  /** Claim ids this violation blocks; empty when no specific claim is attributable. */
  affects_claim_ids: string[];
}

export interface ConsistencyCheckResult {
  passed: boolean;
  violations: ConsistencyViolation[];
  checked_at: string;
}

export interface TestTotalsSource {
  source: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface ReportTotals {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface WarningRecord {
  file: string;
  severity: WarningSeverity;
  message: string;
  /** True when the report claims the warning was removed. */
  claimed_removed?: boolean;
}

export interface OpenFinding {
  id: string;
  severity: FindingSeverity;
  disposition: FindingDisposition;
}

export interface EvidenceTiming {
  evidence_id: string;
  produced_at: number;
  candidate_epoch: number;
  claim_id: string;
}

export interface CoverageEntry {
  route?: string;
  role?: string;
  viewport?: string;
  state?: string;
  claimed: boolean;
  tested: boolean;
}

export interface ReviewerCapabilityRecord {
  reviewer_id: string;
  capability: string;
  verdict: string;
}

export interface AggregateRecord {
  record: string;
  level: AggregateLevel;
  hidden_by_aggregate_pass: boolean;
}

export interface CdpClaimRecord {
  claim_id: string;
  uses_raw_cdp: boolean;
  has_cdp_session: boolean;
}

export interface ParityPair {
  pair_id: string;
  ref_state: string;
  tgt_state: string;
  ref_env: string;
  tgt_env: string;
}

export interface ConsistencyInput {
  /** Raw runner test totals per source (M11-R28 evidence runner output). */
  testTotals?: TestTotalsSource[];
  /** Totals asserted by the summary/final report. */
  reportTotals?: ReportTotals;
  /** Warnings/errors present in the raw output. */
  warnings?: WarningRecord[];
  ledgerStatus?: string;
  reportStatus?: string;
  openFindings?: OpenFinding[];
  evidence?: EvidenceTiming[];
  /** Final candidate epoch created_at (ms); evidence must not predate it. */
  candidateEpoch?: number;
  sourceTreeDigest?: string;
  installedArtifactDigest?: string;
  containerDigest?: string;
  coverage?: CoverageEntry[];
  reviewerCapabilities?: ReviewerCapabilityRecord[];
  aggregateRecords?: AggregateRecord[];
  cdpClaims?: CdpClaimRecord[];
  parityPairs?: ParityPair[];
}

// ── §8 checks (one family per check, fail-closed) ────────────────────────────

/** §8.1 — raw runner totals must reconcile with the summary/report. */
function checkTestTotals(input: ConsistencyInput): ConsistencyViolation[] {
  const { testTotals, reportTotals } = input;
  if (reportTotals === undefined) return [];
  if (testTotals === undefined || testTotals.length === 0) {
    return [{
      artifact: 'test-totals',
      kind: 'TOTALS_UNRECONCILABLE',
      detail: 'report asserts test totals but no raw runner output is available — totals cannot be reconciled (fail closed)',
      affects_claim_ids: [],
    }];
  }
  const raw = testTotals.reduce(
    (acc, t) => ({ total: acc.total + t.total, passed: acc.passed + t.passed, failed: acc.failed + t.failed, skipped: acc.skipped + t.skipped }),
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );
  const fields: Array<[keyof ReportTotals, number, number]> = [
    ['total', raw.total, reportTotals.total],
    ['passed', raw.passed, reportTotals.passed],
    ['failed', raw.failed, reportTotals.failed],
    ['skipped', raw.skipped, reportTotals.skipped],
  ];
  const out: ConsistencyViolation[] = [];
  for (const [field, rawValue, reported] of fields) {
    if (rawValue !== reported) {
      out.push({
        artifact: 'test-totals',
        kind: 'TOTALS_MISMATCH',
        detail: `raw runner ${field} ${rawValue} (sum over ${testTotals.length} source(s)) ≠ report ${field} ${reported}`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

/** §8.2 — a warning claimed removed but still present is a contradiction. */
function checkWarnings(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const w of input.warnings ?? []) {
    if (w.claimed_removed === true) {
      out.push({
        artifact: w.file,
        kind: 'CLAIMED_REMOVED_WARNING_PRESENT',
        detail: `warning "${w.message}" (${w.severity}) is claimed removed but still present in the raw output`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

/** §8.3 — ledger status and report status must agree. */
function checkLedgerReportStatus(input: ConsistencyInput): ConsistencyViolation[] {
  const { ledgerStatus, reportStatus } = input;
  if (ledgerStatus === undefined || reportStatus === undefined) return [];
  if (ledgerStatus !== reportStatus) {
    return [{
      artifact: 'status',
      kind: 'STATUS_MISMATCH',
      detail: `ledger status ${ledgerStatus} ≠ report status ${reportStatus}`,
      affects_claim_ids: [],
    }];
  }
  return [];
}

/** §8.4 — critical/high findings still open block; accepted/wonfix do not. */
function checkOpenFindings(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const f of input.openFindings ?? []) {
    if (f.disposition === 'open' && (f.severity === 'critical' || f.severity === 'high')) {
      out.push({
        artifact: `finding:${f.id}`,
        kind: 'OPEN_BLOCKING_FINDING',
        detail: `finding ${f.id} is ${f.severity} and still ${f.disposition} — an open blocking finding cannot be silenced by report prose`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

/** §8.5 — evidence older than the final candidate epoch cannot bind it (R28/R32). */
function checkEvidenceEpoch(input: ConsistencyInput): ConsistencyViolation[] {
  const { evidence, candidateEpoch } = input;
  if (candidateEpoch === undefined) return [];
  const out: ConsistencyViolation[] = [];
  for (const e of evidence ?? []) {
    if (e.produced_at < candidateEpoch) {
      out.push({
        artifact: `evidence:${e.evidence_id}`,
        kind: 'EVIDENCE_PREDATES_EPOCH',
        detail: `evidence ${e.evidence_id} produced at ${new Date(e.produced_at).toISOString()} predates final candidate epoch ${new Date(candidateEpoch).toISOString()} — it cannot bind the candidate without digest equivalence`,
        affects_claim_ids: [e.claim_id],
      });
    }
  }
  return out;
}

/** §8.6 — source-tree / installed-artifact / container digests must agree. */
function checkDigests(input: ConsistencyInput): ConsistencyViolation[] {
  // Empty digest means "honest empty" (no built dist / no declared container),
  // so it is treated as not provided rather than as a mismatch value.
  const entries: Array<[string, string | undefined]> = [
    ['source-tree', input.sourceTreeDigest],
    ['installed-artifact', input.installedArtifactDigest],
    ['container-image', input.containerDigest],
  ];
  const provided = entries.filter(([, v]) => v !== undefined && v.length > 0);
  const out: ConsistencyViolation[] = [];
  for (let i = 0; i < provided.length; i++) {
    for (let j = i + 1; j < provided.length; j++) {
      const [nameA, valA] = provided[i] as [string, string];
      const [nameB, valB] = provided[j] as [string, string];
      if (valA !== valB) {
        out.push({
          artifact: `digest:${nameA}-vs-${nameB}`,
          kind: 'DIGEST_MISMATCH',
          detail: `${nameA} digest ${valA} ≠ ${nameB} digest ${valB}`,
          affects_claim_ids: [],
        });
      }
    }
  }
  return out;
}

/** §8.7 — claimed coverage that was never actually tested is a contradiction. */
function checkCoverage(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const c of input.coverage ?? []) {
    if (c.claimed === true && c.tested !== true) {
      const target = [
        c.route && `route:${c.route}`,
        c.role && `role:${c.role}`,
        c.viewport && `viewport:${c.viewport}`,
        c.state && `state:${c.state}`,
      ].filter(Boolean).join(' ');
      out.push({
        artifact: `coverage:${target || 'unnamed-target'}`,
        kind: 'COVERAGE_CLAIMED_NOT_TESTED',
        detail: `coverage claimed for ${target || 'an unnamed target'} but no test actually ran it`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

/** Verdict vocabulary ⇒ required capability (AM-0020 §4/§6: visual→vision, raw-CDP→cdp). */
function requiredCapabilitiesForVerdict(verdict: string): string[] {
  const v = verdict.toUpperCase();
  const out = new Set<string>();
  if (/VISUAL|PARITY|VISION/.test(v)) out.add('vision');
  if (/CDP/.test(v)) out.add('cdp');
  return [...out];
}

/** §8.8 — a reviewer cannot issue a verdict requiring a capability it lacks. */
function checkReviewerCapabilities(input: ConsistencyInput): ConsistencyViolation[] {
  const capsByReviewer = new Map<string, Set<string>>();
  const verdictsByReviewer = new Map<string, Set<string>>();
  for (const r of input.reviewerCapabilities ?? []) {
    if (!capsByReviewer.has(r.reviewer_id)) capsByReviewer.set(r.reviewer_id, new Set());
    capsByReviewer.get(r.reviewer_id)!.add(r.capability);
    if (!verdictsByReviewer.has(r.reviewer_id)) verdictsByReviewer.set(r.reviewer_id, new Set());
    verdictsByReviewer.get(r.reviewer_id)!.add(r.verdict);
  }
  const out: ConsistencyViolation[] = [];
  for (const [reviewer, verdicts] of verdictsByReviewer) {
    const caps = capsByReviewer.get(reviewer) ?? new Set<string>();
    for (const verdict of verdicts) {
      for (const required of requiredCapabilitiesForVerdict(verdict)) {
        if (!caps.has(required)) {
          out.push({
            artifact: `reviewer:${reviewer}`,
            kind: 'CAPABILITY_MISSING_FOR_VERDICT',
            detail: `reviewer ${reviewer} issued verdict ${verdict} requiring capability ${required} but does not have it — capability substitution is never silent`,
            affects_claim_ids: [],
          });
        }
      }
    }
  }
  return out;
}

/** §8.9 — PARTIAL/HIGH_DIFF/SKIPPED/UNVERIFIED/advisory records cannot hide under an aggregate PASS. */
function checkAggregateHiding(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const a of input.aggregateRecords ?? []) {
    if (a.hidden_by_aggregate_pass === true) {
      out.push({
        artifact: `record:${a.record}`,
        kind: 'AGGREGATE_PASS_HIDES_RECORD',
        detail: `${a.level} record ${a.record} is hidden by an aggregate PASS — fail-closed records must stay visible`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

/** §8.10 — a claim using raw CDP needs a real CDP session (Playwright-only cannot prove RAW_CDP). */
function checkCdpClaims(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const c of input.cdpClaims ?? []) {
    if (c.uses_raw_cdp === true && c.has_cdp_session !== true) {
      out.push({
        artifact: `claim:${c.claim_id}`,
        kind: 'RAW_CDP_WITHOUT_SESSION',
        detail: `claim ${c.claim_id} uses raw CDP but no real CDP session was established — Playwright-only evidence cannot prove RAW_CDP`,
        affects_claim_ids: [c.claim_id],
      });
    }
  }
  return out;
}

/** §8.11 — reference/target parity pairs must share state and environment. */
function checkParityPairs(input: ConsistencyInput): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const p of input.parityPairs ?? []) {
    const diffs: string[] = [];
    if (p.ref_state !== p.tgt_state) diffs.push(`ref_state ${p.ref_state} ≠ tgt_state ${p.tgt_state}`);
    if (p.ref_env !== p.tgt_env) diffs.push(`ref_env ${p.ref_env} ≠ tgt_env ${p.tgt_env}`);
    if (diffs.length > 0) {
      out.push({
        artifact: `parity:${p.pair_id}`,
        kind: 'PARITY_INEQUIVALENCE',
        detail: `parity pair ${p.pair_id} lacks environmental/state equivalence: ${diffs.join('; ')}`,
        affects_claim_ids: [],
      });
    }
  }
  return out;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Run all §8 cross-artifact consistency checks. Every family is a separate
 * fail-closed check; any contradiction lands in `violations` and sets
 * `passed: false`. Absent optional fields skip their check.
 */
export function validateCrossArtifactConsistency(input: ConsistencyInput): ConsistencyCheckResult {
  const violations: ConsistencyViolation[] = [
    ...checkTestTotals(input),
    ...checkWarnings(input),
    ...checkLedgerReportStatus(input),
    ...checkOpenFindings(input),
    ...checkEvidenceEpoch(input),
    ...checkDigests(input),
    ...checkCoverage(input),
    ...checkReviewerCapabilities(input),
    ...checkAggregateHiding(input),
    ...checkCdpClaims(input),
    ...checkParityPairs(input),
  ];
  return { passed: violations.length === 0, violations, checked_at: new Date().toISOString() };
}

/**
 * Claims actually affected by the violations: the subset of `claims` named in
 * at least one violation's `affects_claim_ids`, in input order, de-duplicated.
 * Violations without a specific claim attribution affect no claim.
 */
export function claimsAffectedByViolations(claims: string[], violations: ConsistencyViolation[]): string[] {
  const affected = new Set<string>();
  for (const v of violations) {
    for (const claimId of v.affects_claim_ids) affected.add(claimId);
  }
  return claims.filter((c) => affected.has(c));
}
