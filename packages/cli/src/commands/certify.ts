import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ExitCode, type CliOptions, type CommandResult } from '../types.js';
import { compilePlanReadiness } from '@initforge/agent-rules-engine/plan-readiness';
import {
  evaluateNorthStarClosure,
  type NorthStarClosureInput,
  type NorthStarClosureReport,
} from '@initforge/agent-rules-engine/northstar/closure-gates';

const GATE_KEYS: Array<keyof NorthStarClosureInput> = [
  'primary_outcome_achieved',
  'contract_traceability',
  'deterministic_acceptance',
  'independent_semantic_review',
  'convergence_audit',
  'spec_revision_invalidation',
  'proof_dag',
  'context_feedback_loop',
  'bounded_skill_capability_surface',
  'empirical_model_routing',
  'crash_resume',
  'forbidden_scope_enforcement',
  'evidence_integrity',
  'false_green_rejection',
  'resource_governance',
  'platform_portability',
  'browser_visual_live',
  'mobile_live',
  'lower_tier_ablation',
  'clean_host_full_suite',
];

export interface ClosureEvidenceFile {
  schema?: 'harness/closure-evidence/v1';
  plan_id?: string;
  head_commit?: string;
  effective_plan_identity?: string;
  gates?: Partial<Record<keyof NorthStarClosureInput, boolean | null>>;
}

export interface CertificationReport {
  planId: string;
  source_complete: boolean;
  fully_certified: boolean;
  evidence_status: 'PRESENT' | 'MISSING' | 'INVALID';
  evidence_hash: string | null;
  readiness: {
    state: string;
    requirementCount: number;
    reasons: string[];
  } | null;
  derived: {
    contract_traceability: boolean;
    pointer_generation: number | null;
    requirement_count: number;
  };
  gates: NorthStarClosureReport['gates'];
  failures: string[];
  blockers: string[];
  reasons: string[];
}

function rootFromArgs(args: string[]): { root: string; planId?: string; evidencePath?: string } {
  const positional: string[] = [];
  let evidencePath: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--evidence') {
      evidencePath = args[++i];
    } else if (!args[i].startsWith('--')) {
      positional.push(args[i]);
    }
  }
  return { root: path.resolve(positional[1] ?? process.cwd()), planId: positional[0], evidencePath };
}

function headCommit(root: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 15_000 }).trim() || null;
  } catch {
    return null;
  }
}

function emptyClosureInput(): NorthStarClosureInput {
  return {
    primary_outcome_achieved: null as unknown as boolean,
    contract_traceability: null as unknown as boolean,
    deterministic_acceptance: null as unknown as boolean,
    independent_semantic_review: null,
    convergence_audit: null as unknown as boolean,
    spec_revision_invalidation: null as unknown as boolean,
    proof_dag: null as unknown as boolean,
    context_feedback_loop: null as unknown as boolean,
    bounded_skill_capability_surface: null as unknown as boolean,
    empirical_model_routing: null,
    crash_resume: null as unknown as boolean,
    forbidden_scope_enforcement: null as unknown as boolean,
    evidence_integrity: null as unknown as boolean,
    false_green_rejection: null as unknown as boolean,
    resource_governance: null as unknown as boolean,
    platform_portability: null,
    browser_visual_live: null,
    mobile_live: null,
    lower_tier_ablation: null,
    clean_host_full_suite: null,
  };
}

function validGateValue(value: unknown): value is boolean | null {
  return value === true || value === false || value === null;
}

export function evaluateCertificationEvidence(
  evidence: ClosureEvidenceFile | null,
  derivedTraceability: boolean,
): NorthStarClosureReport {
  const input = emptyClosureInput();
  input.contract_traceability = derivedTraceability;
  for (const key of GATE_KEYS) {
    if (key === 'contract_traceability') continue;
    const value = evidence?.gates?.[key];
    if (validGateValue(value)) input[key] = value as never;
  }
  return evaluateNorthStarClosure(input);
}

