import { createHash, randomUUID } from 'node:crypto';

/**
 * Phase 4 — explicit MCP lifecycle with lease binding and idle-zero attestation.
 *
 * The lifecycle is:
 *   REGISTERED -> PENDING_APPROVAL -> LEASED -> ACTIVE -> TEARDOWN
 *
 *  - REGISTERED: integration is known but not routed to any task.
 *  - PENDING_APPROVAL: task requests the capability; operator/explicit profile gates.
 *  - LEASED: capability leased to a specific consumer repo/worktree/task/session.
 *  - ACTIVE: process spawned and serving the task.
 *  - TEARDOWN: process terminated and idle-zero attested (0 managed process/CPU/RAM/sockets).
 *
 * A task-specific isolated host config is used; no globally advertised enabled
 * managed MCP exists by default.
 */
export type McpLifecycleState = 'REGISTERED' | 'PENDING_APPROVAL' | 'LEASED' | 'ACTIVE' | 'TEARDOWN';

export interface McpLease {
  lease_id: string;
  integration_id: string;
  state: McpLifecycleState;
  consumer_repo: string;
  worktree_path: string;
  task_id: string;
  session_id: string;
  host: string;
  created_at: string;
  expires_at?: string;
  pid?: number;
  receipt_path?: string;
}

export interface McpIdleReceipt {
  schema: 'agent-rules/mcp-idle-receipt/v1';
  version: 1;
  lease_id: string;
  integration_id: string;
  consumer_repo: string;
  worktree_path: string;
  task_id: string;
  session_id: string;
  state: McpLifecycleState;
  idle: boolean;
  managed_processes: number;
  managed_cpu_ms: number;
  managed_rss_bytes: number;
  managed_sockets: number;
  schema_tokens: string[];
  invocation_count: number;
  teardown_at: string;
  receipt_sha256: string;
}

export function createMcpLease(input: {
  integration_id: string;
  consumer_repo: string;
  worktree_path: string;
  task_id: string;
  session_id: string;
  host: string;
}): McpLease {
  return {
    lease_id: `mcp-lease-${randomUUID().slice(0, 12)}`,
    integration_id: input.integration_id,
    state: 'LEASED',
    consumer_repo: input.consumer_repo,
    worktree_path: input.worktree_path,
    task_id: input.task_id,
    session_id: input.session_id,
    host: input.host,
    created_at: new Date().toISOString(),
  };
}

export function transitionMcpState(lease: McpLease, to: McpLifecycleState): McpLease {
  const valid: Record<McpLifecycleState, McpLifecycleState[]> = {
    REGISTERED: ['PENDING_APPROVAL'],
    PENDING_APPROVAL: ['LEASED', 'TEARDOWN'],
    LEASED: ['ACTIVE', 'TEARDOWN'],
    ACTIVE: ['TEARDOWN'],
    TEARDOWN: [],
  };
  if (!valid[lease.state].includes(to)) {
    throw new Error(`MCP lease ${lease.lease_id} cannot transition ${lease.state} -> ${to}`);
  }
  return { ...lease, state: to };
}

export function buildMcpIdleReceipt(input: {
  lease: McpLease;
  managed_processes: number;
  managed_cpu_ms: number;
  managed_rss_bytes: number;
  managed_sockets: number;
  schema_tokens?: string[];
  invocation_count?: number;
}): McpIdleReceipt {
  const idle = input.managed_processes === 0 && input.managed_sockets === 0;
  const body = {
    schema: 'agent-rules/mcp-idle-receipt/v1' as const,
    version: 1 as const,
    lease_id: input.lease.lease_id,
    integration_id: input.lease.integration_id,
    consumer_repo: input.lease.consumer_repo,
    worktree_path: input.lease.worktree_path,
    task_id: input.lease.task_id,
    session_id: input.lease.session_id,
    state: 'TEARDOWN' as McpLifecycleState,
    idle,
    managed_processes: input.managed_processes,
    managed_cpu_ms: input.managed_cpu_ms,
    managed_rss_bytes: input.managed_rss_bytes,
    managed_sockets: input.managed_sockets,
    schema_tokens: input.schema_tokens ?? [],
    invocation_count: input.invocation_count ?? 0,
    teardown_at: new Date().toISOString(),
  };
  return { ...body, receipt_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}
