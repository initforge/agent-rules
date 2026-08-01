import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertWorkLedger as canonicalAssertWorkLedger, assertCertificationAttestation as canonicalAssertCertificationAttestation, CERTIFICATION_REQUIRED_HOSTS } from './contracts.js';

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
    fs.writeFileSync(path.resolve(ledgerPath), JSON.stringify(raw, null, 2));
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
): TerminalGateResult {
  const l = ledger as Record<string, any>;
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
  const head = l.headCommit ?? l.commitSha ?? '';
  const observedAt = Date.parse(evidence.observedAt);
  const evidenceOk = evidence.fresh === true
    && evidence.envelopeSha256.length > 0
    && evidence.headCommit === head
    && evidence.headCommit.length > 0
    && typeof identity === 'string' && identity.length > 0
    && evidence.effectivePlanIdentity === identity
    && Number.isFinite(observedAt) && observedAt <= now && now - observedAt <= FRESH_EVIDENCE_MAX_AGE_MS;
  if (evidenceOk) pass('M11_EVIDENCE_BINDS_HEAD', `evidence envelope ${evidence.envelopeSha256.slice(0, 12)} binds exact HEAD ${head.slice(0, 12)}`);
  else fail('M11_EVIDENCE_BINDS_HEAD', `evidence stale/unbound: fresh=${evidence.fresh}, head=${evidence.headCommit.slice(0, 12)} vs ledger ${head.slice(0, 12)}`);

  // 5. CI binds the exact HEAD.
  if (evidence.ciSha === evidence.headCommit && evidence.headCommit.length > 0) pass('M11_CI_BINDS_HEAD', `CI SHA ${evidence.ciSha.slice(0, 12)} binds HEAD`);
  else fail('M11_CI_BINDS_HEAD', `CI SHA ${evidence.ciSha.slice(0, 12)} != HEAD ${evidence.headCommit.slice(0, 12)}`);

  // 6. Native attestations bind the exact HEAD.
  const atts = l.attestations ?? [];
  const attBad = atts.length === 0 || atts.some((a: any) => a.commitSha !== head);
  if (attBad) fail('M11_ATTESTATIONS_BIND_HEAD', atts.length === 0 ? 'no native attestations' : 'attestation does not bind exact HEAD');
  else pass('M11_ATTESTATIONS_BIND_HEAD', `${atts.length} attestation(s) bind HEAD`);

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

  // 11. Current reconciliation binds the exact HEAD.
  if (evidence.reconciliationHeadCommit === evidence.headCommit && evidence.headCommit.length > 0) pass('M11_RECONCILIATION_BINDS_HEAD', 'current reconciliation binds exact HEAD');
  else fail('M11_RECONCILIATION_BINDS_HEAD', `reconciliation ${evidence.reconciliationHeadCommit.slice(0, 12)} != HEAD ${evidence.headCommit.slice(0, 12)}`);

  // 12. Execution state is eligible — never NEEDS_REMEDIATION, never the stale M10 marker.
  const state = l.execution_state ?? l.status ?? '';
  const staleMarker = l.terminalMarker === M10_TERMINAL_TOKEN && (l.terminalMarkerStatus ?? '').includes('HISTORICAL_STALE');
  if (state === 'NEEDS_REMEDIATION') fail('M11_EXECUTION_STATE_OK', `execution_state is NEEDS_REMEDIATION`);
  else if (state === M10_TERMINAL_TOKEN) fail('M11_EXECUTION_STATE_OK', 'execution_state carries the M10 token — HISTORICAL_STALE_FOR_M11, cannot authorize M11');
  else if (staleMarker) fail('M11_EXECUTION_STATE_OK', 'ledger terminalMarker is M10 HISTORICAL_STALE_FOR_M11 — cannot authorize M11');
  else pass('M11_EXECUTION_STATE_OK', `execution_state ${state || '(none)'} eligible`);

  return { passed: failedGates.length === 0, gates, failedGates, timestamp: new Date().toISOString() };
}

export function assertM11Certifiable(result: TerminalGateResult): void {
  if (!result.passed) throw new Error(`M11 terminal gate FAILED: ${result.failedGates.join(', ')}`);
}
