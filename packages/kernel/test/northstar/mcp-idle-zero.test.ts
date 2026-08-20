import { describe, it, expect } from 'vitest';
import { createMcpLease, buildMcpIdleReceipt, transitionMcpState, assertIdleZeroReceipt, type McpLease } from '../../src/northstar/mcp-lifecycle.js';

function leased(): McpLease {
  return createMcpLease({
    integration_id: 'mcp-pencil',
    consumer_repo: 'r',
    worktree_path: '/w',
    task_id: 't',
    session_id: 's',
    host: 'opencode',
  });
}

describe('MCP idle-zero (P5)', () => {
  it('claims idle only when process/socket/lease/schema exposure are all zero', () => {
    const teardown = transitionMcpState(leased(), 'TEARDOWN');
    const receipt = buildMcpIdleReceipt({
      lease: teardown,
      managed_processes: 0,
      managed_sockets: 0,
      managed_leases: 0,
      exposed_schema_tokens: 0,
    });
    expect(receipt.idle).toBe(true);
    expect(receipt.managed_cpu_ms).toBe('NOT_APPLICABLE');
    expect(receipt.managed_rss_bytes).toBe('NOT_APPLICABLE');
  });

  it('does not fabricate CPU/RSS as 0 when a process is attributed', () => {
    const teardown = transitionMcpState(leased(), 'TEARDOWN');
    const receipt = buildMcpIdleReceipt({
      lease: teardown,
      managed_processes: 1,
      managed_sockets: 0,
      managed_cpu_ms: 120,
      managed_rss_bytes: 4096,
    });
    expect(receipt.idle).toBe(false);
    expect(receipt.managed_cpu_ms).toBe(120);
    expect(receipt.managed_rss_bytes).toBe(4096);
  });

  it('idle predicate is false for any residual resource (process/socket/lease/exposed)', () => {
    const teardown = transitionMcpState(leased(), 'TEARDOWN');
    expect(buildMcpIdleReceipt({ lease: teardown, managed_processes: 0, managed_sockets: 1, managed_leases: 0, exposed_schema_tokens: 0 }).idle).toBe(false);
    expect(buildMcpIdleReceipt({ lease: teardown, managed_processes: 0, managed_sockets: 0, managed_leases: 1, exposed_schema_tokens: 0 }).idle).toBe(false);
    expect(buildMcpIdleReceipt({ lease: teardown, managed_processes: 0, managed_sockets: 0, managed_leases: 0, exposed_schema_tokens: 2 }).idle).toBe(false);
  });

  it('fail-closed: a receipt claiming idle with residual resources is rejected by the consumer guard', () => {
    const teardown = transitionMcpState(leased(), 'TEARDOWN');
    const bad: ReturnType<typeof buildMcpIdleReceipt> = {
      ...buildMcpIdleReceipt({ lease: teardown, managed_processes: 0, managed_sockets: 0, managed_leases: 0, exposed_schema_tokens: 0 }),
      idle: true,
      managed_sockets: 1,
    };
    expect(() => assertIdleZeroReceipt(bad)).toThrow(/FAIL-CLOSED/);
  });
});
