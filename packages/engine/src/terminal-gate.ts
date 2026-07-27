import fs from 'node:fs';
import path from 'node:path';
import type { WorkLedger } from './contracts.js';

export interface TerminalGateResult {
  passed: boolean;
  gates: GateResult[];
  failedGates: string[];
  timestamp: string;
}

export interface GateResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  detail: string;
}

export const TERMINAL_GATES = [
  'ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED',
  'NO_PARTIAL_MISSING_DEVIATED_EXTRA',
  'ALL_AC_FRESH_INDEPENDENT_PASS',
  'LATEST_RECONCILIATION_BINDS_CURRENT_STATE',
  'NO_OPEN_FINDINGS',
  'NO_STALE_REVIEWS',
  'FIVE_HOST_ATTESTATIONS_BIND_FINAL_HEAD',
  'CI_QUALITY_PASS_ON_HEAD',
  'CI_CERTIFY_PASS_ON_HEAD',
] as const;

function readLedger(ledgerPath: string): WorkLedger {
  const resolved = path.resolve(ledgerPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Ledger does not exist: ${ledgerPath}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf-8')) as WorkLedger;
}

const PASSED_RECONCILIATION = new Set(['MATCH', 'SUPERSEDED']);
const BAD_RECONCILIATION = new Set(['PARTIAL', 'MISSING', 'DEVIATED', 'EXTRA']);

export function verifyTerminalGate(
  ledgerPath: string,
  headCommit: string,
  options: {
    hostAttestations: number;
    ciQualityPassed: boolean;
    ciCertifyPassed: boolean;
  }
): TerminalGateResult {
  const resolved = path.resolve(ledgerPath);
  if (!fs.existsSync(resolved)) {
    const gates = TERMINAL_GATES.map((name) => ({
      name,
      status: 'NOT_CHECKED' as const,
      detail: 'Ledger not found',
    }));
    return { passed: false, gates, failedGates: [...TERMINAL_GATES], timestamp: new Date().toISOString() };
  }

  const raw = readLedger(ledgerPath);
  const gates: GateResult[] = [];
  const failedGates: string[] = [];

  if (raw.status === 'ADOPTED') {
    for (const name of TERMINAL_GATES) {
      gates.push({
        name,
        status: name === 'ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED' ? 'FAIL' : 'NOT_CHECKED',
        detail: name === 'ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED'
          ? 'Ledger is still in ADOPTED state'
          : 'Skipped due to ADOPTED state',
      });
    }
    failedGates.push('ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED');
    return { passed: false, gates, failedGates, timestamp: new Date().toISOString() };
  }

  const allMatch = raw.reconciliations.length > 0 && raw.reconciliations.every((r) => PASSED_RECONCILIATION.has(r.status));
  gates.push({
    name: 'ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED',
    status: allMatch ? 'PASS' : 'FAIL',
    detail: allMatch
      ? `All ${raw.reconciliations.length} requirements reconciled`
      : raw.reconciliations.length === 0
        ? 'No reconciliations found'
        : `${raw.reconciliations.filter((r) => !PASSED_RECONCILIATION.has(r.status)).map((r) => `${r.requirementId}:${r.status}`).join(', ')}`,
  });
  if (!allMatch) failedGates.push('ALL_REQUIREMENTS_MATCH_OR_SUPERSEDED');

  const noBadStatus = raw.reconciliations.every((r) => !BAD_RECONCILIATION.has(r.status));
  gates.push({
    name: 'NO_PARTIAL_MISSING_DEVIATED_EXTRA',
    status: noBadStatus ? 'PASS' : 'FAIL',
    detail: noBadStatus
      ? 'No problematic reconciliations'
      : `${raw.reconciliations.filter((r) => BAD_RECONCILIATION.has(r.status)).map((r) => `${r.requirementId}:${r.status}`).join(', ')}`,
  });
  if (!noBadStatus) failedGates.push('NO_PARTIAL_MISSING_DEVIATED_EXTRA');

  const allAcVerified = raw.plan.requirements.every((req) =>
    req.acceptanceCriteria.every((ac) =>
      raw.verificationClaims.some(
        (vc) =>
          vc.criterionId === ac.criterionId &&
          vc.requirementId === req.requirementId &&
          vc.outcome === 'PASS' &&
          (() => {
            const receipt = raw.receipts.find((r) => r.receiptId === vc.receiptId);
            return receipt !== undefined && vc.verifierIdentity !== receipt.workerIdentity;
          })()
      )
    )
  );
  gates.push({
    name: 'ALL_AC_FRESH_INDEPENDENT_PASS',
    status: allAcVerified ? 'PASS' : 'FAIL',
    detail: allAcVerified ? 'All ACs have independent PASS verification' : 'Some ACs missing independent PASS verification',
  });
  if (!allAcVerified) failedGates.push('ALL_AC_FRESH_INDEPENDENT_PASS');

  const lr = raw.latestReview;
  const bindsCurrent = !lr.stale && lr.shadowRevision === raw.shadowRevision && lr.originalSha256 === raw.plan.original.sha256;
  gates.push({
    name: 'LATEST_RECONCILIATION_BINDS_CURRENT_STATE',
    status: bindsCurrent ? 'PASS' : 'FAIL',
    detail: bindsCurrent ? 'Reconciliation binds current state' : 'Reconciliation does not bind current state',
  });
  if (!bindsCurrent) failedGates.push('LATEST_RECONCILIATION_BINDS_CURRENT_STATE');

  const openFindings = raw.orphanFindings.filter((f) => f.status === 'OPEN');
  gates.push({
    name: 'NO_OPEN_FINDINGS',
    status: openFindings.length === 0 ? 'PASS' : 'FAIL',
    detail: openFindings.length === 0 ? 'No open findings' : `${openFindings.length} open: ${openFindings.map((f) => f.findingId).join(', ')}`,
  });
  if (openFindings.length > 0) failedGates.push('NO_OPEN_FINDINGS');

  const staleReceipts = raw.receipts.filter((r) => r.stale);
  gates.push({
    name: 'NO_STALE_REVIEWS',
    status: staleReceipts.length === 0 && !lr.stale ? 'PASS' : 'FAIL',
    detail: staleReceipts.length === 0 && !lr.stale
      ? 'No stale reviews'
      : `${staleReceipts.length} stale receipt(s), latest review stale=${lr.stale}`,
  });
  if (staleReceipts.length > 0 || lr.stale) failedGates.push('NO_STALE_REVIEWS');

  const atts = raw.attestations;
  const attsMatch = atts.length >= options.hostAttestations && atts.every((a) => a.commitSha === headCommit);
  gates.push({
    name: 'FIVE_HOST_ATTESTATIONS_BIND_FINAL_HEAD',
    status: attsMatch ? 'PASS' : 'FAIL',
    detail: attsMatch
      ? `${atts.length} attestations all bind ${headCommit.slice(0, 12)}`
      : `${atts.length}/${options.hostAttestations} attestations, not all bind ${headCommit.slice(0, 12)}`,
  });
  if (!attsMatch) failedGates.push('FIVE_HOST_ATTESTATIONS_BIND_FINAL_HEAD');

  gates.push({
    name: 'CI_QUALITY_PASS_ON_HEAD',
    status: options.ciQualityPassed ? 'PASS' : 'FAIL',
    detail: options.ciQualityPassed ? 'CI quality passed on head' : 'CI quality not passed on head',
  });
  if (!options.ciQualityPassed) failedGates.push('CI_QUALITY_PASS_ON_HEAD');

  gates.push({
    name: 'CI_CERTIFY_PASS_ON_HEAD',
    status: options.ciCertifyPassed ? 'PASS' : 'FAIL',
    detail: options.ciCertifyPassed ? 'CI certify passed on head' : 'CI certify not passed on head',
  });
  if (!options.ciCertifyPassed) failedGates.push('CI_CERTIFY_PASS_ON_HEAD');

  return {
    passed: failedGates.length === 0,
    gates,
    failedGates,
    timestamp: new Date().toISOString(),
  };
}

export function assertCertifiable(gateResult: TerminalGateResult): void {
  if (!gateResult.passed) {
    throw new Error(`Terminal gate FAILED on gates: ${gateResult.failedGates.join(', ')}`);
  }
}

export function assertNoResidualBeforeFinal(ledgerPath: string, _headCommit: string): void {
  const raw = readLedger(ledgerPath);
  const isRemediation = raw.status === 'needs-remediation';
  const openFindings = raw.orphanFindings.filter((f) => f.status === 'OPEN');

  if (isRemediation || openFindings.length > 0) {
    const message = isRemediation
      ? `Ledger is in needs-remediation state`
      : `${openFindings.length} open finding(s): ${openFindings.map((f) => f.findingId).join(', ')}`;

    console.error(`[terminal-gate] Residual before final: ${message}`);

    const resolved = path.resolve(ledgerPath);
    const updated = { ...raw, status: 'needs-remediation' as const };
    fs.writeFileSync(resolved, JSON.stringify(updated, null, 2), 'utf-8');

    throw new Error(`Cannot proceed: ${message}`);
  }
}

export function terminalGateCheck(ledgerPath: string, _headCommit: string): { passed: boolean; message: string } {
  try {
    const raw = readLedger(ledgerPath);
    const isRemediation = raw.status === 'needs-remediation';
    const openFindings = raw.orphanFindings.filter((f) => f.status === 'OPEN');

    const passed = !isRemediation && openFindings.length === 0;
    const message = passed
      ? 'No residual issues found'
      : isRemediation
        ? 'Ledger is in needs-remediation state'
        : `${openFindings.length} open finding(s)`;

    return { passed, message };
  } catch (err) {
    return { passed: false, message: `Error reading ledger: ${(err as Error).message}` };
  }
}
