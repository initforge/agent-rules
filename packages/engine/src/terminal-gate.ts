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

export const REQUIRED_HOSTS = CERTIFICATION_REQUIRED_HOSTS;

const CERTIFICATION_REQUIRED_FIELDS = [
  'host', 'hostVersion', 'commitSha', 'capabilityStatus', 'capabilityIds',
  'contractSetSha256', 'requestedModel', 'resolvedModel', 'observedModel',
  'evidenceHashes', 'nativeRunnerIdentity', 'issuedAt', 'expiresAt',
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
    gates.push({ name: 'CERTIFICATION_ATTESTATION', status: 'PASS', detail: 'All 4 required native hosts attest HEAD' });
  } catch (e: any) {
    gates.push({ name: 'CERTIFICATION_ATTESTATION', status: 'FAIL', detail: e.message });
    failedGates.push('CERTIFICATION_ATTESTATION');
  }

  // Execution state check
  const state = raw.execution_state || raw.status || '';
  const isCompleted = state === 'COMPLETED';
  gates.push({ name: 'EXECUTION_STATE_COMPLETED', status: isCompleted ? 'PASS' : 'FAIL', detail: `State: ${state}` });
  if (!isCompleted) failedGates.push('EXECUTION_STATE_COMPLETED');

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
