/**
 * resource-broker.ts — C4 global resource/tool/browser broker (AM-0019 §6).
 *
 * A single governor arbitrates all projects/sessions on the machine. This
 * module composes the existing `ResourceGovernorAdapter` (process-tree RSS,
 * available RAM, swap, load, temperature, orphan detection) with the AM-0019
 * additions: memory PSI, swap churn, the §6 threshold decision table, shared
 * browser/MCP pooling with lease semantics, and crash/worktree reclamation.
 *
 * Browser pooling here is deliberately a lightweight lease manager (counts,
 * ceilings, holders, crash release) — NOT a CDP server. C7 owns browser
 * driving; this module only arbitrates how many contexts exist.
 *
 * Cross-project scope: `ResourceBroker` is a per-machine singleton
 * (`getResourceBroker()`); every session in every project on this host shares
 * one arbiter. Extension point for multi-machine arbitration: key the
 * singleton on a `machineId` (see ResourceBrokerOptions).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  createResourceGovernor,
  type ResourceGovernorAdapter,
  type ResourceSnapshot,
} from './resource-governor.js';

// ── AM-0019 §6 thresholds (exactly as written) ─────────────────────────────

export const AM0019 = {
  /** Burst: available RAM at least this fraction. */
  BURST_MIN_RAM_FRACTION: 0.30,
  /** Reduce: available RAM below this fraction. */
  REDUCE_MAX_RAM_FRACTION: 0.20,
  /** Pause heavy: available RAM below this fraction. */
  PAUSE_MAX_RAM_FRACTION: 0.12,
  /** Resume hysteresis: RAM at least this fraction. */
  RESUME_MIN_RAM_FRACTION: 0.25,
  /** Burst: CPU below this temperature. */
  BURST_MAX_CPU_C: 78,
  /** Reduce: CPU at least this temperature. */
  REDUCE_MIN_CPU_C: 85,
  /** Pause heavy: CPU at least this temperature. */
  PAUSE_MIN_CPU_C: 92,
  /** Resume hysteresis: CPU at most this temperature. */
  RESUME_MAX_CPU_C: 78,
  /** Resume hysteresis window. */
  RESUME_HYSTERESIS_MS: 60_000,
  /** Reduce: sustained load greater than this multiple of logical CPUs. */
  REDUCE_LOAD_RATIO: 1.25,
  /** PSI low: some avg10 strictly below this (percent time stalled). */
  PSI_LOW_AVG10: 1.0,
  /** Burst: swap-in below this rate counts as "negligible". */
  SWAP_IN_NEGLIGIBLE_BYTES_PER_SEC: 256 * 1024,
  /** Burst concurrency band (light agents). */
  BURST_MIN_AGENTS: 10,
  BURST_MAX_AGENTS: 14,
  /** Normal operating concurrency (AM-0019 §5 "may use 8 normally"). */
  NORMAL_AGENTS: 8,
  /** Reduced heavy concurrency. */
  REDUCED_AGENTS: 4,
} as const;

const PAGE_SIZE = 4096;

// ── Memory PSI (/proc/pressure/memory) ─────────────────────────────────────

export interface PsiLine {
  /** Percentage of time at least one task stalled on the resource. */
  avg10: number;
  avg60: number;
  avg300: number;
  /** Total microseconds tasks were stalled. */
  total: number;
}

export interface PsiSample {
  available: boolean;
  /** `some` — time at least one task stalled. Primary PSI signal. */
  some: PsiLine | null;
  /** `full` — time all non-idle tasks stalled. */
  full: PsiLine | null;
  source: 'linux-proc' | 'unavailable';
}

const NO_PSI: PsiSample = { available: false, some: null, full: null, source: 'unavailable' };

/** Parse `/proc/pressure/memory` content. Returns UNAVAILABLE for anything else. */
export function parsePressureMemory(raw: string): PsiSample {
  const some = raw.match(/^some\s+avg10=([\d.]+)\s+avg60=([\d.]+)\s+avg300=([\d.]+)\s+total=(\d+)/m);
  const full = raw.match(/^full\s+avg10=([\d.]+)\s+avg60=([\d.]+)\s+avg300=([\d.]+)\s+total=(\d+)/m);
  const line = (m: RegExpMatchArray | null): PsiLine | null => m
    ? { avg10: parseFloat(m[1]), avg60: parseFloat(m[2]), avg300: parseFloat(m[3]), total: parseInt(m[4], 10) }
    : null;
  const someLine = line(some);
  const fullLine = line(full);
  if (someLine === null) return NO_PSI;
  return { available: true, some: someLine, full: fullLine, source: 'linux-proc' };
}

