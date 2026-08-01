import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AM0019,
  ResourceBroker,
  SwapChurnTracker,
  evaluateBrokerDecision,
  getResourceBroker,
  initialBrokerDecisionState,
  parsePressureMemory,
  parseVmstatSwap,
  parseMeminfoSwap,
  poolCeilingsForAction,
  psiIsLow,
  readMemoryPsi,
  recommendedConcurrency,
  resetResourceBrokerForTests,
  type BrokerDecisionInput,
  type BrokerDecisionState,
  type PsiSample,
  type GitExec,
} from '../src/resource-broker.js';

const OK_PSI: PsiSample = { available: true, some: { avg10: 0.4, avg60: 0.3, avg300: 0.2, total: 1 }, full: null, source: 'linux-proc' };
const UP_PSI: PsiSample = { available: true, some: { avg10: 2.5, avg60: 1.8, avg300: 1.0, total: 5 }, full: null, source: 'linux-proc' };

function input(overrides: Partial<BrokerDecisionInput>): BrokerDecisionInput {
  return {
    ramFraction: 0.5,
    psi: OK_PSI,
    cpuTempC: 50,
    loadRatio: 0.5,
    swapInDeltaPerSec: 0,
    ...overrides,
  };
}

function fresh(): BrokerDecisionState {
  return initialBrokerDecisionState(0);
}

describe('C4 resource broker — memory PSI', () => {
  it('parses /proc/pressure/memory some+full lines', () => {
    const raw = 'some avg10=0.10 avg60=0.05 avg300=0.01 total=123\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n';
    const psi = parsePressureMemory(raw);
    expect(psi.available).toBe(true);
    expect(psi.source).toBe('linux-proc');
    expect(psi.some).toEqual({ avg10: 0.1, avg60: 0.05, avg300: 0.01, total: 123 });
    expect(psi.full?.avg10).toBe(0);
  });

  it('returns honest UNAVAILABLE for garbage input', () => {
    const psi = parsePressureMemory('not a pressure file\n');
    expect(psi.available).toBe(false);
    expect(psi.source).toBe('unavailable');
    expect(psi.some).toBeNull();
  });

  it('readMemoryPsi does not throw on this host', () => {
    const psi = readMemoryPsi();
    expect(typeof psi.available).toBe('boolean');
  });

  it('psiIsLow respects the 1.0 avg10 boundary', () => {
    expect(psiIsLow({ ...OK_PSI, some: { avg10: 0.99, avg60: 0, avg300: 0, total: 0 } })).toBe(true);
    expect(psiIsLow({ ...OK_PSI, some: { avg10: 1.0, avg60: 0, avg300: 0, total: 0 } })).toBe(false);
    expect(psiIsLow({ available: false, some: null, full: null, source: 'unavailable' })).toBe(false);
  });
});

