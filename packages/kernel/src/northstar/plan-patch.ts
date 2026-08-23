import crypto from "node:crypto";
import type { PlannerContract } from "./planner.js";

export interface PlanPatch {
  schema: "agent-rules/plan-patch/v1";
  version: 1;
  parent_plan_id: string;
  parent_revision_hash: string;
  patch_hash: string;
  preserved_requirement_ids: string[];
  preserved_decisions: string[];
  preserved_task_ids: string[];
  added_requirements: string[];
  modified_tasks: string[];
  added_tasks: string[];
  patch_rationale: string;
  created_at: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Creates a semantic lineage PlanPatch comparing an original plan against an updated plan.
 * Asserts semantic continuity: preserved requirement IDs, decisions, and task identities.
 */
export function createPlanPatch(
  parentPlan: PlannerContract,
  parentPlanId: string,
  updatedPlan: PlannerContract,
  rationale: string
): { patch: PlanPatch; patchedContract: PlannerContract } {
  const parentReqIds = new Set(parentPlan.requirements.map((r) => r.id || ""));
  const updatedReqIds = new Set(updatedPlan.requirements.map((r) => r.id || ""));

  const preserved_requirement_ids = [...parentReqIds].filter((id) => id && updatedReqIds.has(id));
  const added_requirements = [...updatedReqIds].filter((id) => id && !parentReqIds.has(id));

  const parentDecisions = new Set(parentPlan.decisions ?? []);
  const updatedDecisions = new Set(updatedPlan.decisions ?? []);
  const preserved_decisions = [...parentDecisions].filter((d) => updatedDecisions.has(d));

  const parentTaskGoals = new Set(parentPlan.tasks.map((t) => t.goal));
  const updatedTaskGoals = new Set(updatedPlan.tasks.map((t) => t.goal));

  const preserved_task_ids: string[] = [];
  const modified_tasks: string[] = [];
  const added_tasks: string[] = [];

  for (const task of updatedPlan.tasks) {
    if (parentTaskGoals.has(task.goal)) {
      preserved_task_ids.push(task.goal);
    } else {
      added_tasks.push(task.goal);
    }
  }

  const parentRevHash = sha256(JSON.stringify(parentPlan));
  const patchContent = JSON.stringify({
    parent_plan_id: parentPlanId,
    parent_revision_hash: parentRevHash,
    preserved_requirement_ids,
    preserved_decisions,
    preserved_task_ids,
    added_requirements,
    added_tasks,
    rationale,
  });

  const patch: PlanPatch = {
    schema: "agent-rules/plan-patch/v1",
    version: 1,
    parent_plan_id: parentPlanId,
    parent_revision_hash: parentRevHash,
    patch_hash: sha256(patchContent),
    preserved_requirement_ids,
    preserved_decisions,
    preserved_task_ids,
    added_requirements,
    modified_tasks,
    added_tasks,
    patch_rationale: rationale,
    created_at: new Date().toISOString(),
  };

  return {
    patch,
    patchedContract: updatedPlan,
  };
}
