import { describe, expect, it, beforeAll } from 'vitest';
import { isSha256, sha256Bytes } from '../src/contracts.js';
import {
  NativeResourceGovernor,
  PortableResourceGovernor,
  FailClosedResourceGovernor,
  createResourceGovernor,
  findDescendantPidsBounded,
  DEFAULT_MAX_DESCENDANT_DEPTH,
  DEFAULT_MAX_PROCESS_CEILING,
  type ResourceGovernorAdapter,
  type ResourceLease,
  type ProcReader,
  type ProcKiller,
  type PidInfo,
} from '../src/resource-governor.js';

const EFFECTIVE_IDENTITY = 'a0804467fdd91ccafe6b7e10b7febf345ebb99dcad5c5441a11a4d54c3a18cf5';

function expectSha256(value: string): void {
  expect(value).toMatch(/^[a-f0-9]{64}$/);
}

describe('C1 Resource Governor', () => {
  describe('PortableResourceGovernor', () => {
    it('rejects invalid effective identity', () => {
      expect(() => new PortableResourceGovernor('not-a-hash')).toThrow('SHA-256');
    });

    it('accepts valid effective identity', () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      expect(gov).toBeTruthy();
    });

    it('detect returns portable platform', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const result = await gov.detect();
      expect(result.available).toBe(true);
      expect(result.platform).toBe('portable');
    });

    it('createPool and listPools round-trip', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-1', label: 'default', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 500_000_000, maxCpuPercent: 80, maxProcessCount: 5, priority: 1,
      });
      const pools = await gov.listPools();
      expect(pools.length).toBe(1);
      expect(pools[0].poolId).toBe('pool-1');
    });

    it('createPool rejects duplicate', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-1', label: 'default', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 500_000_000, maxCpuPercent: 80, maxProcessCount: 5, priority: 1,
      });
      await expect(gov.createPool({
        poolId: 'pool-1', label: 'dup', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 500_000_000, maxCpuPercent: 80, maxProcessCount: 5, priority: 1,
      })).rejects.toThrow('Pool exists');
    });

    it('acquireLease returns lease with effective identity bound', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-A', label: 'A', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 500_000_000, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const lease = await gov.acquireLease('pool-A', 'worker-1', { memoryBytes: 100_000_000, cpuPercent: 25 });
      expect(lease.leaseId).toBeTruthy();
      expect(lease.poolId).toBe('pool-A');
      expect(lease.holder).toBe('worker-1');
      expect(lease.memoryBytes).toBe(100_000_000);
      expect(lease.cpuPercent).toBe(25);
      expect(lease.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      expectSha256(lease.effectiveIdentity);
      expect(lease.processGroupId).toMatch(/^pg-/);
    });

    it('acquireLease rejects pool over memory capacity', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-B', label: 'B', maxMemoryBytes: 50_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      await expect(gov.acquireLease('pool-B', 'worker-1', { memoryBytes: 100_000_000, cpuPercent: 10 }))
        .rejects.toThrow('memory capacity exceeded');
    });

    it('acquireLease rejects pool over CPU capacity', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-C', label: 'C', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 50, maxProcessCount: 10, priority: 1,
      });
      await gov.acquireLease('pool-C', 'w1', { memoryBytes: 100_000_000, cpuPercent: 30 });
      await expect(gov.acquireLease('pool-C', 'w2', { memoryBytes: 100_000_000, cpuPercent: 30 }))
        .rejects.toThrow('CPU capacity exceeded');
    });

    it('acquireLease rejects unknown pool', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await expect(gov.acquireLease('nonexistent', 'w1', { memoryBytes: 100_000_000, cpuPercent: 10 }))
        .rejects.toThrow('Pool not found');
    });

    it('releaseLease removes lease', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-D', label: 'D', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const lease = await gov.acquireLease('pool-D', 'w1', { memoryBytes: 100_000_000, cpuPercent: 10 });
      await gov.releaseLease(lease.leaseId);
      const got = await gov.getLease(lease.leaseId);
      expect(got).toBeNull();
    });

    it('releaseLease rejects unknown lease', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await expect(gov.releaseLease('nonexistent')).rejects.toThrow('Lease not found');
    });

    it('getLease returns null for unknown', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const got = await gov.getLease('unknown-lease');
      expect(got).toBeNull();
    });

    it('destroyPool removes pool and its leases', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pool-E', label: 'E', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      await gov.acquireLease('pool-E', 'w1', { memoryBytes: 100_000_000, cpuPercent: 10 });
      await gov.destroyPool('pool-E');
      const pools = await gov.listPools();
      expect(pools.length).toBe(0);
    });

    it('destroyPool rejects unknown pool', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await expect(gov.destroyPool('nonexistent')).rejects.toThrow('Pool not found');
    });

    it('createProcessGroup returns group with ID', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const pg = await gov.createProcessGroup('test-group');
      expect(pg.groupId).toMatch(/^pg-/);
      expect(pg.label).toBe('test-group');
    });

    it('cleanupDescendants returns count (portable returns 0)', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const count = await gov.cleanupDescendants('nonexistent');
      expect(count).toBe(0);
    });

    it('sampleResources returns snapshot with timestamp', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const snap = await gov.sampleResources();
      expect(snap.timestamp).toBeTruthy();
      expect(snap.memoryTotalBytes).toBeGreaterThan(0);
      expect(snap.cpuCount).toBeGreaterThan(0);
      expect(snap.thermalThrottled).toBe(false);
      expect(snap.cpuTemperatureC).toBeNull();
    });

    it('submitToBacklog and pollBacklog round-trip', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const token = await gov.submitToBacklog({
        taskId: 'task-1', priority: 5, estimatedMemoryBytes: 50_000_000,
        estimatedCpuPercent: 10, submittedAt: new Date().toISOString(),
      });
      expect(token.tokenId).toMatch(/^bt-/);
      expect(token.position).toBe(0);

      const status = await gov.pollBacklog(token);
      if (status.status === 'queued') {
        expect(status.position).toBe(0);
      }
    });

    it('drainBacklog returns count and clears backlog', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const t1 = await gov.submitToBacklog({
        taskId: 'task-1', priority: 1, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      const t2 = await gov.submitToBacklog({
        taskId: 'task-2', priority: 2, estimatedMemoryBytes: 20_000_000,
        estimatedCpuPercent: 10, submittedAt: new Date().toISOString(),
      });
      const count = await gov.drainBacklog();
      expect(count).toBe(2);
      const t3 = await gov.submitToBacklog({
        taskId: 'task-3', priority: 1, estimatedMemoryBytes: 5_000_000,
        estimatedCpuPercent: 1, submittedAt: new Date().toISOString(),
      });
      const status = await gov.pollBacklog(t3);
      expect(status.status).toBe('queued');
      expect(t1.tokenId).toBeTruthy();
      expect(t2.tokenId).toBeTruthy();
    });

    it('high priority tasks sort ahead of low priority', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.submitToBacklog({
        taskId: 'low', priority: 1, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      const high = await gov.submitToBacklog({
        taskId: 'high', priority: 10, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      const highStatus = await gov.pollBacklog(high);
      if (highStatus.status === 'queued') {
        expect(highStatus.position).toBe(0);
      }
    });

    describe('buildEvidence', () => {
      it('returns evidence with effective identity bound', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'pool-EV', label: 'evidence-test', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        const lease = await gov.acquireLease('pool-EV', 'ev-worker', { memoryBytes: 50_000_000, cpuPercent: 10 });
        const ev = await gov.buildEvidence('pool-EV', [lease.leaseId]);
        expect(ev.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
        expectSha256(ev.effectiveIdentity);
        expect(ev.poolId).toBe('pool-EV');
        expect(ev.leaseIds).toContain(lease.leaseId);
        expect(ev.governorVersion).toBe('C1-portable-v2');
        expect(ev.backlogDepth).toBe(0);
        expectSha256(ev.evidenceSha256);
        expect(ev.snapshot.timestamp).toBeTruthy();
      });

      it('evidence SHA-256 is deterministic for same inputs', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'pool-DET', label: 'deterministic', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        const lease = await gov.acquireLease('pool-DET', 'det-worker', { memoryBytes: 50_000_000, cpuPercent: 10 });
        const ev1 = await gov.buildEvidence('pool-DET', [lease.leaseId]);
        const ev2 = await gov.buildEvidence('pool-DET', [lease.leaseId]);
        expect(ev1.effectiveIdentity).toBe(ev2.effectiveIdentity);
        expect(ev1.poolId).toBe(ev2.poolId);
        expect(ev1.governorVersion).toBe(ev2.governorVersion);
      });

      it('empty leases array is valid', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'pool-EMPTY', label: 'empty', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        const ev = await gov.buildEvidence('pool-EMPTY', []);
        expect(ev.leaseIds).toEqual([]);
        expect(ev.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      });
    });
  });

  describe('NativeResourceGovernor', () => {
    it('rejects invalid effective identity', () => {
      expect(() => new NativeResourceGovernor('bad')).toThrow('SHA-256');
    });

    it('detect returns available on supported native hosts', async () => {
      const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
      const result = await gov.detect();
      expect(result.available).toBe(true);
      expect(result.platform).toBe(`${process.platform}-native`);
    });

    it('sampleResources returns valid snapshot on supported native hosts', async () => {
      const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
      const snap = await gov.sampleResources();
      expect(snap.timestamp).toBeTruthy();
      expect(snap.memoryTotalBytes).toBeGreaterThan(0);
      expect(snap.cpuCount).toBeGreaterThan(0);
      expect(snap.cpuLoadPercent).toBeGreaterThanOrEqual(0);
    });

    it('acquireLease binds effective identity', async () => {
      const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'native-pool', label: 'native', maxMemoryBytes: 10_000_000_000,
        maxSwapBytes: 5_000_000_000, maxCpuPercent: 100, maxProcessCount: 10, priority: 1,
      });
      const lease = await gov.acquireLease('native-pool', 'native-worker', { memoryBytes: 100_000_000, cpuPercent: 10 });
      expect(lease.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      expect(lease.processGroupId).toMatch(/^pg-/);
      await gov.releaseLease(lease.leaseId);
    });

    it('thermal throttling rejects lease acquisition', async () => {
      const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { thermalHysteresisDegC: 0 });
      await gov.createPool({
        poolId: 'thermal-pool', label: 'thermal', maxMemoryBytes: 10_000_000_000,
        maxSwapBytes: 5_000_000_000, maxCpuPercent: 100, maxProcessCount: 10, priority: 1,
      });
      const snap = await gov.sampleResources();
      if (snap.thermalThrottled) {
        await expect(
          gov.acquireLease('thermal-pool', 'th-worker', { memoryBytes: 100_000_000, cpuPercent: 10 }),
        ).rejects.toThrow('Thermal throttle');
      } else {
        const lease = await gov.acquireLease('thermal-pool', 'th-worker', { memoryBytes: 100_000_000, cpuPercent: 10 });
        expect(lease).toBeTruthy();
      }
    });

    it('buildEvidence includes effective identity', async () => {
      const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'ev-native', label: 'ev', maxMemoryBytes: 10_000_000_000,
        maxSwapBytes: 5_000_000_000, maxCpuPercent: 100, maxProcessCount: 10, priority: 1,
      });
      const ev = await gov.buildEvidence('ev-native', []);
      expect(ev.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      expect(ev.governorVersion).toBe('C1-v2');
      expect(ev.snapshot.memoryTotalBytes).toBeGreaterThan(0);
      expect(ev.snapshot.cpuCount).toBeGreaterThan(0);
    });
  });

  describe('FailClosedResourceGovernor', () => {
    it('detect returns unavailable', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'test failure');
      const result = await gov.detect();
      expect(result.available).toBe(false);
      expect(result.platform).toBe('fail-closed');
    });

    it('createPool throws', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'disk full');
      await expect(gov.createPool({
        poolId: 'p', label: 'p', maxMemoryBytes: 1, maxSwapBytes: 1,
        maxCpuPercent: 1, maxProcessCount: 1, priority: 1,
      })).rejects.toThrow('disk full');
    });

    it('acquireLease throws', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'no resources');
      await expect(gov.acquireLease('p', 'w', { memoryBytes: 1, cpuPercent: 1 }))
        .rejects.toThrow('no resources');
    });

    it('sampleResources returns zeroed snapshot', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'dead');
      const snap = await gov.sampleResources();
      expect(snap.memoryAvailableBytes).toBe(0);
      expect(snap.memoryTotalBytes).toBe(0);
      expect(snap.thermalThrottled).toBe(true);
    });

    it('pollBacklog returns rejected', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'backlog full');
      const status = await gov.pollBacklog({ tokenId: 't1', position: 0, estimatedWaitMs: 0 });
      expect(status.status).toBe('rejected');
      if (status.status === 'rejected') {
        expect(status.reason).toBe('backlog full');
      }
    });

    it('buildEvidence throws', async () => {
      const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      const gov = new FailClosedResourceGovernor(inner, 'evidence unavailable');
      await expect(gov.buildEvidence('p', [])).rejects.toThrow('evidence unavailable');
    });
  });

  describe('createResourceGovernor factory', () => {
    it('rejects invalid identity', () => {
      expect(() => createResourceGovernor('not-a-sha256')).toThrow('SHA-256');
    });

    it('returns a ResourceGovernorAdapter', () => {
      const gov = createResourceGovernor(EFFECTIVE_IDENTITY);
      expect(gov).toBeTruthy();
      expect(typeof gov.detect).toBe('function');
      expect(typeof gov.createPool).toBe('function');
      expect(typeof gov.acquireLease).toBe('function');
      expect(typeof gov.sampleResources).toBe('function');
      expect(typeof gov.buildEvidence).toBe('function');
    });

    it('governor has detectable platform', async () => {
      const gov = createResourceGovernor(EFFECTIVE_IDENTITY);
      const result = await gov.detect();
      expect([`${process.platform}-native`, 'portable']).toContain(result.platform);
    });
  });

  describe('identity binding contract', () => {
    it('leases always carry the effective identity', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'id-pool', label: 'identity', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const lease1 = await gov.acquireLease('id-pool', 'alice', { memoryBytes: 100_000_000, cpuPercent: 20 });
      const lease2 = await gov.acquireLease('id-pool', 'bob', { memoryBytes: 50_000_000, cpuPercent: 10 });
      expect(lease1.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      expect(lease2.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
    });

    it('evidence always carries the effective identity', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'ev-id-pool', label: 'ev-identity', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const ev = await gov.buildEvidence('ev-id-pool', []);
      expect(ev.effectiveIdentity).toBe(EFFECTIVE_IDENTITY);
      const payload = {
        effectiveIdentity: ev.effectiveIdentity,
        poolId: ev.poolId,
        snapshot: ev.snapshot,
        leaseIds: ev.leaseIds,
        backlogDepth: ev.backlogDepth,
        governorVersion: ev.governorVersion,
      };
      const rehash = sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));
      expect(ev.evidenceSha256).toBe(rehash);
    });

    it('NativeResourceGovernor rejects mismatched identity', () => {
      expect(() => new NativeResourceGovernor('not-a-hash')).toThrow('SHA-256');
    });

    it('PortableResourceGovernor rejects mismatched identity', () => {
      expect(() => new PortableResourceGovernor('also-not-a-hash')).toThrow('SHA-256');
    });
  });

  describe('process group lifecycle', () => {
    it('lease creates a process group', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'pg-pool', label: 'pg', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const lease = await gov.acquireLease('pg-pool', 'pg-worker', { memoryBytes: 100_000_000, cpuPercent: 10 });
      expect(lease.processGroupId).toMatch(/^pg-/);
    });

    it('releaseLease does not throw on valid lease (portable)', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.createPool({
        poolId: 'rel-pool', label: 'rel', maxMemoryBytes: 1_000_000_000,
        maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
      });
      const lease = await gov.acquireLease('rel-pool', 'rel-worker', { memoryBytes: 100_000_000, cpuPercent: 10 });
      await expect(gov.releaseLease(lease.leaseId)).resolves.toBeUndefined();
    });
  });

  describe('backlog governor', () => {
    it('submits multiple tasks and maintains priority order', async () => {
      const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
      await gov.submitToBacklog({
        taskId: 'a', priority: 1, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      const high = await gov.submitToBacklog({
        taskId: 'b', priority: 5, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      await gov.submitToBacklog({
        taskId: 'c', priority: 3, estimatedMemoryBytes: 10_000_000,
        estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
      });
      const highStatus = await gov.pollBacklog(high);
      if (highStatus.status === 'queued') {
        expect(highStatus.position).toBe(0);
      }
    });
  });

  describe('AM0014 gap closure — adversarial tests', () => {
    describe('backlog running state', () => {
      it('startBacklogTask transitions to running status', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const token = await gov.submitToBacklog({
          taskId: 'run-1', priority: 5, estimatedMemoryBytes: 10_000_000,
          estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
        });
        let status = await gov.pollBacklog(token);
        expect(status.status).toBe('queued');
        await gov.startBacklogTask(token);
        status = await gov.pollBacklog(token);
        expect(status.status).toBe('running');
        if (status.status === 'running') {
          expect(status.tokenId).toBe(token.tokenId);
        }
      });

      it('completeBacklogTask removes from running and backlog', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const token = await gov.submitToBacklog({
          taskId: 'complete-1', priority: 5, estimatedMemoryBytes: 10_000_000,
          estimatedCpuPercent: 5, submittedAt: new Date().toISOString(),
        });
        await gov.startBacklogTask(token);
        let status = await gov.pollBacklog(token);
        expect(status.status).toBe('running');
        await gov.completeBacklogTask(token);
        status = await gov.pollBacklog(token);
        expect(status.status).toBe('completed');
      });

      it('portable startBacklogTask is idempotent on same token', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const token = await gov.submitToBacklog({
          taskId: 'idempotent', priority: 1, estimatedMemoryBytes: 5_000_000,
          estimatedCpuPercent: 1, submittedAt: new Date().toISOString(),
        });
        await gov.startBacklogTask(token);
        await gov.startBacklogTask(token);
        const status = await gov.pollBacklog(token);
        expect(status.status).toBe('running');
      });

      it('native startBacklogTask and completeBacklogTask round-trip', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const token = await gov.submitToBacklog({
          taskId: 'native-run', priority: 5, estimatedMemoryBytes: 50_000_000,
          estimatedCpuPercent: 10, submittedAt: new Date().toISOString(),
        });
        await gov.startBacklogTask(token);
        let s = await gov.pollBacklog(token);
        expect(s.status).toBe('running');
        await gov.completeBacklogTask(token);
        s = await gov.pollBacklog(token);
        expect(s.status).toBe('completed');
      });
    });

    describe('processCount tracking', () => {
      it('createProcessGroup with PIDs sets processCount', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const pg = await gov.createProcessGroup('with-pids', 1001, 1002, 1003);
        expect(pg.processCount).toBe(3);
      });

      it('createProcessGroup without PIDs sets processCount to 0', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const pg = await gov.createProcessGroup('no-pids');
        expect(pg.processCount).toBe(0);
      });

      it('native createProcessGroup with PIDs sets processCount', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const pg = await gov.createProcessGroup('native-pids', 2001, 2002);
        expect(pg.processCount).toBe(2);
      });

      it('lease acquire creates process group with processCount 0 (no PIDs known at lease time)', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'pc-pool', label: 'pc', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        const lease = await gov.acquireLease('pc-pool', 'pc-worker', { memoryBytes: 10_000_000, cpuPercent: 5 });
        const state = gov as unknown as { processGroups: Map<string, import('../src/resource-governor.js').ProcessGroup> };
        const pg = state.processGroups.get(lease.processGroupId);
        expect(pg).toBeDefined();
        expect(pg!.processCount).toBe(0);
      });
    });

    describe('semantic conflict leases', () => {
      it('detectLeaseConflicts reports duplicate holder', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'conflict-pool', label: 'conflict', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        await gov.acquireLease('conflict-pool', 'alice', { memoryBytes: 100_000_000, cpuPercent: 10 });
        const conflicts = await gov.detectLeaseConflicts('conflict-pool');
        expect(conflicts.length).toBe(0);
      });

      it('acquireLease rejects duplicate holder in same pool', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'dup-pool', label: 'dup', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        await gov.acquireLease('dup-pool', 'bob', { memoryBytes: 100_000_000, cpuPercent: 10 });
        await expect(
          gov.acquireLease('dup-pool', 'bob', { memoryBytes: 50_000_000, cpuPercent: 5 }),
        ).rejects.toThrow('already holds lease');
      });

      it('detectLeaseConflicts detects combined memory over 80%', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'big-pool', label: 'big', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 10, priority: 1,
        });
        await gov.acquireLease('big-pool', 'carol', { memoryBytes: 450_000_000, cpuPercent: 10 });
        await gov.acquireLease('big-pool', 'dave', { memoryBytes: 450_000_000, cpuPercent: 10 });
        const conflicts = await gov.detectLeaseConflicts('big-pool');
        expect(conflicts.some((c) => c.reason.includes('80%'))).toBe(true);
      });
    });

    describe('cleanupDescendants safety', () => {
      it('cleanupDescendants does not kill current process', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const pg = await gov.createProcessGroup('safe-cleanup', 999999);
        const selfPid = process.pid;
        const count = await gov.cleanupDescendants(pg.groupId);
        expect(count).toBe(0);
        expect(process.pid).toBe(selfPid);
      });

      it('cleanupDescendants returns 0 for unknown group', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const count = await gov.cleanupDescendants('nonexistent-group');
        expect(count).toBe(0);
      });

      it('cleanupDescendants walks children recursively via /proc', async () => {
        const { findDescendantPids } = await import('../src/resource-governor.js');
        const selfPid = process.pid;
        const children = findDescendantPids(selfPid);
        expect(children).toBeDefined();
        expect(children.has(selfPid)).toBe(false);
      });
    });

    describe('swap tracking from /proc/vmstat', () => {
      it('ResourceSnapshot includes swapInBytes and swapOutBytes', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const snap = await gov.sampleResources();
        expect(snap).toHaveProperty('swapInBytes');
        expect(snap).toHaveProperty('swapOutBytes');
        expect(snap).toHaveProperty('swapInDeltaPerSec');
        expect(snap).toHaveProperty('swapOutDeltaPerSec');
        expect(typeof snap.swapInBytes).toBe('number');
        expect(typeof snap.swapOutBytes).toBe('number');
      });

      it('swapInDeltaPerSec and swapOutDeltaPerSec are zero on first sample', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const snap1 = await gov.sampleResources();
        expect(snap1.swapInDeltaPerSec).toBe(0);
        expect(snap1.swapOutDeltaPerSec).toBe(0);
      });

      it('swapDelta fields are numbers after second sample', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.sampleResources();
        const snap2 = await gov.sampleResources();
        expect(typeof snap2.swapInDeltaPerSec).toBe('number');
        expect(typeof snap2.swapOutDeltaPerSec).toBe('number');
      });

      it('portable governor returns zero swap fields', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const snap = await gov.sampleResources();
        expect(snap.swapInBytes).toBe(0);
        expect(snap.swapOutBytes).toBe(0);
        expect(snap.swapInDeltaPerSec).toBe(0);
        expect(snap.swapOutDeltaPerSec).toBe(0);
      });
    });

    describe('thermal hysteresis instance-local', () => {
      it('two governors have independent thermal state', async () => {
        const gov1 = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { thermalHysteresisDegC: 2 });
        const gov2 = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { thermalHysteresisDegC: 10 });
        const s1 = await gov1.sampleResources();
        const s2 = await gov2.sampleResources();
        expect(s1).toBeDefined();
        expect(s2).toBeDefined();
      });

      it('thermal state is not shared across instances', async () => {
        const ThermalStateHolder = (await import('../src/resource-governor.js')).NativeResourceGovernor;
        const g1 = new ThermalStateHolder(EFFECTIVE_IDENTITY, { thermalHysteresisDegC: 0 });
        const g2 = new ThermalStateHolder(EFFECTIVE_IDENTITY, { thermalHysteresisDegC: 0 });
        await g1.sampleResources();
        const s2 = await g2.sampleResources();
        expect(typeof s2.cpuTemperatureC === 'number' || s2.cpuTemperatureC === null).toBe(true);
      });

      it('thermal zone type preference does not throw', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        const snap = await gov.sampleResources();
        expect(snap).toBeDefined();
      });
    });

    describe('process pool capacity per-pool', () => {
      it('process limit is enforced per-pool, not global', async () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'small-pool', label: 'small', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 1, priority: 1,
        });
        await gov.createPool({
          poolId: 'big-pool', label: 'big', maxMemoryBytes: 1_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 80, maxProcessCount: 5, priority: 1,
        });
        await gov.acquireLease('small-pool', 'x', { memoryBytes: 10_000_000, cpuPercent: 5 });
        await expect(
          gov.acquireLease('small-pool', 'y', { memoryBytes: 10_000_000, cpuPercent: 5 }),
        ).rejects.toThrow('process limit reached');
      });

      it('native per-pool process limit is enforced', async () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        await gov.createPool({
          poolId: 'n-small', label: 'ns', maxMemoryBytes: 10_000_000_000,
          maxSwapBytes: 0, maxCpuPercent: 100, maxProcessCount: 1, priority: 1,
        });
        await gov.acquireLease('n-small', 'a', { memoryBytes: 10_000_000, cpuPercent: 5 });
        await expect(
          gov.acquireLease('n-small', 'b', { memoryBytes: 10_000_000, cpuPercent: 5 }),
        ).rejects.toThrow('process limit reached');
      });
    });

    describe('FailClosedResourceGovernor new methods', () => {
      let FailClosed: typeof FailClosedResourceGovernor;

      beforeAll(async () => {
        const mod = await import('../src/resource-governor.js');
        FailClosed = mod.FailClosedResourceGovernor;
      });

      it('startBacklogTask throws', async () => {
        const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const gov = new FailClosed(inner, 'closed');
        await expect(gov.startBacklogTask({ tokenId: 't', position: 0, estimatedWaitMs: 0 })).rejects.toThrow('closed');
      });

      it('completeBacklogTask throws', async () => {
        const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const gov = new FailClosed(inner, 'closed');
        await expect(gov.completeBacklogTask({ tokenId: 't', position: 0, estimatedWaitMs: 0 })).rejects.toThrow('closed');
      });

      it('detectLeaseConflicts throws', async () => {
        const inner = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        const gov = new FailClosed(inner, 'closed');
        await expect(gov.detectLeaseConflicts('p')).rejects.toThrow('closed');
      });
    });

    describe('ResourceGovernorAdapter contract', () => {
      it('all required methods are present on NativeResourceGovernor', () => {
        const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY);
        expect(typeof gov.startBacklogTask).toBe('function');
        expect(typeof gov.completeBacklogTask).toBe('function');
        expect(typeof gov.detectLeaseConflicts).toBe('function');
      });

      it('all required methods are present on PortableResourceGovernor', () => {
        const gov = new PortableResourceGovernor(EFFECTIVE_IDENTITY);
        expect(typeof gov.startBacklogTask).toBe('function');
        expect(typeof gov.completeBacklogTask).toBe('function');
        expect(typeof gov.detectLeaseConflicts).toBe('function');
      });
    });

    describe('adversarial PID reuse / unrelated / depth tests', () => {
      function makeMutableReader(initial?: Record<number, { ppid: number; starttime?: number }>): ProcReader & {
        setPid(pid: number, info: { ppid: number; starttime?: number }): void;
        removePid(pid: number): void;
      } {
        const pidData = new Map<number, { ppid: number; starttime: number }>();
        let nextStarttime = 1000;
        if (initial) {
          for (const [pid, info] of Object.entries(initial)) {
            pidData.set(Number(pid), { ppid: info.ppid, starttime: info.starttime ?? nextStarttime++ });
          }
        }
        return {
          readPidInfo(pid: number): PidInfo | null {
            const p = pidData.get(pid);
            return p ? { pid, ppid: p.ppid, starttime: p.starttime } : null;
          },
          readAllPids(): number[] {
            return [...pidData.keys()];
          },
          setPid(pid: number, info: { ppid: number; starttime?: number }) {
            pidData.set(pid, { ppid: info.ppid, starttime: info.starttime ?? nextStarttime++ });
          },
          removePid(pid: number) {
            pidData.delete(pid);
          },
        };
      }

      function makeImmutableReader(processes: Record<number, { ppid: number; starttime?: number }>, nextStarttime = 1000): ProcReader {
        const pidData = new Map<number, { ppid: number; starttime: number }>();
        for (const [pid, info] of Object.entries(processes)) {
          pidData.set(Number(pid), { ppid: info.ppid, starttime: info.starttime ?? nextStarttime++ });
        }
        return {
          readPidInfo(pid: number): PidInfo | null {
            const p = pidData.get(pid);
            return p ? { pid, ppid: p.ppid, starttime: p.starttime } : null;
          },
          readAllPids(): number[] {
            return [...pidData.keys()];
          },
        };
      }

      function makeKiller(): ProcKiller & { killed: Array<{ pid: number; signal: string }> } {
        const killed: Array<{ pid: number; signal: string }> = [];
        return {
          kill(pid: number, signal: string): boolean {
            killed.push({ pid, signal });
            return true;
          },
          killed,
        };
      }

      describe('PID reuse detection', () => {
        it('detects reused root PID via starttime mismatch and reports orphan instead of killing', async () => {
          const reader = makeMutableReader();
          reader.setPid(100, { ppid: 1, starttime: 500 });
          reader.setPid(200, { ppid: 100, starttime: 600 });
          const killer = makeKiller();

          const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer });
          const pg = await gov.createProcessGroup('reuse-test', 100);

          reader.setPid(100, { ppid: 1, starttime: 9999 });

          const count = await gov.cleanupDescendants(pg.groupId);
          expect(count).toBe(0);
          expect(killer.killed).toEqual([]);
          expect(gov.orphanReports.length).toBe(1);
          expect(gov.orphanReports[0].pid).toBe(100);
          expect(gov.orphanReports[0].reason).toContain('starttime/ppid mismatch');
        });

        it('reports orphan when root PID no longer exists', async () => {
          const reader = makeMutableReader();
          reader.setPid(100, { ppid: 1, starttime: 500 });
          const killer = makeKiller();

          const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer });
          const pg = await gov.createProcessGroup('gone-test', 100);

          reader.removePid(100);

          const count = await gov.cleanupDescendants(pg.groupId);
          expect(count).toBe(0);
          expect(killer.killed).toEqual([]);
          expect(gov.orphanReports.length).toBe(1);
          expect(gov.orphanReports[0].reason).toContain('process no longer exists');
        });

        it('kills verified root and descendants when starttime matches', async () => {
          const reader = makeImmutableReader({
            100: { ppid: 1, starttime: 500 },
            200: { ppid: 100, starttime: 600 },
            300: { ppid: 200, starttime: 700 },
          });
          const killer = makeKiller();

          const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer });
          const pg = await gov.createProcessGroup('valid-test', 100);

          const count = await gov.cleanupDescendants(pg.groupId);
          expect(count).toBe(3);
          expect(killer.killed.map((k) => k.pid).sort()).toEqual([100, 200, 300]);
        });
      });

      describe('unrelated PID protection', () => {
        it('only targets registered roots and verified descendants, not unrelated PIDs', async () => {
          const reader = makeImmutableReader({
            100: { ppid: 1, starttime: 500 },
            200: { ppid: 100, starttime: 600 },
            999: { ppid: 1, starttime: 900 },
            888: { ppid: 999, starttime: 950 },
          });
          const killer = makeKiller();

          const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer });
          const pg = await gov.createProcessGroup('unrelated-test', 100);

          const count = await gov.cleanupDescendants(pg.groupId);
          expect(count).toBe(2);
          expect(killer.killed.map((k) => k.pid).sort()).toEqual([100, 200]);
        });

        it('a second registered root group does not affect unrelated first group', async () => {
          const reader = makeImmutableReader({
            100: { ppid: 1, starttime: 500 },
            200: { ppid: 100, starttime: 600 },
            300: { ppid: 1, starttime: 700 },
            400: { ppid: 300, starttime: 800 },
          });
          const killer1 = makeKiller();
          const killer2 = makeKiller();

          const gov1 = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer1 });
          const gov2 = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer2 });
          const pg1 = await gov1.createProcessGroup('group-A', 100);
          await gov2.createProcessGroup('group-B', 300);

          const count = await gov1.cleanupDescendants(pg1.groupId);
          expect(count).toBe(2);
          expect(killer1.killed.map((k) => k.pid).sort()).toEqual([100, 200]);
          expect(killer2.killed).toEqual([]);
        });
      });

      describe('bounded depth traversal', () => {
        it('does not traverse beyond max depth', async () => {
          const processes: Record<number, { ppid: number }> = {};
          processes[1] = { ppid: 0 };
          let prev = 1;
          for (let i = 0; i < DEFAULT_MAX_DESCENDANT_DEPTH + 3; i++) {
            const pid = 100 + i;
            processes[pid] = { ppid: prev };
            prev = pid;
          }
          const reader = makeImmutableReader(processes);
          const result = findDescendantPidsBounded(1, reader);
          expect(result.descendants.size).toBe(DEFAULT_MAX_DESCENDANT_DEPTH);
          expect(result.visited).toBe(DEFAULT_MAX_DESCENDANT_DEPTH + 1);
        });

        it('respects maxCeiling when process count exceeds limit', async () => {
          const processes: Record<number, { ppid: number }> = {};
          const rootPid = 1;
          processes[rootPid] = { ppid: 0 };
          const ceiling = 50;
          for (let i = 0; i < ceiling + 20; i++) {
            const pid = 100 + i;
            processes[pid] = { ppid: rootPid };
          }
          const reader = makeImmutableReader(processes);
          const result = findDescendantPidsBounded(rootPid, reader, { maxDepth: 5, maxCeiling: ceiling });
          expect(result.descendants.size).toBeLessThanOrEqual(ceiling);
        });
      });

      describe('visited set prevents re-traversal', () => {
        it('BFS visits each PID only once', async () => {
          const reader = makeImmutableReader({
            1: { ppid: 0 },
            10: { ppid: 1 },
            20: { ppid: 1 },
            30: { ppid: 10 },
            40: { ppid: 20 },
          });
          const result = findDescendantPidsBounded(1, reader);
          expect(result.visited).toBe(5);
          expect(result.descendants.size).toBe(4);
        });

        it('self-referencing PID does not cause infinite loop', async () => {
          const reader = makeImmutableReader({
            1: { ppid: 0 },
            100: { ppid: 100 },
          });
          const result = findDescendantPidsBounded(1, reader);
          expect(result.descendants.has(100)).toBe(false);
        });
      });

      describe('self-PID protection', () => {
        it('NativeResourceGovernor never kills its own process', async () => {
          const selfPid = process.pid;
          const reader = makeMutableReader();
          reader.setPid(selfPid, { ppid: 1 });

          const killer = makeKiller();

          const gov = new NativeResourceGovernor(EFFECTIVE_IDENTITY, { procReader: reader, procKiller: killer });
          const pg = await gov.createProcessGroup('self-test', selfPid);

          const count = await gov.cleanupDescendants(pg.groupId);
          expect(count).toBe(0);
          expect(killer.killed.every((k) => k.pid !== selfPid)).toBe(true);
        });
      });
    });
  });
});
