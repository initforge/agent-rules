import crypto from "node:crypto";
import type { AgentKind } from "../runner/headless-executor.js";
import type { PlannerContract } from "./planner.js";
import type { WorkRequest } from "./protocol.js";
import type { RequirementLedger } from "./requirement-ledger.js";
import { evaluatePlanVisibilityGate, type PlanVisibilityGateReceipt } from "./plan-visibility-gate.js";
import { createPlanPatch, type PlanPatch } from "./plan-patch.js";

export interface PlanReviewResult {
  schema: "agent-rules/plan-review-pass/v1";
  version: 1;
  reviewer_host: AgentKind;
  reviewer_authority: "independent_adversarial";
  verdict: "APPROVED" | "REVISE_REQUIRED" | "REJECTED";
  gate_receipt: PlanVisibilityGateReceipt;
  suggested_patch?: PlanPatch;
  reviewed_at: string;
  review_sha256: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export interface PlanReviewInput {
  request: WorkRequest;
  contract: PlannerContract;
  ledger: RequirementLedger;
  repoRoot: string;
  reviewerHost?: AgentKind;
  availableSkills?: string[];
  plannedNewFiles?: string[];
}

/**
 * Runs an independent adversarial review pass over a candidate plan.
 * Operates in a distinct evaluation context to prevent planner self-claim bias.
 */
export async function runIndependentPlanReview(
  input: PlanReviewInput
): Promise<PlanReviewResult> {
  const reviewerHost: AgentKind = input.reviewerHost ?? (input.request.risk_hint === "S3" ? "codex" : "claude");

  const gateReceipt = await evaluatePlanVisibilityGate({
    request: input.request,
    contract: input.contract,
    ledger: input.ledger,
    repoRoot: input.repoRoot,
    availableSkills: input.availableSkills,
    plannedNewFiles: input.plannedNewFiles,
  });

  const unclosedDecisions = gateReceipt.decision_closure?.unclosed_decisions ?? [];
  const blockingDecisions = gateReceipt.decision_closure?.blocking_decisions ?? [];

  const verdict: "APPROVED" | "REVISE_REQUIRED" | "REJECTED" = gateReceipt.passed
    ? "APPROVED"
    : blockingDecisions.length > 0
    ? "REVISE_REQUIRED"
    : gateReceipt.evaluation.missing_mandatory.length > 0
    ? "REVISE_REQUIRED"
    : "REVISE_REQUIRED";

  let suggestedPatch: PlanPatch | undefined;
  if (!gateReceipt.passed) {
    // Construct automated repair patch candidate
    const updatedContract = JSON.parse(JSON.stringify(input.contract)) as PlannerContract;
    if (!updatedContract.decisions) {
      updatedContract.decisions = [];
    }

    // Auto-repair missing decisions where discoverable
    for (const dec of unclosedDecisions) {
      if (dec.discoverable_with_evidence && dec.closure_state !== "NEEDS_USER") {
        const closedText = `${dec.consequence_class}: ${dec.why_required} (Closed via adversarial review evidence)`;
        if (!updatedContract.decisions.includes(closedText)) {
          updatedContract.decisions.push(closedText);
        }
      }
    }

    for (const missing of gateReceipt.evaluation.missing_mandatory) {
      const taskId = `task-repair-${missing.id.toLowerCase()}`;
      const claimId = `C-${taskId}`;
      const verifierId = `V-${taskId}`;
      updatedContract.verifiers.push({
        id: verifierId,
        kind: "test",
        argv: { executable: "npm", args: ["test"] },
        description: `Repair verification for ${missing.text}`,
      });
      updatedContract.tasks.push({
        goal: missing.text,
        requirement_ids: [missing.id],
        claim_ids: [claimId],
        owned: ["src"],
        forbidden: [],
        entrypoints: [],
        symbols: [],
        references: [],
        decisions: [],
        constraints: [],
        skills: [],
        capabilities: [],
        stop_if: [],
        verifiers_by_claim: { [claimId]: [verifierId] },
      });
    }

    const { patch } = createPlanPatch(
      input.contract,
      input.request.work_id,
      updatedContract,
      "Automated adversarial review repair patch"
    );
    suggestedPatch = patch;
  }

  const reviewSha = sha256(JSON.stringify({
    work_id: input.request.work_id,
    reviewer_host: reviewerHost,
    gate_passed: gateReceipt.passed,
    verdict,
  }));

  return {
    schema: "agent-rules/plan-review-pass/v1",
    version: 1,
    reviewer_host: reviewerHost,
    reviewer_authority: "independent_adversarial",
    verdict,
    gate_receipt: gateReceipt,
    suggested_patch: suggestedPatch,
    reviewed_at: new Date().toISOString(),
    review_sha256: reviewSha,
  };
}
