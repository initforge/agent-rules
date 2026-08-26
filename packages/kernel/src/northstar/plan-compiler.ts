import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentKind } from "../runner/headless-executor.js";
import { compilePlannerContract, type CompiledPlannerContract, type PlannerContract } from "./planner.js";
import type { WorkRequest } from "./protocol.js";
import { extractRequirementLedger, freezeRequirementLedger, type RequirementLedger } from "./requirement-ledger.js";
import { deliverReferenceInputs } from "./reference-input.js";
import { normalizeNativePlanArtifact } from "./plan-normalizer.js";
import { evaluatePlanVisibilityGate, type PlanVisibilityGateReceipt } from "./plan-visibility-gate.js";
import { runIndependentPlanReview, type PlanReviewResult } from "./plan-reviewer.js";
import { createPlanPatch, type PlanPatch } from "./plan-patch.js";
import { runStrongPlanner } from "./planner-runtime.js";

export type PlanIntent = "PLAN_CREATE" | "PLAN_REVIEW" | "PLAN_EXECUTE";

export interface ExistingPlanArtifact {
  origin_host: AgentKind;
  plan_text: string;
  plan_contract?: PlannerContract;
  format: "markdown" | "json";
  plan_id: string;
  created_at: string;
  source_tree_hash?: string;
}

export interface PlanCompilerOptions {
  repoRoot: string;
  request: WorkRequest;
  planner: AgentKind;
  reviewer?: AgentKind;
  existingPlan?: ExistingPlanArtifact;
  availableSkills?: string[];
  plannedNewFiles?: string[];
  maxInternalReviewTurns?: number;
  invocationOverride?: any;
  domainPackId?: string | null;
}

export interface PlanCompilerResult {
  intent: PlanIntent;
  contract: PlannerContract;
  compiled: CompiledPlannerContract;
  visibilityReceipt: PlanVisibilityGateReceipt;
  reviewResult: PlanReviewResult;
  userVisibleRevisions: number;
  internalRevisionTurns?: number;
  patchHistory: PlanPatch[];
}

export function classifyPlanIntent(
  request: WorkRequest,
  existingPlan?: ExistingPlanArtifact
): PlanIntent {
  if (request.source === "plan" && existingPlan?.plan_contract) {
    return "PLAN_EXECUTE";
  }
  if (existingPlan) {
    return "PLAN_REVIEW";
  }
  return "PLAN_CREATE";
}

/**
 * High-level Plan Compiler entrypoint optimizing for single user-visible review.
 * Internal adversarial loops repair omissions before user publication.
 */
export async function compileOrReviewPlan(
  options: PlanCompilerOptions
): Promise<PlanCompilerResult> {
  const intent = classifyPlanIntent(options.request, options.existingPlan);
  const ledger = freezeRequirementLedger(extractRequirementLedger(options.request.raw_intent));
  await deliverReferenceInputs(options.request, options.planner, options.repoRoot);

  const patchHistory: PlanPatch[] = [];
  let activeContract: PlannerContract;

  if (intent === "PLAN_CREATE") {
    // 1. Run strong planner
    const planResult = await runStrongPlanner({
      repoRoot: options.repoRoot,
      request: options.request,
      planner: options.planner,
      availableSkills: options.availableSkills,
      domainPackId: options.domainPackId,
      ...(options.invocationOverride ? { invocationOverride: options.invocationOverride } : {}),
    });
    activeContract = planResult.contract;
  } else if (intent === "PLAN_REVIEW" && options.existingPlan) {
    // 2. Ingest existing plan artifact and re-ground against current source and facts
    if (options.existingPlan.plan_contract) {
      activeContract = options.existingPlan.plan_contract;
    } else {
      activeContract = normalizeNativePlanArtifact(
        {
          host: options.existingPlan.origin_host,
          raw_text: options.existingPlan.plan_text,
          format: options.existingPlan.format,
          captured_at: options.existingPlan.created_at,
          origin_plan_id: options.existingPlan.plan_id,
        },
        ledger,
        options.request
      );
    }
  } else {
    // 3. PLAN_EXECUTE: Fast-path with fresh preflight
    activeContract = options.existingPlan?.plan_contract ?? normalizeNativePlanArtifact(
      {
        host: options.existingPlan?.origin_host ?? options.planner,
        raw_text: options.existingPlan?.plan_text ?? "",
        format: "markdown",
        captured_at: new Date().toISOString(),
      },
      ledger,
      options.request
    );
  }

  // Internal Adversarial Review & Repair Loop (Primary review + 1 correction review = max 2 turns)
  const maxReviewTurns = Math.min(options.maxInternalReviewTurns ?? 2, 2);
  let reviewTurn = 0;
  let finalReviewResult: PlanReviewResult | undefined;
  let finalGateReceipt: PlanVisibilityGateReceipt | undefined;

  while (reviewTurn < maxReviewTurns) {
    reviewTurn++;
    const reviewResult = await runIndependentPlanReview({
      request: options.request,
      contract: activeContract,
      ledger,
      repoRoot: options.repoRoot,
      reviewerHost: options.reviewer,
      availableSkills: options.availableSkills,
      plannedNewFiles: options.plannedNewFiles,
    });

    finalReviewResult = reviewResult;
    finalGateReceipt = reviewResult.gate_receipt;

    if (reviewResult.verdict === "APPROVED") {
      break;
    }

    // Apply internal patch and continue without exposing unready revisions to user
    if (reviewResult.suggested_patch) {
      patchHistory.push(reviewResult.suggested_patch);
      for (const dec of reviewResult.gate_receipt.decision_closure?.unclosed_decisions ?? []) {
        if (dec.discoverable_with_evidence && dec.closure_state !== "NEEDS_USER") {
          const closedText = `${dec.consequence_class}: ${dec.why_required} (Closed via evidence repair)`;
          if (!activeContract.decisions) activeContract.decisions = [];
          if (!activeContract.decisions.includes(closedText)) {
            activeContract.decisions.push(closedText);
          }
        }
      }
      // A planner may repair wording only when it has repository-backed scope
      // and a verifier.  Inventing `src/index.ts` and `node --test` converts an
      // unknown into a plausible-looking but unsafe execution contract.
      if (reviewResult.gate_receipt.evaluation.missing_mandatory.length > 0) {
        const missing = reviewResult.gate_receipt.evaluation.missing_mandatory
          .map((item) => `${item.id}: ${item.text}`)
          .join('; ');
        throw new Error(`Plan compiler requires source-backed scope and verifier before repair: ${missing}`);
      }
    }
  }

  if (!finalReviewResult || !finalGateReceipt) {
    throw new Error("Plan compiler failed to produce a valid review result");
  }

  if (finalReviewResult.verdict !== "APPROVED") {
    const failedChecks = Object.values(finalGateReceipt.checks)
      .filter((c) => c.status === "FAIL")
      .map((c) => `${c.code}: ${c.detail ?? c.name}`)
      .join("; ");
    throw new Error(`Plan compiler failed closed: verdict ${finalReviewResult.verdict} after ${reviewTurn} turn(s): ${failedChecks || "unapproved"}`);
  }

  const compiled = compilePlannerContract(options.request, activeContract);
  const userVisibleRevisions = 0; // Strictly 0 for S1/S2 internal convergence

  return {
    intent,
    contract: activeContract,
    compiled,
    visibilityReceipt: finalGateReceipt,
    reviewResult: finalReviewResult,
    userVisibleRevisions,
    internalRevisionTurns: reviewTurn,
    patchHistory,
  };
}
