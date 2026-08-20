import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertWorkLedger as canonicalAssertWorkLedger, assertCertificationAttestation as canonicalAssertCertificationAttestation, CERTIFICATION_REQUIRED_HOSTS } from './contracts.js';
import { candidateEpochHash, type CandidateEpoch } from './candidate-epoch.js';
import { atomicLedgerWrite } from './m11-terminal-evidence.js';
import { MATURITY_RANK, type EvidenceMaturity } from './plan-readiness.js';

export interface GateResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  detail: string;
}

export interface TerminalGateResult {
  passed: boolean;
  gates: GateResult[];
  failedGates: string[];
  timestamp: string;
}

export const M10_TERMINAL_TOKEN = 'HARNESS_V3_10_OF_10_COMPLETE';
export const M11_TERMINAL_TOKEN = 'HV3_M11_LOCAL_COMPLETE';
/** Legacy M8 floor. M11 terminal truth derives the requirement count dynamically from the effective plan (AM-0019 §3 forbids hard-coded counts). */
export const M8_REQUIRED_REQUIREMENTS = 15;
export const M95_REQUIRED_RECONCILIATIONS = 15;
const FRESH_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function effectiveIdentity(ledger: Record<string, any>): string | undefined {
  return ledger.effective_plan_identity?.sha256 || ledger.effectivePlanIdentity || ledger.effective_plan_identity;
}

