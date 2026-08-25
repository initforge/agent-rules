import { describe, it, expect } from 'vitest';
import {
  createMcpLease,
  transitionMcpState,
  buildMcpIdleReceipt,
  assertIdleZeroReceipt,
  buildNoMcpProof,
  buildMcpCanaryResult,
  MCP_CANARY_POINTS,
  leasePolicyFor,
  type McpLease,
} from '../../src/northstar/mcp-lifecycle.js';

function lease(): McpLease {
  return createMcpLease({
    integration_id: 'codebase-memory',
    consumer_repo: '/repo',
    worktree_path: '/repo/.worktrees/1',
    task_id: 'T-1',
    session_id: 'S-1',
    host: 'codex',
  });
}

describe('mcp-lifecycle (REQ-110)', () => {
  it('lease state machine is strictly ordered and fail-closed', () => {
    const l = lease();
    // createMcpLease begins its life at LEASED (the harness already holds it).
    const active = transitionMcpState(l, 'ACTIVE');
    const torn = transitionMcpState(active, 'TEARDOWN');
    expect(torn.state).toBe('TEARDOWN');
    expect(() => transitionMcpState(torn, 'ACTIVE')).toThrow(/cannot transition/);
    expect(() => transitionMcpState(lease(), 'TEARDOWN')).not.toThrow();
  });

  it('idle-zero is fail-closed against residual resources', () => {
    const torn = transitionMcpState(lease(), 'TEARDOWN');
    const idle = buildMcpIdleReceipt({ lease: torn, managed_processes: 0, managed_sockets: 0, managed_leases: 0, exposed_schema_tokens: 0 });
    expect(idle.idle).toBe(true);
    expect(() => assertIdleZeroReceipt(idle)).not.toThrow();
    const liar = buildMcpIdleReceipt({ lease: torn, managed_processes: 1, managed_sockets: 0, managed_leases: 0, exposed_schema_tokens: 0 });
    expect(liar.idle).toBe(false);
  });

  it('tasks without MCP prove zero lease and zero call', () => {
    const proof = buildNoMcpProof({ task_id: 'T-2', work_id: 'W-2' });
    expect(proof.leases_created).toBe(0);
    expect(proof.mcp_calls).toBe(0);
    expect(proof.mcp_configured).toBe(false);
    expect(proof.proof_sha256).toMatch(/^[0-9a-f]{64}$/);
    const policy = leasePolicyFor(false, ['code.verify'], ['codebase-memory']);
    expect(policy.required).toBe(false);
  });

  it('capacity-required tasks MUST lease; non-capability tasks must not', () => {
    const required = leasePolicyFor(true, ['code.verify', 'codebase-memory'], ['codebase-memory']);
    expect(required.required).toBe(true);
    const notRequired = leasePolicyFor(true, ['code.verify'], ['codebase-memory']);
    expect(notRequired.required).toBe(false);
  });

  it('MCP canary PASS requires all seven points', () => {
    const full: Record<string, { status: 'PASS' | 'FAIL' | 'OMITTED' }> = {};
    for (const point of MCP_CANARY_POINTS) full[point] = { status: 'PASS' };
    const ok = buildMcpCanaryResult({ integration_id: 'codebase-memory', host: 'codex', nonce: 'nonce-1', points: full });
    expect(ok.passed).toBe(true);
    expect(ok.points.CONFIG_READBACK.status).toBe('PASS');
    const missingTeardown: Record<string, { status: 'PASS' | 'FAIL' | 'OMITTED' }> = { ...full };
    missingTeardown['TEARDOWN'] = { status: 'OMITTED' };
    const partial = buildMcpCanaryResult({ integration_id: 'codebase-memory', host: 'codex', nonce: 'nonce-1', points: missingTeardown });
    expect(partial.passed).toBe(false);
  });
});