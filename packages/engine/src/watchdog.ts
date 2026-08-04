export type WatchdogState = 'RUNNING' | 'SOFT_STALLED' | 'HARD_STALLED' | 'COMPLETED' | 'ESCALATED';

export interface SemanticProgressObservation {
  /** Changes only when the child advances a meaningful artifact, claim, command, or phase. */
  readonly cursor: string;
  readonly phase: string;
  readonly observedAt: number;
  readonly detail?: string;
}

export interface SemanticWatchdogConfig {
  readonly softStallMs: number;
  readonly hardStallMs: number;
  readonly pollIntervalMs: number;
  readonly maxReassignments: number;
}

export const DEFAULT_SEMANTIC_WATCHDOG_CONFIG: SemanticWatchdogConfig = Object.freeze({
  softStallMs: 5 * 60_000,
  hardStallMs: 8 * 60_000,
  pollIntervalMs: 30_000,
  maxReassignments: 1,
});

export type WatchdogDecision =
  | { readonly action: 'continue'; readonly state: 'RUNNING'; readonly elapsedMs: number; readonly progressed: boolean }
  | { readonly action: 'diagnose'; readonly state: 'SOFT_STALLED'; readonly elapsedMs: number; readonly progressed: false }
  | { readonly action: 'abort-reassign'; readonly state: 'HARD_STALLED'; readonly elapsedMs: number; readonly progressed: false; readonly attempt: number }
  | { readonly action: 'escalate'; readonly state: 'ESCALATED'; readonly elapsedMs: number; readonly progressed: false; readonly cause: string };

export interface WatchdogSnapshot {
  readonly assignmentId: string;
  readonly state: WatchdogState;
  readonly lastCursor: string;
  readonly lastPhase: string;
  readonly lastProgressAt: number;
  readonly diagnosticIssued: boolean;
  readonly reassignments: number;
  readonly repeatedCauses: Readonly<Record<string, number>>;
}

export class SemanticWatchdog {
  readonly assignmentId: string;
  readonly config: SemanticWatchdogConfig;
  #state: WatchdogState = 'RUNNING';
  #lastCursor = '';
  #lastPhase = 'dispatch';
  #lastProgressAt: number;
  #diagnosticIssued = false;
  #reassignments = 0;
  #repeatedCauses = new Map<string, number>();

  constructor(
    assignmentId: string,
    startedAt: number,
    config: Partial<SemanticWatchdogConfig> = {},
  ) {
    if (!assignmentId) throw new Error('watchdog assignmentId is required');
    this.assignmentId = assignmentId;
    this.config = { ...DEFAULT_SEMANTIC_WATCHDOG_CONFIG, ...config };
    if (this.config.softStallMs <= 0 || this.config.hardStallMs <= this.config.softStallMs
        || this.config.pollIntervalMs <= 0 || this.config.maxReassignments < 0) {
      throw new Error('invalid semantic watchdog configuration');
    }
    this.#lastProgressAt = startedAt;
  }

  observe(observation: SemanticProgressObservation, now = observation.observedAt): WatchdogDecision {
    if (this.#state === 'COMPLETED' || this.#state === 'ESCALATED') {
      return this.#state === 'COMPLETED'
        ? { action: 'continue', state: 'RUNNING', elapsedMs: 0, progressed: false }
        : { action: 'escalate', state: 'ESCALATED', elapsedMs: Math.max(0, now - this.#lastProgressAt), progressed: false, cause: 'already-escalated' };
    }
    if (!observation.cursor || !observation.phase || !Number.isFinite(observation.observedAt)) {
      throw new Error('semantic progress observation is incomplete');
    }

    const progressed = observation.cursor !== this.#lastCursor;
    if (progressed) {
      this.#lastCursor = observation.cursor;
      this.#lastPhase = observation.phase;
      this.#lastProgressAt = Math.max(this.#lastProgressAt, observation.observedAt);
      this.#diagnosticIssued = false;
      this.#state = 'RUNNING';
      return { action: 'continue', state: 'RUNNING', elapsedMs: 0, progressed: true };
    }

    const elapsedMs = Math.max(0, now - this.#lastProgressAt);
    if (elapsedMs >= this.config.hardStallMs) {
      const cause = `semantic-stall:${this.#lastPhase}`;
      const count = (this.#repeatedCauses.get(cause) ?? 0) + 1;
      this.#repeatedCauses.set(cause, count);
      if (count > 1 || this.#reassignments >= this.config.maxReassignments) {
        this.#state = 'ESCALATED';
        return { action: 'escalate', state: 'ESCALATED', elapsedMs, progressed: false, cause };
      }
      this.#state = 'HARD_STALLED';
      this.#reassignments++;
      return { action: 'abort-reassign', state: 'HARD_STALLED', elapsedMs, progressed: false, attempt: this.#reassignments };
    }
    if (elapsedMs >= this.config.softStallMs && !this.#diagnosticIssued) {
      this.#diagnosticIssued = true;
      this.#state = 'SOFT_STALLED';
      return { action: 'diagnose', state: 'SOFT_STALLED', elapsedMs, progressed: false };
    }
    return { action: 'continue', state: 'RUNNING', elapsedMs, progressed: false };
  }

  /** Reset the semantic timer for a fresh child while retaining cause history. */
  beginReassignment(startedAt: number): void {
    if (this.#state !== 'HARD_STALLED') throw new Error('watchdog reassignment requires HARD_STALLED state');
    this.#state = 'RUNNING';
    this.#lastCursor = '';
    this.#lastProgressAt = startedAt;
    this.#diagnosticIssued = false;
  }

  complete(): void {
    this.#state = 'COMPLETED';
  }

  snapshot(): WatchdogSnapshot {
    return {
      assignmentId: this.assignmentId,
      state: this.#state,
      lastCursor: this.#lastCursor,
      lastPhase: this.#lastPhase,
      lastProgressAt: this.#lastProgressAt,
      diagnosticIssued: this.#diagnosticIssued,
      reassignments: this.#reassignments,
      repeatedCauses: Object.fromEntries([...this.#repeatedCauses].sort(([a], [b]) => a.localeCompare(b))),
    };
  }
}
