import fs from 'node:fs';
import path from 'node:path';

export interface TerminalGateResult {
  passed: boolean;
  gates: GateResult[];
  timestamp: string;
}

export interface GateResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'NOT_CHECKED';
  detail: string;
}

export function verifyTerminalGate(
  ledgerPath: string,
  headCommit: string,
  options: { hostAttestations: number; ciQualityPassed: boolean; ciCertifyPassed: boolean }
): TerminalGateResult {
  const resolved = path.resolve(ledgerPath);
  if (!fs.existsSync(resolved)) {
    return { passed: false, gates: [{ name: 'LEDGER_EXISTS', status: 'FAIL', detail: 'Ledger not found' }], timestamp: new Date().toISOString() };
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  const gates: GateResult[] = [];
  const failedGates: string[] = [];

  // Gate 1: Not ADOPTED
  const notAdopted = raw.status !== 'ADOPTED' && raw.execution_state !== 'ADOPTED';
  gates.push({ name: 'NOT_ADOPTED', status: notAdopted ? 'PASS' : 'FAIL', detail: notAdopted ? `State: ${raw.status || raw.execution_state}` : 'Ledger still ADOPTED' });
  if (!notAdopted) failedGates.push('NOT_ADOPTED');

  // Gate 2: Open findings = 0
  const allFindings = raw.findings || raw.orphanFindings || [];
  const openFindings = allFindings.filter((f: any) => f.status && f.status.includes('OPEN'));
  const noOpen = openFindings.length === 0;
  gates.push({ name: 'NO_OPEN_FINDINGS', status: noOpen ? 'PASS' : 'FAIL', detail: noOpen ? '0 open findings' : `${openFindings.length} open: ${openFindings.map((f: any) => f.finding_id || f.findingId).join(', ')}` });
  if (!noOpen) failedGates.push('NO_OPEN_FINDINGS');

  // Gate 3: Latest reconciliation binds current
  const reconciliations = raw.reconciliations || [];
  const latestRec = reconciliations.length > 0 ? reconciliations[reconciliations.length - 1] : null;
  const recFresh = latestRec && (latestRec.status === 'MATCH' || latestRec.status === 'PASS' || latestRec.result?.includes('MATCH'));
  gates.push({ name: 'LATEST_RECONCILIATION_FRESH', status: recFresh ? 'PASS' : 'FAIL', detail: recFresh ? `Latest: ${latestRec.status || latestRec.result}` : 'No fresh reconciliation' });
  if (!recFresh) failedGates.push('LATEST_RECONCILIATION_FRESH');

  // Gate 4: Host attestations
  const atts = raw.attestations || [];
  const attsMatch = atts.length >= options.hostAttestations;
  gates.push({ name: 'HOST_ATTESTATIONS', status: attsMatch ? 'PASS' : 'FAIL', detail: attsMatch ? `${atts.length} attestations` : `${atts.length}/${options.hostAttestations}` });
  if (!attsMatch) failedGates.push('HOST_ATTESTATIONS');

  // Gate 5: CI quality
  gates.push({ name: 'CI_QUALITY', status: options.ciQualityPassed ? 'PASS' : 'FAIL', detail: options.ciQualityPassed ? 'PASS on HEAD' : 'Not passed' });
  if (!options.ciQualityPassed) failedGates.push('CI_QUALITY');

  // Gate 6: CI certify
  gates.push({ name: 'CI_CERTIFY', status: options.ciCertifyPassed ? 'PASS' : 'FAIL', detail: options.ciCertifyPassed ? 'PASS on HEAD' : 'Not passed' });
  if (!options.ciCertifyPassed) failedGates.push('CI_CERTIFY');

  // Gate 7: No stale evidence
  const hasFresh = raw.audit_events?.length > 0;
  gates.push({ name: 'EVIDENCE_FRESH', status: hasFresh ? 'PASS' : 'FAIL', detail: hasFresh ? `${raw.audit_events.length} audit events` : 'No audit events' });
  if (!hasFresh) failedGates.push('EVIDENCE_FRESH');

  // Gate 8: Reconciliation counts
  const reqCount = raw.plan_anchors?.length || 0;
  const hasReq = reqCount > 0;
  gates.push({ name: 'REQUIREMENTS_DEFINED', status: hasReq ? 'PASS' : 'FAIL', detail: hasReq ? `${reqCount} anchors` : 'No plan anchors' });
  if (!hasReq) failedGates.push('REQUIREMENTS_DEFINED');

  return {
    passed: failedGates.length === 0,
    gates,
    timestamp: new Date().toISOString(),
  };
}
