import os from 'node:os';
import type { TaskPacket } from './protocol.js';

export interface ResourcePolicy {
  max_repair_attempts: number;
  max_active_skills: number;
  max_active_capabilities: number;
  max_task_timeout_ms: number;
  max_agent_concurrency: number;
  max_subagent_concurrency: number;
  max_browser_instances: number;
  max_parallel_verifiers: number;
  target_free_memory_mb: number;
  hard_min_free_memory_mb: number;
  elevated_cpu_load_per_core: number;
  critical_cpu_load_per_core: number;
}

export interface HostResourceSnapshot {
  observed_at: string;
  cpu_count: number;
  load_1m: number | null;
  load_per_core: number | null;
  total_memory_mb: number;
  free_memory_mb: number;
  free_memory_ratio: number;
  platform: NodeJS.Platform;
}

export interface ResourceDecision {
  pressure: 'normal' | 'elevated' | 'critical';
  allow_new_work: boolean;
  recommended_agent_concurrency: number;
  recommended_subagent_concurrency: number;
  browser_instances: number;
  parallel_verifiers: number;
  reasons: string[];
  snapshot: HostResourceSnapshot;
  policy: ResourcePolicy;
}

export const DEFAULT_RESOURCE_POLICY: ResourcePolicy = {
  max_repair_attempts: 2,
  max_active_skills: 3,
  max_active_capabilities: 8,
  max_task_timeout_ms: 60 * 60 * 1000,
  max_agent_concurrency: 2,
  max_subagent_concurrency: 2,
  max_browser_instances: 1,
  max_parallel_verifiers: 2,
  target_free_memory_mb: 4096,
  hard_min_free_memory_mb: 768,
  elevated_cpu_load_per_core: 0.8,
  critical_cpu_load_per_core: 1.25,
};

const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024);

export function observeHostResources(): HostResourceSnapshot {
  const cpuCount = Math.max(1, os.cpus().length);
  const [load] = os.loadavg();
  // Node reports 0 load averages on Windows. Treat that as unknown rather than
  // pretending the machine is idle.
  const loadKnown = os.platform() !== 'win32' && Number.isFinite(load);
  const total = Math.max(1, mb(os.totalmem()));
  const free = Math.max(0, mb(os.freemem()));
  return {
    observed_at: new Date().toISOString(),
    cpu_count: cpuCount,
    load_1m: loadKnown ? load : null,
    load_per_core: loadKnown ? load / cpuCount : null,
    total_memory_mb: total,
    free_memory_mb: free,
    free_memory_ratio: free / total,
    platform: os.platform(),
  };
}

/**
 * Resource policy is advisory under ordinary pressure and fail-closed only at
 * the hard memory floor. This avoids brittle OS-specific CPU throttling while
 * still reducing concurrency before the host starts swapping/thrashing.
 */
export function governResources(snapshot = observeHostResources(), policy = DEFAULT_RESOURCE_POLICY): ResourceDecision {
  const reasons: string[] = [];
  let pressure: ResourceDecision['pressure'] = 'normal';
  if (snapshot.free_memory_mb < policy.hard_min_free_memory_mb) {
    pressure = 'critical';
    reasons.push(`free memory ${snapshot.free_memory_mb}MB is below hard floor ${policy.hard_min_free_memory_mb}MB`);
  } else if (snapshot.free_memory_mb < policy.target_free_memory_mb || snapshot.free_memory_ratio < 0.12) {
    pressure = 'elevated';
    reasons.push(`free memory ${snapshot.free_memory_mb}MB is below target ${policy.target_free_memory_mb}MB`);
  }
  if (snapshot.load_per_core !== null) {
    if (snapshot.load_per_core >= policy.critical_cpu_load_per_core) {
      pressure = 'critical';
      reasons.push(`1m CPU load/core ${snapshot.load_per_core.toFixed(2)} exceeds critical ${policy.critical_cpu_load_per_core}`);
    } else if (snapshot.load_per_core >= policy.elevated_cpu_load_per_core && pressure === 'normal') {
      pressure = 'elevated';
      reasons.push(`1m CPU load/core ${snapshot.load_per_core.toFixed(2)} exceeds elevated ${policy.elevated_cpu_load_per_core}`);
    }
  }
  if (reasons.length === 0) reasons.push('host pressure is within policy targets');
  const scale = pressure === 'normal' ? 1 : pressure === 'elevated' ? 0.5 : 0;
  return {
    pressure,
    allow_new_work: pressure !== 'critical' || snapshot.free_memory_mb >= policy.hard_min_free_memory_mb,
    recommended_agent_concurrency: Math.max(pressure === 'critical' ? 1 : 1, Math.floor(policy.max_agent_concurrency * Math.max(scale, 0.5))),
    recommended_subagent_concurrency: pressure === 'normal' ? policy.max_subagent_concurrency : pressure === 'elevated' ? Math.min(1, policy.max_subagent_concurrency) : 0,
    browser_instances: pressure === 'critical' ? 0 : Math.min(1, policy.max_browser_instances),
    parallel_verifiers: pressure === 'normal' ? policy.max_parallel_verifiers : 1,
    reasons,
    snapshot,
    policy,
  };
}

export function assertResourceBudget(input: {
  packets: readonly TaskPacket[];
  maxRepairDepth?: number;
  taskTimeoutMs?: number;
  policy?: ResourcePolicy;
  snapshot?: HostResourceSnapshot;
}): ResourcePolicy {
  const policy = input.policy ?? DEFAULT_RESOURCE_POLICY;
  const repair = input.maxRepairDepth ?? policy.max_repair_attempts;
  if (!Number.isInteger(repair) || repair < 0 || repair > policy.max_repair_attempts) {
    throw new Error(`repair budget ${repair} exceeds policy max ${policy.max_repair_attempts}`);
  }
  const timeout = input.taskTimeoutMs;
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout <= 0 || timeout > policy.max_task_timeout_ms)) {
    throw new Error(`task timeout ${timeout} exceeds policy max ${policy.max_task_timeout_ms}`);
  }
  for (const packet of input.packets) {
    if ((packet.skills?.length ?? 0) > policy.max_active_skills) throw new Error(`task ${packet.task_id} activates too many skills`);
    if ((packet.capabilities?.length ?? 0) > policy.max_active_capabilities) throw new Error(`task ${packet.task_id} activates too many capabilities`);
  }
  if (input.snapshot && input.snapshot.free_memory_mb < policy.hard_min_free_memory_mb) {
    throw new Error(`host free memory ${input.snapshot.free_memory_mb}MB is below hard floor ${policy.hard_min_free_memory_mb}MB`);
  }
  return policy;
}
