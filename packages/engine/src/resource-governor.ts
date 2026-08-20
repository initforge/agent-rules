import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isSha256, sha256Bytes, type Sha256 } from './contracts.js';

export const DEFAULT_MAX_DESCENDANT_DEPTH = 10;
export const DEFAULT_MAX_PROCESS_CEILING = 500;

export interface PidInfo { pid: number; starttime: number; ppid: number; }
export interface ProcReader { readPidInfo(pid: number): PidInfo | null; readAllPids(): number[]; }
export interface ProcKiller { kill(pid: number, signal: string): boolean; }
export interface OrphanReport { pid: number; reason: string; }

export class DefaultProcReader implements ProcReader {
  readPidInfo(pid: number): PidInfo | null {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const closeParen = stat.lastIndexOf(')');
      if (closeParen === -1) return null;
      const fields = stat.slice(closeParen + 2).split(/\s+/);
      return { pid, ppid: parseInt(fields[1], 10), starttime: parseInt(fields[19], 10) };
    } catch { return null; }
  }
  readAllPids(): number[] {
    try { return fs.readdirSync('/proc').filter((e) => /^\d+$/.test(e)).map(Number); }
    catch { return []; }
  }
}

export class DefaultProcKiller implements ProcKiller {
  kill(pid: number, signal: string): boolean {
    try { process.kill(pid, signal as NodeJS.Signals); return true; }
    catch { return false; }
  }
}

