// Compatibility facade delegating to canonical kernel; new consumers use the
// state/live-amendment entrypoint exported from the kernel root.
import {
  createAmendmentRequest as kCreate,
  compileRevisionImpactPlan as kCompile,
  compileRevisionImpactPlanFromStrongPlanner as kCompileStrong,
  parseStrongPlannerRevisionImpactPlan as kParseStrong,
  activateRevisionImpact as kActivate,
  type WorkerTaskRecipe as kRecipe,
  type RevisionImpactPlan as kPlan,
  type AmendmentRequest as kRequest,
  type StrongPlannerRevisionImpactPlan as kStrongPlan,
  type ActivationResult as kResult,
} from '@initforge/agent-rules-kernel';

export type WorkerTaskRecipe = kRecipe;
export type RevisionImpactPlan = kPlan;
export type AmendmentRequest = kRequest;
export type StrongPlannerRevisionImpactPlan = kStrongPlan;
export type ActivationResult = kResult;

export function createAmendmentRequest(
  planId: string,
  intent: string,
  cwd: string,
): AmendmentRequest {
  return kCreate(planId, intent, cwd);
}

export function compileRevisionImpactPlan(
  planId: string,
  amendment: AmendmentRequest,
  currentTaskIds: string[],
  activeTasks: string[],
  completedTasks: string[],
  currentRevision: string,
  taskDependencies?: Record<string, string[]>,
  cwd: string = '.',
): RevisionImpactPlan {
  return kCompile(planId, amendment, currentTaskIds, activeTasks, completedTasks, currentRevision, taskDependencies, cwd);
}

export const parseStrongPlannerRevisionImpactPlan = kParseStrong;

export function compileRevisionImpactPlanFromStrongPlanner(
  planId: string,
  amendment: AmendmentRequest,
  currentTaskIds: string[],
  activeTasks: string[],
  completedTasks: string[],
  currentRevision: string,
  rawPlannerPlan: unknown,
  cwd: string = '.',
): RevisionImpactPlan {
  return kCompileStrong(planId, amendment, currentTaskIds, activeTasks, completedTasks, currentRevision, rawPlannerPlan, cwd);
}

export function activateRevisionImpact(
  cwd: string,
  impactPlan: RevisionImpactPlan,
): ActivationResult {
  return kActivate(cwd, impactPlan);
}
