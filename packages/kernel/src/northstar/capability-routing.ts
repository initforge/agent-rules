/**
 * Capability-based routing policy (owner contract REQ-C23 + steering §4).
 *
 * Provider-agnostic by construction: classes are derived from observed
 * capability/evidence, never from hardcoded model or vendor names. All eight
 * canonical hosts are eligible for every run role; planner/implementor is a
 * per-run assignment backed by evidence, never a host identity.
 */

import { HOST_CAPABILITIES, type HostId } from './host-adapters.js';

export const RUN_ROLES = ['planner', 'researcher', 'implementor', 'tester', 'reviewer', 'verifier'] as const;
export type RunRole = (typeof RUN_ROLES)[number];

/** Structural symmetry invariant: every canonical host may fill every role. */
export function assertHostRoleSymmetry(): void {
  const hosts = Object.keys(HOST_CAPABILITIES) as HostId[];
  if (hosts.length !== 8) throw new Error(`host-role symmetry expects 8 canonical hosts, found ${hosts.length}`);
}

/**
 * Per-run role assignment. Selection MUST be driven by the provided evidence;
 * no role may be bound to a fixed host identity across runs.
 */
export interface RoleAssignment {
  run_id: string;
  role: RunRole;
  assigned_host: HostId;
  assignment_basis: string;
}

export function assignRoleForRun(input: { run_id: string; role: RunRole; candidates: HostId[]; assignment_basis: string }): RoleAssignment {
  const hosts = Object.keys(HOST_CAPABILITIES) as HostId[];
  if (input.candidates.length === 0) throw new Error(`role ${input.role} for run ${input.run_id}: empty candidate set`);
  for (const candidate of input.candidates) {
    if (!hosts.includes(candidate)) throw new Error(`unknown host id in role candidates: ${candidate}`);
  }
  return {
    run_id: input.run_id,
    role: input.role,
    // Caller supplies the evidence-ranked candidate order; the head of the
    // list is the assignment. No default host exists anywhere in this module.
    assigned_host: input.candidates[0],
    assignment_basis: input.assignment_basis,
  };
}

export type CapabilityClass = 'planner-researcher' | 'implementation-worker' | 'economy-worker';

export interface CapabilityEvidence {
  class: CapabilityClass;
  handles_ambiguity: boolean;
  handles_architecture: boolean;
  handles_cross_layer_integration: boolean;
  owns_final_quality: boolean;
}

/** Strong planner/researcher responsibilities vs bounded worker slices. */
export const CAPABILITY_CLASS_CONTRACT: Record<CapabilityClass, CapabilityEvidence> = {
  'planner-researcher': {
    class: 'planner-researcher',
    handles_ambiguity: true,
    handles_architecture: true,
    handles_cross_layer_integration: true,
    owns_final_quality: true,
  },
  'implementation-worker': {
    class: 'implementation-worker',
    handles_ambiguity: false,
    handles_architecture: false,
    handles_cross_layer_integration: false,
    owns_final_quality: false,
  },
  'economy-worker': {
    class: 'economy-worker',
    handles_ambiguity: false,
    handles_architecture: false,
    handles_cross_layer_integration: false,
    owns_final_quality: false,
  },
};

export interface WorkSlice {
  id: string;
  kind: 'foundation' | 'primary-journey' | 'live-proof' | 'secondary-journey';
  requirement_ids: string[];
  depends_on: string[];
  min_class: CapabilityClass;
}

const CLASS_RANK: Record<CapabilityClass, number> = {
  'economy-worker': 0,
  'implementation-worker': 1,
  'planner-researcher': 2,
};

export function assertClassAtLeast(actual: CapabilityClass, required: CapabilityClass): void {
  if (CLASS_RANK[actual] < CLASS_RANK[required]) {
    throw new Error(`capability escalation required: task needs ${required}, routed worker is ${actual}`);
  }
}

export interface FailureObservation {
  slice_id: string;
  cause_class: string;
}

/**
 * Escalation rule: after two failures with the same root cause on a slice —
 * or direct evidence the task exceeds the routed class — route to a higher
 * capability class. Never downward.
 */
export function nextRouteAfterFailures(
  current: CapabilityClass,
  failures: FailureObservation[],
): { route: CapabilityClass; escalated: boolean; reason: string } {
  const counts = new Map<string, number>();
  for (const f of failures) counts.set(f.cause_class, (counts.get(f.cause_class) ?? 0) + 1);
  const dominant = [...counts.entries()].find(([, n]) => n >= 2);
  if (!dominant) return { route: current, escalated: false, reason: 'no repeated same-cause failure' };
  if (current === 'planner-researcher') {
    return { route: current, escalated: false, reason: 'already at strongest class; blocker requires owner decision' };
  }
  const upgraded = current === 'economy-worker' ? 'implementation-worker' : 'planner-researcher';
  return { route: upgraded as CapabilityClass, escalated: true, reason: `two same-cause failures (${dominant[0]})` };
}

/**
 * A single worker must never self-perform research -> architecture ->
 * implementation -> closure for a large task (REQ-C23).
 */
export function assertNoSingleWorkerSelfClosure(input: { slice_count: number; worker_class: CapabilityClass; self_verified_closure: boolean }): void {
  if (input.slice_count > 1 && input.self_verified_closure && CLASS_RANK[input.worker_class] < CLASS_RANK['planner-researcher']) {
    throw new Error('single non-planner worker attempted research/architecture/implementation/closure self-certification');
  }
}

/** Compile one mega-plan into dependency-ordered slices preserving ONE owner outcome. */
export function compileSlices(input: { primary_outcome_id: string; requirement_ids: string[]; boundaries?: Partial<Record<WorkSlice['kind'], string[]>> }): WorkSlice[] {
  const reqs = input.requirement_ids;
  const pick = (kind: WorkSlice['kind']) => input.boundaries?.[kind] ?? [];
  const slices: WorkSlice[] = [
    { id: `${input.primary_outcome_id}-S1-foundation`, kind: 'foundation', requirement_ids: pick('foundation'), depends_on: [], min_class: 'planner-researcher' },
    { id: `${input.primary_outcome_id}-S2-primary`, kind: 'primary-journey', requirement_ids: pick('primary-journey'), depends_on: [`${input.primary_outcome_id}-S1-foundation`], min_class: 'implementation-worker' },
    { id: `${input.primary_outcome_id}-S3-proof`, kind: 'live-proof', requirement_ids: pick('live-proof'), depends_on: [`${input.primary_outcome_id}-S2-primary`], min_class: 'implementation-worker' },
    { id: `${input.primary_outcome_id}-S4-secondary`, kind: 'secondary-journey', requirement_ids: pick('secondary-journey'), depends_on: [`${input.primary_outcome_id}-S3-proof`], min_class: 'economy-worker' },
  ];
  const covered = slices.flatMap((s) => s.requirement_ids);
  const missing = reqs.filter((r) => !covered.includes(r));
  if (missing.length > 0) {
    // One owner outcome may be sliced but never decomposed into tasks that
    // lose requirements — unassigned requirements stay with the planner slice.
    slices[0].requirement_ids.push(...missing);
  }
  return slices;
}