export function findDescendantPidsBounded(
  rootPid: number,
  reader: ProcReader,
  options?: { maxDepth?: number; maxCeiling?: number },
): { descendants: Set<number>; visited: number } {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DESCENDANT_DEPTH;
  const maxCeiling = options?.maxCeiling ?? DEFAULT_MAX_PROCESS_CEILING;
  const descendants = new Set<number>();
  const visited = new Set<number>([rootPid]);
  const queue: Array<{ pid: number; depth: number }> = [{ pid: rootPid, depth: 0 }];
  while (queue.length > 0) {
    const { pid, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    for (const candidatePid of reader.readAllPids()) {
      if (descendants.size >= maxCeiling) break;
      if (visited.has(candidatePid)) continue;
      const info = reader.readPidInfo(candidatePid);
      if (info && info.ppid === pid) {
        descendants.add(candidatePid);
        visited.add(candidatePid);
        if (depth + 1 < maxDepth) queue.push({ pid: candidatePid, depth: depth + 1 });
      }
    }
  }
  return { descendants, visited: visited.size };
}

export interface ResourcePoolConfig {
  poolId: string;
  label: string;
  maxMemoryBytes: number;
  maxSwapBytes: number;
  maxCpuPercent: number;
  maxProcessCount: number;
  priority: number;
}

export interface ResourceLease {
  leaseId: string;
  poolId: string;
  holder: string;
  acquiredAt: string;
  expiresAt: string;
  memoryBytes: number;
  cpuPercent: number;
  processGroupId: string;
  effectiveIdentity: Sha256;
}

export interface ResourceSnapshot {
  timestamp: string;
  memoryAvailableBytes: number;
  memoryTotalBytes: number;
  swapAvailableBytes: number;
  swapTotalBytes: number;
  swapInBytes: number;
  swapOutBytes: number;
  swapInDeltaPerSec: number;
  swapOutDeltaPerSec: number;
  cpuCount: number;
  cpuLoadPercent: number;
  cpuTemperatureC: number | null;
  thermalThrottled: boolean;
}

export interface ProcessGroup {
  groupId: string;
  label: string;
  processCount: number;
  createdAt: string;
}

export interface BacklogTask {
  taskId: string;
  priority: number;
  estimatedMemoryBytes: number;
  estimatedCpuPercent: number;
  submittedAt: string;
}

export interface BacklogToken {
  tokenId: string;
  position: number;
  estimatedWaitMs: number;
}

export type BacklogStatus =
  | { status: 'queued'; position: number; estimatedWaitMs: number }
  | { status: 'running'; tokenId: string }
  | { status: 'completed' }
  | { status: 'rejected'; reason: string };

export interface ResourceGovernanceEvidence {
  effectiveIdentity: Sha256;
  poolId: string;
  snapshot: ResourceSnapshot;
  leaseIds: string[];
  backlogDepth: number;
  governorVersion: string;
  evidenceSha256: Sha256;
}

export interface ResourceGovernorAdapter {
  detect(): Promise<{ available: boolean; platform: string }>;
  createPool(config: ResourcePoolConfig): Promise<void>;
  destroyPool(poolId: string): Promise<void>;
  listPools(): Promise<ResourcePoolConfig[]>;
  acquireLease(poolId: string, holder: string, request: { memoryBytes: number; cpuPercent: number }): Promise<ResourceLease>;
  releaseLease(leaseId: string): Promise<void>;
  getLease(leaseId: string): Promise<ResourceLease | null>;
  createProcessGroup(label: string): Promise<ProcessGroup>;
  cleanupDescendants(groupId: string, signal?: string): Promise<number>;
  sampleResources(): Promise<ResourceSnapshot>;
  submitToBacklog(task: BacklogTask): Promise<BacklogToken>;
  startBacklogTask(token: BacklogToken): Promise<void>;
  completeBacklogTask(token: BacklogToken): Promise<void>;
  pollBacklog(token: BacklogToken): Promise<BacklogStatus>;
  drainBacklog(): Promise<number>;
  detectLeaseConflicts(poolId: string): Promise<Array<{ leaseIdA: string; leaseIdB: string; reason: string }>>;
  buildEvidence(poolId: string, leaseIds: string[]): Promise<ResourceGovernanceEvidence>;
}

const DEFAULT_THERMAL_HYSTERESIS_DEG_C = 5;
const MAX_TEMPERATURE_THROTTLE_C = 85;
const RECOVERY_TEMPERATURE_C = 80;
const LEEWAY_MEMORY_FACTOR = 0.9;

const PAGE_SIZE = 4096;

function parseMeminfoValue(line: string): number {
  const match = line.match(/(\d+)/);
  return match ? parseInt(match[1], 10) * 1024 : 0;
}

function readProcVmstatSwap(): { swapInBytes: number; swapOutBytes: number } {
  try {
    const data = fs.readFileSync('/proc/vmstat', 'utf-8');
    let swapIn = 0;
    let swapOut = 0;
    for (const line of data.split('\n')) {
      if (line.startsWith('pgswapin ')) swapIn = parseInt(line.split(/\s+/)[1], 10) || 0;
      else if (line.startsWith('pgswapout ')) swapOut = parseInt(line.split(/\s+/)[1], 10) || 0;
    }
    return { swapInBytes: swapIn * PAGE_SIZE, swapOutBytes: swapOut * PAGE_SIZE };
  } catch {
    return { swapInBytes: 0, swapOutBytes: 0 };
  }
}

export function findDescendantPids(parentPid: number): Set<number> {
  const descendants = new Set<number>();
  try {
    const procEntries = fs.readdirSync('/proc').filter((e) => /^\d+$/.test(e));
    for (const pidStr of procEntries) {
      const pid = parseInt(pidStr, 10);
      if (pid === parentPid) continue;
      try {
        const statusPath = `/proc/${pid}/status`;
        const status = fs.readFileSync(statusPath, 'utf-8');
        const ppidMatch = status.match(/^PPid:\s+(\d+)/m);
        if (ppidMatch && parseInt(ppidMatch[1], 10) === parentPid) {
          descendants.add(pid);
          for (const child of findDescendantPids(pid)) {
            descendants.add(child);
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return descendants;
}

export function readProcessRss(pid: number): number {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    return match ? parseInt(match[1], 10) * 1024 : 0;
  } catch {
    return 0;
  }
}

function readProcMeminfo(): { memAvailable: number; memTotal: number; swapAvailable: number; swapTotal: number } {
  try {
    const data = fs.readFileSync('/proc/meminfo', 'utf-8');
    const lines = data.split('\n');
    let memTotal = 0;
    let memAvailable = 0;
    let swapTotal = 0;
    let swapFree = 0;
    for (const line of lines) {
      if (line.startsWith('MemTotal:')) memTotal = parseMeminfoValue(line);
      else if (line.startsWith('MemAvailable:')) memAvailable = parseMeminfoValue(line);
      else if (line.startsWith('SwapTotal:')) swapTotal = parseMeminfoValue(line);
      else if (line.startsWith('SwapFree:')) swapFree = parseMeminfoValue(line);
    }
    return { memAvailable, memTotal, swapAvailable: swapFree, swapTotal };
  } catch {
    return { memAvailable: 0, memTotal: 0, swapAvailable: 0, swapTotal: 0 };
  }
}

function readCpuInfo(): { cpuCount: number } {
  try {
    const data = fs.readFileSync('/proc/cpuinfo', 'utf-8');
    const matches = data.match(/^processor\s+:\s+\d+/gm);
    return { cpuCount: matches ? matches.length : 1 };
  } catch {
    return { cpuCount: os.cpus().length };
  }
}

function readCpuLoad(): number {
  try {
    const data = fs.readFileSync('/proc/loadavg', 'utf-8');
    const parts = data.split(/\s+/);
    const oneMin = parseFloat(parts[0]);
    const cpuCount = readCpuInfo().cpuCount;
    return Math.min(100, Math.round((oneMin / cpuCount) * 100));
  } catch {
    return 0;
  }
}

interface ThermalState {
  previousThrottled: boolean;
  previousTemperatureC: number | null;
}

function findCpuPackageZone(thermalDir: string): string | null {
  try {
    const entries = fs.readdirSync(thermalDir);
    const zones = entries.filter((e) => e.startsWith('thermal_zone'));
    let pkgZone: string | null = null;
    for (const zone of zones) {
      const typePath = path.join(thermalDir, zone, 'type');
      if (fs.existsSync(typePath)) {
        const type = fs.readFileSync(typePath, 'utf-8').trim();
        if (type === 'x86_pkg_temp') {
          pkgZone = zone;
          break;
        }
      }
    }
    return pkgZone;
  } catch {
    return null;
  }
}

function readThermalState(
  thermalState: ThermalState,
  hysteresisDegC: number,
): { temperatureC: number | null; throttled: boolean } {
  try {
    const thermalDir = '/sys/class/thermal';
    if (!fs.existsSync(thermalDir)) {
      return { temperatureC: null, throttled: false };
    }

    const pkgZone = findCpuPackageZone(thermalDir);
    const entries = fs.readdirSync(thermalDir);
    const thermalZones = entries.filter((e) => e.startsWith('thermal_zone'));
    if (thermalZones.length === 0) {
      return { temperatureC: null, throttled: false };
    }

    let selectedTemp = 0;
    const candidateZones = pkgZone ? [pkgZone] : thermalZones;
    for (const zone of candidateZones) {
      const tempPath = path.join(thermalDir, zone, 'temp');
      if (fs.existsSync(tempPath)) {
        const raw = parseInt(fs.readFileSync(tempPath, 'utf-8').trim(), 10);
        const tempC = raw / 1000;
        if (tempC > selectedTemp) selectedTemp = tempC;
      }
    }
    if (selectedTemp === 0) {
      return { temperatureC: null, throttled: false };
    }
    let throttled: boolean;
    if (thermalState.previousTemperatureC === null) {
      throttled = selectedTemp >= MAX_TEMPERATURE_THROTTLE_C;
    } else if (thermalState.previousThrottled) {
      throttled = selectedTemp >= RECOVERY_TEMPERATURE_C;
    } else {
      throttled = selectedTemp >= MAX_TEMPERATURE_THROTTLE_C + hysteresisDegC;
    }
    thermalState.previousTemperatureC = selectedTemp;
    thermalState.previousThrottled = throttled;
    return { temperatureC: selectedTemp, throttled };
  } catch {
    return { temperatureC: null, throttled: false };
  }
}

export class NativeResourceGovernor implements ResourceGovernorAdapter {
  private pools = new Map<string, ResourcePoolConfig>();
  private leases = new Map<string, ResourceLease>();
  private processGroups = new Map<string, ProcessGroup>();
  private processGroupPids = new Map<string, Set<number>>();
  private backlog: Array<{ task: BacklogTask; token: BacklogToken; submittedAt: number }> = [];
  private runningBacklog = new Set<string>();
  private tokenToTaskId = new Map<string, string>();
  private nextLeaseId = 1;
  private nextGroupId = 1;
  private nextTokenId = 1;
  private readonly thermalHysteresisDegC: number;
  private readonly backlogLimit: number;
  private readonly effectiveIdentity: Sha256;
  private readonly thermalState: ThermalState = { previousThrottled: false, previousTemperatureC: null };
  private readonly procReader: ProcReader;
  private readonly procKiller: ProcKiller;
  private processGroupRootInfo = new Map<string, Map<number, PidInfo>>();
  private lastOrphans: OrphanReport[] = [];
  private prevSwapInBytes = 0;
  private prevSwapOutBytes = 0;
  private prevSampleTime = 0;

  constructor(
    effectiveIdentity: Sha256,
    options?: { thermalHysteresisDegC?: number; backlogLimit?: number; procReader?: ProcReader; procKiller?: ProcKiller },
  ) {
    if (!isSha256(effectiveIdentity)) {
      throw new Error(`NativeResourceGovernor: effectiveIdentity must be a SHA-256 hash, got ${effectiveIdentity}`);
    }
    this.effectiveIdentity = effectiveIdentity;
    this.thermalHysteresisDegC = options?.thermalHysteresisDegC ?? DEFAULT_THERMAL_HYSTERESIS_DEG_C;
    this.backlogLimit = options?.backlogLimit ?? 100;
    this.procReader = options?.procReader ?? new DefaultProcReader();
    this.procKiller = options?.procKiller ?? new DefaultProcKiller();
  }

  get orphanReports(): readonly OrphanReport[] {
    return this.lastOrphans;
  }

  async detect(): Promise<{ available: boolean; platform: string }> {
    try {
      fs.accessSync('/proc/meminfo', fs.constants.R_OK);
      fs.accessSync('/proc/cpuinfo', fs.constants.R_OK);
      return { available: true, platform: 'linux-native' };
    } catch {
      return { available: false, platform: 'linux-native-unavailable' };
    }
  }

  async createPool(config: ResourcePoolConfig): Promise<void> {
    if (this.pools.has(config.poolId)) {
      throw new Error(`Pool already exists: ${config.poolId}`);
    }
    this.pools.set(config.poolId, { ...config });
  }

  async destroyPool(poolId: string): Promise<void> {
    if (!this.pools.has(poolId)) {
      throw new Error(`Pool not found: ${poolId}`);
    }
    for (const [leaseId, lease] of this.leases) {
      if (lease.poolId === poolId) {
        this.leases.delete(leaseId);
      }
    }
    this.pools.delete(poolId);
  }

  async listPools(): Promise<ResourcePoolConfig[]> {
    return [...this.pools.values()];
  }

  async acquireLease(poolId: string, holder: string, request: { memoryBytes: number; cpuPercent: number }): Promise<ResourceLease> {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);

    const snapshot = await this.sampleResources();
    if (snapshot.thermalThrottled) {
      throw new Error(`Thermal throttle active: cannot acquire lease in pool ${poolId}`);
    }

    const poolMemoryUsed = [...this.leases.values()]
      .filter((l) => l.poolId === poolId)
      .reduce((sum, l) => sum + l.memoryBytes, 0);
    const poolCpuUsed = [...this.leases.values()]
      .filter((l) => l.poolId === poolId)
      .reduce((sum, l) => sum + l.cpuPercent, 0);

    if (poolMemoryUsed + request.memoryBytes > pool.maxMemoryBytes) {
      throw new Error(`Pool ${poolId} memory capacity exceeded`);
    }
    if (poolCpuUsed + request.cpuPercent > pool.maxCpuPercent) {
      throw new Error(`Pool ${poolId} CPU capacity exceeded`);
    }
    const poolProcessCount = [...this.leases.values()].filter((l) => l.poolId === poolId).length;
    if (pool.maxProcessCount > 0 && poolProcessCount >= pool.maxProcessCount) {
      throw new Error(`Pool ${poolId} process limit reached`);
    }

    if (request.memoryBytes > snapshot.memoryAvailableBytes * LEEWAY_MEMORY_FACTOR) {
      throw new Error(`Insufficient available memory: request ${request.memoryBytes}, available ${snapshot.memoryAvailableBytes}`);
    }

    const existingHolder = [...this.leases.values()]
      .find((l) => l.poolId === poolId && l.holder === holder);
    if (existingHolder) {
      throw new Error(`Pool ${poolId}: holder ${holder} already holds lease ${existingHolder.leaseId}`);
    }

    const pg = await this.createProcessGroup(`lease-${this.nextLeaseId}`);
    const leaseId = `lease-${this.nextLeaseId++}-${createHash('sha256').update(poolId + holder + Date.now().toString()).digest('hex').slice(0, 16)}`;

    const lease: ResourceLease = {
      leaseId,
      poolId,
      holder,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      memoryBytes: request.memoryBytes,
      cpuPercent: request.cpuPercent,
      processGroupId: pg.groupId,
      effectiveIdentity: this.effectiveIdentity,
    };
    this.leases.set(leaseId, lease);
    return lease;
  }

  async releaseLease(leaseId: string): Promise<void> {
    const lease = this.leases.get(leaseId);
    if (!lease) throw new Error(`Lease not found: ${leaseId}`);
    await this.cleanupDescendants(lease.processGroupId, 'SIGTERM');
    this.leases.delete(leaseId);
  }

  async getLease(leaseId: string): Promise<ResourceLease | null> {
    return this.leases.get(leaseId) ?? null;
  }

  async createProcessGroup(label: string, ...pids: number[]): Promise<ProcessGroup> {
    const groupId = `pg-${this.nextGroupId++}-${createHash('sha256').update(label + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const pg: ProcessGroup = {
      groupId,
      label,
      processCount: pids.length,
      createdAt: new Date().toISOString(),
    };
    this.processGroups.set(groupId, pg);
    this.processGroupPids.set(groupId, new Set(pids));
    const rootInfo = new Map<number, PidInfo>();
    for (const pid of pids) {
      const info = this.procReader.readPidInfo(pid);
      if (info) rootInfo.set(pid, info);
    }
    this.processGroupRootInfo.set(groupId, rootInfo);
    return pg;
  }

  async cleanupDescendants(groupId: string, signal = 'SIGTERM'): Promise<number> {
    const pg = this.processGroups.get(groupId);
    if (!pg) return 0;

    const rootInfo = this.processGroupRootInfo.get(groupId) ?? new Map();
    const knownPids = this.processGroupPids.get(groupId) ?? new Set<number>();
    const selfPid = process.pid;
    const toKill: Set<number> = new Set();
    const orphans: OrphanReport[] = [];

    for (const rootPid of knownPids) {
      const saved = rootInfo.get(rootPid);
      if (!saved) continue;

      const current = this.procReader.readPidInfo(rootPid);
      if (!current || current.starttime !== saved.starttime || current.ppid !== saved.ppid) {
        if (current) {
          orphans.push({ pid: rootPid, reason: `starttime/ppid mismatch: registered starttime=${saved.starttime} ppid=${saved.ppid}, current starttime=${current.starttime} ppid=${current.ppid}` });
        } else {
          orphans.push({ pid: rootPid, reason: 'process no longer exists' });
        }
        continue;
      }

      toKill.add(rootPid);

      const { descendants } = findDescendantPidsBounded(rootPid, this.procReader);
      for (const childPid of descendants) {
        toKill.add(childPid);
      }
    }

    this.lastOrphans = orphans;

    let cleaned = 0;
    for (const pid of toKill) {
      if (pid === selfPid) continue;
      if (this.procKiller.kill(pid, signal)) cleaned++;
    }

    this.processGroups.delete(groupId);
    this.processGroupPids.delete(groupId);
    this.processGroupRootInfo.delete(groupId);

    return cleaned;
  }

  async sampleResources(): Promise<ResourceSnapshot> {
    const mem = readProcMeminfo();
    const cpu = readCpuInfo();
    const load = readCpuLoad();
    const thermal = readThermalState(this.thermalState, this.thermalHysteresisDegC);
    const now = readProcVmstatSwap();
    const nowTime = Date.now();
    let swapInDeltaPerSec = 0;
    let swapOutDeltaPerSec = 0;
    if (this.prevSampleTime > 0) {
      const elapsedSec = (nowTime - this.prevSampleTime) / 1000;
      if (elapsedSec > 0) {
        swapInDeltaPerSec = (now.swapInBytes - this.prevSwapInBytes) / elapsedSec;
        swapOutDeltaPerSec = (now.swapOutBytes - this.prevSwapOutBytes) / elapsedSec;
      }
    }
    this.prevSwapInBytes = now.swapInBytes;
    this.prevSwapOutBytes = now.swapOutBytes;
    this.prevSampleTime = nowTime;
    return {
      timestamp: new Date().toISOString(),
      memoryAvailableBytes: mem.memAvailable,
      memoryTotalBytes: mem.memTotal,
      swapAvailableBytes: mem.swapAvailable,
      swapTotalBytes: mem.swapTotal,
      swapInBytes: now.swapInBytes,
      swapOutBytes: now.swapOutBytes,
      swapInDeltaPerSec,
      swapOutDeltaPerSec,
      cpuCount: cpu.cpuCount,
      cpuLoadPercent: load,
      cpuTemperatureC: thermal.temperatureC,
      thermalThrottled: thermal.throttled,
    };
  }

  async submitToBacklog(task: BacklogTask): Promise<BacklogToken> {
    if (this.backlog.length >= this.backlogLimit) {
      throw new Error(`Backlog limit reached (${this.backlogLimit})`);
    }
    const tokenId = `bt-${this.nextTokenId++}-${createHash('sha256').update(task.taskId + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const position = this.backlog.length;
    const token: BacklogToken = { tokenId, position, estimatedWaitMs: position * 1000 };
    this.backlog.push({ task, token, submittedAt: Date.now() });
    this.tokenToTaskId.set(tokenId, task.taskId);
    this.backlog.sort((a, b) => b.task.priority - a.task.priority || a.submittedAt - b.submittedAt);
    return token;
  }

  async startBacklogTask(token: BacklogToken): Promise<void> {
    this.runningBacklog.add(token.tokenId);
  }

  async completeBacklogTask(token: BacklogToken): Promise<void> {
    this.runningBacklog.delete(token.tokenId);
    const taskId = this.tokenToTaskId.get(token.tokenId);
    if (taskId) {
      const idx = this.backlog.findIndex((t) => t.task.taskId === taskId);
      if (idx >= 0) this.backlog.splice(idx, 1);
    }
    this.tokenToTaskId.delete(token.tokenId);
  }

  async pollBacklog(token: BacklogToken): Promise<BacklogStatus> {
    if (this.runningBacklog.has(token.tokenId)) {
      return { status: 'running', tokenId: token.tokenId };
    }
    const taskId = this.tokenToTaskId.get(token.tokenId);
    if (!taskId) return { status: 'completed' };
    const idx = this.backlog.findIndex((t) => t.task.taskId === taskId);
    if (idx < 0) return { status: 'completed' };
    return { status: 'queued', position: idx, estimatedWaitMs: idx * 1000 };
  }

  async drainBacklog(): Promise<number> {
    const count = this.backlog.length;
    this.backlog = [];
    this.runningBacklog.clear();
    this.tokenToTaskId.clear();
    return count;
  }

  async detectLeaseConflicts(poolId: string): Promise<Array<{ leaseIdA: string; leaseIdB: string; reason: string }>> {
    const poolLeases = [...this.leases.values()].filter((l) => l.poolId === poolId);
    const conflicts: Array<{ leaseIdA: string; leaseIdB: string; reason: string }> = [];
    for (let i = 0; i < poolLeases.length; i++) {
      for (let j = i + 1; j < poolLeases.length; j++) {
        const a = poolLeases[i];
        const b = poolLeases[j];
        if (a.holder === b.holder) {
          conflicts.push({ leaseIdA: a.leaseId, leaseIdB: b.leaseId, reason: `Duplicate holder: ${a.holder}` });
        }
        const pool = this.pools.get(poolId);
        if (pool) {
          const totalMemory = a.memoryBytes + b.memoryBytes;
          if (totalMemory > pool.maxMemoryBytes * 0.8) {
            conflicts.push({ leaseIdA: a.leaseId, leaseIdB: b.leaseId, reason: `Combined memory ${totalMemory} exceeds 80% of pool capacity ${pool.maxMemoryBytes}` });
          }
        }
      }
    }
    return conflicts;
  }

  async buildEvidence(poolId: string, leaseIds: string[]): Promise<ResourceGovernanceEvidence> {
    const snapshot = await this.sampleResources();
    const evidence: ResourceGovernanceEvidence = {
      effectiveIdentity: this.effectiveIdentity,
      poolId,
      snapshot,
      leaseIds,
      backlogDepth: this.backlog.length,
      governorVersion: 'C1-v2',
      evidenceSha256: '' as Sha256,
    };
    const payload = {
      effectiveIdentity: evidence.effectiveIdentity,
      poolId: evidence.poolId,
      snapshot: evidence.snapshot,
      leaseIds: evidence.leaseIds,
      backlogDepth: evidence.backlogDepth,
      governorVersion: evidence.governorVersion,
    };
    evidence.evidenceSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));
    return evidence;
  }
}

export class FailClosedResourceGovernor implements ResourceGovernorAdapter {
  private readonly delegate: ResourceGovernorAdapter;
  private readonly failReason: string;

  constructor(delegate: ResourceGovernorAdapter, failReason: string) {
    this.delegate = delegate;
    this.failReason = failReason;
  }

  async detect(): Promise<{ available: boolean; platform: string }> {
    return { available: false, platform: 'fail-closed' };
  }

  async createPool(_config: ResourcePoolConfig): Promise<void> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async destroyPool(_poolId: string): Promise<void> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async listPools(): Promise<ResourcePoolConfig[]> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async acquireLease(_poolId: string, _holder: string, _request: { memoryBytes: number; cpuPercent: number }): Promise<ResourceLease> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async releaseLease(_leaseId: string): Promise<void> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async getLease(_leaseId: string): Promise<ResourceLease | null> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async createProcessGroup(_label: string): Promise<ProcessGroup> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async cleanupDescendants(_groupId: string, _signal?: string): Promise<number> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async sampleResources(): Promise<ResourceSnapshot> {
    return {
      timestamp: new Date().toISOString(),
      memoryAvailableBytes: 0,
      memoryTotalBytes: 0,
      swapAvailableBytes: 0,
      swapTotalBytes: 0,
      swapInBytes: 0,
      swapOutBytes: 0,
      swapInDeltaPerSec: 0,
      swapOutDeltaPerSec: 0,
      cpuCount: 0,
      cpuLoadPercent: 0,
      cpuTemperatureC: null,
      thermalThrottled: true,
    };
  }

  async submitToBacklog(_task: BacklogTask): Promise<BacklogToken> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async startBacklogTask(_token: BacklogToken): Promise<void> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async completeBacklogTask(_token: BacklogToken): Promise<void> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async pollBacklog(_token: BacklogToken): Promise<BacklogStatus> {
    return { status: 'rejected', reason: this.failReason };
  }

  async drainBacklog(): Promise<number> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async detectLeaseConflicts(_poolId: string): Promise<Array<{ leaseIdA: string; leaseIdB: string; reason: string }>> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }

  async buildEvidence(_poolId: string, _leaseIds: string[]): Promise<ResourceGovernanceEvidence> {
    throw new Error(`Fail-closed: ${this.failReason}`);
  }
}

export class PortableResourceGovernor implements ResourceGovernorAdapter {
  private pools = new Map<string, ResourcePoolConfig>();
  private leases = new Map<string, ResourceLease>();
  private processGroups = new Map<string, ProcessGroup>();
  private backlog: Array<{ task: BacklogTask; token: BacklogToken; submittedAt: number }> = [];
  private runningBacklog = new Set<string>();
  private tokenToTaskId = new Map<string, string>();
  private nextLeaseId = 1;
  private nextGroupId = 1;
  private nextTokenId = 1;
  private readonly effectiveIdentity: Sha256;

  constructor(effectiveIdentity: Sha256) {
    if (!isSha256(effectiveIdentity)) {
      throw new Error(`PortableResourceGovernor: effectiveIdentity must be a SHA-256 hash, got ${effectiveIdentity}`);
    }
    this.effectiveIdentity = effectiveIdentity;
  }

  async detect(): Promise<{ available: boolean; platform: string }> {
    return { available: true, platform: 'portable' };
  }

  async createPool(config: ResourcePoolConfig): Promise<void> {
    if (this.pools.has(config.poolId)) throw new Error(`Pool exists: ${config.poolId}`);
    this.pools.set(config.poolId, { ...config });
  }

  async destroyPool(poolId: string): Promise<void> {
    if (!this.pools.has(poolId)) throw new Error(`Pool not found: ${poolId}`);
    for (const [leaseId, lease] of this.leases) {
      if (lease.poolId === poolId) this.leases.delete(leaseId);
    }
    this.pools.delete(poolId);
  }

  async listPools(): Promise<ResourcePoolConfig[]> {
    return [...this.pools.values()];
  }

  async acquireLease(poolId: string, holder: string, request: { memoryBytes: number; cpuPercent: number }): Promise<ResourceLease> {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    const poolMemoryUsed = [...this.leases.values()]
      .filter((l) => l.poolId === poolId).reduce((s, l) => s + l.memoryBytes, 0);
    const poolCpuUsed = [...this.leases.values()]
      .filter((l) => l.poolId === poolId).reduce((s, l) => s + l.cpuPercent, 0);
    if (poolMemoryUsed + request.memoryBytes > pool.maxMemoryBytes) {
      throw new Error(`Pool ${poolId} memory capacity exceeded`);
    }
    if (poolCpuUsed + request.cpuPercent > pool.maxCpuPercent) {
      throw new Error(`Pool ${poolId} CPU capacity exceeded`);
    }
    const poolProcessCount = [...this.leases.values()].filter((l) => l.poolId === poolId).length;
    if (pool.maxProcessCount > 0 && poolProcessCount >= pool.maxProcessCount) {
      throw new Error(`Pool ${poolId} process limit reached`);
    }
    const existingHolder = [...this.leases.values()]
      .find((l) => l.poolId === poolId && l.holder === holder);
    if (existingHolder) {
      throw new Error(`Pool ${poolId}: holder ${holder} already holds lease ${existingHolder.leaseId}`);
    }
    const pg = await this.createProcessGroup(`lease-${this.nextLeaseId}`);
    const leaseId = `lease-${this.nextLeaseId++}-p${poolId.slice(0, 8)}-${createHash('sha256').update(holder + Date.now().toString()).digest('hex').slice(0, 12)}`;
    const lease: ResourceLease = {
      leaseId,
      poolId,
      holder,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      memoryBytes: request.memoryBytes,
      cpuPercent: request.cpuPercent,
      processGroupId: pg.groupId,
      effectiveIdentity: this.effectiveIdentity,
    };
    this.leases.set(leaseId, lease);
    return lease;
  }

  async releaseLease(leaseId: string): Promise<void> {
    if (!this.leases.has(leaseId)) throw new Error(`Lease not found: ${leaseId}`);
    this.leases.delete(leaseId);
  }

  async getLease(leaseId: string): Promise<ResourceLease | null> {
    return this.leases.get(leaseId) ?? null;
  }

  async createProcessGroup(label: string, ...pids: number[]): Promise<ProcessGroup> {
    const groupId = `pg-${this.nextGroupId++}-${createHash('sha256').update(label + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const pg: ProcessGroup = { groupId, label, processCount: pids.length, createdAt: new Date().toISOString() };
    this.processGroups.set(groupId, pg);
    return pg;
  }

  async cleanupDescendants(_groupId: string, _signal?: string): Promise<number> {
    return 0;
  }

  async sampleResources(): Promise<ResourceSnapshot> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuLoad = cpus.length > 0
      ? Math.round(cpus.reduce((sum, cpu) => {
        const idle = cpu.times.idle;
        const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        return sum + (total > 0 ? Math.round((1 - idle / total) * 100) : 0);
      }, 0) / cpus.length)
      : 0;
    return {
      timestamp: new Date().toISOString(),
      memoryAvailableBytes: freeMem,
      memoryTotalBytes: totalMem,
      swapAvailableBytes: 0,
      swapTotalBytes: 0,
      swapInBytes: 0,
      swapOutBytes: 0,
      swapInDeltaPerSec: 0,
      swapOutDeltaPerSec: 0,
      cpuCount: cpus.length,
      cpuLoadPercent: cpuLoad,
      cpuTemperatureC: null,
      thermalThrottled: false,
    };
  }

  async submitToBacklog(task: BacklogTask): Promise<BacklogToken> {
    const tokenId = `bt-${this.nextTokenId++}-${createHash('sha256').update(task.taskId + Date.now().toString()).digest('hex').slice(0, 16)}`;
    const position = this.backlog.length;
    const token: BacklogToken = { tokenId, position, estimatedWaitMs: position * 200 };
    this.backlog.push({ task, token, submittedAt: Date.now() });
    this.tokenToTaskId.set(tokenId, task.taskId);
    this.backlog.sort((a, b) => b.task.priority - a.task.priority || a.submittedAt - b.submittedAt);
    return token;
  }

  async startBacklogTask(token: BacklogToken): Promise<void> {
    this.runningBacklog.add(token.tokenId);
  }

  async completeBacklogTask(token: BacklogToken): Promise<void> {
    this.runningBacklog.delete(token.tokenId);
    const taskId = this.tokenToTaskId.get(token.tokenId);
    if (taskId) {
      const idx = this.backlog.findIndex((t) => t.task.taskId === taskId);
      if (idx >= 0) this.backlog.splice(idx, 1);
    }
    this.tokenToTaskId.delete(token.tokenId);
  }

  async pollBacklog(token: BacklogToken): Promise<BacklogStatus> {
    if (this.runningBacklog.has(token.tokenId)) return { status: 'running', tokenId: token.tokenId };
    const taskId = this.tokenToTaskId.get(token.tokenId);
    if (!taskId) return { status: 'completed' };
    const idx = this.backlog.findIndex((t) => t.task.taskId === taskId);
    if (idx < 0) return { status: 'completed' };
    return { status: 'queued', position: idx, estimatedWaitMs: idx * 200 };
  }

  async drainBacklog(): Promise<number> {
    const count = this.backlog.length;
    this.backlog = [];
    this.runningBacklog.clear();
    this.tokenToTaskId.clear();
    return count;
  }

  async detectLeaseConflicts(poolId: string): Promise<Array<{ leaseIdA: string; leaseIdB: string; reason: string }>> {
    const poolLeases = [...this.leases.values()].filter((l) => l.poolId === poolId);
    const conflicts: Array<{ leaseIdA: string; leaseIdB: string; reason: string }> = [];
    for (let i = 0; i < poolLeases.length; i++) {
      for (let j = i + 1; j < poolLeases.length; j++) {
        const a = poolLeases[i];
        const b = poolLeases[j];
        if (a.holder === b.holder) {
          conflicts.push({ leaseIdA: a.leaseId, leaseIdB: b.leaseId, reason: `Duplicate holder: ${a.holder}` });
        }
        const totalMemory = a.memoryBytes + b.memoryBytes;
        const pool = this.pools.get(poolId);
        if (pool && totalMemory > pool.maxMemoryBytes * 0.8) {
          conflicts.push({ leaseIdA: a.leaseId, leaseIdB: b.leaseId, reason: `Combined memory ${totalMemory} exceeds 80% of pool capacity ${pool.maxMemoryBytes}` });
        }
      }
    }
    return conflicts;
  }

  async buildEvidence(poolId: string, leaseIds: string[]): Promise<ResourceGovernanceEvidence> {
    const snapshot = await this.sampleResources();
    const evidence: ResourceGovernanceEvidence = {
      effectiveIdentity: this.effectiveIdentity,
      poolId,
      snapshot,
      leaseIds,
      backlogDepth: this.backlog.length,
      governorVersion: 'C1-portable-v2',
      evidenceSha256: '' as Sha256,
    };
    const payload = {
      effectiveIdentity: evidence.effectiveIdentity,
      poolId: evidence.poolId,
      snapshot: evidence.snapshot,
      leaseIds: evidence.leaseIds,
      backlogDepth: evidence.backlogDepth,
      governorVersion: evidence.governorVersion,
    };
    evidence.evidenceSha256 = sha256Bytes(new TextEncoder().encode(JSON.stringify(payload)));
    return evidence;
  }
}

export function createResourceGovernor(effectiveIdentity: Sha256): ResourceGovernorAdapter {
  if (!isSha256(effectiveIdentity)) {
    throw new Error(`createResourceGovernor: effectiveIdentity must be a SHA-256 hash, got ${effectiveIdentity}`);
  }
  try {
    fs.accessSync('/proc/meminfo', fs.constants.R_OK);
    return new NativeResourceGovernor(effectiveIdentity);
  } catch {
    return new PortableResourceGovernor(effectiveIdentity);
  }
}