function freshEpoch(value: any, now: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value <= now && now - value <= FRESH_EVIDENCE_MAX_AGE_MS;
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Dynamic requirement count: derived from the canonical M8 requirements packet
 * when present (plan-readiness compiles the M11 additive registry on top of it),
 * falling back to the legacy floor only when no packet exists. Never a hard-coded
 * terminal count for M11.
 */
export function deriveM8RequirementCount(ledger: Record<string, any>): number {
  const reqs = ledger.milestones?.M8?.requirements;
  if (Array.isArray(reqs) && reqs.length > 0) return reqs.length;
  return M8_REQUIRED_REQUIREMENTS;
}

/** M10 proof is content-derived; callers cannot choose its digest independently. */
export function deriveM10ProofHash(input: {
  headCommit: string;
  effectivePlanIdentity: string;
  reconciliationIds: readonly string[];
  evidenceHashes: readonly string[];
  epoch: number;
}): string {
  return sha256Json({
    headCommit: input.headCommit,
    effectivePlanIdentity: input.effectivePlanIdentity,
    reconciliationIds: [...input.reconciliationIds],
    evidenceHashes: [...input.evidenceHashes],
    epoch: input.epoch,
  });
}

function verifyM95(ledger: Record<string, any>, now: number): { passed: boolean; reason: string; packet?: any } {
  const packet = ledger.milestones?.['M9.5'] || ledger.milestoneEvidence?.['M9.5'] || ledger.m95;
  const identity = effectiveIdentity(ledger);
  if (!packet || typeof identity !== 'string' || identity.length === 0) return { passed: false, reason: 'M9.5 packet or effective plan identity missing' };
  if (packet.identity !== undefined && packet.identity !== identity) return { passed: false, reason: 'M9.5 identity mismatch' };
  if (typeof packet.reviewerIdentity !== 'string' || packet.reviewerIdentity.length === 0) return { passed: false, reason: 'M9.5 reviewer identity missing' };
  if (packet.reviewerIdentity !== ledger.latestReview?.reviewerIdentity) return { passed: false, reason: 'M9.5 reviewer binding mismatch' };
  const timestamp = Date.parse(packet.observedAt || packet.timestamp || '');
  if (Number.isNaN(timestamp) || !freshEpoch(packet.epoch, now) || packet.epoch !== timestamp) return { passed: false, reason: 'M9.5 timestamp or epoch is stale/mismatched' };
  if (now - timestamp > FRESH_EVIDENCE_MAX_AGE_MS || timestamp > now) return { passed: false, reason: 'M9.5 timestamp is stale or future-dated' };
  const evidence = Array.isArray(packet.evidence) ? packet.evidence : [];
  if (evidence.length === 0) return { passed: false, reason: 'M9.5 fresh evidence missing' };
  for (const item of evidence) {
    if (item.identity !== identity && item.effectivePlanIdentity !== identity) return { passed: false, reason: 'M9.5 evidence identity mismatch' };
    const at = Date.parse(item.observedAt || '');
    if (item.fresh !== true || item.stale === true || Number.isNaN(at) || at > now || now - at > FRESH_EVIDENCE_MAX_AGE_MS) return { passed: false, reason: 'M9.5 evidence is stale' };
    if (typeof item.evidenceHash !== 'string' && typeof item.sha256 !== 'string') return { passed: false, reason: 'M9.5 evidence hash missing' };
  }
  return { passed: true, reason: 'fresh M9.5 timestamp, epoch, identity, and reviewer binding', packet };
}

function verifyM10Proof(ledger: Record<string, any>, headCommit: string, m95: any, now: number): { passed: boolean; reason: string } {
  const proof = ledger.m10Proof || ledger.m10_proof || ledger.terminalProof;
  const identity = effectiveIdentity(ledger);
  if (!proof || typeof identity !== 'string') return { passed: false, reason: 'M10 proof or effective plan identity missing' };
  if (proof.headCommit !== headCommit || proof.effectivePlanIdentity !== identity) return { passed: false, reason: 'M10 proof HEAD or identity mismatch' };
  if (proof.reviewerIdentity !== m95.reviewerIdentity) return { passed: false, reason: 'M10 reviewer binding mismatch' };
  if (!freshEpoch(proof.epoch, now) || proof.epoch !== m95.epoch) return { passed: false, reason: 'M10 proof epoch is stale or mismatched' };
  const ids = proof.reconciliationIds;
  const hashes = proof.evidenceHashes;
  if (!Array.isArray(ids) || ids.length !== M95_REQUIRED_RECONCILIATIONS || new Set(ids).size !== ids.length || ids.some((id: any) => typeof id !== 'string')) return { passed: false, reason: 'M10 proof requires 15 unique reconciliation IDs' };
  if (!Array.isArray(hashes) || hashes.length === 0 || new Set(hashes).size !== hashes.length || hashes.some((h: any) => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) return { passed: false, reason: 'M10 proof evidence hashes are invalid' };
  const recs = Array.isArray(ledger.reconciliations) ? ledger.reconciliations : [];
  if (ids.some((id: string) => !recs.some((rec: any) => (rec.requirementId || rec.id) === id && rec.status === 'MATCH' && (rec.headCommit === headCommit || rec.detail?.includes(headCommit.slice(0, 12)))))) return { passed: false, reason: 'M10 proof reconciliation set is not an exact fresh MATCH set' };
  const expected = deriveM10ProofHash({ headCommit, effectivePlanIdentity: identity, reconciliationIds: ids, evidenceHashes: hashes, epoch: proof.epoch });
  return { passed: proof.proofHash === expected, reason: proof.proofHash === expected ? 'M10 proof content binding passes' : 'M10 proof hash mismatch' };
}

export interface MilestoneGateResult {
  passed: boolean;
  milestone: 'M8' | 'M9.5' | 'M10';
  reason: string;
}

/** Canonical milestone reducer. Milestone labels are never terminal state. */
export function verifyMilestoneGate(
  ledger: Record<string, unknown>,
  milestone: 'M8' | 'M9.5' | 'M10',
  expectedIdentity?: string,
  now = Date.now(),
): MilestoneGateResult {
  const l = ledger as Record<string, any>;
  if (milestone === 'M10') {
    return { passed: l.execution_state === M10_TERMINAL_TOKEN, milestone, reason: l.execution_state === M10_TERMINAL_TOKEN ? 'exact M10 terminal token' : 'M10 terminal token missing' };
  }
  const state = l.execution_state || l.status;
  if (state === M10_TERMINAL_TOKEN || state === 'COMPLETED') return { passed: false, milestone, reason: 'terminal state cannot certify a nonterminal milestone' };
  if (milestone === 'M9.5') {
    const result = verifyM95(l, now);
    return { passed: result.passed, milestone, reason: result.reason };
  }
  const identity = expectedIdentity || l.effective_plan_identity?.sha256 || l.effectivePlanIdentity;
  if (typeof identity !== 'string' || identity.length === 0) return { passed: false, milestone, reason: 'missing effective plan identity' };
  const packet = l.milestones?.[milestone] || l.milestoneEvidence?.[milestone] || l[milestone === 'M8' ? 'm8' : 'm95'];
  if (packet?.identity !== undefined && packet.identity !== identity) return { passed: false, milestone, reason: 'milestone identity mismatch' };
  const requirements = packet?.requirements;
  if (!Array.isArray(requirements) || requirements.length < (milestone === 'M8' ? deriveM8RequirementCount(ledger) : 1)) return { passed: false, milestone, reason: 'missing canonical milestone requirements' };
  for (const requirement of requirements) {
    if (requirement.status !== 'MATCH' || !Array.isArray(requirement.evidence) || requirement.evidence.length === 0) return { passed: false, milestone, reason: `requirement ${requirement.id || '(missing id)'} lacks MATCH evidence` };
    for (const evidence of requirement.evidence) {
      if (evidence.identity !== identity && evidence.effectivePlanIdentity !== identity) return { passed: false, milestone, reason: `requirement ${requirement.id || '(missing id)'} evidence identity mismatch` };
      if (evidence.fresh !== true || evidence.stale === true) return { passed: false, milestone, reason: `requirement ${requirement.id || '(missing id)'} evidence is not fresh` };
      if (typeof evidence.observedAt !== 'string' || Number.isNaN(Date.parse(evidence.observedAt)) || now - Date.parse(evidence.observedAt) < 0) return { passed: false, milestone, reason: `requirement ${requirement.id || '(missing id)'} evidence timestamp invalid` };
    }
  }
  if (milestone === 'M8') {
    const dimensions = packet.scorecard?.dimensions;
    if (!Array.isArray(dimensions) || dimensions.length !== 18 || dimensions.some((d: any) => typeof d.score !== 'number' || d.score < 8)) return { passed: false, milestone, reason: 'M8 scorecard is incomplete or below 8/10' };
  }
  return { passed: true, milestone, reason: 'canonical requirements, identity, and fresh evidence pass' };
}

export const REQUIRED_HOSTS = CERTIFICATION_REQUIRED_HOSTS;

const CERTIFICATION_REQUIRED_FIELDS = [
  'host', 'hostVersion', 'commitSha', 'capabilityStatus', 'capabilityIds',
  'contractSetSha256', 'requestedModel', 'resolvedModel', 'observedModel',
  'evidenceRefs', 'nativeRunnerIdentity', 'issuedAt', 'expiresAt',
];

export function assertWorkLedger(ledger: Record<string, unknown>, originalBytes?: Uint8Array, shadowBytes?: Record<string, Uint8Array>): void {
  const l = ledger as Record<string, any>;
  const original = l.plan?.original || l.original_artifact;
  if (!original) {
    throw new Error('WorkLedger: missing original artifact');
  }
  if (!original.sha256 && !original.sha) {
    throw new Error('WorkLedger: original artifact missing SHA');
  }
  if (!Array.isArray(l.amendments)) {
    throw new Error('WorkLedger: missing amendments array');
  }
  if (l.status === 'TAMPERED' || l.execution_state === 'TAMPERED') {
    throw new Error('WorkLedger: ledger is in TAMPERED status');
  }
  if (original.status === 'TAMPERED' || original.tampered === true) {
    throw new Error('WorkLedger: original.md is TAMPERED');
  }
  if (originalBytes && shadowBytes) {
    canonicalAssertWorkLedger(ledger as any, originalBytes, shadowBytes);
  }
}

export function assertCertificationAttestation(ledger: Record<string, unknown>, headCommit: string): void {
  const l = ledger as Record<string, any>;
  const atts = l.attestations || [];
  if (atts.length === 0) {
    throw new Error('CertificationAttestation: no attestations found');
  }

  // Reject duplicate hosts
  const seenHosts = new Set<string>();
  for (const att of atts) {
    if (!att.host) throw new Error('CertificationAttestation: attestation missing host field');
    if (seenHosts.has(att.host)) throw new Error(`CertificationAttestation: duplicate attestation for host ${att.host}`);
    seenHosts.add(att.host);
  }

  // Reject extra/deferred hosts (only REQUIRED_HOSTS allowed)
  for (const att of atts) {
    if (!REQUIRED_HOSTS.includes(att.host)) {
      throw new Error(`CertificationAttestation: unexpected host ${att.host}; only native hosts allowed`);
    }
  }

  // Enforce exactly one attestation per required host (no extras, no missing, no duplicates)
  if (atts.length !== REQUIRED_HOSTS.length) {
    throw new Error(`CertificationAttestation: expected ${REQUIRED_HOSTS.length} attestations, got ${atts.length}`);
  }

  for (const host of REQUIRED_HOSTS) {
    const att = atts.find((a: any) => a.host === host);
    if (!att) {
      throw new Error(`CertificationAttestation: missing attestation for host ${host}`);
    }
    if (!att.commitSha || att.commitSha.length === 0) {
      throw new Error(`CertificationAttestation: attestation for ${host} has empty commitSha`);
    }
    if (att.commitSha !== headCommit) {
      throw new Error(`CertificationAttestation: attestation for ${host} binds ${att.commitSha.slice(0, 12)} but HEAD is ${headCommit.slice(0, 12)}`);
    }
    if (att.status === 'NOT_INSTALLED' || att.status === 'NOT_INSTALLED_NOT_REQUIRED' || att.status === 'EMULATED') {
      throw new Error(`CertificationAttestation: host ${host} attestation status is ${att.status}`);
    }
    for (const field of CERTIFICATION_REQUIRED_FIELDS) {
      if (att[field] === null || att[field] === undefined || att[field] === '') {
        throw new Error(`CertificationAttestation: attestation for ${host} has null/empty field '${field}'`);
      }
    }
    canonicalAssertCertificationAttestation(att, headCommit);
  }
}

export function verifyTerminalGate(
  ledgerPath: string,
  headCommit: string,
  originalBytes?: Uint8Array,
  shadowBytes?: Record<string, Uint8Array>,
): TerminalGateResult {
  const resolved = path.resolve(ledgerPath);
  const gates: GateResult[] = [];
  const failedGates: string[] = [];

  if (!fs.existsSync(resolved)) {
    const g: GateResult = { name: 'LEDGER_EXISTS', status: 'FAIL', detail: 'Ledger not found' };
    return { passed: false, gates: [g], failedGates: ['LEDGER_EXISTS'], timestamp: new Date().toISOString() };
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));

  // assertWorkLedger checks (wired canonical contract)
  try {
    assertWorkLedger(raw, originalBytes, shadowBytes);
    gates.push({ name: 'WORK_LEDGER_VALID', status: 'PASS', detail: 'Canonical fields valid' });
  } catch (e: any) {
    gates.push({ name: 'WORK_LEDGER_VALID', status: 'FAIL', detail: e.message });
    failedGates.push('WORK_LEDGER_VALID');
  }

  // assertCertificationAttestation checks (wired canonical contract)
  try {
    assertCertificationAttestation(raw, headCommit);
    gates.push({ name: 'CERTIFICATION_ATTESTATION', status: 'PASS', detail: `All ${REQUIRED_HOSTS.length} required native hosts attest HEAD with content-addressed evidence` });
  } catch (e: any) {
    gates.push({ name: 'CERTIFICATION_ATTESTATION', status: 'FAIL', detail: e.message });
    failedGates.push('CERTIFICATION_ATTESTATION');
  }

  // Execution state check
  const state = raw.execution_state || raw.status || '';
  const isCompleted = state === M10_TERMINAL_TOKEN;
  gates.push({ name: 'EXECUTION_STATE_COMPLETED', status: isCompleted ? 'PASS' : 'FAIL', detail: isCompleted ? 'Exact M10 terminal token' : `Nonterminal state: ${state}` });
  if (!isCompleted) failedGates.push('EXECUTION_STATE_COMPLETED');

  const hasM8 = Boolean(raw.milestones?.M8 || raw.milestoneEvidence?.M8 || raw.m8);
  const m8 = hasM8 ? verifyMilestoneGate(raw, 'M8') : undefined;
  gates.push({ name: 'M8_CANONICAL_GATE', status: m8 ? (m8.passed ? 'PASS' : 'FAIL') : 'NOT_CHECKED', detail: m8?.reason ?? 'M8 evidence not supplied' });
  if (m8 && !m8.passed) failedGates.push('M8_CANONICAL_GATE');

  const m95 = verifyM95(raw, Date.now());
  gates.push({ name: 'M9_5_CANONICAL_GATE', status: m95.passed ? 'PASS' : 'FAIL', detail: m95.reason });
  if (!m95.passed) failedGates.push('M9_5_CANONICAL_GATE');

  if (m95.passed) {
    const proof = verifyM10Proof(raw, headCommit, m95.packet, Date.now());
    gates.push({ name: 'M10_PROOF_BINDING', status: proof.passed ? 'PASS' : 'FAIL', detail: proof.reason });
    if (!proof.passed) failedGates.push('M10_PROOF_BINDING');
  }

  // No open findings
  const findings = raw.findings || raw.orphanFindings || [];
  const openF = findings.filter((f: any) => f.status && f.status.includes('OPEN'));
  gates.push({ name: 'NO_OPEN_FINDINGS', status: openF.length === 0 ? 'PASS' : 'FAIL', detail: openF.length === 0 ? '0 open' : `${openF.length} open` });
  if (openF.length > 0) failedGates.push('NO_OPEN_FINDINGS');

  // Reconciliation check
  const recs = raw.reconciliations || [];
  const latestRec = recs.length > 0 ? recs[recs.length - 1] : null;
  const recMatch = latestRec && (latestRec.status === 'MATCH' || latestRec.result?.includes('MATCH'));
  gates.push({ name: 'LATEST_RECONCILIATION_MATCH', status: recMatch ? 'PASS' : 'FAIL', detail: recMatch ? 'Latest MATCH' : 'No MATCH reconciliation' });
  if (!recMatch) failedGates.push('LATEST_RECONCILIATION_MATCH');

  if (latestRec) {
    const bindsHead = latestRec.detail?.includes(headCommit.slice(0, 12)) || latestRec.headCommit === headCommit;
    gates.push({ name: 'RECONCILIATION_BINDS_HEAD', status: bindsHead ? 'PASS' : 'FAIL', detail: bindsHead ? 'Binds HEAD' : 'Does not bind HEAD' });
    if (!bindsHead) failedGates.push('RECONCILIATION_BINDS_HEAD');
  }

  // PLAN_ANCHORS_DEFINED
  const anchors = raw.plan_anchors || raw.planAnchors || [];
  gates.push({ name: 'PLAN_ANCHORS_DEFINED', status: anchors.length >= 25 ? 'PASS' : 'FAIL', detail: `${anchors.length} anchors` });
  if (anchors.length < 25) failedGates.push('PLAN_ANCHORS_DEFINED');

  // ORIGINAL_NOT_TAMPERED
  const original = raw.plan?.original || raw.original_artifact || {};
  const isTampered = original.status === 'TAMPERED' || original.tampered === true;
  gates.push({ name: 'ORIGINAL_NOT_TAMPERED', status: isTampered ? 'FAIL' : 'PASS', detail: isTampered ? 'original.md is tampered' : 'original.md intact' });
  if (isTampered) failedGates.push('ORIGINAL_NOT_TAMPERED');

  // AMENDMENT_CHAIN_EVIDENCE
  const amendments = raw.amendments || [];
  const hasAcEvidence = amendments.length > 0
    ? amendments.every((a: any) => a.sha256 || a.content)
    : true;
  gates.push({ name: 'AMENDMENT_CHAIN_EVIDENCE', status: hasAcEvidence ? 'PASS' : 'FAIL', detail: hasAcEvidence ? `${amendments.length} amendments with evidence` : 'Missing amendment evidence' });
  if (!hasAcEvidence) failedGates.push('AMENDMENT_CHAIN_EVIDENCE');

  // SHADOW_NOT_STALE
  const shadowRevision = raw.shadowRevision || 0;
  const latestShadow = raw.latestShadowRevision || shadowRevision;
  const isShadowStale = latestShadow > shadowRevision;
  gates.push({ name: 'SHADOW_NOT_STALE', status: isShadowStale ? 'FAIL' : 'PASS', detail: isShadowStale ? `Shadow stale (${shadowRevision} < ${latestShadow})` : `Shadow current (rev ${shadowRevision})` });
  if (isShadowStale) failedGates.push('SHADOW_NOT_STALE');

  // REVIEW_NOT_STALE
  const latestReview = raw.latestReview || {};
  const isReviewStale = latestReview.stale === true;
  gates.push({ name: 'REVIEW_NOT_STALE', status: isReviewStale ? 'FAIL' : 'PASS', detail: isReviewStale ? `Review ${latestReview.reviewId || 'unknown'} is stale` : 'Review current' });
  if (isReviewStale) failedGates.push('REVIEW_NOT_STALE');

  // HEAD_MATCH — require nonempty HEAD exact match
  const ledgerHead = raw.headCommit || raw.commitSha || '';
  if (!ledgerHead) {
    gates.push({ name: 'HEAD_MATCH', status: 'FAIL', detail: 'Ledger has empty headCommit' });
    failedGates.push('HEAD_MATCH');
  } else {
    const headMatch = ledgerHead === headCommit;
    gates.push({ name: 'HEAD_MATCH', status: headMatch ? 'PASS' : 'FAIL', detail: headMatch ? 'HEAD matches' : `Ledger HEAD ${ledgerHead.slice(0, 12)} != ${headCommit.slice(0, 12)}` });
    if (!headMatch) failedGates.push('HEAD_MATCH');
  }

  // NO_NON_NATIVE_HOST
  const attestations = raw.attestations || [];
  const nonNativeHosts = attestations.filter((a: any) => a.host && !REQUIRED_HOSTS.includes(a.host));
  const hasNonNative = nonNativeHosts.length > 0;
  gates.push({ name: 'NO_NON_NATIVE_HOST', status: hasNonNative ? 'FAIL' : 'PASS', detail: hasNonNative ? `Non-native: ${nonNativeHosts.map((h: any) => h.host).join(', ')}` : 'All hosts native' });
  if (hasNonNative) failedGates.push('NO_NON_NATIVE_HOST');

  // ORIGINAL_SHA_MATCH — recompute sha256(original.md) and compare against ledger's plan.original.sha256
  if (!originalBytes) {
    gates.push({ name: 'ORIGINAL_SHA_MATCH', status: 'NOT_CHECKED', detail: 'No original bytes provided' });
  } else {
    try {
      const computedSha = createHash('sha256').update(originalBytes).digest('hex');
      const ledgerSha = original.sha256;
      if (!ledgerSha) throw new Error('Ledger has no original.sha256');
      if (computedSha !== ledgerSha) {
        throw new Error(`original.md SHA mismatch: computed ${computedSha.slice(0, 12)} != ledger ${ledgerSha.slice(0, 12)}`);
      }
      gates.push({ name: 'ORIGINAL_SHA_MATCH', status: 'PASS', detail: `original.md SHA ${computedSha.slice(0, 12)} matches ledger` });
    } catch (e: any) {
      gates.push({ name: 'ORIGINAL_SHA_MATCH', status: 'FAIL', detail: e.message });
      failedGates.push('ORIGINAL_SHA_MATCH');
    }
  }

  // SHADOW_HASHES_MATCH — verify shadow file hashes against ledger shadowHashes
  if (!shadowBytes) {
    gates.push({ name: 'SHADOW_HASHES_MATCH', status: 'NOT_CHECKED', detail: 'No shadow bytes provided' });
  } else {
    try {
      const shadowHashes = raw.shadowHashes || raw.shadow_hashes || {};
      if (Object.keys(shadowHashes).length === 0) throw new Error('Ledger has no shadowHashes');
      for (const [name, expectedHash] of Object.entries(shadowHashes)) {
        const actualBytes = shadowBytes[name];
        if (!actualBytes) throw new Error(`Missing shadow file: ${name}`);
        const actualHash = createHash('sha256').update(actualBytes).digest('hex');
        if (actualHash !== expectedHash) {
          throw new Error(`Shadow ${name} hash mismatch: ${actualHash.slice(0, 12)} != ${(expectedHash as string).slice(0, 12)}`);
        }
      }
      gates.push({ name: 'SHADOW_HASHES_MATCH', status: 'PASS', detail: 'All shadow hashes match' });
    } catch (e: any) {
      gates.push({ name: 'SHADOW_HASHES_MATCH', status: 'FAIL', detail: e.message });
      failedGates.push('SHADOW_HASHES_MATCH');
    }
  }

  // GITHUB_CI_PASSED — CI evidence with commitSha exact HEAD, repository parsed from runUrl, workflow/check nonempty
  try {
    const ciChecks = raw.ci_checks || [];
    if (!Array.isArray(ciChecks) || ciChecks.length === 0) throw new Error('No CI checks found');
    for (const check of ciChecks) {
      if (typeof check.passed !== 'boolean') throw new Error('CI check missing boolean passed');
      if (!check.runUrl || typeof check.runUrl !== 'string' || check.runUrl.trim().length === 0) throw new Error('CI check missing runUrl');
      if (check.runUrl.startsWith('local')) throw new Error(`CI runUrl starts with 'local': ${check.runUrl}`);
      if (!check.passed) throw new Error('CI check not passed');
      // runUrl must be a valid GitHub Actions run URL
      if (!check.runUrl.startsWith('https://github.com/')) throw new Error(`CI runUrl must be GitHub Actions URL: ${check.runUrl}`);
      if (!check.runUrl.includes('/actions/runs/')) throw new Error(`CI runUrl must include /actions/runs/: ${check.runUrl}`);
      // Parse repository from runUrl: https://github.com/{owner}/{repo}/actions/runs/{id}
      const urlParts = check.runUrl.replace('https://github.com/', '').split('/');
      if (urlParts.length < 2) throw new Error(`Cannot parse owner/repo from runUrl: ${check.runUrl}`);
      const repoFromUrl = `${urlParts[0]}/${urlParts[1]}`;
      if (!check.repository || check.repository !== repoFromUrl) {
        throw new Error(`CI repository '${check.repository}' does not match runUrl owner/repo '${repoFromUrl}'`);
      }
      // Require nonempty workflow and check
      if (!check.workflow || typeof check.workflow !== 'string' || check.workflow.trim().length === 0) throw new Error('CI check missing workflow');
      if (!check.check || typeof check.check !== 'string' || check.check.trim().length === 0) throw new Error('CI check missing check name');
      // commitSha must match ledger HEAD (exact match required)
      if (!check.commitSha || check.commitSha !== headCommit) {
        throw new Error(`CI commitSha '${(check.commitSha || '').slice(0, 12)}' does not match HEAD ${headCommit.slice(0, 12)}`);
      }
    }
    gates.push({ name: 'GITHUB_CI_PASSED', status: 'PASS', detail: `${ciChecks.length} CI checks: ${ciChecks.map((c: any) => c.check).join(', ')} passed` });
  } catch (e: any) {
    gates.push({ name: 'GITHUB_CI_PASSED', status: 'FAIL', detail: e.message });
    failedGates.push('GITHUB_CI_PASSED');
  }

  return { passed: failedGates.length === 0, gates, failedGates, timestamp: new Date().toISOString() };
}

export function assertCertifiable(result: TerminalGateResult): void {
  if (!result.passed) {
    const failed = result.failedGates.join(', ');
    throw new Error(`Terminal gate FAILED: ${failed}`);
  }
}

export function assertNoResidualBeforeFinal(ledgerPath: string, headCommit: string): void {
  const result = verifyTerminalGate(ledgerPath, headCommit);
  if (!result.passed) {
    const msg = `Cannot issue final: gates failing: ${result.failedGates.join(', ')}`;
    const raw = JSON.parse(fs.readFileSync(path.resolve(ledgerPath), 'utf-8'));
    raw.execution_state = 'NEEDS_REMEDIATION';
    atomicLedgerWrite(path.resolve(ledgerPath), JSON.stringify(raw, null, 2));
    throw new Error(msg);
  }
}

export function terminalGateCheck(ledgerPath: string, headCommit: string): { passed: boolean; message: string } {
  try {
    const result = verifyTerminalGate(ledgerPath, headCommit);
    return { passed: result.passed, message: result.failedGates.length > 0 ? `Gates failing: ${result.failedGates.join(', ')}` : 'All gates pass' };
  } catch (e: any) {
    return { passed: false, message: e.message };
  }
}

// ── M11 terminal truth (AM-0019 §13) ─────────────────────────────────────────

export interface M11Review {
  dimension: string;
  accepted: boolean;
  reviewId: string;
  stale: boolean;
}

export interface M11Evidence {
  /** Exact source HEAD the evidence envelope binds. */
  headCommit: string;
  effectivePlanIdentity: string;
  envelopeSha256: string;
  observedAt: string;
  fresh: boolean;
  /** CI SHA bound by evidence — must equal the exact HEAD. */
  ciSha: string;
  certifiedArtifactSha256: string;
  installedArtifactSha256: string;
  /** Must name the certified local main source, e.g. `certified-local-main`. */
  installedFrom: string;
  reconciliationHeadCommit: string;
  parity: 'COMPLETE' | 'SKIPPED';
  topology: 'COMPLETE' | 'SKIPPED';
  reviews: M11Review[];
  /** Content hash of the candidate epoch this evidence envelope binds. */
  candidate_epoch_hash?: string;
}

export interface M11Checks {
  /** Effective requirement set compiled from plan-readiness — count is dynamic, never hard-coded. */
  requirements: Array<{ requirement_id: string; status: string }>;
  /** Fitness dimensions; zero null/UNVERIFIED required. */
  scorecard: Array<{ id: string; score: number | null; status: string }>;
  /** Required gates currently waiting (e.g. topology gate on a capable runner). */
  waitingGates: string[];
}

const M11_REQUIRED_REVIEW_DIMENSIONS = ['architecture', 'security', 'maintainability', 'UX', 'operations'];

function ledgerEffectiveIdentity(ledger: Record<string, any>): string | undefined {
  return ledger.effective_plan_identity?.sha256 ?? ledger.effectivePlanIdentity;
}

function scorecardDimensions(ledger: Record<string, any>, checks: M11Checks): Array<{ id: string; score: number | null; status: string }> {
  if (checks.scorecard.length > 0) return checks.scorecard;
  return ledger.milestones?.M8?.scorecard?.dimensions ?? [];
}

/**
 * HV3_M11_LOCAL_COMPLETE eligibility from REAL ledger state. Pure evaluator —
 * never writes the terminal token (engine-only emission). Returns FAIL whenever
 * a requirement is not MATCH/SUPERSEDED, a finding is open, a score is
 * null/UNVERIFIED, evidence is stale or unbinds the exact HEAD, parity/topology
 * is skipped, the installed artifact differs, a required gate waits, reviews do
 * not all accept, or execution_state is NEEDS_REMEDIATION / an M10 stale marker
 * is present.
 */
export function evaluateM11Terminal(
  ledger: Record<string, unknown>,
  evidence: M11Evidence,
  checks: M11Checks,
  now = Date.now(),
  epoch?: CandidateEpoch,
  headCommit?: string,
): TerminalGateResult {
  const l = ledger as Record<string, any>;
  // Use the actual repository HEAD (passed from CLI/engine) for evidence
  // binding, not the ledger headCommit. This is the root-cause fix for
  // M11 terminal gate trusting the ledger head instead of the real Git HEAD.
  const actualHead = headCommit ?? l.headCommit ?? l.commitSha ?? '';
  const gates: GateResult[] = [];
  const failedGates: string[] = [];
  const fail = (name: string, detail: string): void => {
    gates.push({ name, status: 'FAIL', detail });
    failedGates.push(name);
  };
  const pass = (name: string, detail: string): void => { gates.push({ name, status: 'PASS', detail }); };

  // 1. Every effective requirement MATCH or approved SUPERSEDED (dynamic count).
  const reqs = Array.isArray(checks.requirements) ? checks.requirements : [];
  const badReqs = reqs.filter((r) => r.status !== 'MATCH' && r.status !== 'SUPERSEDED');
  if (reqs.length === 0) fail('M11_EFFECTIVE_REQUIREMENTS_MATCH', 'no effective requirements compiled — empty set cannot certify');
  else if (badReqs.length > 0) fail('M11_EFFECTIVE_REQUIREMENTS_MATCH', `${badReqs.length}/${reqs.length} not MATCH/SUPERSEDED (${badReqs.map((r) => `${r.requirement_id}:${r.status}`).join(', ')})`);
  else pass('M11_EFFECTIVE_REQUIREMENTS_MATCH', `${reqs.length} effective requirements MATCH/SUPERSEDED (dynamic count)`);

  // 2. Zero open findings.
  const findings = [...(l.findings ?? []), ...(l.orphanFindings ?? [])];
  const open = findings.filter((f: any) => f.status && String(f.status).includes('OPEN'));
  if (open.length === 0) pass('M11_NO_OPEN_FINDINGS', '0 open findings');
  else fail('M11_NO_OPEN_FINDINGS', `${open.length} open finding(s)`);

  // 3. Zero null/UNVERIFIED scores.
  const dims = scorecardDimensions(l, checks);
  const badScores = dims.filter((d) => d.score === null || d.score === undefined || String(d.status).toUpperCase() === 'UNVERIFIED');
  if (dims.length === 0) fail('M11_SCORES_VERIFIED', 'no fitness dimensions recorded');
  else if (badScores.length > 0) fail('M11_SCORES_VERIFIED', `${badScores.length}/${dims.length} null/UNVERIFIED (${badScores.map((d) => `${d.id}:${d.status ?? d.score}`).join(', ')})`);
  else pass('M11_SCORES_VERIFIED', `${dims.length} dimensions verified`);

  // 4. Evidence binds the exact source HEAD + effective identity and is fresh.
  const identity = ledgerEffectiveIdentity(l);
  const observedAt = Date.parse(evidence.observedAt);
  const evidenceOk = evidence.fresh === true
    && evidence.envelopeSha256.length > 0
    && evidence.headCommit === actualHead
    && evidence.headCommit.length > 0
    && typeof identity === 'string' && identity.length > 0
    && evidence.effectivePlanIdentity === identity
    && Number.isFinite(observedAt) && observedAt <= now && now - observedAt <= FRESH_EVIDENCE_MAX_AGE_MS;
  if (evidenceOk) pass('M11_EVIDENCE_BINDS_HEAD', `evidence envelope ${evidence.envelopeSha256.slice(0, 12)} binds actual HEAD ${actualHead.slice(0, 12)}`);
  else fail('M11_EVIDENCE_BINDS_HEAD', `evidence stale/unbound: fresh=${evidence.fresh}, head=${evidence.headCommit.slice(0, 12)} vs actual HEAD ${actualHead.slice(0, 12)}`);

  // 5. CI binds the exact HEAD.
  if (evidence.ciSha === evidence.headCommit && evidence.headCommit.length > 0) pass('M11_CI_BINDS_HEAD', `CI SHA ${evidence.ciSha.slice(0, 12)} binds HEAD`);
  else fail('M11_CI_BINDS_HEAD', `CI SHA ${evidence.ciSha.slice(0, 12)} != HEAD ${evidence.headCommit.slice(0, 12)}`);

  // 6. Native attestations bind the exact HEAD.
  const atts = l.attestations ?? [];
  const attBad = atts.length === 0 || atts.some((a: any) => a.commitSha !== actualHead);
  if (attBad) fail('M11_ATTESTATIONS_BIND_HEAD', atts.length === 0 ? 'no native attestations' : 'attestation does not bind actual HEAD');
  else pass('M11_ATTESTATIONS_BIND_HEAD', `${atts.length} attestation(s) bind actual HEAD`);

  // 7. Exact certified artifact installed from certified local main.
  const artifactOk = evidence.installedArtifactSha256 === evidence.certifiedArtifactSha256
    && evidence.installedArtifactSha256.length > 0
    && /main/.test(evidence.installedFrom);
  if (artifactOk) pass('M11_INSTALLED_ARTIFACT_MATCHES', `artifact ${evidence.installedArtifactSha256.slice(0, 12)} installed from ${evidence.installedFrom}`);
  else fail('M11_INSTALLED_ARTIFACT_MATCHES', `installed ${evidence.installedArtifactSha256.slice(0, 12)} != certified ${evidence.certifiedArtifactSha256.slice(0, 12)} or not from certified local main (${evidence.installedFrom})`);

  // 8. Independent reviews accept all five dimensions, none stale.
  const acceptedDims = new Set(evidence.reviews.filter((r) => r.accepted && !r.stale).map((r) => r.dimension));
  const missingDims = M11_REQUIRED_REVIEW_DIMENSIONS.filter((d) => !acceptedDims.has(d));
  if (missingDims.length === 0) pass('M11_REVIEWS_ACCEPT', 'architecture/security/maintainability/UX/operations reviews accept');
  else fail('M11_REVIEWS_ACCEPT', `reviews not all accepting/stale: missing ${missingDims.join(', ')}`);

  // 9. Required parity/topology not skipped.
  if (evidence.parity === 'SKIPPED' || evidence.topology === 'SKIPPED') fail('M11_PARITY_TOPOLOGY_COMPLETE', `parity=${evidence.parity} topology=${evidence.topology} — skipped verification cannot certify`);
  else pass('M11_PARITY_TOPOLOGY_COMPLETE', 'paired parity + deployed-topology verification complete');

  // 10. No required gate waits.
  if (checks.waitingGates.length === 0) pass('M11_NO_WAITING_GATES', 'no required gate waiting');
  else fail('M11_NO_WAITING_GATES', `required gate(s) waiting: ${checks.waitingGates.join(', ')}`);

  // 11. Current reconciliation binds the actual HEAD.
  if (evidence.reconciliationHeadCommit === actualHead && actualHead.length > 0) pass('M11_RECONCILIATION_BINDS_HEAD', 'current reconciliation binds actual HEAD');
  else fail('M11_RECONCILIATION_BINDS_HEAD', `reconciliation ${evidence.reconciliationHeadCommit.slice(0, 12)} != actual HEAD ${actualHead.slice(0, 12)}`);

  // 12. Execution state is eligible — never NEEDS_REMEDIATION, never the stale M10 marker.
  const state = l.execution_state ?? l.status ?? '';
  const staleMarker = l.terminalMarker === M10_TERMINAL_TOKEN && (l.terminalMarkerStatus ?? '').includes('HISTORICAL_STALE');
  if (state === 'NEEDS_REMEDIATION') fail('M11_EXECUTION_STATE_OK', `execution_state is NEEDS_REMEDIATION`);
  else if (state === M10_TERMINAL_TOKEN) fail('M11_EXECUTION_STATE_OK', 'execution_state carries the M10 token — HISTORICAL_STALE_FOR_M11, cannot authorize M11');
  else if (staleMarker) fail('M11_EXECUTION_STATE_OK', 'ledger terminalMarker is M10 HISTORICAL_STALE_FOR_M11 — cannot authorize M11');
  else pass('M11_EXECUTION_STATE_OK', `execution_state ${state || '(none)'} eligible`);

  // 13. Candidate epoch binding (AM-0020 §3, M11-R32): terminal evidence must
  //     bind an immutable candidate epoch. Fail-closed — no epoch, incomplete
  //     epoch, stale epoch, or epoch/HEAD mismatch blocks terminal.
  const boundEpoch = epoch ?? (l.candidate_epoch as CandidateEpoch | undefined);
  if (!boundEpoch || typeof boundEpoch !== 'object') {
    fail('M11_CANDIDATE_EPOCH_BOUND', 'no candidate epoch bound — terminal evidence requires an immutable candidate epoch');
  } else {
    const required: Array<keyof CandidateEpoch> = [
      'schema', 'source_tree_sha', 'candidate_commit_or_tree', 'artifact_digest',
      'container_image_digests', 'dependency_lock_hash', 'migration_set_hash',
      'environment_hash', 'fixture_hash', 'topology_hash', 'created_at',
    ];
    const missing = required.filter((k) => boundEpoch[k] === undefined || boundEpoch[k] === null || boundEpoch[k] === '');
    if (missing.length > 0) {
      fail('M11_CANDIDATE_EPOCH_BOUND', `candidate epoch incomplete: ${missing.join(', ')}`);
    } else {
      const createdAt = Date.parse(boundEpoch.created_at);
      const fresh = Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= FRESH_EVIDENCE_MAX_AGE_MS;
      const bindsHead = boundEpoch.candidate_commit_or_tree === evidence.headCommit;
      const bindsEpoch = evidence.candidate_epoch_hash === candidateEpochHash(boundEpoch);
      if (!fresh) fail('M11_CANDIDATE_EPOCH_BOUND', `candidate epoch stale or future-dated (${boundEpoch.created_at})`);
      else if (!bindsHead) fail('M11_CANDIDATE_EPOCH_BOUND', `candidate epoch candidate_commit_or_tree ${boundEpoch.candidate_commit_or_tree.slice(0, 12)} != evidence HEAD ${evidence.headCommit.slice(0, 12)}`);
      else if (!bindsEpoch) fail('M11_CANDIDATE_EPOCH_BOUND', 'evidence does not bind this candidate epoch (candidate_epoch_hash mismatch)');
      else pass('M11_CANDIDATE_EPOCH_BOUND', `candidate epoch ${candidateEpochHash(boundEpoch).slice(0, 12)} binds exact HEAD`);
    }
  }

  return { passed: failedGates.length === 0, gates, failedGates, timestamp: new Date().toISOString() };
}

export function assertM11Certifiable(result: TerminalGateResult): void {
  if (!result.passed) throw new Error(`M11 terminal gate FAILED: ${result.failedGates.join(', ')}`);
}

// ── M11 terminal emission (engine-only, fail-closed) ─────────────────────────

export interface M11FinalizeOptions {
  /** Absolute path to the canonical ledger JSON. */
  ledgerPath: string;
  evidence: M11Evidence;
  checks: M11Checks;
  /** Shadow projection dir (.agent/plans/<plan-id>/shadow). Defaults from the ledger plan_id. */
  shadowDir?: string;
  /** Immutable candidate epoch (M11-R32). Defaults to the ledger's bound epoch. */
  epoch?: CandidateEpoch;
  /** Actual repository HEAD commit (from `git rev-parse HEAD`). Binds evidence and attestations. */
  headCommit?: string;
  now?: number;
}

export interface M11FinalizeResult {
  passed: boolean;
  token?: string;
  reason?: string;
  failedGates?: string[];
}

/**
 * Engine-owned terminal emission (AM-0019 §13). Runs the full 12-gate
 * evaluateM11Terminal; ONLY when every gate passes does it write the
 * HV3_M11_LOCAL_COMPLETE token into the ledger execution_state, append an
 * audit event, and regenerate the shadow projection hashes. Any failing gate
 * returns not-eligible with the reason and mutates NOTHING (fail-closed).
 */
export function finalizeM11(options: M11FinalizeOptions): M11FinalizeResult {
  const resolved = path.resolve(options.ledgerPath);
  if (!fs.existsSync(resolved)) {
    return { passed: false, reason: `ledger not found: ${resolved}` };
  }
  const raw: unknown = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { passed: false, reason: 'ledger is not a JSON object' };
  }
  const ledger = raw as Record<string, any>;
  const epoch = options.epoch ?? (ledger.candidate_epoch as CandidateEpoch | undefined);

  const gate = evaluateM11Terminal(ledger, options.evidence, options.checks, options.now, epoch, options.headCommit);
  if (!gate.passed) {
    return { passed: false, reason: `M11 terminal gate false: ${gate.failedGates.join(', ')}`, failedGates: gate.failedGates };
  }

  // ── all gates pass: emit token + audit event + regenerate shadows ─────────
  const at = new Date(options.now ?? Date.now()).toISOString();
  const auditEvents = Array.isArray(ledger.audit_events) ? ledger.audit_events : [];
  ledger.audit_events = [
    ...auditEvents,
    {
      event_id: `E-M11-${auditEvents.length + 1}`,
      type: 'M11_TERMINAL_FINALIZE',
      summary: `M11 terminal emitted ${M11_TERMINAL_TOKEN}: all ${gate.gates.length} gates pass; headCommit ${options.evidence.headCommit.slice(0, 12)}; effective identity ${options.evidence.effectivePlanIdentity.slice(0, 12)}; candidate epoch ${epoch ? candidateEpochHash(epoch).slice(0, 12) : 'none'}`,
      actor: 'engine',
      at,
    },
  ];
  ledger.execution_state = M11_TERMINAL_TOKEN;
  if (typeof ledger.status === 'string' && ledger.status !== M11_TERMINAL_TOKEN) {
    ledger.status = M11_TERMINAL_TOKEN;
  }
  // Persist the immutable candidate epoch so terminal state binds the candidate.
  ledger.candidate_epoch = epoch;

  // Regenerate shadow projection hashes at the new revision (fail-closed: keep
  // the prior hash only when the shadow file is unreadable, never guess).
  const previousHashes: Record<string, string> = ledger.shadow_hashes ?? ledger.shadowHashes ?? {};
  const shadowDir = options.shadowDir
    ?? path.resolve(path.dirname(resolved), '..', 'plans', String(ledger.plan_id ?? ''), 'shadow');
  const hashes: Record<string, string> = {};
  if (fs.existsSync(shadowDir)) {
    for (const key of Object.keys(previousHashes)) {
      try {
        hashes[key] = createHash('sha256').update(fs.readFileSync(path.join(shadowDir, key))).digest('hex');
      } catch {
        hashes[key] = previousHashes[key];
      }
    }
  }
  const nextRevision = (typeof ledger.shadowRevision === 'number' ? ledger.shadowRevision : (ledger.shadow_revision ?? 0)) + 1;
  ledger.shadowRevision = nextRevision;
  ledger.shadow_revision = nextRevision;
  ledger.shadow_hashes = hashes;
  ledger.shadowHashes = hashes;

  atomicLedgerWrite(resolved, `${JSON.stringify(ledger, null, 2)}\n`);
  return { passed: true, token: M11_TERMINAL_TOKEN };
}