/** Read memory PSI from this host. Degrades to honest UNAVAILABLE off Linux. */
export function readMemoryPsi(): PsiSample {
  if (process.platform !== 'linux') return NO_PSI;
  try {
    return parsePressureMemory(fs.readFileSync('/proc/pressure/memory', 'utf-8'));
  } catch {
    return NO_PSI;
  }
}

/** PSI "low": some avg10 strictly below the threshold. UNAVAILABLE is not low. */
export function psiIsLow(psi: PsiSample, threshold = AM0019.PSI_LOW_AVG10): boolean {
  return psi.available && psi.some !== null && psi.some.avg10 < threshold;
}

// ── Swap churn ─────────────────────────────────────────────────────────────

export function parseVmstatSwap(raw: string): { pswpInPages: number; pswpOutPages: number } {
  let pswpInPages = 0;
  let pswpOutPages = 0;
  for (const line of raw.split('\n')) {
    if (line.startsWith('pgswapin ')) pswpInPages = parseInt(line.split(/\s+/)[1], 10) || 0;
    else if (line.startsWith('pgswapout ')) pswpOutPages = parseInt(line.split(/\s+/)[1], 10) || 0;
  }
  return { pswpInPages, pswpOutPages };
}

export function parseMeminfoSwap(raw: string): {
  swapTotalBytes: number; swapFreeBytes: number; swapCachedBytes: number;
} {
  const value = (key: string): number => {
    const line = raw.split('\n').find((l) => l.startsWith(`${key}:`));
    if (!line) return 0;
    const match = line.match(/(\d+)/);
    return match ? parseInt(match[1], 10) * 1024 : 0;
  };
  return {
    swapTotalBytes: value('SwapTotal'),
    swapFreeBytes: value('SwapFree'),
    swapCachedBytes: value('SwapCached'),
  };
}

export interface SwapChurnSample {
  available: boolean;
  source: 'vmstat' | 'meminfo' | 'none';
  swapInDeltaPerSec: number;
  swapOutDeltaPerSec: number;
}

export interface SwapChurnRaw {
  vmstat?: string;
  meminfo?: string;
}

interface SwapTrackerState {
  pswpInBytes: number;
  pswpOutBytes: number;
  memUsedBytes: number;
  source: SwapChurnSample['source'];
  time: number;
  primed: boolean;
}

/**
 * Delta tracker. Primary source is `/proc/vmstat` pgswapin/pgswapout
 * (cumulative pages); fallback is `/proc/meminfo` SwapTotal−SwapFree−SwapCached
 * movement. When neither source is present the sample is honest `none`.
 */
export class SwapChurnTracker {
  #state: SwapTrackerState | null = null;

  update(raw: SwapChurnRaw, now = Date.now()): SwapChurnSample {
    const source = raw.vmstat ? 'vmstat' : raw.meminfo ? 'meminfo' : 'none';
    let swapInDeltaPerSec = 0;
    let swapOutDeltaPerSec = 0;

    if (source === 'vmstat' && raw.vmstat) {
      const { pswpInPages, pswpOutPages } = parseVmstatSwap(raw.vmstat);
      const inBytes = pswpInPages * PAGE_SIZE;
      const outBytes = pswpOutPages * PAGE_SIZE;
      const prev = this.#state;
      if (prev && prev.source === 'vmstat' && prev.primed) {
        const dt = (now - prev.time) / 1000;
        if (dt > 0) {
          swapInDeltaPerSec = Math.max(0, inBytes - prev.pswpInBytes) / dt;
          swapOutDeltaPerSec = Math.max(0, outBytes - prev.pswpOutBytes) / dt;
        }
      }
      this.#state = { pswpInBytes: inBytes, pswpOutBytes: outBytes, memUsedBytes: 0, source, time: now, primed: true };
    } else if (source === 'meminfo' && raw.meminfo) {
      const s = parseMeminfoSwap(raw.meminfo);
      const usedBytes = Math.max(0, s.swapTotalBytes - s.swapFreeBytes - s.swapCachedBytes);
      const prev = this.#state;
      if (prev && prev.source === 'meminfo' && prev.primed) {
        const dt = (now - prev.time) / 1000;
        const delta = usedBytes - prev.memUsedBytes;
        if (dt > 0) {
          if (delta > 0) swapInDeltaPerSec = delta / dt;
          else swapOutDeltaPerSec = -delta / dt;
        }
      }
      this.#state = { pswpInBytes: 0, pswpOutBytes: 0, memUsedBytes: usedBytes, source, time: now, primed: true };
    } else {
      this.#state = null;
    }

    return {
      available: source !== 'none',
      source,
      swapInDeltaPerSec,
      swapOutDeltaPerSec,
    };
  }
}

