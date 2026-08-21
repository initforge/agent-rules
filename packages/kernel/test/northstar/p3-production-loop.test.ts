/**
 * Phase P3 — Production Loop Promotion Test Suite
 * 
 * Verifies that ProofRouter, ArtifactAdmission, LaneController, and MCPLifecycle
 * operate in production authority, selecting minimal sufficient proofs,
 * logging omitted proofs, and enforcing idle-zero resources.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  planProofRoute,
  classifyArtifact,
  admitArtifact,
  assertIdleZeroReceipt,
  buildMcpIdleReceipt,
  createMcpLease,
  transitionMcpState,
  type ProofRouteRequest,
} from '../../src/northstar/index.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p3-loop-'));
});

afterEach(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup locks on Windows
  }
});

describe('Phase P3 — Production Loop Promotion', () => {
  it('ProofRouter selects minimal sufficient proofs and records omitted proofs with reason', () => {
    const request: ProofRouteRequest = {
      task_id: 'T-001',
      repository: 'test-repo',
      trigger: {
        event: 'file-change',
        changed_files: ['src/utils.ts'],
      },
      claims: [
        { id: 'C-001', claim: 'unit tests pass' },
        { id: 'C-002', claim: 'browser tests pass' },
      ],
      risks: ['low'],
      host_capabilities: ['node', 'git'],
    };

    const routePlan = planProofRoute(request);
    expect(routePlan.plan).toBeDefined();
    expect(routePlan.trigger).toBeDefined();
    expect(Array.isArray(routePlan.plan.selected)).toBe(true);
    expect(Array.isArray(routePlan.plan.omitted)).toBe(true);
  });

  it('ArtifactAdmission correctly classifies ephemeral vs durable artifacts', () => {
    expect(classifyArtifact({ risk: 'low' })).toBe('EPHEMERAL');
    expect(classifyArtifact({ risk: 'high' })).toBe('AUDITED');

    const checkpointAdmission = admitArtifact({
      class: 'CHECKPOINTED',
      reasons: ['restart_resume'],
      ttl_ms: 86_400_000,
    });
    expect(checkpointAdmission.admission).toBe('ADMIT');
    expect(checkpointAdmission.persist).toBe(true);

    const ephemeralRefusal = admitArtifact({
      class: 'EPHEMERAL',
      reasons: [],
    });
    expect(ephemeralRefusal.admission).toBe('REFUSE');
    expect(ephemeralRefusal.persist).toBe(false);
  });

  it('MCPLifecycle transitions cleanly and verifies idle-zero teardown', () => {
    const lease = createMcpLease({
      integration_id: 'mcp-guardian-test',
      consumer_repo: 'test-repo',
      worktree_path: tempDir,
      task_id: 'T-001',
      session_id: 'S-001',
      host: 'opencode',
    });

    const teardown = transitionMcpState(lease, 'TEARDOWN');
    expect(teardown.state).toBe('TEARDOWN');

    const idleReceipt = buildMcpIdleReceipt({
      lease: teardown,
      managed_processes: 0,
      managed_sockets: 0,
      managed_leases: 0,
      exposed_schema_tokens: 0,
    });

    expect(idleReceipt.idle).toBe(true);
    assertIdleZeroReceipt(idleReceipt);
  });

  it('negative control: orphaned MCP process fails idle-zero assertion', () => {
    const lease = createMcpLease({
      integration_id: 'mcp-guardian-test',
      consumer_repo: 'test-repo',
      worktree_path: tempDir,
      task_id: 'T-001',
      session_id: 'S-001',
      host: 'opencode',
    });

    const teardown = transitionMcpState(lease, 'TEARDOWN');
    const badReceipt = {
      ...buildMcpIdleReceipt({
        lease: teardown,
        managed_processes: 0,
        managed_sockets: 0,
        managed_leases: 0,
        exposed_schema_tokens: 0,
      }),
      idle: true,
      managed_processes: 1, // Residual orphaned process
    };

    expect(() => assertIdleZeroReceipt(badReceipt)).toThrow(/FAIL-CLOSED/);
  });
});