// ── M11-R34 machine-generated terminal report (AM-0020 §9) ───────────────────

export interface TerminalReportSection {
  id: string;
  title: string;
  content: string;
  source_ledger_field?: string;
}

export interface TerminalReportOptions {
  /** Evidence freshness window; defaults to 24h. */
  requireFreshEvidenceMs?: number;
  /** Capabilities the reviewer set must cover; defaults to ['specialist'] (AM-0020 §6). */
  requireCapabilities?: string[];
  /** Open findings with these severities block terminal; defaults to ['critical', 'high']. */
  blockingSeverities?: string[];
  /** Raw-artifact claim totals; the compiled report totals must equal these, else fail-closed. */
  rawTotals?: { total: number; fresh: number; terminal_eligible: number };
  /** Overridable clock; defaults to Date.now(). */
  now?: number;
}

export interface TerminalReport {
  report_id: string;
  candidate_identity: string;
  claim_coverage: { total: number; fresh: number; terminal_eligible: number; blocked: number };
  evidence_summary: { maturity: Record<string, number>; oldest_fresh_age_ms: number | null };
  review_summary: { reviewers: number; capabilities: string[]; independent: number; blind_challenge: boolean };
  open_findings: Array<{ id: string; severity: string; disposition: string }>;
  bindings: { ci: string | null; install: string | null; topology: string | null; parity: string | null; attestation: string | null };
  residuals: string[];
  terminal_formula: 'HV3_M11_LOCAL_COMPLETE' | 'NOT_ELIGIBLE';
  compiler_errors: string[];
  /** The nine AM-0020 §9 report sections, compiled from the canonical ledger. */
  sections: TerminalReportSection[];
}

