import fs from 'node:fs';
import path from 'node:path';

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

export const REQUIRED_HOSTS = ['codex', 'cursor', 'antigravity', 'grok', 'opencode'];

export function assertWorkLedger(ledger: Record<string, unknown>): void {
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
}

export function assertCertificationAttestation(ledger: Record<string, unknown>, headCommit: string): void {
  const l = ledger as Record<string, any>;
  const atts = l.attestations || [];
  if (atts.length === 0) {
    throw new Error('CertificationAttestation: no attestations found');
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
    const keys = Object.keys(att);
    for (const k of keys) {
      if (att[k] === null || att[k] === undefined || att[k] === '') {
        throw new Error(`CertificationAttestation: attestation for ${host} has null/empty field '${k}'`);
      }
    }
  }
}

export function verifyTerminalGate(
  ledgerPath: string,
  headCommit: string,
): TerminalGateResult {
  const resolved = path.resolve(ledgerPath);
  const gates: GateResult[] = [];
  const failedGates: string[] = [];

  if (!fs.existsSync(resolved)) {
    const g: GateResult = { name: 'LEDGER_EXISTS', status: 'FAIL', detail: 'Ledger not found' };
    return { passed: false, gates: [g], failedGates: ['LEDGER_EXISTS'], timestamp: new Date().toISOString() };
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));

  // assertWorkLedger checks
  try {
    assertWorkLedger(raw);
    gates.push({ name: 'WORK_LEDGER_VALID', status: 'PASS', detail: 'Canonical fields valid' });
  } catch (e: any) {
    gates.push({ name: 'WORK_LEDGER_VALID', status: 'FAIL', detail: e.message });
    failedGates.push('WORK_LEDGER_VALID');
  }

  // assertCertificationAttestation checks
  try {
    assertCertificationAttestation(raw, headCommit);
    gates.push({ name: 'CERTIFICATION_ATTESTATION', status: 'PASS', detail: 'All 5 hosts attest HEAD' });
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

  // HEAD_MATCH
  const ledgerHead = raw.headCommit || raw.commitSha || '';
  const headMatch = !ledgerHead || ledgerHead === headCommit;
  gates.push({ name: 'HEAD_MATCH', status: headMatch ? 'PASS' : 'FAIL', detail: headMatch ? 'HEAD matches' : `Ledger HEAD ${ledgerHead.slice(0, 12)} != ${headCommit.slice(0, 12)}` });
  if (!headMatch) failedGates.push('HEAD_MATCH');

  // NO_NON_NATIVE_HOST
  const attestations = raw.attestations || [];
  const nonNativeHosts = attestations.filter((a: any) => a.host && !REQUIRED_HOSTS.includes(a.host));
  const hasNonNative = nonNativeHosts.length > 0;
  gates.push({ name: 'NO_NON_NATIVE_HOST', status: hasNonNative ? 'FAIL' : 'PASS', detail: hasNonNative ? `Non-native: ${nonNativeHosts.map((h: any) => h.host).join(', ')}` : 'All hosts native' });
  if (hasNonNative) failedGates.push('NO_NON_NATIVE_HOST');

  // GITHUB_CI_PASSED — read CI check data from ledger
  const ciQuality = raw.ci_quality || raw.ciQuality || {};
  const ciCertify = raw.ci_certify || raw.ciCertify || {};
  const ciChecks = raw.ci_checks || [];
  const ciFromArray = Array.isArray(ciChecks) && ciChecks.length > 0
    ? ciChecks.every((c: any) => c.status === 'PASS' || c.passed === true)
    : false;
  const ciFromFields = (ciQuality.status === 'PASS' || ciQuality.passed === true) &&
                       (ciCertify.status === 'PASS' || ciCertify.passed === true);
  const ciPassed = ciFromArray || ciFromFields;
  gates.push({ name: 'GITHUB_CI_PASSED', status: ciPassed ? 'PASS' : 'FAIL', detail: ciPassed ? 'CI checks passed' : 'CI checks absent or failing' });
  if (!ciPassed) failedGates.push('GITHUB_CI_PASSED');

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