/** Read swap telemetry from this host (Linux /proc only; otherwise `none`). */
export function readSwapChurnRaw(): SwapChurnRaw {
  if (process.platform !== 'linux') return {};
  try {
    const vmstat = fs.readFileSync('/proc/vmstat', 'utf-8');
    return { vmstat };
  } catch {
    try {
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
      return { meminfo };
    } catch {
      return {};
    }
  }
}

// ── Sustained load ratio (1-min load / logical CPUs) ───────────────────────

export interface LoadRatioSample {
  loadRatio: number;
  source: 'loadavg' | 'os' | 'unavailable';
}

export function readLoadRatio(): LoadRatioSample {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf-8').trim().split(/\s+/);
    const oneMin = parseFloat(parts[0]);
    const cpuCount = os.cpus().length;
    if (Number.isFinite(oneMin) && cpuCount > 0) {
      return { loadRatio: oneMin / cpuCount, source: 'loadavg' };
    }
  } catch { /* fall through */ }
  const [oneMinute] = os.loadavg();
  const cpuCount = Math.max(1, os.cpus().length);
  if (!Number.isFinite(oneMinute)) return { loadRatio: 0, source: 'unavailable' };
  return { loadRatio: oneMinute / cpuCount, source: 'os' };
}

// ── Decision table (AM-0019 §6) ────────────────────────────────────────────

export type BrokerAction = 'burst' | 'normal' | 'reduce' | 'pause' | 'resume';
export type BrokerMode = 'burst' | 'normal' | 'reduced' | 'paused';

export interface BrokerDecisionInput {
  /** available RAM / total RAM (0..1). Unknown totals → 0.5 neutral. */
  ramFraction: number;
  psi: PsiSample;
  cpuTempC: number | null;
  /** 1-min load / logical CPUs. */
  loadRatio: number;
  swapInDeltaPerSec: number;
}

export interface BrokerDecisionState {
  mode: BrokerMode;
  pausedSince?: number;
  resumeCandidateSince?: number;
  lastActionAt: number;
}

export interface BrokerDecision {
  action: BrokerAction;
  mode: BrokerMode;
  reasons: string[];
  input: BrokerDecisionInput;
}

export function initialBrokerDecisionState(now = Date.now()): BrokerDecisionState {
  return { mode: 'normal', lastActionAt: now };
}