interface LedgerClaimRow {
  claim_id?: string;
  maturity?: string;
  blocked?: boolean;
  observed_at?: string;
  observedAt?: string;
}

function ledgerClaimRows(ledger: Record<string, any>): LedgerClaimRow[] {
  const raw = ledger.claims ?? ledger.claim_evaluations;
  if (Array.isArray(raw)) return raw as LedgerClaimRow[];
  const byClaim = ledger.claim_summary?.byClaim;
  if (byClaim && typeof byClaim === 'object') return Object.values(byClaim) as LedgerClaimRow[];
  return [];
}

/**
 * Compile the AM-0020 §9 machine-generated terminal report from the canonical
 * ledger. Pure compiler — it never writes state and never honors a marker.
 *
 * Terminal marker written by an LLM/Markdown outside an engine event is invalid
 * (AM-0020 §9): the ledger execution_state/status is NOT consulted here, so a
 * marker scribbled outside an engine event cannot set the formula. The report
 * fails closed when required evidence is stale, a capability is missing, a
 * blocking finding is open, report totals conflict with raw artifacts, or
 * candidate/CI/install identities differ. There is no pass switch: the formula
 * is HV3_M11_LOCAL_COMPLETE only when every compiler gate above passes, and no
 * option can force it otherwise.
 *
 * Ledger claim data is read dynamically from `ledger.claims` /
 * `ledger.claim_evaluations` (array of `{ claim_id, maturity, blocked,
 * observed_at }`) or `ledger.claim_summary.byClaim` (a claim-registry
 * `ClaimFormulaSummary`) — the count is never a constant. CI/install bindings
 * are `ledger.ci_binding` / `ledger.install_binding` objects whose `sha256`
 * must equal the candidate epoch hash (identity mismatch = fail-closed).
 */
