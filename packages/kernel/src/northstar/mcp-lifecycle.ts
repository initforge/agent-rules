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
  managed_cpu_ms: number | 'NOT_APPLICABLE';
  managed_rss_bytes: number | 'NOT_APPLICABLE';
  managed_sockets: number;
  /** Outstanding leases still held by the harness (idle-zero requires 0). */
  managed_leases: number;
  /** Harness-advertised provider/schema tokens still exposed (idle-zero requires 0). */
  exposed_schema_tokens: number;
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
  managed_cpu_ms?: number;
  managed_rss_bytes?: number;
  managed_sockets: number;
  /** Outstanding leases still held by the harness. */
  managed_leases?: number;
  /** Harness-advertised provider/schema tokens still exposed. */
  exposed_schema_tokens?: number;
  schema_tokens?: string[];
  invocation_count?: number;
}): McpIdleReceipt {
  const leases = input.managed_leases ?? 0;
  const exposed = input.exposed_schema_tokens ?? 0;
  // Idle-zero = no harness-owned process / socket / lease / advertised provider /
  // orphan / schema exposure. CPU/RSS only matter when there is PID attribution.
  const idle = input.managed_processes === 0 && input.managed_sockets === 0 && leases === 0 && exposed === 0;
  // CPU/RSS are recorded ONLY with PID attribution. With no process they are
  // NOT_APPLICABLE — never fabricated as 0.
  const cpu: number | 'NOT_APPLICABLE' = input.managed_processes === 0 ? 'NOT_APPLICABLE' : (input.managed_cpu_ms ?? 0);
  const rss: number | 'NOT_APPLICABLE' = input.managed_processes === 0 ? 'NOT_APPLICABLE' : (input.managed_rss_bytes ?? 0);
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
    managed_cpu_ms: cpu,
    managed_rss_bytes: rss,
    managed_sockets: input.managed_sockets,
    managed_leases: leases,
    exposed_schema_tokens: exposed,
    schema_tokens: input.schema_tokens ?? [],
    invocation_count: input.invocation_count ?? 0,
    teardown_at: new Date().toISOString(),
  };
  return { ...body, receipt_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/**
 * Fail-closed consumer guard: a receipt may never be accepted as idle-zero while
 * any harness-owned process/socket/lease/advertised-provider/schema exposure
 * remains. Callers must invoke this before treating teardown as idle; a false
 * idle claim is rejected rather than silently trusted.
 */
export function assertIdleZeroReceipt(receipt: McpIdleReceipt): void {
  if (receipt.idle && (
    receipt.managed_processes > 0
    || receipt.managed_sockets > 0
    || receipt.managed_leases > 0
    || receipt.exposed_schema_tokens > 0
  )) {
    throw new Error('MCP idle-zero FAIL-CLOSED: receipt claims idle with residual resources');
  }
}

/**
 * REQ-110 — a task that does not need MCP must prove zero lease and zero MCP
 * call. This is the fail-closed counter-evidence a non-MCP task records.
 */
export interface NoMcpProof {
  schema: 'agent-rules/no-mcp-proof/v1';
  version: 1;
  task_id: string;
  work_id: string;
  leases_created: number;
  mcp_calls: number;
  mcp_configured: boolean;
  proof_sha256: string;
}

export function buildNoMcpProof(input: { task_id: string; work_id: string; leases_created?: number; mcp_calls?: number }): NoMcpProof {
  const body = {
    schema: 'agent-rules/no-mcp-proof/v1' as const,
    version: 1 as const,
    task_id: input.task_id,
    work_id: input.work_id,
    leases_created: input.leases_created ?? 0,
    mcp_calls: input.mcp_calls ?? 0,
    mcp_configured: false,
  };
  return { ...body, proof_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/** External MCP requirement: capability-required tasks MUST have a lease. */
export type McpRequirement = 'REQUIRED' | 'NOT_REQUIRED';

/**
 * REQ-110 — an MCP claim PASSes only when ALL seven points hold:
 *  1. host-native config read back (real bytes, not fabricated)
 *  2. initialize handshake succeeded
 *  3. listTools returned the canary tool
 *  4. real tool call executed with a nonce
 *  5. observable output/effect matched the nonce
 *  6. session teardown succeeded
 *  7. temporary config rolled back byte-for-byte
 */
export type McpCanaryPoint =
  | 'CONFIG_READBACK'
  | 'INITIALIZE'
  | 'LIST_TOOLS_CANARY'
  | 'TOOL_CALL_NONCE'
  | 'EFFECT_OBSERVED'
  | 'TEARDOWN'
  | 'CONFIG_ROLLBACK_BYTE_EQUAL';

export const MCP_CANARY_POINTS: readonly McpCanaryPoint[] = [
  'CONFIG_READBACK', 'INITIALIZE', 'LIST_TOOLS_CANARY', 'TOOL_CALL_NONCE',
  'EFFECT_OBSERVED', 'TEARDOWN', 'CONFIG_ROLLBACK_BYTE_EQUAL',
];

export interface McpCanaryResult {
  schema: 'agent-rules/mcp-canary/v1';
  version: 1;
  integration_id: string;
  host: string;
  nonce: string;
  points: Record<McpCanaryPoint, { status: 'PASS' | 'FAIL' | 'OMITTED'; evidence?: unknown }>;
  passed: boolean;
  canary_sha256: string;
}

export function buildMcpCanaryResult(input: {
  integration_id: string;
  host: string;
  nonce: string;
  points: Partial<Record<McpCanaryPoint, { status: 'PASS' | 'FAIL' | 'OMITTED'; evidence?: unknown }>>;
}): McpCanaryResult {
  const points = {} as Record<McpCanaryPoint, { status: 'PASS' | 'FAIL' | 'OMITTED'; evidence?: unknown }>;
  for (const point of MCP_CANARY_POINTS) {
    points[point] = input.points[point] ?? { status: 'OMITTED', evidence: { reason: `point ${point} not executed` } };
  }
  const passed = MCP_CANARY_POINTS.every((point) => points[point]!.status === 'PASS');
  const body = {
    schema: 'agent-rules/mcp-canary/v1' as const,
    version: 1 as const,
    integration_id: input.integration_id,
    host: input.host,
    nonce: input.nonce,
    points,
    passed,
  };
  return { ...body, canary_sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/**
 * A lease is REQUIRED exactly when the task declares an MCP capability;
 * otherwise the broker must create NO lease (REQ-110).
 */
export function leasePolicyFor(requiresMcp: boolean, declaredCapabilities: readonly string[], mcpCapabilities: readonly string[]): { required: boolean; reason: string } {
  if (!requiresMcp) return { required: false, reason: 'task does not require MCP; no lease must be created' };
  const needsMcp = declaredCapabilities.some((c) => mcpCapabilities.includes(c));
  return {
    required: needsMcp,
    reason: needsMcp ? `task declares MCP capability (${declaredCapabilities.filter((c) => mcpCapabilities.includes(c)).join(', ')})` : 'task requires a capability but none maps to an MCP provider; no lease',
  };
}
