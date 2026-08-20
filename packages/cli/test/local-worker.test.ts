import { describe, it, expect } from 'vitest';
import { LocalWorkerAdapter } from '../src/adapters/local-worker.js';
import type { DelegationAssignment, DelegationReceipt } from '../src/services/orchestrator.js';

function validAssignment(overrides?: Partial<DelegationAssignment>): DelegationAssignment {
  return {
    taskId: 'T-001',
    reqIds: ['REQ-001'],
    objective: 'Implement REQ-001',
    ownedPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: ['REQ-001 is implemented and verified'],
    verificationCommands: [],
    model: 'gpt-4o',
    effort: 'small',
    ...overrides,
  };
}

describe('LocalWorkerAdapter', () => {
  it('healthCheck returns ok', async () => {
    const adapter = new LocalWorkerAdapter();
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.version).toBeDefined();
  });

  it('submitAssignment works with a real assignment', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment();
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.taskId).toBe('T-001');
    expect(receipt.status).toBe('PASS');
  });

  it('submitAssignment returns a proper receipt with filesChanged', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-002',
      reqIds: ['REQ-002'],
      objective: 'Check package.json exists',
      ownedPaths: ['package.json'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.taskId).toBe('T-002');
    expect(receipt.filesChanged).toContain('package.json');
    expect(receipt.status).toBe('PASS');
  });

  it('cancellation kills the worker process', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-003',
      objective: 'Infinite sleep',
      verificationCommands: ['node -e "setTimeout(()=>{},10000)"'],
    });

    const receiptPromise = adapter.submitAssignment(assignment);
    await adapter.cancelTask('T-003');
    await expect(receiptPromise).rejects.toThrow();
  });

  it('Timeout causes task failure', async () => {
    const adapter = new LocalWorkerAdapter(100);
    const assignment = validAssignment({
      taskId: 'T-004',
      objective: 'Slow task',
      verificationCommands: ['node -e "setTimeout(()=>{},5000)"'],
    });

    await expect(adapter.submitAssignment(assignment)).rejects.toThrow(/timed out/i);
  });
});