function readEvidence(root: string, planId: string, requested?: string): {
  evidence: ClosureEvidenceFile | null;
  status: CertificationReport['evidence_status'];
  hash: string | null;
  reason?: string;
} {
  const file = path.resolve(root, requested ?? '.agent/evidence/closure.json');
  if (!fs.existsSync(file)) return { evidence: null, status: 'MISSING', hash: null, reason: `closure evidence not found: ${path.relative(root, file)}` };
  try {
    const bytes = fs.readFileSync(file);
    const parsed = JSON.parse(bytes.toString('utf8')) as ClosureEvidenceFile;
    if (parsed.schema !== 'harness/closure-evidence/v1') throw new Error('schema must be harness/closure-evidence/v1');
    if (parsed.plan_id !== undefined && parsed.plan_id !== planId) throw new Error(`plan_id ${parsed.plan_id} does not match ${planId}`);
    if (parsed.head_commit !== undefined && parsed.head_commit !== headCommit(root)) throw new Error('head_commit does not match repository HEAD');
    if (parsed.effective_plan_identity !== undefined && !/^[a-f0-9]{64}$/i.test(parsed.effective_plan_identity)) throw new Error('effective_plan_identity must be a SHA-256 hex string');
    for (const [key, value] of Object.entries(parsed.gates ?? {})) {
      if (!GATE_KEYS.includes(key as keyof NorthStarClosureInput)) throw new Error(`unknown closure gate ${key}`);
      if (!validGateValue(value)) throw new Error(`closure gate ${key} must be true, false, or null`);
    }
    return { evidence: parsed, status: 'PRESENT', hash: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) {
    return { evidence: null, status: 'INVALID', hash: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function certifyCmd(args: string[], _opts: CliOptions): Promise<CommandResult> {
  const parsed = rootFromArgs(args);
  const root = parsed.root;
  const pointerPath = path.join(root, '.agent', 'current.json');
  if (!fs.existsSync(pointerPath)) return { exitCode: ExitCode.GeneralError, message: `current pointer not found: ${pointerPath}` };

  try {
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as Record<string, any>;
    const planId = parsed.planId ?? pointer.plan_id;
    if (planId !== pointer.plan_id) return { exitCode: ExitCode.GeneralError, message: `requested plan ${planId} is not the active plan ${pointer.plan_id}` };
    const ledgerPath = path.join(root, '.agent', 'ledger', `${planId}.json`);
    const planDir = path.join(root, '.agent', 'plans', planId);
    const originalPath = path.join(planDir, 'original.md');
    let readiness: CertificationReport['readiness'] = null;
    let readinessIds: string[] = [];
    try {
      const compiled = compilePlanReadiness({ ledgerPath, planDir, originalPath, headCommit: headCommit(root) ?? undefined });
      readiness = { state: compiled.readinessState, requirementCount: compiled.requirementCount, reasons: compiled.reasons };
      readinessIds = compiled.requirements.map((row) => row.requirement_id);
    } catch (error) {
      readiness = { state: 'NOT_READY', requirementCount: 0, reasons: [error instanceof Error ? error.message : String(error)] };
    }
    const pointerIds = Array.isArray(pointer.contract?.requirement_ids) ? pointer.contract.requirement_ids : [];
    const derivedTraceability = readinessIds.length > 0 && pointerIds.length === readinessIds.length && pointerIds.every((id: string, i: number) => id === readinessIds[i]);
    const evidence = readEvidence(root, planId, parsed.evidencePath);
    const closure = evaluateCertificationEvidence(evidence.evidence, derivedTraceability);
    const reasons = [...closure.failures, ...closure.blockers];
    if (evidence.reason) reasons.push(evidence.reason);
    const report: CertificationReport = {
      planId,
      source_complete: closure.source_complete,
      fully_certified: closure.release_ready,
      evidence_status: evidence.status,
      evidence_hash: evidence.hash,
      readiness,
      derived: { contract_traceability: derivedTraceability, pointer_generation: pointer.generation ?? null, requirement_count: readinessIds.length },
      gates: closure.gates,
      failures: closure.failures,
      blockers: closure.blockers,
      reasons,
    };
    return {
      exitCode: report.fully_certified ? ExitCode.Success : ExitCode.GeneralError,
      message: report.fully_certified ? `${planId}: FULLY_CERTIFIED` : `${planId}: ${report.source_complete ? 'SOURCE_COMPLETE' : 'SOURCE_INCOMPLETE'}; FULLY_CERTIFIED not proven`,
      data: report as unknown as Record<string, unknown>,
    };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: `Certification failed closed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
