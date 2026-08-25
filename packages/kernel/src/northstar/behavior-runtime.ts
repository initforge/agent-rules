/**
 * behavior-runtime.ts — canonical global-behavior runtime (closure phase
 * global-agent-behavior-native-live-closure-v1, REQ-103/105/112/115).
 *
 * ONE canonical runtime shared by every host/project. This module declares:
 *  - the 11 owner modules (BehaviorRuntime, RequestIntake, PlanCompiler,
 *    ContextRuntime, SkillResolver, CapabilityBroker, ExecutionCoordinator,
 *    ProofRouter, RunStore, OutcomeReducer, HostAdapter);
 *  - the single flow: RequestIntake → PlanCompiler → ContextRuntime →
 *    SkillResolver → CapabilityBroker → ExecutionCoordinator → ProofRouter →
 *    RunStore → OutcomeReducer;
 *  - the single vocabulary: task_state, claim_outcome, host_state,
 *    provider_state (no ambiguous synonyms);
 *  - the finite coverage-matrix contract.
 *
 * Invariants enforced structurally by tests:
 *  - No module other than RunStore writes run.json / events.jsonl / result.json
 *    / artifacts/ (single writer).
 *  - No module other than the OutcomeReducer derives final outcomes / PASS
 *    (single reducer).
 *  - Skill resolution runs exactly once per context_generation.
 */
import type { WorkRequest, WorkSpec, RunState } from './protocol.js';

export const SINGLE_FLOW = [
  'RequestIntake',
  'PlanCompiler',
  'ContextRuntime',
  'SkillResolver',
  'CapabilityBroker',
  'ExecutionCoordinator',
  'ProofRouter',
  'RunStore',
  'OutcomeReducer',
] as const;

export type FlowStage = (typeof SINGLE_FLOW)[number];

export const OWNER_MODULES = [
  'BehaviorRuntime',
  'RequestIntake',
  'PlanCompiler',
  'ContextRuntime',
  'SkillResolver',
  'CapabilityBroker',
  'ExecutionCoordinator',
  'ProofRouter',
  'RunStore',
  'OutcomeReducer',
  'HostAdapter',
] as const;

export type OwnerModule = (typeof OWNER_MODULES)[number];

export const TASK_STATES = ['DISCUSSING', 'PLANNED', 'EXECUTING', 'VERIFYING', 'COMPLETE', 'BLOCKED', 'NEEDS_USER'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const CLAIM_OUTCOMES = ['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER'] as const;
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number];

export const HOST_STATES = ['NOT_DETECTED', 'DETECTED', 'INSTALLED', 'OFFLINE_VERIFIED', 'LIVE_VERIFIED', 'FAILED'] as const;
export type HostState = (typeof HOST_STATES)[number];

export const PROVIDER_STATES = ['UNAVAILABLE', 'AVAILABLE', 'AUTHORIZED', 'ACTIVE', 'FAILED'] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

/** Ambiguous synonyms that must never be used as a domain status (REQ-105). */
export const REMOVED_STATUS_SYNONYMS = [
  'Ready', 'Completed', 'Observed', 'Effective', 'Live pass', 'Host usable pass',
] as const;

export interface StateVocabulary {
  task_state: TaskState;
  claim_outcome: ClaimOutcome;
  host_state: HostState;
  provider_state: ProviderState;
}

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && (TASK_STATES as readonly string[]).includes(value);
}

export function isClaimOutcome(value: unknown): value is ClaimOutcome {
  return typeof value === 'string' && (CLAIM_OUTCOMES as readonly string[]).includes(value);
}

export function isHostState(value: unknown): value is HostState {
  return typeof value === 'string' && (HOST_STATES as readonly string[]).includes(value);
}

export function isProviderState(value: unknown): value is ProviderState {
  return typeof value === 'string' && (PROVIDER_STATES as readonly string[]).includes(value);
}

export interface BehaviorRuntimeInput {
  repoRoot: string;
  request: WorkRequest;
  spec: WorkSpec;
  contextGeneration: number;
}

export interface BehaviorRuntimeReceipt {
  schema: 'agent-rules/behavior-runtime/v1';
  flow: readonly FlowStage[];
  owners: readonly OwnerModule[];
  vocabulary: StateVocabulary | null;
  context_generation: number;
  valid: boolean;
  violations: string[];
}

/**
 * Validate that a run payload conforms to the single flow / vocabulary contract
 * before execution. Fail-closed: unknown state vocabulary is a violation.
 */
export function validateBehaviorRuntimeContract(input: BehaviorRuntimeInput, state: Pick<RunState, 'status'> | null): BehaviorRuntimeReceipt {
  const violations: string[] = [];
  if (!input.request.raw_intent || input.request.raw_intent.trim().length === 0) violations.push('RequestIntake: raw intent missing');
  if (!input.spec.spec_id) violations.push('PlanCompiler: spec id missing');
  if (!Number.isInteger(input.contextGeneration) || input.contextGeneration < 0) violations.push('ContextRuntime: invalid context_generation');
  if (state !== null && !isTaskState(state.status.toUpperCase() as TaskState)) {
    violations.push(`OutcomeReducer: run status ${state.status} is not a canonical task_state`);
  }
  return {
    schema: 'agent-rules/behavior-runtime/v1',
    flow: SINGLE_FLOW,
    owners: OWNER_MODULES,
    vocabulary: state === null ? null : {
      task_state: state.status.toUpperCase() as TaskState,
      claim_outcome: 'PASS',
      host_state: 'NOT_DETECTED',
      provider_state: 'UNAVAILABLE',
    },
    context_generation: input.contextGeneration,
    valid: violations.length === 0,
    violations,
  };
}

/** Finite coverage-matrix cell status (REQ-115). */
export type CoverageCellStatus = 'BEHAVIOR_AND_PROOF' | 'NOT_APPLICABLE' | 'BLOCKED_NEEDS_USER';

export interface CoverageCell {
  stage: string;
  invariant: string;
  actor: string;
  handoff: string;
  mode: 'success' | 'failure' | 'resume';
  host: string | 'all';
  status: CoverageCellStatus;
  reason?: string;
}