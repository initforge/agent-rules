import type { QueuedTask } from './queue.js';

export type ExecutionClass = 'deterministic' | 'integration' | 'browser' | 'mobile' | 'planner';

export interface ExecutionBudget {
  executionClass: ExecutionClass;
  softTimeoutMs: number;
  hardTimeoutMs: number;
  heartbeatIntervalMs: number;
  killGraceMs: number;
  rationale: string;
}

export const DEFAULT_EXECUTION_TIMEOUTS: Record<ExecutionClass, number> = {
  deterministic: 10 * 60 * 1000,
  integration: 20 * 60 * 1000,
  browser: 30 * 60 * 1000,
  mobile: 35 * 60 * 1000,
  planner: 15 * 60 * 1000,
};

const HARD_MAX_TIMEOUT_MS = 60 * 60 * 1000;

function hasKind(task: QueuedTask, kinds: string[]): boolean {
  return (task.verificationProfile?.steps ?? []).some((step) => kinds.includes(step.kind));
}

/** Classify from the claim surface, not from provider names or tool inventory. */
export function classifyExecution(task: QueuedTask): ExecutionClass {
  const text = task.prompt.toLowerCase();
  if (hasKind(task, ['playwright', 'browser-script', 'visual-diff']) || /\b(browser|e2e|playwright|chrome|web ui)\b/.test(text)) return 'browser';
  if (hasKind(task, ['mcp-tool-call']) && /\b(mobile|device|ios|android|maestro)\b/.test(text)) return 'mobile';
  if (/\b(planner|planning|architecture|specification|research)\b/.test(text)) return 'planner';
  if (hasKind(task, ['argv', 'shell']) && task.verificationProfile?.steps.length && task.verificationProfile.steps.length > 1) return 'integration';
  return 'deterministic';
}

/**
 * Derive a bounded deadline per case. An explicit runner timeout remains an
 * owner override; otherwise the claim surface selects a smaller or larger
 * default instead of making every task wait twenty minutes.
 */
export function deriveExecutionBudget(task: QueuedTask, explicitTimeoutMs?: number): ExecutionBudget {
  const executionClass = classifyExecution(task);
  const hardTimeoutMs = Math.min(
    HARD_MAX_TIMEOUT_MS,
    Math.max(1_000, Math.floor(explicitTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUTS[executionClass])),
  );
  const softTimeoutMs = Math.max(500, Math.floor(hardTimeoutMs * 0.8));
  return {
    executionClass,
    softTimeoutMs,
    hardTimeoutMs,
    heartbeatIntervalMs: Math.max(250, Math.min(5_000, Math.floor(hardTimeoutMs / 20))),
    killGraceMs: executionClass === 'deterministic' ? 2_000 : 5_000,
    rationale: explicitTimeoutMs === undefined
      ? `${executionClass} claim surface selected adaptive default`
      : `owner timeout override ${explicitTimeoutMs}ms preserved`,
  };
}