describe('C4 resource broker — swap churn', () => {
  const VMSTAT_A = 'pgswapin 100\npgswapout 200\n';
  const VMSTAT_B = 'pgswapin 300\npgswapout 250\n';

  it('computes vmstat pswpin/pswpot byte deltas per second', () => {
    const t = new SwapChurnTracker();
    const first = t.update({ vmstat: VMSTAT_A }, 1000);
    expect(first.available).toBe(true);
    expect(first.source).toBe('vmstat');
    expect(first.swapInDeltaPerSec).toBe(0);

    const second = t.update({ vmstat: VMSTAT_B }, 3000); // 2s apart, 200 pages in
    expect(second.swapInDeltaPerSec).toBe((200 * 4096) / 2);
    expect(second.swapOutDeltaPerSec).toBe((50 * 4096) / 2);
  });

  it('parses vmstat raw lines', () => {
    expect(parseVmstatSwap('pgswapin 42\npgswapout 7\n')).toEqual({ pswpInPages: 42, pswpOutPages: 7 });
  });

  it('falls back to meminfo SwapFree/SwapCached movement', () => {
    const t = new SwapChurnTracker();
    const memA = 'SwapTotal: 100000 kB\nSwapFree: 80000 kB\nSwapCached: 5000 kB\n';
    const memB = 'SwapTotal: 100000 kB\nSwapFree: 60000 kB\nSwapCached: 4000 kB\n';
    t.update({ meminfo: memA }, 1000);
    const sample = t.update({ meminfo: memB }, 2000);
    // usedA = 100000-80000-5000 = 15000 kB; usedB = 100000-60000-4000 = 36000 kB
    expect(sample.source).toBe('meminfo');
    expect(sample.swapInDeltaPerSec).toBe((36000 - 15000) * 1024);
    expect(sample.swapOutDeltaPerSec).toBe(0);
  });

  it('reports none when no source is available (portable fallback)', () => {
    const t = new SwapChurnTracker();
    const sample = t.update({}, 1000);
    expect(sample.available).toBe(false);
    expect(sample.source).toBe('none');
    expect(sample.swapInDeltaPerSec).toBe(0);
  });

  it('parseMeminfoSwap reads the three fields', () => {
    const raw = 'SwapTotal: 100000 kB\nSwapFree: 80000 kB\nSwapCached: 5000 kB\n';
    expect(parseMeminfoSwap(raw)).toEqual({ swapTotalBytes: 100000 * 1024, swapFreeBytes: 80000 * 1024, swapCachedBytes: 5000 * 1024 });
  });
});

