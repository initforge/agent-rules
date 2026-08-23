import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PlannerContract } from "./planner.js";
import type { WorkRequest } from "./protocol.js";
import type { RequirementLedger } from "./requirement-ledger.js";
import { evaluateCandidatePlan, type PlanEvaluationResult } from "./plan-evaluator.js";
import { analyzeDecisionClosure, type DecisionClosureAnalysisResult } from "./decision-closure.js";

export type SourceAnchorKind = "EXISTING_REFERENCE" | "PLANNED_NEW_ARTIFACT";

export interface SourceAnchor {
  kind: SourceAnchorKind;
  path: string;
  symbol?: string;
  status: "VALID" | "INVALID";
  reason?: string;
}

export interface PlanVisibilityGateCheck {
  code: string;
  name: string;
  status: "PASS" | "FAIL";
  detail?: string;
}

export interface PlanVisibilityGateReceipt {
  schema: "agent-rules/plan-visibility-gate-receipt/v1";
  version: 1;
  work_id: string;
  passed: boolean;
  checks: Record<string, PlanVisibilityGateCheck>;
  anchors: SourceAnchor[];
  evaluation: PlanEvaluationResult;
  decision_closure?: DecisionClosureAnalysisResult;
  evaluated_at: string;
  receipt_sha256: string;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export interface PlanVisibilityGateInput {
  request: WorkRequest;
  contract: PlannerContract;
  ledger: RequirementLedger;
  repoRoot: string;
  availableSkills?: string[];
  plannedNewFiles?: string[];
}

export async function verifySourceAnchors(
  contract: PlannerContract,
  repoRoot: string,
  declaredNewFiles: string[] = []
): Promise<SourceAnchor[]> {
  const anchors: SourceAnchor[] = [];
  const plannedNewSet = new Set(declaredNewFiles.map((p) => path.normalize(p).toLowerCase()));

  // Extract referenced file paths from tasks and impact
  const referencedPaths = new Set<string>();
  for (const task of contract.tasks) {
    for (const owned of task.owned ?? []) referencedPaths.add(owned);
    for (const ref of task.references ?? []) referencedPaths.add(ref);
    for (const entry of task.entrypoints ?? []) referencedPaths.add(entry);
  }
  for (const mod of contract.impact?.owning_modules ?? []) referencedPaths.add(mod);
  for (const test of contract.impact?.relevant_tests ?? []) referencedPaths.add(test);

  for (const refPath of referencedPaths) {
    if (!refPath || refPath === "src" || refPath === "." || refPath === "packages") continue;
    const normalized = path.normalize(refPath).toLowerCase();

    if (plannedNewSet.has(normalized)) {
      anchors.push({
        kind: "PLANNED_NEW_ARTIFACT",
        path: refPath,
        status: "VALID",
        reason: "Declared planned new artifact",
      });
      continue;
    }

    const fullPath = path.resolve(repoRoot, refPath);
    try {
      await fs.stat(fullPath);
      anchors.push({
        kind: "EXISTING_REFERENCE",
        path: refPath,
        status: "VALID",
      });
    } catch {
      // File does not exist on disk and was not declared as a planned new artifact
      anchors.push({
        kind: "EXISTING_REFERENCE",
        path: refPath,
        status: "INVALID",
        reason: `Referenced file does not exist on disk and was not declared as a planned new artifact: ${refPath}`,
      });
    }
  }

  return anchors;
}

/**
 * Enforces the 7 mandatory pre-publication invariants before a plan is presented
 * to the user or promoted to Frozen state.
 */
export async function evaluatePlanVisibilityGate(
  input: PlanVisibilityGateInput
): Promise<PlanVisibilityGateReceipt> {
  const checks: Record<string, PlanVisibilityGateCheck> = {};

  // 1. Raw intent preservation
  const rawIntentMatch = input.contract.raw_intent === input.request.raw_intent;
  checks["RAW_INTENT_PRESERVED"] = {
    code: "RAW_INTENT_PRESERVED",
    name: "Raw user intent verbatim preserved",
    status: rawIntentMatch ? "PASS" : "FAIL",
    detail: rawIntentMatch ? undefined : "Contract raw_intent does not match request raw_intent byte-for-byte",
  };

  // Run independent plan evaluation
  const evaluation = evaluateCandidatePlan({
    request: input.request,
    ledger: input.ledger,
    contract: input.contract,
    availableSkills: input.availableSkills,
  });

  // 2. 100% MUST obligations covered
  const missingMust = evaluation.missing_mandatory.length === 0;
  checks["MUST_OBLIGATIONS_COVERED"] = {
    code: "MUST_OBLIGATIONS_COVERED",
    name: "100% of MUST-obligation requirements covered in plan",
    status: missingMust ? "PASS" : "FAIL",
    detail: missingMust ? undefined : `${evaluation.missing_mandatory.length} MUST requirements omitted`,
  };

  // 3. 100% claims backed by fresh verification
  let unverifiedClaims = 0;
  const verifiedClaimIds = new Set<string>();
  for (const task of input.contract.tasks ?? []) {
    if (task.verifiers_by_claim) {
      for (const [cId, vIds] of Object.entries(task.verifiers_by_claim)) {
        if (Array.isArray(vIds) && vIds.length > 0) {
          verifiedClaimIds.add(cId);
        }
      }
    }
  }
  for (const req of input.contract.requirements) {
    for (const claim of req.claims ?? []) {
      const hasDirectVerifier = Boolean(claim.verifier_id);
      const hasTaskVerifier = claim.claim_id ? verifiedClaimIds.has(claim.claim_id) : false;
      if (!hasDirectVerifier && !hasTaskVerifier) {
        unverifiedClaims++;
      }
    }
  }
  checks["FRESH_VERIFICATION_MAPPED"] = {
    code: "FRESH_VERIFICATION_MAPPED",
    name: "100% of claims backed by fresh verification",
    status: unverifiedClaims === 0 ? "PASS" : "FAIL",
    detail: unverifiedClaims === 0 ? undefined : `${unverifiedClaims} claims have no mapped verifier`,
  };

  // 4. Source anchors grounded (distinguishing EXISTING_REFERENCE from PLANNED_NEW_ARTIFACT)
  const anchors = await verifySourceAnchors(input.contract, input.repoRoot, input.plannedNewFiles);
  const invalidAnchors = anchors.filter((a) => a.status === "INVALID");
  checks["SOURCE_ANCHORS_GROUNDED"] = {
    code: "SOURCE_ANCHORS_GROUNDED",
    name: "Source anchors grounded (EXISTING_REFERENCE verified in snapshot)",
    status: invalidAnchors.length === 0 ? "PASS" : "FAIL",
    detail: invalidAnchors.length === 0 ? undefined : `${invalidAnchors.length} invalid source anchors`,
  };

  // 5. Epistemic integrity preserved
  const epistemicClean = evaluation.epistemic_violations.length === 0;
  checks["EPISTEMIC_INTEGRITY"] = {
    code: "EPISTEMIC_INTEGRITY",
    name: "Epistemic integrity (zero hypothesis-to-fact leakage)",
    status: epistemicClean ? "PASS" : "FAIL",
    detail: epistemicClean ? undefined : `${evaluation.epistemic_violations.length} epistemic violations`,
  };

  // 6. Canary skills available
  const skillsClean = evaluation.skill_discovery_failures.length === 0;
  checks["CANARY_SKILLS_AVAILABLE"] = {
    code: "CANARY_SKILLS_AVAILABLE",
    name: "Required canary domain skills discoverable",
    status: skillsClean ? "PASS" : "FAIL",
    detail: skillsClean ? undefined : `${evaluation.skill_discovery_failures.length} required skills not discoverable`,
  };

  // 7. Reference inputs preserved
  const refsClean = evaluation.reference_omissions.length === 0;
  checks["REFERENCE_INPUTS_PRESERVED"] = {
    code: "REFERENCE_INPUTS_PRESERVED",
    name: "Multimodal reference inputs preserved",
    status: refsClean ? "PASS" : "FAIL",
    detail: refsClean ? undefined : `${evaluation.reference_omissions.length} reference inputs omitted from plan`,
  };

  // 8. Decision closure proven (consequential decisions closed or bounded)
  const decisionClosure = analyzeDecisionClosure(input.request, input.ledger, input.contract);
  checks["DECISION_CLOSURE_PROVEN"] = {
    code: "DECISION_CLOSURE_PROVEN",
    name: "Consequential engineering decisions closed, bounded, or not applicable",
    status: decisionClosure.passed ? "PASS" : "FAIL",
    detail: decisionClosure.passed
      ? undefined
      : `${decisionClosure.blocking_decisions.length + decisionClosure.unclosed_decisions.length} unclosed consequential decision(s)`,
  };

  const allPassed = Object.values(checks).every((c) => c.status === "PASS");

  const receiptContent = JSON.stringify({
    work_id: input.request.work_id,
    checks,
    anchors,
    evaluation: evaluation.verdict,
    decision_closure: decisionClosure.passed,
  });

  return {
    schema: "agent-rules/plan-visibility-gate-receipt/v1",
    version: 1,
    work_id: input.request.work_id,
    passed: allPassed,
    checks,
    anchors,
    evaluation,
    decision_closure: decisionClosure,
    evaluated_at: new Date().toISOString(),
    receipt_sha256: sha256(receiptContent),
  };
}