/** Fresh decision without hysteresis state. */
export function evaluateBrokerDecision(
  input: BrokerDecisionInput,
  state: BrokerDecisionState,
  now = Date.now(),
): { decision: BrokerDecision; next: BrokerDecisionState } {
  const reasons: string[] = [];
  const { ramFraction, psi, cpuTempC, loadRatio, swapInDeltaPerSec } = input;

  const pauseTriggered =
    ramFraction < AM0019.PAUSE_MAX_RAM_FRACTION
    || (cpuTempC !== null && cpuTempC >= AM0019.PAUSE_MIN_CPU_C);

  // ── paused state: stay paused until hysteresis window elapses ─────────
  if (state.mode === 'paused') {
    if (pauseTriggered) {
      if (ramFraction < AM0019.PAUSE_MAX_RAM_FRACTION) reasons.push('RAM below 12%');
      if (cpuTempC !== null && cpuTempC >= AM0019.PAUSE_MIN_CPU_C) reasons.push(`CPU >= ${AM0019.PAUSE_MIN_CPU_C}C`);
      return {
        decision: { action: 'pause', mode: 'paused', reasons, input },
        next: { ...state, resumeCandidateSince: undefined, lastActionAt: now },
      };
    }
    const resumeEligible =
      ramFraction >= AM0019.RESUME_MIN_RAM_FRACTION
      && (cpuTempC === null || cpuTempC <= AM0019.RESUME_MAX_CPU_C);
    if (!resumeEligible) {
      return {
        decision: { action: 'pause', mode: 'paused', reasons: ['pause conditions persist'], input },
        next: { ...state, resumeCandidateSince: undefined, lastActionAt: now },
      };
    }
    const candidateSince = state.resumeCandidateSince ?? now;
    if (now - candidateSince >= AM0019.RESUME_HYSTERESIS_MS) {
      // Hysteresis satisfied: re-evaluate from the fresh state.
      const fresh = evaluateBrokerDecision(input, initialBrokerDecisionState(now), now);
      return {
        decision: { action: 'resume', mode: fresh.decision.mode, reasons: ['RAM >= 25% and CPU <= 78C for 60s'], input },
        next: { ...fresh.next, lastActionAt: now },
      };
    }
    return {
      decision: { action: 'pause', mode: 'paused', reasons: ['resume hysteresis: ' + Math.max(0, Math.round((AM0019.RESUME_HYSTERESIS_MS - (now - candidateSince)) / 1000)) + 's remaining'], input },
      next: { ...state, resumeCandidateSince: candidateSince, lastActionAt: now },
    };
  }

  // ── non-paused state: pause > reduce > burst > normal ─────────────────
  if (pauseTriggered) {
    if (ramFraction < AM0019.PAUSE_MAX_RAM_FRACTION) reasons.push('RAM below 12%');
    if (cpuTempC !== null && cpuTempC >= AM0019.PAUSE_MIN_CPU_C) reasons.push(`CPU >= ${AM0019.PAUSE_MIN_CPU_C}C`);
    return {
      decision: { action: 'pause', mode: 'paused', reasons, input },
      next: { mode: 'paused', pausedSince: now, lastActionAt: now },
    };
  }

  const reduceTriggered =
    ramFraction < AM0019.REDUCE_MAX_RAM_FRACTION
    || (psi.available && !psiIsLow(psi))
    || (cpuTempC !== null && cpuTempC >= AM0019.REDUCE_MIN_CPU_C)
    || loadRatio > AM0019.REDUCE_LOAD_RATIO;
  if (reduceTriggered) {
    if (ramFraction < AM0019.REDUCE_MAX_RAM_FRACTION) reasons.push('RAM below 20%');
    if (psi.available && !psiIsLow(psi)) reasons.push('memory PSI up');
    if (cpuTempC !== null && cpuTempC >= AM0019.REDUCE_MIN_CPU_C) reasons.push(`CPU >= ${AM0019.REDUCE_MIN_CPU_C}C`);
    if (loadRatio > AM0019.REDUCE_LOAD_RATIO) reasons.push(`sustained load ${loadRatio.toFixed(2)} > ${AM0019.REDUCE_LOAD_RATIO} x CPU`);
    return {
      decision: { action: 'reduce', mode: 'reduced', reasons, input },
      next: { mode: 'reduced', lastActionAt: now },
    };
  }

  const burstReady =
    ramFraction >= AM0019.BURST_MIN_RAM_FRACTION
    && (!psi.available || psiIsLow(psi)) // PSI UNAVAILABLE degrades gracefully, does not block burst
    && (cpuTempC === null || cpuTempC < AM0019.BURST_MAX_CPU_C)
    && swapInDeltaPerSec < AM0019.SWAP_IN_NEGLIGIBLE_BYTES_PER_SEC;
  if (burstReady) {
    return {
      decision: { action: 'burst', mode: 'burst', reasons: ['RAM >= 30%, PSI low, CPU < 78C, swap-in negligible'], input },
      next: { mode: 'burst', lastActionAt: now },
    };
  }

  return {
    decision: { action: 'normal', mode: 'normal', reasons: ['within normal envelope'], input },
    next: { mode: 'normal', lastActionAt: now },
  };
}

