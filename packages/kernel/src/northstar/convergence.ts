import type { AcceptanceAudit } from './acceptance-audit.js';
import type { AcceptanceResult } from './evidence-ledger.js';
import type { RunState, TaskPacket, WorkSpec } from './protocol.js';

export type ConvergenceSeverity = 'critical' | 'major' | 'minor';
export interface ConvergenceGap { id: string; severity: ConvergenceSeverity; reason: string; claim_id?: string; requirement_id?: string }
export interface ConvergenceResult {
  converged: boolean;
  gaps: ConvergenceGap[];
  delta_tasks: Array<{ id: string; goal: string; anchors: string[] }>;
  /** Set by the bounded runtime when a prior gap state recurs unchanged. */
  oscillation_detected?: boolean;
  oscillation_fingerprint?: string;
}

export interface ConvergenceDeltaCompilation {
  packets: TaskPacket[];
  skipped: Array<{ gap_id: string; reason: string }>;
}

/**
 * Produce a stable identity for the unresolved convergence state.
 *
 * Reasons are included deliberately: the same claim can fail for a different
 * root cause and should receive one more bounded repair opportunity before the
 * oscillation guard stops the loop.
 */
export function convergenceFingerprint(result: Pick<ConvergenceResult, 'gaps'>): string {
  return JSON.stringify([...result.gaps]
    .map((gap) => ({
      id: gap.id,
      severity: gap.severity,
      reason: gap.reason,
      claim_id: gap.claim_id ?? null,
      requirement_id: gap.requirement_id ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)));
}

export interface ConvergenceOscillation {
  detected: boolean;
  fingerprint?: string;
  first_index?: number;
  repeat_index?: number;
}

/** Detect an unchanged gap state across bounded convergence passes. */
export function detectConvergenceOscillation(history: readonly ConvergenceResult[]): ConvergenceOscillation {
  const seen = new Map<string, number>();
  for (const [index, result] of history.entries()) {
    const fingerprint = convergenceFingerprint(result);
    const first = seen.get(fingerprint);
    if (first !== undefined) return { detected: true, fingerprint, first_index: first, repeat_index: index };
    seen.set(fingerprint, index);
  }
  return { detected: false };
}

/** Read-only completeness audit. It proposes bounded delta work; it never edits source/spec. */
export function assessConvergence(input: {
  spec: WorkSpec;
  packets: readonly TaskPacket[];
  acceptance: AcceptanceResult;
  audit: AcceptanceAudit;
  state?: RunState;
}): ConvergenceResult {
  const gaps: ConvergenceGap[] = [];
  const routedClaims = new Set(input.packets.flatMap((p) => p.acceptance.map((a) => a.claim_id)));
  for (const requirement of input.spec.requirements) {
    for (const claim of requirement.claims) {
      if (!routedClaims.has(claim)) gaps.push({ id: `UNROUTED:${claim}`, severity: 'critical', reason: 'claim has no TaskPacket route', claim_id: claim, requirement_id: requirement.id });
      else if (input.acceptance.failed_claims.includes(claim)) gaps.push({ id: `FAILED:${claim}`, severity: 'critical', reason: 'claim has failing evidence', claim_id: claim, requirement_id: requirement.id });
      else if (input.acceptance.unresolved_claims.includes(claim)) gaps.push({ id: `UNRESOLVED:${claim}`, severity: requirement.mandatory ? 'critical' : 'major', reason: 'claim is unresolved', claim_id: claim, requirement_id: requirement.id });
    }
  }
  input.audit.findings.forEach((finding, index) => gaps.push({ id: `AUDIT:${index + 1}`, severity: 'critical', reason: finding }));
  if (input.state) {
    for (const [taskId, status] of Object.entries(input.state.tasks)) {
      if (status === 'failed' || status === 'blocked') gaps.push({ id: `TASK:${taskId}`, severity: 'major', reason: `task truth is ${status}` });
    }
  }
  const unique = [...new Map(gaps.map((gap) => [gap.id, gap])).values()];
  const delta = unique.map((gap, index) => ({ id: `DELTA-${String(index + 1).padStart(3, '0')}`, goal: `Resolve convergence gap ${gap.id}: ${gap.reason}`, anchors: [gap.requirement_id, gap.claim_id].filter((v): v is string => !!v) }));
  return { converged: unique.length === 0, gaps: unique, delta_tasks: delta };
}

/**
 * Turn only claim-grounded convergence gaps into bounded executable packets.
 *
 * This is deliberately a compiler seam, not an acceptance shortcut: gaps that
 * have no claim/requirement anchor remain skipped and therefore keep the run
 * non-converged. A delta packet inherits the original packet's verifier and
 * scope, so a repair cannot widen authority or invent an oracle.
 */
export function compileConvergenceDeltaPackets(input: {
  spec: WorkSpec;
  packets: readonly TaskPacket[];
  result: ConvergenceResult;
  pass: number;
  maxTasks?: number;
}): ConvergenceDeltaCompilation {
  if (!Number.isInteger(input.pass) || input.pass < 1) throw new Error('convergence delta pass must be an integer >= 1');
  const limit = input.maxTasks ?? 6;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('convergence delta maxTasks must be an integer >= 1');

  const byClaim = new Map<string, TaskPacket>();
  for (const packet of input.packets) {
    for (const acceptance of packet.acceptance) {
      if (!byClaim.has(acceptance.claim_id)) byClaim.set(acceptance.claim_id, packet);
    }
  }
  const failedClaims = new Set(input.result.gaps.filter((gap) => gap.id.startsWith('FAILED:') && gap.claim_id).map((gap) => gap.claim_id!));
  const packets: TaskPacket[] = [];
  const skipped: Array<{ gap_id: string; reason: string }> = [];
  for (const [index, gap] of input.result.gaps.entries()) {
    if (packets.length >= limit) {
      skipped.push({ gap_id: gap.id, reason: `delta task budget ${limit} exhausted` });
      continue;
    }
    if (!gap.claim_id) {
      skipped.push({ gap_id: gap.id, reason: 'gap has no claim anchor; requires semantic/owner resolution' });
      continue;
    }
    // The production Runner already owns bounded verifier-failure repair. Do not
    // mint a second convergence task for the same failed claim after that chain
    // has exhausted its evidence; the terminal failure must stay singular.
    if (gap.id.startsWith('FAILED:')) {
      skipped.push({ gap_id: gap.id, reason: 'verifier failure is handled by the bounded Runner repair chain' });
      continue;
    }
    const source = byClaim.get(gap.claim_id);
    if (!source) {
      skipped.push({ gap_id: gap.id, reason: `claim ${gap.claim_id} has no existing TaskPacket to repair` });
      continue;
    }
    const acceptance = source.acceptance.filter((entry) => entry.claim_id === gap.claim_id);
    if (acceptance.length === 0) {
      skipped.push({ gap_id: gap.id, reason: `claim ${gap.claim_id} is not accepted by its source TaskPacket` });
      continue;
    }
    if (source.acceptance.some((entry) => failedClaims.has(entry.claim_id))) {
      skipped.push({ gap_id: gap.id, reason: 'source TaskPacket has a failed prerequisite claim; preserve fail-fast ordering' });
      continue;
    }
    const id = `T-DELTA-${input.spec.revision}-${input.pass}-${String(index + 1).padStart(3, '0')}`;
    packets.push({
      ...source,
      task_id: id,
      goal: `Resolve convergence gap ${gap.id}: ${gap.reason}`,
      acceptance,
      constraints: [...new Set([...(source.constraints ?? []), 'Change only what is required to resolve the anchored convergence gap.'])],
      stop_if: [...new Set([...(source.stop_if ?? []), 'Stop if the gap cannot be resolved from the existing claim, scope, and verifier.'])],
      repair: {
        attempt: (source.repair?.attempt ?? 0) + input.pass,
        previous_failure: gap.reason,
      },
    });
  }
  return { packets, skipped };
}
