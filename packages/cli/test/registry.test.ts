import { describe, it, expect } from 'vitest';
import { adapterRegistry, registerCoordinatorAdapter, type AdapterName } from '../src/adapters/registry.js';
import type { WorkerAdapter } from '../src/adapters/registry.js';

// Mock WorkerAdapter for testing
const mockWorkerAdapter = (): WorkerAdapter => ({
  name: 'mock-worker',
  platform: 'test',
  async submitAssignment() {
    return {
      taskId: 'test',
      filesChanged: [],
      commandsRun: [],
      testsRun: [],
      evidencePaths: [],
      status: 'PASS',
      retries: 0,
      assumptions: [],
      unresolvedFindings: [],
    };
  },
  async cancelTask() {},
  async healthCheck() {
    return { ok: true, version: 'test-1.0.0' };
  },
});

describe('adapterRegistry', () => {
  describe('default registration', () => {
    it('has local-worker registered by default', () => {
      expect(adapterRegistry.has('local-worker')).toBe(true);
    });

    it('local-worker adapter is retrievable and implements WorkerAdapter', () => {
      const adapter = adapterRegistry.get('local-worker');
      expect(adapter).toBeDefined();
      expect(typeof adapter.submitAssignment).toBe('function');
      expect(typeof adapter.cancelTask).toBe('function');
      expect(typeof adapter.healthCheck).toBe('function');
    });

    it('available() includes local-worker', () => {
      const available = adapterRegistry.available();
      expect(available).toContain('local-worker');
    });
  });

  describe('fail-closed on unknown adapter', () => {
    it('throws on unknown adapter name', () => {
      expect(() => adapterRegistry.get('unknown-adapter' as AdapterName)).toThrow(
        /Unknown adapter: unknown-adapter/
      );
    });

    it('has() returns false for unknown adapter', () => {
      expect(adapterRegistry.has('nonexistent' as AdapterName)).toBe(false);
    });
  });

  describe('coordinator adapter registration', () => {
    it('can register coordinator adapter', () => {
      registerCoordinatorAdapter({
        create: () => mockWorkerAdapter(),
      });
      expect(adapterRegistry.has('coordinator')).toBe(true);
    });

    it('retrieves coordinator adapter after registration', () => {
      const adapter = adapterRegistry.get('coordinator');
      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('mock-worker');
    });

    it('available() includes coordinator after registration', () => {
      const available = adapterRegistry.available();
      expect(available).toContain('coordinator');
    });
  });

  describe('runExecutionRuntime integration', () => {
    it('runExecutionRuntime is exported from runner', async () => {
      const { runExecutionRuntime } = await import('../src/services/runner.js');
      expect(typeof runExecutionRuntime).toBe('function');
    });

    it('runExecutionRuntime returns adapter for local-worker', async () => {
      const { runExecutionRuntime } = await import('../src/services/runner.js');
      const { DurableStore } = await import('../src/services/durable-store.js');

      // Create a minimal mock orchestration run
      const mockOrcRun = {
        runId: 'test-run',
        state: 'EXECUTING',
        plan: { 
          tasks: [],
          completion_policy: { require_all_tasks: false, require_verification: false }
        },
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const store = new DurableStore(process.cwd());

      const adapter = runExecutionRuntime({
        adapterName: 'local-worker',
        orcRun: mockOrcRun,
        basePath: process.cwd(),
        store,
      });

      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('local-worker');
    });

    it('runExecutionRuntime throws for unknown adapter', async () => {
      const { runExecutionRuntime } = await import('../src/services/runner.js');
      const { DurableStore } = await import('../src/services/durable-store.js');

      const mockOrcRun = {
        runId: 'test-run',
        state: 'EXECUTING',
        plan: { 
          tasks: [],
          completion_policy: { require_all_tasks: false, require_verification: false }
        },
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const store = new DurableStore(process.cwd());

      expect(() =>
        runExecutionRuntime({
          adapterName: 'invalid-adapter' as AdapterName,
          orcRun: mockOrcRun,
          basePath: process.cwd(),
          store,
        })
      ).toThrow(/Unknown adapter/);
    });
  });

  describe('adapter handle persistence', () => {
    it('adapter is retrieved synchronously before async operations', () => {
      // This test verifies the pattern: adapter ref stored in variable before any await
      const adapter = adapterRegistry.get('local-worker');
      const adapterHandle = adapter; // Persist handle before await pattern

      // Verify the handle is a valid WorkerAdapter
      expect(adapterHandle.name).toBe('local-worker');
      expect(typeof adapterHandle.submitAssignment).toBe('function');
    });
  });
});