// ── Concurrency and C2 pool-ceiling mapping ────────────────────────────────

export interface BrokerConcurrency {
  /** Total light/read agent slots. */
  agents: number;
  /** Heavy (writer/reviewer/build) concurrency. 0 means paused. */
  heavy: number;
}

export function recommendedConcurrency(action: BrokerAction, opts?: { burstMax?: number }): BrokerConcurrency {
  const burstMax = opts?.burstMax ?? AM0019.BURST_MAX_AGENTS;
  switch (action) {
    case 'burst': return { agents: burstMax, heavy: 8 };
    case 'normal': return { agents: AM0019.NORMAL_AGENTS, heavy: 6 };
    case 'reduce': return { agents: AM0019.REDUCED_AGENTS, heavy: 3 };
    case 'resume': return { agents: AM0019.NORMAL_AGENTS, heavy: 6 };
    case 'pause': return { agents: 2, heavy: 0 };
  }
}

/** Align with C2 dispatch-ready-set POOL_CEILINGS per broker action. */
export function poolCeilingsForAction(action: BrokerAction): {
  total: number; writers: number; reviewers: number; integration: number;
  browser: number; build: number; compose: number;
} {
  const c = recommendedConcurrency(action);
  const writers = Math.min(c.heavy, 8);
  return {
    total: c.agents,
    writers,
    reviewers: Math.min(5, Math.max(1, Math.ceil(writers / 2))),
    integration: 1,
    browser: action === 'burst' ? 4 : action === 'pause' ? 1 : 2,
    build: action === 'pause' ? 0 : action === 'reduce' ? 1 : 2,
    compose: 1,
  };
}

// ── Browser/MCP pool (lease semantics, no CDP) ─────────────────────────────

export type BrokerPoolKind = 'browser' | 'mcp';

export const DEFAULT_POOL_CEILINGS = { browser: 4, mcp: 8 } as const;

export interface BrokerPoolLease {
  leaseId: string;
  kind: BrokerPoolKind;
  holder: string;
  processGroupId?: string;
  acquiredAt: string;
  expiresAt: string;
  state: 'ACTIVE' | 'RELEASED';
}

export type BrokerAcquireResult =
  | { acquired: true; lease: BrokerPoolLease }
  | { acquired: false; reason: 'pool-full'; waiting: true; position: number };

export interface PoolStats { used: number; ceiling: number; active: number; }

export interface BrokerPoolState {
  browser: PoolStats;
  mcp: PoolStats;
}

// ── Worktree reclamation (C3 worktree-train lease files) ───────────────────

export interface AbandonedWorktreeLease {
  taskId: string;
  leasePath: string;
  worktreePath: string;
  state: string;
  createdAt: string;
  reason: 'lease-stale' | 'worktree-missing';
}

export interface ReclamationRecord {
  taskId: string;
  worktreePath: string;
  removed: boolean;
  removedDetail: string;
  markedReclaimed: boolean;
}

export interface GitExec {
  (args: string[], opts?: { cwd?: string }): { status: number; stdout: string; stderr: string };
}

