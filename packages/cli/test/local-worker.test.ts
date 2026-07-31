import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

  it('GAP-1: refuses owned paths that escape the project root', async () => {
    const adapter = new LocalWorkerAdapter();
    const assignment = validAssignment({
      taskId: 'T-005',
      root: process.cwd(),
      ownedPaths: ['/etc/hostname'],
    });
    const receipt = await adapter.submitAssignment(assignment);
    expect(receipt.status).toBe('FAIL');
    expect(receipt.filesChanged).toEqual([]);
    expect(receipt.unresolvedFindings.some(f => /escapes/.test(f))).toBe(true);
  });

  it('F2: rejects owned paths that escape via symlink to an outside file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-leak-'));
    try {
      // Self-contained outside file (deterministic on all platforms — /etc/hostname
      // does not exist on macOS, which would produce a dangling symlink).
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-outside-'));
      try {
        fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret\n', 'utf-8');
        fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(tmp, 'leak'));
        const adapter = new LocalWorkerAdapter();
        const assignment = validAssignment({
          taskId: 'T-006',
          root: tmp,
          ownedPaths: ['leak'],
        });
        const receipt = await adapter.submitAssignment(assignment);
        expect(receipt.status).toBe('FAIL');
        expect(receipt.filesChanged).toEqual([]);
        expect(receipt.unresolvedFindings.some(f => /escapes/.test(f))).toBe(true);
        expect(receipt.unresolvedFindings.some(f => /does not exist/.test(f))).toBe(false);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('F2: symlink that stays inside the root is allowed', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-worker-link-'));
    try {
      fs.writeFileSync(path.join(tmp, 'real.txt'), 'content\n', 'utf-8');
      fs.symlinkSync('real.txt', path.join(tmp, 'link.txt'));
      const adapter = new LocalWorkerAdapter();
      const assignment = validAssignment({
        taskId: 'T-007',
        root: tmp,
        ownedPaths: ['link.txt'],
      });
      const receipt = await adapter.submitAssignment(assignment);
      expect(receipt.status).toBe('PASS');
      expect(receipt.filesChanged).toEqual(['link.txt']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