export function compileTerminalReport(
  ledger: Record<string, unknown>,
  candidate: { headCommit: string; epoch: number; epochHash: string },
  opts: TerminalReportOptions = {},
): TerminalReport {
  const l = ledger as Record<string, any>;
  const now = opts.now ?? Date.now();
  const errors: string[] = [];
  const freshWindow = opts.requireFreshEvidenceMs ?? FRESH_EVIDENCE_MAX_AGE_MS;
  const requiredCaps = opts.requireCapabilities ?? ['specialist'];
  const blockingSeverities = (opts.blockingSeverities ?? ['critical', 'high']).map((s) => s.toLowerCase());

  // a. Candidate identity: derived from the epoch hash; the ledger's effective
  //    plan identity must match it.
  const identity = effectiveIdentity(l);
  if (typeof identity !== 'string' || identity.length === 0) {
    errors.push('candidate identity mismatch: ledger has no effective_plan_identity');
  } else if (identity !== candidate.epochHash) {
    errors.push(`candidate identity mismatch: ledger effective_plan_identity ${identity.slice(0, 12)} != candidate epochHash ${candidate.epochHash.slice(0, 12)}`);
  }

  // Claim coverage — dynamic count from the ledger, never hard-coded.
  const claims = ledgerClaimRows(l);
  const coverage = { total: claims.length, fresh: 0, terminal_eligible: 0, blocked: 0 };
  const maturity: Record<string, number> = {};
  let oldestFreshAge: number | null = null;
  if (claims.length === 0) errors.push('claim coverage empty: no claim evidence in ledger');
  for (const claim of claims) {
    const m = (claim.maturity ?? 'UNOBSERVED') as EvidenceMaturity;
    maturity[m] = (maturity[m] ?? 0) + 1;
    const rank = MATURITY_RANK[m] ?? 0;
    const blocked = claim.blocked === true || rank < 0;
    if (blocked) {
      coverage.blocked += 1;
      errors.push(`blocked claim ${claim.claim_id ?? '(no id)'}: maturity ${m}`);
    } else if (m === 'TERMINAL_ELIGIBLE' || m === 'SUPERSEDED') {
      coverage.terminal_eligible += 1;
    }
    if (rank >= MATURITY_RANK.FRESH) {
      coverage.fresh += 1;
      const at = Date.parse(claim.observed_at ?? claim.observedAt ?? '');
      if (Number.isNaN(at)) {
        errors.push(`fresh claim ${claim.claim_id ?? '(no id)'} lacks observed_at — freshness unproven`);
      } else if (at > now) {
        errors.push(`claim ${claim.claim_id ?? '(no id)'} evidence is future-dated`);
      } else {
        const age = now - at;
        if (oldestFreshAge === null || age > oldestFreshAge) oldestFreshAge = age;
      }
    }
  }

  // b. Evidence freshness (fail-closed).
  if (coverage.total > 0 && coverage.fresh === 0) errors.push('evidence stale: no fresh claim evidence');
  if (oldestFreshAge !== null && oldestFreshAge > freshWindow) {
    errors.push(`evidence stale: oldest fresh evidence age ${oldestFreshAge}ms exceeds window ${freshWindow}ms`);
  }

  // c. Review coverage + capability gate.
  const reviewRecords = [
    ...(Array.isArray(l.reviews) ? l.reviews : []),
    ...(l.latestReview && typeof l.latestReview === 'object' ? [l.latestReview] : []),
  ];
  const reviewerIds = new Set<string>();
  const capabilities = new Set<string>();
  let independent = 0;
  let blindChallenge = false;
  for (const r of reviewRecords) {
    const rid = r.reviewer_id ?? r.reviewerId ?? r.reviewerIdentity;
    if (typeof rid === 'string' && rid.length > 0) reviewerIds.add(rid);
    for (const c of r.capabilities ?? []) if (typeof c === 'string') capabilities.add(c);
    if (r.independent === true) independent += 1;
    if (r.blind_challenge === true) blindChallenge = true;
  }
  const missingCaps = requiredCaps.filter((c) => !capabilities.has(c));
  if (missingCaps.length > 0) {
    errors.push(`capability missing: ${missingCaps.join(', ')} (reviewer capabilities: ${[...capabilities].join(', ') || 'none'})`);
  }

  // d. Blocking findings open.
  const findings = [
    ...(Array.isArray(l.findings) ? l.findings : []),
    ...(Array.isArray(l.orphanFindings) ? l.orphanFindings : []),
  ];
  const openFindings: TerminalReport['open_findings'] = [];
  for (const f of findings) {
    const status = String(f.status ?? '');
    if (!status.toUpperCase().includes('OPEN')) continue;
    const severity = String(f.severity ?? f.priority ?? 'unknown');
    openFindings.push({
      id: String(f.finding_id ?? f.id ?? 'unknown'),
      severity,
      disposition: status,
    });
    if (blockingSeverities.includes(severity.toLowerCase())) {
      errors.push(`blocking finding open: ${f.finding_id ?? f.id} (${severity})`);
    }
  }

  // e. Report totals vs raw artifacts (fail-closed when supplied).
  if (opts.rawTotals) {
    if (opts.rawTotals.total !== coverage.total) {
      errors.push(`report totals conflict with raw artifacts: total ${coverage.total} != raw ${opts.rawTotals.total}`);
    }
    if (opts.rawTotals.fresh !== coverage.fresh) {
      errors.push(`report totals conflict with raw artifacts: fresh ${coverage.fresh} != raw ${opts.rawTotals.fresh}`);
    }
    if (opts.rawTotals.terminal_eligible !== coverage.terminal_eligible) {
      errors.push(`report totals conflict with raw artifacts: terminal_eligible ${coverage.terminal_eligible} != raw ${opts.rawTotals.terminal_eligible}`);
    }
  }

  // f. Candidate/CI/install identities must agree (fail-closed).
  const ciBinding = l.ci_binding;
  const installBinding = l.install_binding;
  if (ciBinding?.sha256 && ciBinding.sha256 !== candidate.epochHash) {
    errors.push(`CI identity mismatch: ci_binding ${String(ciBinding.sha256).slice(0, 12)} != candidate ${candidate.epochHash.slice(0, 12)}`);
  }
  if (installBinding?.sha256 && installBinding.sha256 !== candidate.epochHash) {
    errors.push(`install identity mismatch: install_binding ${String(installBinding.sha256).slice(0, 12)} != candidate ${candidate.epochHash.slice(0, 12)}`);
  }

  // Cross-check the claim formula verdict when the ledger carries one
  // (claim-registry evaluateClaimFormulas output): a not-satisfied terminal
  // formula can never be overridden by report prose.
  const formulaState = l.claim_formula_state ?? l.claimFormulas?.formulaState;
  if (formulaState && formulaState.HV3_M11_LOCAL_COMPLETE === false) {
    errors.push('claim formula HV3_M11_LOCAL_COMPLETE not satisfied by claim evidence');
  }

  const residuals = Array.isArray(l.residuals)
    ? l.residuals.filter((r: unknown): r is string => typeof r === 'string')
    : [];

  const bindings: TerminalReport['bindings'] = {
    ci: typeof ciBinding?.runUrl === 'string'
      ? ciBinding.runUrl
      : (Array.isArray(l.ci_checks) && l.ci_checks.length > 0 ? l.ci_checks[0]?.runUrl ?? null : null),
    install: typeof installBinding?.from === 'string'
      ? installBinding.from
      : (typeof installBinding?.sha256 === 'string' ? installBinding.sha256 : null),
    topology: typeof l.topology_binding === 'string' ? l.topology_binding : (l.candidate_epoch?.topology_hash ?? null),
    parity: typeof l.parity_binding === 'string' ? l.parity_binding : null,
    attestation: typeof l.attestation_binding === 'string' ? l.attestation_binding : null,
  };

  const reviewSummary: TerminalReport['review_summary'] = {
    reviewers: reviewerIds.size,
    capabilities: [...capabilities].sort(),
    independent,
    blind_challenge: blindChallenge,
  };

  // Formula: NO pass switch. Only zero compiler errors can yield the terminal token.
  const terminalFormula: TerminalReport['terminal_formula'] = errors.length === 0 ? M11_TERMINAL_TOKEN : 'NOT_ELIGIBLE';

  const report: TerminalReport = {
    report_id: `TERMINAL-REPORT-${sha256Json({ candidate_identity: candidate.epochHash, claim_coverage: coverage, terminal_formula: terminalFormula }).slice(0, 24).toUpperCase()}`,
    candidate_identity: candidate.epochHash,
    claim_coverage: coverage,
    evidence_summary: { maturity, oldest_fresh_age_ms: oldestFreshAge },
    review_summary: reviewSummary,
    open_findings: openFindings,
    bindings,
    residuals,
    terminal_formula: terminalFormula,
    compiler_errors: [...errors],
    sections: [
      { id: 'candidate-identity', title: 'Candidate identity', content: candidate.epochHash, source_ledger_field: 'effective_plan_identity' },
      { id: 'claim-coverage', title: 'Claim coverage', content: JSON.stringify(coverage), source_ledger_field: 'claims' },
      { id: 'evidence-maturity-freshness', title: 'Evidence maturity and freshness', content: JSON.stringify({ maturity, oldest_fresh_age_ms: oldestFreshAge }), source_ledger_field: 'claims[].maturity/observed_at' },
      { id: 'review-coverage-capabilities', title: 'Review coverage and capabilities', content: JSON.stringify(reviewSummary), source_ledger_field: 'reviews' },
      { id: 'open-findings', title: 'Open findings', content: openFindings.length > 0 ? JSON.stringify(openFindings) : 'none', source_ledger_field: 'findings' },
      { id: 'bindings', title: 'CI/install/topology/parity/attestation bindings', content: JSON.stringify(bindings), source_ledger_field: 'ci_binding/install_binding/topology_binding/parity_binding/attestation_binding' },
      { id: 'residuals', title: 'Residuals', content: residuals.length > 0 ? residuals.join('\n') : 'none', source_ledger_field: 'residuals' },
      { id: 'terminal-formula', title: 'Terminal formula result', content: terminalFormula },
      { id: 'compiler-status', title: 'Compiler status', content: errors.length > 0 ? errors.join('; ') : 'OK' },
    ],
  };
  return report;
}