const defaultGitExec: GitExec = (args, opts) => {
  const result = spawnSync('git', ['-C', opts?.cwd ?? process.cwd(), ...args], { encoding: 'utf8' });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

// ── ResourceBroker ─────────────────────────────────────────────────────────

export interface BrokerSnapshot {
  timestamp: string;
  platform: string;
  governorAvailable: boolean;
  brokerVersion: string;
  memoryAvailableBytes: number;
  memoryTotalBytes: number;
  ramFraction: number;
  psi: PsiSample;
  cpuTemperatureC: number | null;
  cpuLoadPercent: number;
  loadRatio: number;
  cpuCount: number;
  swapInDeltaPerSec: number;
  swapChurn: SwapChurnSample;
  pools: BrokerPoolState;
  orphanCount: number;
  decision: BrokerDecision;
  /** Extension points for cross-machine / other-project arbitration. */
  extensionPoints: readonly string[];
}

export interface ResourceBrokerOptions {
  governor?: ResourceGovernorAdapter;
  /** Inject for deterministic tests; defaults to real git on the worktree root. */
  gitExec?: GitExec;
  /** Abandoned ACTIVE lease age after which it is reclaimed. Default 4h. */
  worktreeReclaimMaxAgeMs?: number;
  now?: () => number;
  /** Extension point: key the per-machine singleton on machine identity. */
  machineId?: string;
}

export class ResourceBroker {
  /** Per-machine singleton so multiple sessions share one arbiter (AM-0019 §6). */
  static #singleton: ResourceBroker | null = null;

  static getInstance(): ResourceBroker {
    if (ResourceBroker.#singleton === null) ResourceBroker.#singleton = new ResourceBroker();
    return ResourceBroker.#singleton;
  }

  /** Test seam — drop the singleton so a fresh instance is created. */
  static resetForTests(): void {
    ResourceBroker.#singleton = null;
  }

  readonly machineId: string;
  readonly governor: ResourceGovernorAdapter;
  readonly swapTracker: SwapChurnTracker;
  readonly #gitExec: GitExec;
  readonly #worktreeReclaimMaxAgeMs: number;
  readonly #now: () => number;
  readonly #leases = new Map<string, BrokerPoolLease>();
  readonly #ceilings: { browser: number; mcp: number };
  #leaseSeq = 1;
  #decisionState: BrokerDecisionState = initialBrokerDecisionState();
  #lastDecision: BrokerDecision | null = null;

  constructor(options: ResourceBrokerOptions = {}) {
    const machineId = options.machineId ?? 'machine:local';
    // Extension point: multiple machines/sessions currently share the local
    // arbiter; keying a broker registry on machineId is the upgrade path for
    // multi-host arbitration.
    this.machineId = machineId;
    this.governor = options.governor ?? createResourceGovernor(
      // Placeholder identity; swapped for the real effective identity by the
      // caller when the singleton is created from an activated session.
      'a0804467fdd91ccafe6b7e10b7febf345ebb99dcad5c5441a11a4d54c3a18cf5',
    );
    this.swapTracker = new SwapChurnTracker();
    this.#gitExec = options.gitExec ?? defaultGitExec;
    this.#worktreeReclaimMaxAgeMs = options.worktreeReclaimMaxAgeMs ?? 4 * 60 * 60 * 1000;
    this.#now = options.now ?? (() => Date.now());
    this.#ceilings = { ...DEFAULT_POOL_CEILINGS };
  }

  get lastDecision(): BrokerDecision | null {
    return this.#lastDecision;
  }

  get decisionState(): BrokerDecisionState {
    return { ...this.#decisionState };
  }

  // ── Decision ─────────────────────────────────────────────────────────

  async decide(): Promise<BrokerDecision> {
    const snapshot = await this.governor.sampleResources();
    const churn = this.swapTracker.update(readSwapChurnRaw(), this.#now());
    const psi = readMemoryPsi();
    const load = readLoadRatio();
    const input = telemetryFromSnapshot(snapshot, churn, psi, load);
    const { decision, next } = evaluateBrokerDecision(input, this.#decisionState, this.#now());
    this.#decisionState = next;
    this.#lastDecision = decision;
    return decision;
  }

  async snapshot(): Promise<BrokerSnapshot> {
    const governor = this.governor;
    const resource = await governor.sampleResources();
    const churn = this.swapTracker.update(readSwapChurnRaw(), this.#now());
    const psi = readMemoryPsi();
    const load = readLoadRatio();
    const input = telemetryFromSnapshot(resource, churn, psi, load);
    const { decision, next } = evaluateBrokerDecision(input, this.#decisionState, this.#now());
    this.#decisionState = next;
    this.#lastDecision = decision;
    const detected = await governor.detect();
    return {
      timestamp: new Date(this.#now()).toISOString(),
      platform: detected.platform,
      governorAvailable: detected.available,
      brokerVersion: 'C4-broker-v1',
      memoryAvailableBytes: resource.memoryAvailableBytes,
      memoryTotalBytes: resource.memoryTotalBytes,
      ramFraction: input.ramFraction,
      psi,
      cpuTemperatureC: resource.cpuTemperatureC,
      cpuLoadPercent: resource.cpuLoadPercent,
      loadRatio: input.loadRatio,
      cpuCount: resource.cpuCount,
      swapInDeltaPerSec: input.swapInDeltaPerSec,
      swapChurn: churn,
      pools: this.poolStats(),
      orphanCount: 'orphanReports' in governor ? (governor as { orphanReports: readonly unknown[] }).orphanReports.length : 0,
      decision,
      extensionPoints: ['machineId-keyed broker registry', 'shared /proc telemetry across projects', 'C2 POOL_CEILINGS alignment'],
    };
  }

  // ── Browser/MCP pooling ───────────────────────────────────────────────

  acquire(kind: BrokerPoolKind, holder: string, opts: { ceiling?: number; processGroupId?: string } = {}): BrokerAcquireResult {
    const ceiling = opts.ceiling ?? this.#ceilings[kind];
    const used = this.#poolCount(kind);
    if (used >= ceiling) {
      return { acquired: false, reason: 'pool-full', waiting: true, position: used };
    }
    const nowMs = this.#now();
    const leaseId = `pool-${kind}-${this.#leaseSeq++}-${createHash('sha256').update(holder + nowMs.toString()).digest('hex').slice(0, 12)}`;
    const lease: BrokerPoolLease = {
      leaseId,
      kind,
      holder,
      processGroupId: opts.processGroupId,
      acquiredAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 300_000).toISOString(),
      state: 'ACTIVE',
    };
    this.#leases.set(leaseId, lease);
    return { acquired: true, lease };
  }

  /** Release one lease. Returns true when a slot was freed. */
  release(leaseId: string): boolean {
    const lease = this.#leases.get(leaseId);
    if (!lease || lease.state !== 'ACTIVE') return false;
    lease.state = 'RELEASED';
    this.#leases.delete(leaseId);
    return true;
  }

  /** Crash/session reclamation: release every lease held by a holder. */
  releaseAll(holder: string): number {
    let freed = 0;
    for (const [leaseId, lease] of [...this.#leases]) {
      if (lease.holder === holder && lease.state === 'ACTIVE') {
        lease.state = 'RELEASED';
        this.#leases.delete(leaseId);
        freed++;
      }
    }
    return freed;
  }

  /** Release every lease bound to a crashed process group. */
  releaseForProcessGroup(processGroupId: string): number {
    let freed = 0;
    for (const [leaseId, lease] of [...this.#leases]) {
      if (lease.processGroupId === processGroupId && lease.state === 'ACTIVE') {
        lease.state = 'RELEASED';
        this.#leases.delete(leaseId);
        freed++;
      }
    }
    return freed;
  }

  poolStats(): BrokerPoolState {
    const count = (kind: BrokerPoolKind): number => this.#poolCount(kind);
    const active = (kind: BrokerPoolKind): number => [...this.#leases.values()].filter((l) => l.kind === kind && l.state === 'ACTIVE').length;
    return {
      browser: { used: count('browser'), ceiling: this.#ceilings.browser, active: active('browser') },
      mcp: { used: count('mcp'), ceiling: this.#ceilings.mcp, active: active('mcp') },
    };
  }

  #poolCount(kind: BrokerPoolKind): number {
    return [...this.#leases.values()].filter((l) => l.kind === kind && l.state === 'ACTIVE').length;
  }

  // ── Reclamation ───────────────────────────────────────────────────────

  /**
   * Crash reclamation: kill the governor process tree for `groupId`, then
   * release every browser/MCP lease bound to that group. Returns the kill
   * count, orphan count and freed lease count.
   */
  async reclaimProcessGroup(groupId: string, signal = 'SIGTERM'): Promise<{ killed: number; orphans: number; leasesReleased: number }> {
    const killed = await this.governor.cleanupDescendants(groupId, signal);
    const leasesReleased = this.releaseForProcessGroup(groupId);
    const orphans = 'orphanReports' in this.governor
      ? (this.governor as { orphanReports: readonly unknown[] }).orphanReports.length
      : 0;
    return { killed, orphans, leasesReleased };
  }

  /** Scan C3 worktree-train `state/leases/*.lease.json` for abandoned ACTIVE leases. */
  async findAbandonedWorktreeLeases(worktreeRoot: string, now = this.#now()): Promise<AbandonedWorktreeLease[]> {
    const leasesDir = `${worktreeRoot}/state/leases`;
    let entries: string[];
    try {
      entries = fs.readdirSync(leasesDir);
    } catch {
      return [];
    }
    const abandoned: AbandonedWorktreeLease[] = [];
    for (const name of entries.sort()) {
      if (!name.endsWith('.lease.json')) continue;
      const leasePath = `${leasesDir}/${name}`;
      let lease: { taskId?: string; worktreePath?: string; state?: string; createdAt?: string };
      try {
        lease = JSON.parse(fs.readFileSync(leasePath, 'utf-8')) as typeof lease;
      } catch {
        continue;
      }
      if (lease.state !== 'ACTIVE' || !lease.taskId) continue;
      const createdAt = lease.createdAt ? new Date(lease.createdAt).getTime() : 0;
      const stale = Number.isFinite(createdAt) && createdAt > 0 && now - createdAt > this.#worktreeReclaimMaxAgeMs;
      const worktreeMissing = lease.worktreePath ? !fs.existsSync(lease.worktreePath) : true;
      if (stale) {
        abandoned.push({
          taskId: lease.taskId, leasePath, worktreePath: lease.worktreePath ?? '', state: lease.state,
          createdAt: lease.createdAt ?? '', reason: 'lease-stale',
        });
      } else if (worktreeMissing) {
        abandoned.push({
          taskId: lease.taskId, leasePath, worktreePath: lease.worktreePath ?? '', state: lease.state,
          createdAt: lease.createdAt ?? '', reason: 'worktree-missing',
        });
      }
    }
    return abandoned;
  }

  /**
   * Reclaim abandoned worktrees: remove the git worktree (force), prune stale
   * registrations, then mark the C3 lease file `state: 'RECLAIMED'`. Pure scan
   * is `findAbandonedWorktreeLeases`; this mutates only abandoned leases.
   */
  async reclaimAbandonedWorktreeLeases(worktreeRoot: string, now = this.#now()): Promise<ReclamationRecord[]> {
    const abandoned = await this.findAbandonedWorktreeLeases(worktreeRoot, now);
    const records: ReclamationRecord[] = [];
    for (const entry of abandoned) {
      const record: ReclamationRecord = {
        taskId: entry.taskId,
        worktreePath: entry.worktreePath,
        removed: false,
        removedDetail: '',
        markedReclaimed: false,
      };
      if (entry.worktreePath && fs.existsSync(entry.worktreePath)) {
        const result = this.#gitExec(['worktree', 'remove', '--force', entry.worktreePath]);
        record.removed = result.status === 0;
        record.removedDetail = record.removed ? 'worktree removed' : `git failed: ${result.stderr.trim() || `exit ${result.status}`}`;
      } else {
        // Stale registration with no directory: prune it.
        this.#gitExec(['worktree', 'prune']);
        record.removed = true;
        record.removedDetail = 'worktree directory absent; registration pruned';
      }
      if (record.removed) {
        try {
          const lease = JSON.parse(fs.readFileSync(entry.leasePath, 'utf-8')) as Record<string, unknown>;
          fs.writeFileSync(entry.leasePath, `${JSON.stringify({ ...lease, state: 'RECLAIMED' }, null, 2)}\n`, 'utf8');
          record.markedReclaimed = true;
        } catch {
          record.markedReclaimed = false;
        }
      }
      records.push(record);
    }
    return records;
  }
}

export function getResourceBroker(): ResourceBroker {
  return ResourceBroker.getInstance();
}

/** Test seam — drop the singleton. */
export function resetResourceBrokerForTests(): void {
  ResourceBroker.resetForTests();
}

function telemetryFromSnapshot(
  snapshot: ResourceSnapshot,
  churn: SwapChurnSample,
  psi: PsiSample,
  load: LoadRatioSample,
): BrokerDecisionInput {
  const ramFraction = snapshot.memoryTotalBytes > 0
    ? Math.max(0, Math.min(1, snapshot.memoryAvailableBytes / snapshot.memoryTotalBytes))
    : 0.5;
  return {
    ramFraction,
    psi,
    cpuTempC: snapshot.cpuTemperatureC,
    loadRatio: load.loadRatio,
    swapInDeltaPerSec: churn.available ? churn.swapInDeltaPerSec : snapshot.swapInDeltaPerSec,
  };
}
