import type { QueuedTask } from './queue.js';
import type { McpConfigPaths } from './mcp-config.js';
import type { ExecutionBudget } from './execution-policy.js';
import type { ExecutionResult } from './headless-executor.js';

/** Host-neutral execution seam. A host adapter supplies execution; the kernel owns truth. */
export interface AgentDriver {
  execute(task: QueuedTask, mcpConfigPaths?: McpConfigPaths, budget?: ExecutionBudget): Promise<ExecutionResult>;
  host(): string;
}

export interface AgentDriverReceipt {
  [key: string]: unknown;
  schema: 'harness/agent-driver-receipt/v1';
  task_id: string;
  work_id?: string;
  execution_generation?: number;
  spec_revision?: number;
  host: string;
  exit_code: number;
  timed_out: boolean;
  termination: ExecutionResult['termination'];
  cleanup_confirmed: boolean;
  stdout_sha256: string;
  stderr_sha256: string;
}

/** Bind host execution to the same task identity used by queue/evidence gates. */
export function bindAgentDriverReceipt(task: QueuedTask, execution: ExecutionResult, host: string): AgentDriverReceipt {
  return {
    schema: 'harness/agent-driver-receipt/v1',
    task_id: task.contractTaskId ?? task.id,
    ...(task.workId ? { work_id: task.workId } : {}),
    ...(task.executionGeneration !== undefined ? { execution_generation: task.executionGeneration } : {}),
    ...(task.specRevision !== undefined ? { spec_revision: task.specRevision } : {}),
    host,
    exit_code: execution.exitCode,
    timed_out: execution.timedOut,
    termination: execution.termination,
    cleanup_confirmed: execution.cleanupConfirmed,
    stdout_sha256: execution.stdoutSha256,
    stderr_sha256: execution.stderrSha256,
  };
}
