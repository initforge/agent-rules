/**
 * adapter-registry.ts — Production adapter registry for runExecutionRuntime.
 * Maps adapter names to factory functions; fail-closed on unknown adapter.
 *
 * ponytail: skip — dynamic adapter discovery, hot-reload.
 * Add when runtime adapter injection is required.
 */
import type { WorkerAdapter } from './local-worker.js';
import type { DelegationAssignment, DelegationReceipt } from '../services/orchestrator.js';

export interface AdapterFactory {
  create(): WorkerAdapter | Promise<WorkerAdapter>;
}

export interface CoordinatorAdapterFactory {
  create(client: unknown): WorkerAdapter;
}

export type AdapterName = 'local-worker' | 'coordinator';

/** Adapter registry — fail-closed on unknown adapter. */
class AdapterRegistry {
  private readonly factories = new Map<AdapterName, AdapterFactory>();
  private readonly preloadedAdapters = new Map<AdapterName, WorkerAdapter>();

  register(name: AdapterName, factory: AdapterFactory): void {
    this.factories.set(name, factory);
  }

  registerSync(name: AdapterName, adapter: WorkerAdapter): void {
    this.preloadedAdapters.set(name, adapter);
    this.factories.set(name, {
      create: (): WorkerAdapter => adapter,
    });
  }

  get(name: AdapterName): WorkerAdapter {
    // First check preloaded adapters (no dynamic import at runtime)
    const preloaded = this.preloadedAdapters.get(name);
    if (preloaded) {
      return preloaded;
    }

    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Unknown adapter: ${name}. Supported: ${[...this.factories.keys()].join(', ')}`);
    }
    return factory.create() as WorkerAdapter;
  }

  has(name: AdapterName): boolean {
    return this.factories.has(name) || this.preloadedAdapters.has(name);
  }

  /** Returns adapter names in registration order. */
  available(): readonly AdapterName[] {
    return [...this.factories.keys()];
  }
}

const globalRegistry = new AdapterRegistry();

// Register local-worker via lazy factory — adapter instantiated once on first get(),
// not at module load. Factory registered at module init; adapter created on demand.
// ponytail: skip — async registration, module-level singleton per worker process.
// Add when multi-instance or per-request adapter lifecycle is needed.
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
let _localWorkerInstance: WorkerAdapter | null = null;
globalRegistry.register('local-worker', {
  create(): WorkerAdapter {
    if (!_localWorkerInstance) {
      // createRequire defers LocalWorkerAdapter instantiation to first get() call,
      // avoiding circular dependency at module load time while staying ESM-correct.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LocalWorkerAdapter } = _require('./local-worker.js');
      _localWorkerInstance = new LocalWorkerAdapter();
    }
    return _localWorkerInstance;
  },
});

/**
 * Register CoordinatorAdapter factory.
 * Called once at startup when opencode platform is available.
 * ponytail: skip — multiple coordinator instances, named coordinator pools.
 * Add when multi-coordinator support ships.
 */
export function registerCoordinatorAdapter(factory: CoordinatorAdapterFactory): void {
  globalRegistry.register('coordinator', {
    create(): WorkerAdapter {
      // CoordinatorAdapter implements WorkerAdapter interface via adapter pattern
      return factory.create(null);
    },
  });
}

// Coordinator adapter placeholder - registered when opencode platform initializes
let _coordinatorAdapter: WorkerAdapter | null = null;
export function setCoordinatorAdapter(adapter: WorkerAdapter): void {
  _coordinatorAdapter = adapter;
  if (_coordinatorAdapter) {
    globalRegistry.registerSync('coordinator', _coordinatorAdapter);
  }
}

export { globalRegistry as adapterRegistry };

export type { WorkerAdapter, DelegationAssignment, DelegationReceipt };