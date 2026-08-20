import { createHash } from 'node:crypto';

/**
 * REQ-016 — trajectory supervisor.
 *
 * Extends heartbeat/resource governance with trajectory analysis: it detects
 * repeated tool/read sequences (loops), no-progress, retry storms, budget
 * exhaustion and orphan-process signals, and returns a pause/repair/stop
 * decision with a bounded reason receipt. Shared mutations stay serialized by
 * the runner; this supervisor only decides, it never mutates.
 */

export interface TrajectoryEvent {
  seq: number;
  /** Event kind: 'tool_call' | 'read' | 'write' | 'verify' | 'error' | 'progress' | 'orphan_process'. */
  kind: string;
  /** Canonical signature of the event (e.g. tool name + hash of its args). */
  signature: string;
  /** Whether the event reported a failure/error outcome. */
  failed?: boolean;
  at: string;
}

export interface TrajectoryBudgets {
  max_steps?: number;
  max_tool_calls?: number;
  max_retries?: number;
  max_repair_rounds?: number;
}

export interface TrajectorySupervisionInput {
  events: TrajectoryEvent[];
  budgets?: TrajectoryBudgets;
  /** Retry/wall-clock metadata from the heartbeat. */
  attempt?: number;
  duration_ms?: number;
}

export type SupervisionAction = 'continue' | 'pause' | 'repair' | 'stop';

export interface SupervisionDetected {
  signal: string;
  detail: string;
  evidence: string[];
}

export interface SupervisionDecision {
  schema: 'agent-rules/trajectory-supervision-decision';
  version: 1;
  action: SupervisionAction;
  reason: string;
  detected: SupervisionDetected[];
  decision_id: string;
  decided_at: string;
  receipt_sha256: string;
}

export const DEFAULTS = {
  loopRepeat: 4,
  loopWindow: 8,
  retryStormThreshold: 5,
  noProgressThreshold: 6,
};

/**
 * Analyse a bounded trajectory window and decide. Deterministic: the same
 * event stream yields the same decision. `continue` is the only default; every
 * other action must be justified by a detected signal.
 */