describe('C4 resource broker — AM-0019 decision table boundaries', () => {
  it('burst fires at RAM exactly 30% with cool CPU, low PSI, no swap-in', () => {
    const { decision } = evaluateBrokerDecision(input({ ramFraction: 0.3, cpuTempC: 77.99 }), fresh(), 0);
    expect(decision.action).toBe('burst');
    expect(decision.mode).toBe('burst');
  });

  it('burst does not fire below 30% RAM', () => {
    const { decision } = evaluateBrokerDecision(input({ ramFraction: 0.2999 }), fresh(), 0);
    expect(decision.action).toBe('normal');
  });

  it('burst requires CPU strictly below 78C', () => {
    expect(evaluateBrokerDecision(input({ cpuTempC: 78 }), fresh(), 0).decision.action).toBe('normal');
    expect(evaluateBrokerDecision(input({ cpuTempC: 77 }), fresh(), 0).decision.action).toBe('burst');
  });

  it('burst is blocked by non-negligible swap-in (at threshold it now triggers reduce)', () => {
    const d = evaluateBrokerDecision(
      input({ swapInDeltaPerSec: AM0019.SWAP_IN_NEGLIGIBLE_BYTES_PER_SEC }),
      fresh(), 0,
    ).decision;
    expect(d.action).toBe('reduce');
  });

  it('swap-in reduce boundary: below threshold stays normal, at/above triggers reduce', () => {
    // Non-burst RAM keeps below-threshold swap-in inside the normal envelope.
    const below = evaluateBrokerDecision(
      input({ ramFraction: 0.26, swapInDeltaPerSec: AM0019.REDUCE_SWAP_IN_BYTES_PER_SEC - 1 }),
      fresh(), 0,
    ).decision;
    expect(below.action).toBe('normal');

    const at = evaluateBrokerDecision(
      input({ ramFraction: 0.26, swapInDeltaPerSec: AM0019.REDUCE_SWAP_IN_BYTES_PER_SEC }),
      fresh(), 0,
    ).decision;
    expect(at.action).toBe('reduce');
    expect(at.reasons.some((r) => r.includes('swap-in'))).toBe(true);

    const above = evaluateBrokerDecision(
      input({ swapInDeltaPerSec: AM0019.REDUCE_SWAP_IN_BYTES_PER_SEC + 4096 }),
      fresh(), 0,
    ).decision;
    expect(above.action).toBe('reduce');
  });

  it('burst requires PSI low when PSI is available', () => {
    expect(evaluateBrokerDecision(input({ psi: UP_PSI }), fresh(), 0).decision.action).toBe('reduce');
  });

  it('UNAVAILABLE PSI degrades gracefully and does not block burst', () => {
    const psi = { available: false, some: null, full: null, source: 'unavailable' as const };
    const d = evaluateBrokerDecision(input({ psi }), fresh(), 0).decision;
    expect(d.action).toBe('burst');
  });

  it('reduce fires at RAM strictly below 20% (20% itself is not reduce)', () => {
    expect(evaluateBrokerDecision(input({ ramFraction: 0.2 }), fresh(), 0).decision.action).not.toBe('reduce');
    const d = evaluateBrokerDecision(input({ ramFraction: 0.1999 }), fresh(), 0).decision;
    expect(d.action).toBe('reduce');
    expect(d.reasons.some((r) => r.includes('RAM below 20%'))).toBe(true);
  });

  it('reduce fires at CPU >= 85C (84.99 is not reduce)', () => {
    expect(evaluateBrokerDecision(input({ cpuTempC: 84.99 }), fresh(), 0).decision.action).not.toBe('reduce');
    expect(evaluateBrokerDecision(input({ cpuTempC: 85 }), fresh(), 0).decision.action).toBe('reduce');
  });

  it('reduce fires when PSI crosses the low threshold', () => {
    const up = { ...OK_PSI, some: { avg10: 1.0, avg60: 1.0, avg300: 1.0, total: 1 } };
    expect(evaluateBrokerDecision(input({ psi: up }), fresh(), 0).decision.action).toBe('reduce');
  });

  it('reduce fires only when load ratio strictly exceeds 1.25x logical CPUs', () => {
    expect(evaluateBrokerDecision(input({ loadRatio: 1.25 }), fresh(), 0).decision.action).not.toBe('reduce');
    const d = evaluateBrokerDecision(input({ loadRatio: 1.2501 }), fresh(), 0).decision;
    expect(d.action).toBe('reduce');
    expect(d.reasons.some((r) => r.includes('1.25'))).toBe(true);
  });

  it('pause fires at RAM strictly below 12% (12% itself is not pause)', () => {
    expect(evaluateBrokerDecision(input({ ramFraction: 0.12 }), fresh(), 0).decision.action).not.toBe('pause');
    const d = evaluateBrokerDecision(input({ ramFraction: 0.1199 }), fresh(), 0).decision;
    expect(d.action).toBe('pause');
    expect(d.mode).toBe('paused');
  });

  it('pause fires at CPU >= 92C (91.99 is not pause)', () => {
    expect(evaluateBrokerDecision(input({ cpuTempC: 91.99 }), fresh(), 0).decision.action).not.toBe('pause');
    const d = evaluateBrokerDecision(input({ cpuTempC: 92 }), fresh(), 0).decision;
    expect(d.action).toBe('pause');
  });

  it('pause is sticky while pause conditions persist', () => {
    const paused = evaluateBrokerDecision(input({ ramFraction: 0.1 }), fresh(), 0).next;
    expect(paused.mode).toBe('paused');
    const again = evaluateBrokerDecision(input({ ramFraction: 0.1, cpuTempC: 95 }), paused, 10_000);
    expect(again.decision.action).toBe('pause');
    expect(again.decision.mode).toBe('paused');
  });

  it('resume requires RAM >= 25% and CPU <= 78C sustained for 60s', () => {
    const paused = evaluateBrokerDecision(input({ ramFraction: 0.1 }), fresh(), 0).next;
    // Not yet eligible (RAM too low).
    const stillPaused = evaluateBrokerDecision(input({ ramFraction: 0.2, cpuTempC: 50 }), paused, 1000);
    expect(stillPaused.decision.action).toBe('pause');

    // Eligible but hysteresis window has not elapsed.
    const inWindow = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78 }), stillPaused.next, 1000);
    expect(inWindow.decision.action).toBe('pause');
    expect(inWindow.next.resumeCandidateSince).toBe(1000);

    // 59s more: still inside the 60s window.
    const before = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78 }), inWindow.next, 60_999);
    expect(before.decision.action).toBe('pause');

    // Window elapsed -> resume.
    const resumed = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78 }), inWindow.next, 61_000);
    expect(resumed.decision.action).toBe('resume');
    expect(resumed.decision.mode).not.toBe('paused');
  });

  it('resume requires CPU at most 78C (78.1 keeps pausing)', () => {
    const paused = evaluateBrokerDecision(input({ ramFraction: 0.1 }), fresh(), 0).next;
    const inWindow = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78 }), paused, 1000);
    const d = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78.1 }), inWindow.next, 1000 + AM0019.RESUME_HYSTERESIS_MS + 1);
    expect(d.decision.action).toBe('pause');
    expect(d.decision.mode).toBe('paused');
  });

  it('a paused broker drops out of pause and can burst again after resume', () => {
    const paused = evaluateBrokerDecision(input({ ramFraction: 0.1 }), fresh(), 0).next;
    const win = evaluateBrokerDecision(input({ ramFraction: 0.25, cpuTempC: 78 }), paused, 1000).next;
    const resumed = evaluateBrokerDecision(input({ ramFraction: 0.35, cpuTempC: 60, psi: OK_PSI, swapInDeltaPerSec: 0 }), win, 1000 + AM0019.RESUME_HYSTERESIS_MS);
    expect(resumed.decision.action).toBe('resume');
    const after = evaluateBrokerDecision(input({ ramFraction: 0.35, cpuTempC: 60, psi: OK_PSI, swapInDeltaPerSec: 0 }), resumed.next, 1000 + AM0019.RESUME_HYSTERESIS_MS + 1);
    expect(after.decision.action).toBe('burst');
  });

  it('normal fires inside the envelope (RAM 25%..30%, cool, low load)', () => {
    const d = evaluateBrokerDecision(input({ ramFraction: 0.26, cpuTempC: 70, loadRatio: 1.0 }), fresh(), 0).decision;
    expect(d.action).toBe('normal');
  });
});

