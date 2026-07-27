import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

export function verifyTerminalGate(
  ledgerPath: string,
  headCommit: string,
  ciQualityReceipt?: { passed: boolean; runUrl?: string },
  ciCertifyReceipt?: { passed: boolean; runUrl?: string }
): TerminalGateResult {
  const resolved = path.resolve(ledgerPath);
  const gates: GateResult[] = [];
  const failedGates: string[] = [];

  if (!fs.existsSync(resolved)) {
    const g = { name: 'LEDGER_EXISTS', status: 'FAIL' as const, detail: 'Ledger not found' };
    return { passed: false, gates: [g], failedGates: ['LEDGER_EXISTS'], timestamp: new Date().toISOString() };
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  const state = raw.execution_state || raw.status || '';
  const isCompleted = state === 'COMPLETED';
  gates.push({ name: 'EXECUTION_STATE_COMPLETED', status: isCompleted ? 'PASS' : 'FAIL', detail: `State: ${state}` });
  if (!isCompleted) failedGates.push('EXECUTION_STATE_COMPLETED');

  const findings = raw.findings || raw.orphanFindings || [];
  const openF = findings.filter((f: any) => f.status && f.status.includes('OPEN'));
  gates.push({ name: 'NO_OPEN_FINDINGS', status: openF.length === 0 ? 'PASS' : 'FAIL', detail: openF.length === 0 ? '0 open' : `${openF.length} open` });
  if (openF.length > 0) failedGates.push('NO_OPEN_FINDINGS');

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

  const atts = raw.attestations || [];
  const hasAllHosts = REQUIRED_HOSTS.every((h) => atts.some((a: any) => a.host === h));
  const allBindHead = atts.length > 0 && atts.every((a: any) => a.commitSha === headCommit);
  gates.push({ name: 'FIVE_HOST_ATTESTATIONS', status: hasAllHosts && allBindHead ? 'PASS' : 'FAIL', detail: hasAllHosts ? `${atts.length} attestations, all bind ${headCommit.slice(0, 12)}` : `Missing hosts: ${REQUIRED_HOSTS.filter((h) => !atts.some((a: any) => a.host === h)).join(', ')}` });
  if (!hasAllHosts || !allBindHead) failedGates.push('FIVE_HOST_ATTESTATIONS');

  if (ciQualityReceipt) {
    gates.push({ name: 'CI_QUALITY', status: ciQualityReceipt.passed ? 'PASS' : 'FAIL', detail: ciQualityReceipt.passed ? `PASS${ciQualityReceipt.runUrl ? ` ${ciQualityReceipt.runUrl}` : ''}` : 'FAIL' });
    if (!ciQualityReceipt.passed) failedGates.push('CI_QUALITY');
  }

  if (ciCertifyReceipt) {
    gates.push({ name: 'CI_CERTIFY', status: ciCertifyReceipt.passed ? 'PASS' : 'FAIL', detail: ciCertifyReceipt.passed ? `PASS${ciCertifyReceipt.runUrl ? ` ${ciCertifyReceipt.runUrl}` : ''}` : 'FAIL' });
    if (!ciCertifyReceipt.passed) failedGates.push('CI_CERTIFY');
  }

  const anchors = raw.plan_anchors || [];
  gates.push({ name: 'PLAN_ANCHORS_DEFINED', status: anchors.length >= 25 ? 'PASS' : 'FAIL', detail: `${anchors.length} anchors` });
  if (anchors.length < 25) failedGates.push('PLAN_ANCHORS_DEFINED');

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
