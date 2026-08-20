import type { TraceabilityManifest } from './compiler.js';
import type { EvidenceRecord, TaskPacket, WorkRequest, WorkSpec } from './protocol.js';

export type SemanticAuditVerdict = 'PASS' | 'REJECT' | 'BLOCKED';
export interface SemanticAuditFinding { code: string; message: string; severity: 'critical' | 'major' | 'minor' }
export interface SemanticAuditResult { verdict: SemanticAuditVerdict; findings: SemanticAuditFinding[]; auditor_id: string }
export interface IndependentSemanticAuditor {
  id: string;
  audit(input: {
    request: WorkRequest;
    spec: WorkSpec;
    manifest: TraceabilityManifest;
    packets: readonly TaskPacket[];
    evidence: readonly EvidenceRecord[];
    changedFiles: readonly string[];
  }): SemanticAuditResult | Promise<SemanticAuditResult>;
}

const STOP = new Set('the a an and or to of in on for with from by is are be as at this that these those implement add fix make update change ensure support using use into should must can will'.split(' '));
function terms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu)?.filter((t) => !STOP.has(t)) ?? [])];
}

/**
 * Conservative built-in intent/spec coverage signal. It can reject obvious semantic
 * drift but is deliberately incapable of declaring semantic success on its own.
 */
export function auditIntentCoverage(request: WorkRequest, spec: WorkSpec): SemanticAuditResult {
  const intentTerms = terms([request.raw_intent, ...(request.explicit_constraints ?? [])].join(' '));
  const specText = [
    ...spec.requirements.map((r) => r.statement), ...(spec.constraints ?? []), ...(spec.non_goals ?? []),
    ...(spec.known ?? []), ...(spec.decisions ?? []), ...(spec.unresolved ?? []),
  ].join(' ').toLowerCase();
  const uncovered = intentTerms.filter((term) => !specText.includes(term));
  const ratio = intentTerms.length ? uncovered.length / intentTerms.length : 0;
  const findings: SemanticAuditFinding[] = [];
  if (intentTerms.length >= 4 && ratio > 0.45) {
    findings.push({ code: 'INTENT_SPEC_DRIFT', severity: 'major', message: `spec may omit intent concepts (${uncovered.slice(0, 8).join(', ')})` });
  }
  for (const constraint of request.explicit_constraints ?? []) {
    if (!(spec.constraints ?? []).includes(constraint)) findings.push({ code: 'CONSTRAINT_DROPPED', severity: 'critical', message: `explicit constraint missing from WorkSpec: ${constraint}` });
  }
  for (const nonGoal of request.explicit_non_goals ?? []) {
    if (!(spec.non_goals ?? []).includes(nonGoal)) findings.push({ code: 'NON_GOAL_DROPPED', severity: 'critical', message: `explicit non-goal missing from WorkSpec: ${nonGoal}` });
  }
  return { verdict: findings.some((f) => f.severity === 'critical') ? 'REJECT' : 'BLOCKED', findings, auditor_id: 'builtin-intent-coverage' };
}