describe('C4 resource broker — concurrency and C2 alignment', () => {
  it('burst maps to 10-14 light agents / heavy 8', () => {
    const c = recommendedConcurrency('burst');
    expect(c.agents).toBe(AM0019.BURST_MAX_AGENTS);
    expect(c.agents).toBeGreaterThanOrEqual(AM0019.BURST_MIN_AGENTS);
  });

  it('pause maps to zero heavy concurrency', () => {
    expect(recommendedConcurrency('pause').heavy).toBe(0);
  });

  it('pool ceilings align with C2 POOL_CEILINGS shape', () => {
    const burst = poolCeilingsForAction('burst');
    expect(burst.total).toBe(14);
    expect(burst.writers).toBe(8);
    expect(burst.browser).toBe(4);
    const normal = poolCeilingsForAction('normal');
    expect(normal.browser).toBe(2);
    const pause = poolCeilingsForAction('pause');
    expect(pause.browser).toBe(1);
    expect(pause.build).toBe(0);
  });
});

describe('C4 resource broker — browser/MCP pool', () => {
  let broker: ResourceBroker;

  beforeEach(() => {
    broker = new ResourceBroker({ now: () => 0 });
  });

  it('honors the pool ceiling and reports waiting (nonterminal)', () => {
    for (let i = 0; i < 4; i++) {
      const r = broker.acquire('browser', `holder-${i}`);
      expect(r.acquired).toBe(true);
    }
    expect(broker.poolStats().browser.used).toBe(4);
    const fifth = broker.acquire('browser', 'holder-5');
    expect(fifth.acquired).toBe(false);
    if (!fifth.acquired) {
      expect(fifth.reason).toBe('pool-full');
      expect(fifth.waiting).toBe(true);
      expect(fifth.position).toBe(4);
    }
  });

  it('release frees a slot for the next acquirer', () => {
    const first = broker.acquire('browser', 'a');
    const second = broker.acquire('browser', 'b');
    if (!first.acquired || !second.acquired) throw new Error('expected acquired');
    expect(broker.release(first.lease.leaseId)).toBe(true);
    expect(broker.release(first.lease.leaseId)).toBe(false); // double release is a no-op
    const next = broker.acquire('browser', 'c');
    expect(next.acquired).toBe(true);
  });

  it('browser and mcp pools are independent', () => {
    for (let i = 0; i < 4; i++) broker.acquire('browser', `h${i}`);
    const mcp = broker.acquire('mcp', 'm1');
    expect(mcp.acquired).toBe(true);
    expect(broker.poolStats().browser.used).toBe(4);
    expect(broker.poolStats().mcp.used).toBe(1);
  });

  it('releaseAll reclaims every lease for a crashed holder', () => {
    broker.acquire('browser', 'victim');
    broker.acquire('mcp', 'victim');
    broker.acquire('browser', 'other');
    expect(broker.releaseAll('victim')).toBe(2);
    expect(broker.poolStats().browser.active).toBe(1);
    expect(broker.poolStats().mcp.used).toBe(0);
  });

  it('releaseForProcessGroup frees leases bound to a crashed process group', () => {
    const r1 = broker.acquire('browser', 'a', { processGroupId: 'pg-1' });
    const r2 = broker.acquire('mcp', 'a', { processGroupId: 'pg-1' });
    broker.acquire('browser', 'a', { processGroupId: 'pg-2' });
    expect(r1.acquired && r2.acquired).toBe(true);
    expect(broker.releaseForProcessGroup('pg-1')).toBe(2);
    expect(broker.poolStats().browser.active).toBe(1);
  });

  it('custom ceiling is honored per acquire', () => {
    broker.acquire('browser', 'a', { ceiling: 1 });
    const r = broker.acquire('browser', 'b', { ceiling: 1 });
    expect(r.acquired).toBe(false);
  });
});

