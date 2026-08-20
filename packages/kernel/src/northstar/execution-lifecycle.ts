export type ExecutionState =
  | 'UNCLAIMED'
  | 'CLAIMED'
  | 'PREPARING'
  | 'RUNNING'
  | 'RETRY_QUEUED'
  | 'STALLED'
  | 'TIMED_OUT'
  | 'CANCELED'
  | 'SUCCEEDED'
  | 'FAILED';

export type TaskTruthState = 'READY' | 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED';

export interface ExecutionLifecycleRecord {
  run_id: string;
  work_id?: string;
  execution_generation?: number;
  spec_revision?: number;
  execution_state: ExecutionState;
  task_truth: TaskTruthState;
  updated_at: string;
  reason?: string;
  attempt?: number;
}

const TRANSITIONS: Record<ExecutionState, ReadonlySet<ExecutionState>> = {
  UNCLAIMED: new Set(['CLAIMED', 'CANCELED']),
  CLAIMED: new Set(['PREPARING', 'CANCELED', 'FAILED']),
  PREPARING: new Set(['RUNNING', 'FAILED', 'TIMED_OUT', 'CANCELED']),
  RUNNING: new Set(['RETRY_QUEUED', 'STALLED', 'TIMED_OUT', 'CANCELED', 'SUCCEEDED', 'FAILED']),
  RETRY_QUEUED: new Set(['PREPARING', 'CANCELED', 'FAILED']),
  STALLED: new Set(['RETRY_QUEUED', 'CANCELED', 'FAILED']),
  TIMED_OUT: new Set(['RETRY_QUEUED', 'CANCELED', 'FAILED']),
  CANCELED: new Set(),
  SUCCEEDED: new Set(['RETRY_QUEUED']),
  FAILED: new Set(['RETRY_QUEUED']),
};

export function assertExecutionTransition(from: ExecutionState, to: ExecutionState): void {
  if (from === to) return;
  if (!TRANSITIONS[from].has(to)) throw new Error(`invalid execution lifecycle transition ${from} -> ${to}`);
}

export function transitionExecution(current: ExecutionLifecycleRecord, to: ExecutionState, patch: Partial<Omit<ExecutionLifecycleRecord, 'run_id' | 'execution_state' | 'updated_at'>> = {}): ExecutionLifecycleRecord {
  assertExecutionTransition(current.execution_state, to);
  return {
    ...current,
    ...patch,
    execution_state: to,
    updated_at: new Date().toISOString(),
  };
}

export function truthFromOutcome(outcome: 'PASS' | 'PARTIAL' | 'BLOCKED' | 'FAILED'): TaskTruthState {
  return outcome;
}