export function superviseTrajectory(input: TrajectorySupervisionInput): SupervisionDecision {
  const events = [...input.events];
  const detected: SupervisionDetected[] = [];
  const budgets = input.budgets ?? {};

  // Budget exhaustion.
  const toolCalls = events.filter((event) => event.kind === 'tool_call');
  if (budgets.max_steps !== undefined && events.length >= budgets.max_steps) {
    detected.push({ signal: 'budget_exhaustion', detail: `trajectory reached max_steps ${budgets.max_steps}`, evidence: [`steps=${events.length}`] });
  }
  if (budgets.max_tool_calls !== undefined && toolCalls.length >= budgets.max_tool_calls) {
    detected.push({ signal: 'budget_exhaustion', detail: `trajectory reached max_tool_calls ${budgets.max_tool_calls}`, evidence: [`tool_calls=${toolCalls.length}`] });
  }

  // Retry storm: the same failing signature repeated.
  const failureCounts = new Map<string, number>();
  const failureSeqs = new Map<string, number[]>();
  for (const event of events) {
    if (!event.failed) continue;
    failureCounts.set(event.signature, (failureCounts.get(event.signature) ?? 0) + 1);
    failureSeqs.set(event.signature, [...(failureSeqs.get(event.signature) ?? []), event.seq]);
  }
  const stormThreshold = budgets.max_retries ?? DEFAULTS.retryStormThreshold;
  for (const [signature, count] of failureCounts) {
    if (count >= stormThreshold) {
      detected.push({ signal: 'retry_storm', detail: `signature failed ${count} times`, evidence: failureSeqs.get(signature)!.map((seq) => `seq:${seq}`) });
    }
  }

  // Repeated tool/read sequence (loop): a short cycle or a single signature
  // dominating the window.
  const window = events.slice(-DEFAULTS.loopWindow);
  const signatureCounts = new Map<string, number>();
  for (const event of window) {
    if (event.kind === 'tool_call' || event.kind === 'read') {
      signatureCounts.set(event.signature, (signatureCounts.get(event.signature) ?? 0) + 1);
    }
  }
  for (const [signature, count] of signatureCounts) {
    if (count >= DEFAULTS.loopRepeat) {
      detected.push({ signal: 'repeated_sequence', detail: `signature ${signature.slice(0, 40)} repeated ${count} times in the last ${DEFAULTS.loopWindow} events`, evidence: window.filter((event) => event.signature === signature).map((event) => `seq:${event.seq}:${event.kind}`) });
    }
  }
  detectCycle(window, detected);

  // No progress: many events but no progress/write/verify marker.
  const progress = events.filter((event) => event.kind === 'progress' || event.kind === 'write' || event.kind === 'verify');
  if (events.length >= DEFAULTS.noProgressThreshold && progress.length === 0 && detected.length === 0) {
    detected.push({ signal: 'no_progress', detail: `${events.length} events with no progress/write/verify marker`, evidence: events.slice(-DEFAULTS.noProgressThreshold).map((event) => `seq:${event.seq}:${event.kind}`) });
  }

  // Orphan process: an explicit orphan signal.
  const orphan = events.filter((event) => event.kind === 'orphan_process');
  if (orphan.length > 0) {
    detected.push({ signal: 'orphan_process', detail: `${orphan.length} orphan-process event(s)`, evidence: orphan.map((event) => `seq:${event.seq}`) });
  }

  const decision = decideAction(detected);
  const decidedAt = new Date().toISOString();
  // Deterministic decision identity from content; the timestamp is metadata and
  // is excluded from the receipt hash so identical streams hash identically.
  const decisionBody = {
    schema: 'agent-rules/trajectory-supervision-decision' as const,
    version: 1 as const,
    action: decision.action,
    reason: decision.reason,
    detected,
    decided_at: decidedAt,
  };
  const decision_id = `sup-${createHash('sha256').update(JSON.stringify({ action: decision.action, reason: decision.reason, detected })).digest('hex').slice(0, 12)}`;
  const receiptBody = { ...decisionBody, decision_id };
  return {
    ...receiptBody,
    receipt_sha256: createHash('sha256').update(JSON.stringify({ ...receiptBody, decided_at: undefined })).digest('hex'),
  };
}

/** A repeated short cycle (length 2..3) inside the window is a loop. */
function detectCycle(window: TrajectoryEvent[], detected: SupervisionDetected[]): void {
  for (let length = 2; length <= 3; length += 1) {
    const signatures = window.map((event) => event.signature);
    for (let start = 0; start + length * 2 <= signatures.length; start += 1) {
      const cycle = signatures.slice(start, start + length).join('|');
      const next = signatures.slice(start + length, start + length * 2).join('|');
      if (cycle === next) {
        detected.push({
          signal: 'repeated_sequence',
          detail: `cycle of length ${length} repeated consecutively`,
          evidence: window.slice(start, start + length * 2).map((event) => `seq:${event.seq}:${event.signature.slice(0, 24)}`),
        });
        return;
      }
    }
  }
}

function decideAction(detected: SupervisionDetected[]): { action: SupervisionAction; reason: string } {
  const signals = new Set(detected.map((item) => item.signal));
  if (signals.has('budget_exhaustion') || signals.has('orphan_process')) {
    return { action: 'stop', reason: `stop: ${[...signals].join(', ')}` };
  }
  if (signals.has('retry_storm')) {
    return { action: 'stop', reason: `stop: retry storm — bounded repair would not converge; reason receipt required` };
  }
  if (signals.has('no_progress')) {
    return { action: 'pause', reason: `pause: no progress across the trajectory; operator/repair input needed` };
  }
  if (signals.has('repeated_sequence')) {
    return { action: 'repair', reason: `repair: repeated tool/read sequence detected; break the loop with a bounded repair packet` };
  }
  return { action: 'continue', reason: 'no supervision signal; continue' };
}