describe('C4 resource broker — crash reclamation', () => {
  it('reclaimProcessGroup kills the tree via governor and frees leases', async () => {
    const broker = new ResourceBroker({ now: () => 0 });
    const pg = await broker.governor.createProcessGroup('crash-test', 999999);
    broker.acquire('browser', 'crashed-holder', { processGroupId: pg.groupId });
    const result = await broker.reclaimProcessGroup(pg.groupId);
    expect(result.killed).toBe(0); // nonexistent pid, nothing killed
    expect(result.leasesReleased).toBe(1);
    expect(broker.poolStats().browser.used).toBe(0);
  });
});

describe('C4 resource broker — abandoned worktree reclamation (C3 lease files)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-reclaim-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeLease(taskId: string, overrides: Record<string, unknown> = {}) {
    const dir = path.join(root, 'state', 'leases');
    fs.mkdirSync(dir, { recursive: true });
    const lease = {
      schema: 'artifact/worktree-lease',
      taskId,
      branch: `feature/${taskId}`,
      worktreePath: path.join(root, 'worktrees', taskId),
      ownedPaths: [],
      semanticResources: [],
      dependencyRank: 0,
      dependencyRankSource: 'default',
      createdAt: new Date().toISOString(),
      state: 'ACTIVE',
      ...overrides,
    };
    fs.writeFileSync(path.join(dir, `${taskId}.lease.json`), `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
    return lease;
  }

  it('flags ACTIVE leases whose worktree directory is missing', async () => {
    writeLease('task-1');
    const broker = new ResourceBroker({ now: () => Date.now() });
    const found = await broker.findAbandonedWorktreeLeases(root);
    expect(found.length).toBe(1);
    expect(found[0].taskId).toBe('task-1');
    expect(found[0].reason).toBe('worktree-missing');
  });

  it('flags stale ACTIVE leases beyond the max age', async () => {
    const old = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    fs.mkdirSync(path.join(root, 'worktrees', 'task-stale'), { recursive: true });
    writeLease('task-stale', { createdAt: old });
    const broker = new ResourceBroker({ now: () => Date.now(), worktreeReclaimMaxAgeMs: 4 * 60 * 60 * 1000 });
    const found = await broker.findAbandonedWorktreeLeases(root);
    expect(found.length).toBe(1);
    expect(found[0].reason).toBe('lease-stale');
  });

  it('ignores RELEASED leases and fresh ACTIVE leases with live worktrees', async () => {
    writeLease('done', { state: 'RELEASED' });
    writeLease('live');
    fs.mkdirSync(path.join(root, 'worktrees', 'live'), { recursive: true });
    const broker = new ResourceBroker({ now: () => Date.now() });
    const found = await broker.findAbandonedWorktreeLeases(root);
    expect(found.length).toBe(0);
  });

  it('reclaims: removes worktree, prunes, and marks the lease RECLAIMED', async () => {
    const taskDir = path.join(root, 'worktrees', 'task-1');
    fs.mkdirSync(taskDir, { recursive: true });
    writeLease('task-1', { createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() });
    const gitExec: GitExec = (args) => {
      if (args[0] === 'worktree' && args[1] === 'remove') {
        fs.rmSync(taskDir, { recursive: true, force: true });
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const broker = new ResourceBroker({ now: () => Date.now(), gitExec });
    const records = await broker.reclaimAbandonedWorktreeLeases(root);
    expect(records.length).toBe(1);
    expect(records[0].removed).toBe(true);
    expect(records[0].markedReclaimed).toBe(true);
    const updated = JSON.parse(fs.readFileSync(path.join(root, 'state', 'leases', 'task-1.lease.json'), 'utf-8'));
    expect(updated.state).toBe('RECLAIMED');
  });

  it('reclaims a worktree-missing lease via prune without touching files', async () => {
    writeLease('ghost');
    const gitExec: GitExec = () => ({ status: 0, stdout: '', stderr: '' });
    const broker = new ResourceBroker({ now: () => Date.now(), gitExec });
    const records = await broker.reclaimAbandonedWorktreeLeases(root);
    expect(records.length).toBe(1);
    expect(records[0].removed).toBe(true);
    expect(records[0].markedReclaimed).toBe(true);
  });

  it('does not mark RECLAIMED when git worktree removal fails', async () => {
    const taskDir = path.join(root, 'worktrees', 'task-1');
    fs.mkdirSync(taskDir, { recursive: true });
    writeLease('task-1', { createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() });
    const gitExec: GitExec = () => ({ status: 1, stdout: '', stderr: 'fatal: not a working tree' });
    const broker = new ResourceBroker({ now: () => Date.now(), gitExec });
    const records = await broker.reclaimAbandonedWorktreeLeases(root);
    expect(records[0].removed).toBe(false);
    expect(records[0].markedReclaimed).toBe(false);
    const updated = JSON.parse(fs.readFileSync(path.join(root, 'state', 'leases', 'task-1.lease.json'), 'utf-8'));
    expect(updated.state).toBe('ACTIVE');
  });
});

describe('C4 resource broker — per-machine singleton', () => {
  beforeEach(() => resetResourceBrokerForTests());
  afterEach(() => resetResourceBrokerForTests());

  it('getResourceBroker returns the same instance across calls', () => {
    expect(getResourceBroker()).toBe(getResourceBroker());
  });

  it('resetForTests yields a fresh instance', () => {
    const first = getResourceBroker();
    resetResourceBrokerForTests();
    const second = getResourceBroker();
    expect(first).not.toBe(second);
  });

  it('singleton snapshot and pools are shared state (one arbiter per machine)', async () => {
    const broker = getResourceBroker();
    broker.acquire('browser', 'session-A');
    const same = getResourceBroker();
    expect(same.poolStats().browser.used).toBe(1);
    const snap = await same.snapshot();
    expect(snap.pools.browser.active).toBe(1);
    expect(snap.decision).toBeTruthy();
    expect(snap.extensionPoints.length).toBeGreaterThan(0);
  });
});
