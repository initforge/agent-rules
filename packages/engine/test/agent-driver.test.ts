import { describe, expect, it } from 'vitest';
import { bindAgentDriverReceipt } from '../src/runner/agent-driver.js';

describe('host-neutral AgentDriver receipt', () => {
  it('binds host execution to work identity without allowing the host to author truth', () => {
    const receipt = bindAgentDriverReceipt({
      id: 'attempt-1', contractTaskId: 'T-001', workId: 'W-001', executionGeneration: 7, specRevision: 2,
      prompt: 'run', verification: ['true'], ownedPaths: ['src'], repairDepth: 0, createdAt: new Date().toISOString(),
    }, {
      exitCode: 0, timedOut: false, durationMs: 12, stdoutPath: 'stdout', stderrPath: 'stderr',
      stdoutSha256: 'a'.repeat(64), stderrSha256: 'b'.repeat(64), termination: 'natural', cleanupConfirmed: true,
    }, 'codex');
    expect(receipt).toMatchObject({ schema: 'harness/agent-driver-receipt/v1', task_id: 'T-001', work_id: 'W-001', execution_generation: 7, spec_revision: 2, host: 'codex', exit_code: 0 });
    expect(receipt).not.toHaveProperty('status', 'PASS');
  });
});
