import type { TraceabilityManifest } from './compiler.js';
import type { AcceptanceResult } from './evidence-ledger.js';
import type { EvidenceRecord, TaskPacket, WorkRequest, WorkSpec } from './protocol.js';
import { validateTraceability } from './protocol.js';
import { auditIntentCoverage, type SemanticAuditResult } from './semantic-auditor.js';

export interface AcceptanceAudit {
  accepted: boolean;
  findings: string[];
}

/** Independent semantic seam around deterministic gates; never upgrades a failure. */
export function auditAcceptance(input: {
  request: WorkRequest;
  spec: WorkSpec;
  manifest: TraceabilityManifest;
  packets: TaskPacket[];
  evidence: EvidenceRecord[];
  acceptance: AcceptanceResult;
  semanticReview?: SemanticAuditResult;
}): AcceptanceAudit {
  const findings: string[] = [];
  const intentAudit = auditIntentCoverage(input.request, input.spec);
  if (intentAudit.verdict === 'REJECT') findings.push(...intentAudit.findings.map((f) => `${f.code}:${f.message}`));
  if (input.semanticReview && input.semanticReview.verdict !== 'PASS') {
    findings.push(...input.semanticReview.findings.map((f) => `semantic-review:${f.code}:${f.message}`));
    if (input.semanticReview.verdict === 'BLOCKED' && input.semanticReview.findings.length === 0) findings.push('semantic-review:blocked without positive semantic proof');
  }
  const trace = validateTraceability(input.spec, input.packets);
  if (!trace.valid) findings.push(...trace.problems.map((problem) => `${problem.code}:${problem.id}`));
  if (input.spec.work_id !== input.request.work_id) findings.push('spec/work request identity mismatch');
  if (input.manifest.spec_id !== input.spec.spec_id || input.manifest.spec_revision !== input.spec.revision) findings.push('manifest revision mismatch');
  if (input.acceptance.outcome !== 'PASS') findings.push(`deterministic acceptance is ${input.acceptance.outcome}`);
  if (input.acceptance.unresolved_claims.length) findings.push(`unresolved claims: ${input.acceptance.unresolved_claims.join(', ')}`);
  const evidenceClaims = new Set(input.evidence.filter((item) => item.status === 'pass').map((item) => item.claim_id));
  const mandatoryClaims = input.spec.requirements.filter((r) => r.mandatory).flatMap((r) => r.claims);
  for (const claim of mandatoryClaims) if (!evidenceClaims.has(claim)) findings.push(`mandatory claim lacks passing evidence: ${claim}`);
  return { accepted: findings.length === 0, findings };
}
