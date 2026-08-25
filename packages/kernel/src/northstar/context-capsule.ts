/**
 * context-capsule.ts — canonical ContextRuntime capsule (closure REQ-108).
 *
 * ContextCapsule is the durable instruction-source contract a worker opens on
 * resume with NO prior conversation. It contains exactly:
 *  - raw request reference
 *  - effective requirements and decisions
 *  - current plan/task id
 *  - owned and forbidden scope
 *  - skill route receipt
 *  - capability plan/lease
 *  - evidence references
 *  - remaining work and next action
 *
 * Raw session JSONL is telemetry, never an instruction source. Compaction must
 * never lose raw intent, requirements, skills, MCP requirements or proof.
 * Prompt classification: compatible | refinement | conflict | supersedes |
 * unrelated. Only compatible/refinement auto-reconcile; conflict/supersession
 * need an owner decision.
 */
import type { WorkRequest, WorkSpec } from './protocol.js';

export interface SkillRouteReceipt {
  context_generation: number;
  selected: string[];
  resolved_by: 'skill-resolver';
  facts_hash: string;
}

export interface CapabilityLease {
  capability: string;
  provider: string | null;
  mcp: boolean;
  lease_id?: string;
}

export interface EvidenceReference {
  path: string;
  sha256?: string;
  claim_id?: string;
}

export interface ContextCapsule {
  schema: 'agent-rules/context-capsule/v1';
  raw_request_ref: string;
  raw_intent: string;
  effective_requirements: string[];
  decisions: string[];
  plan_id: string;
  task_id: string;
  owned_scope: string[];
  forbidden_scope: string[];
  skill_route: SkillRouteReceipt | null;
  capability_plan: CapabilityLease[];
  evidence_refs: EvidenceReference[];
  remaining_work: string[];
  next_action: string;
  context_generation: number;
}

/** Build the canonical capsule from the frozen inputs available at resume. */
export function buildContextCapsule(input: {
  request: WorkRequest;
  spec: WorkSpec;
  planId: string;
  taskId: string;
  owned: string[];
  forbidden: string[];
  skillRoute?: SkillRouteReceipt | null;
  capabilityPlan?: CapabilityLease[];
  evidenceRefs?: EvidenceReference[];
  remainingWork?: string[];
  nextAction: string;
  contextGeneration: number;
}): ContextCapsule {
  return {
    schema: 'agent-rules/context-capsule/v1',
    raw_request_ref: input.request.work_id,
    raw_intent: input.request.raw_intent,
    effective_requirements: input.spec.requirements.map((r) => r.id),
    decisions: [...(input.spec.decisions ?? [])],
    plan_id: input.planId,
    task_id: input.taskId,
    owned_scope: [...input.owned],
    forbidden_scope: [...input.forbidden],
    skill_route: input.skillRoute ?? null,
    capability_plan: input.capabilityPlan ?? [],
    evidence_refs: input.evidenceRefs ?? [],
    remaining_work: input.remainingWork ?? [],
    next_action: input.nextAction,
    context_generation: input.contextGeneration,
  };
}

/** Validate a resume capsule: nothing the worker needs may be missing. */
export function assertCapsuleComplete(capsule: ContextCapsule): string[] {
  const problems: string[] = [];
  if (!capsule.raw_intent || !capsule.raw_intent.trim()) problems.push('raw intent missing');
  if (!capsule.plan_id || !capsule.task_id) problems.push('plan/task identity missing');
  if (typeof capsule.context_generation !== 'number' || capsule.context_generation < 0) problems.push('context_generation invalid');
  if (!capsule.next_action || !capsule.next_action.trim()) problems.push('next action missing');
  return problems;
}

export type PromptRelation = 'compatible' | 'refinement' | 'conflict' | 'supersedes' | 'unrelated';

export interface PromptRelationResult {
  relation: PromptRelation;
  reason: string;
}

/**
 * Classify a new prompt against the current capsule. Only compatible and
 * refinement are auto-reconciled; conflict and supersedes require an owner
 * decision; unrelated prompts open independent work.
 */
export function classifyPromptRelation(capsule: ContextCapsule, prompt: string): PromptRelationResult {
  const promptLower = prompt.toLowerCase();
  const capsuleIntent = capsule.raw_intent.toLowerCase();
  const intentTokens = new Set(capsuleIntent.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? []);
  const promptTokens = new Set(promptLower.match(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu) ?? []);
  const overlap = [...intentTokens].filter((t) => promptTokens.has(t)).length;
  const supersedeMarkers = ['supersede', 'replaces', 'instead of', 'new plan', 'abandon'];
  const conflictMarkers = ['conflict', 'contradict', 'do not', 'never do', 'opposite'];
  const unrelatedMarkers = ['unrelated', 'different task', 'new topic', 'separate'];
  const refineMarkers = ['refine', 'adjust', 'update the', 'modify', 'tweak', 'expand detail', 'change format', 'style change'];

  if (supersedeMarkers.some((m) => promptLower.includes(m))) {
    return { relation: 'supersedes', reason: 'prompt explicitly supersedes the current plan/intent' };
  }
  if (conflictMarkers.some((m) => promptLower.includes(m))) {
    return { relation: 'conflict', reason: 'prompt contradicts the current capsule' };
  }
  if (unrelatedMarkers.some((m) => promptLower.includes(m)) || (intentTokens.size > 0 && overlap === 0 && intentTokens.size >= 4)) {
    return { relation: 'unrelated', reason: `no intent-token overlap with current work (${overlap}/${intentTokens.size})` };
  }
  if (refineMarkers.some((m) => promptLower.includes(m))) {
    return { relation: 'refinement', reason: `prompt refines detail of the current work (marker: ${refineMarkers.find((m) => promptLower.includes(m))})` };
  }
  if (overlap >= 2 && overlap >= Math.ceil(intentTokens.size / 2)) {
    return { relation: 'compatible', reason: `prompt overlaps the current intent (${overlap}/${intentTokens.size} tokens)` };
  }
  return { relation: 'refinement', reason: `prompt adjusts detail of the current work (${overlap}/${intentTokens.size} token overlap)` };
}

/** Compaction must preserve the proof-critical fields verbatim. */
export function compactCapsulePreservingProof(capsule: ContextCapsule, trimmed: {
  remainingWork?: string[];
  nextAction?: string;
}): ContextCapsule {
  const next: ContextCapsule = {
    ...capsule,
    remaining_work: trimmed.remainingWork ?? [],
    next_action: trimmed.nextAction ?? capsule.next_action,
  };
  // Never drop raw intent/requirements/evidence by compaction (REQ-108).
  const preserved = assertCapsuleComplete(next);
  if (preserved.length) throw new Error(`compaction would break capsule: ${preserved.join('; ')}`);
  return next;
}