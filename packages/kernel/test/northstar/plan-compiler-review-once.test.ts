import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyPlanIntent,
  compileOrReviewPlan,
  createPlanPatch,
  evaluatePlanVisibilityGate,
  extractRequirementLedger,
  runIndependentPlanReview,
  createWorkRequest,
  type ExistingPlanArtifact,
  type PlannerContract,
} from "../../src/northstar/index.js";

const temps: string[] = [];
function tempRepo(): string {
  const dir = path.join(os.tmpdir(), `plan-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of temps.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

function createMockContract(rawIntent: string, reqIds: string[] = ["R-001"]): PlannerContract {
  const verifiers = [
    {
      id: "V-001",
      kind: "test" as const,
      argv: { executable: "node", args: ["--test", "src/app.test.ts"] },
      description: "Test verifier",
    },
  ];

  return {
    protocol_version: "2.0",
    raw_intent: rawIntent,
    risk_class: "S1",
    requirements: reqIds.map((id, idx) => ({
      id,
      statement: `Statement for ${id}`,
      mandatory: true,
      claims: [{
        claim_id: `C-00${idx + 1}a`,
        statement: `Claim for ${id}`,
        class: "runtime" as const,
        required_kinds: ["test" as const],
        verifier_id: "V-001",
      }],
    })),
    tasks: reqIds.map((id, idx) => ({
      goal: `Implement task for ${id}`,
      requirement_ids: [id],
      claim_ids: [`C-00${idx + 1}a`],
      owned: ["src/app.ts"],
      forbidden: [],
      verifiers_by_claim: { [`C-00${idx + 1}a`]: ["V-001"] },
    })),
    verifiers,
    known: ["Existing system facts"],
    assumed: [],
    unresolved: [],
    requires_user: [],
    impact: {
      owning_modules: ["src"],
      dependency_breadth: "direct_only",
      public_api: [],
      schema_data: [],
      security_boundaries: [],
      reference_dependencies: [],
      relevant_tests: ["src/app.test.ts"],
      active_decisions: [],
    },
  };
}

describe("Plan Compiler / Review-Once Optimization", () => {
  it("classifies PlanIntent correctly (PLAN_CREATE, PLAN_REVIEW, PLAN_EXECUTE)", () => {
    const reqCreate = createWorkRequest({ raw_intent: "New task from user" });
    expect(classifyPlanIntent(reqCreate)).toBe("PLAN_CREATE");

    const existingArtifact: ExistingPlanArtifact = {
      origin_host: "codex",
      plan_text: "# Plan text",
      format: "markdown",
      plan_id: "plan-123",
      created_at: new Date().toISOString(),
    };
    expect(classifyPlanIntent(reqCreate, existingArtifact)).toBe("PLAN_REVIEW");

    const reqExec = createWorkRequest({ raw_intent: "Execute plan", source: "plan" });
    const existingWithContract: ExistingPlanArtifact = {
      ...existingArtifact,
      plan_contract: createMockContract("Execute plan"),
    };
    expect(classifyPlanIntent(reqExec, existingWithContract)).toBe("PLAN_EXECUTE");
  });

  it("distinguishes EXISTING_REFERENCE from PLANNED_NEW_ARTIFACT in PlanVisibilityGate", async () => {
    const repo = tempRepo();
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "existing.ts"), "export const x = 1;\n", "utf8");

    const raw = "Add new feature in src/new_feature.ts using src/existing.ts";
    const req = createWorkRequest({ raw_intent: raw });
    const ledger = extractRequirementLedger(raw);

    const contract = createMockContract(raw);
    contract.tasks[0].owned = ["src/existing.ts", "src/new_feature.ts"];

    const gateReceipt = await evaluatePlanVisibilityGate({
      request: req,
      contract,
      ledger,
      repoRoot: repo,
      plannedNewFiles: ["src/new_feature.ts"],
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa"],
    });

    const existingAnchor = gateReceipt.anchors.find((a) => a.path === "src/existing.ts");
    const newAnchor = gateReceipt.anchors.find((a) => a.path === "src/new_feature.ts");

    expect(existingAnchor?.kind).toBe("EXISTING_REFERENCE");
    expect(existingAnchor?.status).toBe("VALID");

    expect(newAnchor?.kind).toBe("PLANNED_NEW_ARTIFACT");
    expect(newAnchor?.status).toBe("VALID");
  });

  it("maintains semantic lineage in PlanPatch across cross-host review pairs (Codex -> Antigravity)", () => {
    const parentContract = createMockContract("Intent text", ["R-001"]);
    const updatedContract = createMockContract("Intent text", ["R-001", "R-002"]);

    const { patch } = createPlanPatch(
      parentContract,
      "codex-plan-01",
      updatedContract,
      "Antigravity review added missing edge case"
    );

    expect(patch.schema).toBe("agent-rules/plan-patch/v1");
    expect(patch.parent_plan_id).toBe("codex-plan-01");
    expect(patch.preserved_requirement_ids).toContain("R-001");
    expect(patch.added_requirements).toContain("R-002");
  });

  it("supports cross-host review pairs: Claude -> Codex and OpenCode -> Claude", async () => {
    const repo = tempRepo();
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "app.ts"), "export const a = 1;\n", "utf8");

    const raw = "Refactor module and verify.";
    const req = createWorkRequest({ raw_intent: raw });
    const ledger = extractRequirementLedger(raw);
    const contract = createMockContract(raw);

    // Claude -> Codex
    const reviewResult1 = await runIndependentPlanReview({
      request: req,
      contract,
      ledger,
      repoRoot: repo,
      reviewerHost: "codex",
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa"],
    });
    expect(reviewResult1.reviewer_host).toBe("codex");
    expect(reviewResult1.reviewer_authority).toBe("independent_adversarial");

    // OpenCode -> Claude
    const reviewResult2 = await runIndependentPlanReview({
      request: req,
      contract,
      ledger,
      repoRoot: repo,
      reviewerHost: "claude",
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa"],
    });
    expect(reviewResult2.reviewer_host).toBe("claude");
  });

  it("executes PLAN_REVIEW and achieves 0 user-visible revisions via internal convergence", async () => {
    const repo = tempRepo();
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "app.ts"), "export const a = 1;\n", "utf8");
    await fs.writeFile(path.join(repo, "src", "app.test.ts"), "export const test = 1;\n", "utf8");

    const raw = "Implement feature and tests.";
    const req = createWorkRequest({ raw_intent: raw });
    const contract = createMockContract(raw);

    const existingArtifact: ExistingPlanArtifact = {
      origin_host: "codex",
      plan_text: "# Plan\n## Tasks\n- Task 1",
      plan_contract: contract,
      format: "json",
      plan_id: "plan-test-01",
      created_at: new Date().toISOString(),
    };

    const compilerResult = await compileOrReviewPlan({
      repoRoot: repo,
      request: req,
      planner: "antigravity",
      reviewer: "codex",
      existingPlan: existingArtifact,
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa"],
    });

    expect(compilerResult.intent).toBe("PLAN_REVIEW");
    expect(compilerResult.userVisibleRevisions).toBe(0); // 0 user-visible revisions target achieved
    expect(compilerResult.visibilityReceipt.passed).toBe(true);
    expect(compilerResult.reviewResult.verdict).toBe("APPROVED");
  });
});
