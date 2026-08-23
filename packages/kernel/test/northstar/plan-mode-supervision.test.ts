import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReplanPrompt,
  buildStrongPlannerInvocation,
  buildStrongPlannerPrompt,
  createWorkRequest,
  evaluateCandidatePlan,
  extractRequirementLedger,
  freezeRequirementLedger,
  reconcileRequirementLedger,
  runStrongPlanner,
  normalizeNativePlanArtifact,
  type PlannerContract,
  type RequirementLedger,
} from "../../src/northstar/index.js";

const temps: string[] = [];
function tempRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-rules-plan-mode-test-"));
  temps.push(root);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const answer = 42;\n");
  fs.writeFileSync(path.join(root, "package.json"), "{\"name\":\"plan-mode-fixture\"}\n");
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function validMultiRequirementContract(intent: string, includeDomainA = true): PlannerContract {
  const requirements = [
    ...(includeDomainA ? [{
      id: "R-001",
      statement: "Fix Domain A backend calculation pipeline defect",
      mandatory: true,
      claims: [{
        claim_id: "C-001a",
        statement: "Domain A calculation correctly processes data inputs",
        class: "runtime" as const,
        required_kinds: ["test" as const],
      }],
    }] : []),
    {
      id: "R-002",
      statement: "Align checkout button and fix styling",
      mandatory: true,
      claims: [{
        claim_id: "C-002a",
        statement: "Checkout button matches design alignment",
        class: "runtime" as const,
        required_kinds: ["test" as const],
      }],
    },
    {
      id: "R-003",
      statement: "Update dark mode background color theme",
      mandatory: true,
      claims: [{
        claim_id: "C-003a",
        statement: "Dark mode theme token is applied",
        class: "runtime" as const,
        required_kinds: ["test" as const],
      }],
    },
  ];

  const tasks = [
    ...(includeDomainA ? [{
      goal: "Implement Domain A backend calculation algorithm fix and unit tests",
      requirement_ids: ["R-001"],
      claim_ids: ["C-001a"],
      owned: ["src/backend"],
      forbidden: [],
      verifiers_by_claim: { "C-001a": ["V-001"] },
    }] : []),
    {
      goal: "Update checkout button styling in CSS/TSX",
      requirement_ids: ["R-002"],
      claim_ids: ["C-002a"],
      owned: ["src/components"],
      forbidden: [],
      verifiers_by_claim: { "C-002a": ["V-002"] },
    },
    {
      goal: "Update dark mode CSS variables in theme stylesheet",
      requirement_ids: ["R-003"],
      claim_ids: ["C-003a"],
      owned: ["src/theme"],
      forbidden: [],
      verifiers_by_claim: { "C-003a": ["V-002"] },
    },
  ];

  const verifiers = [
    {
      id: "V-001",
      kind: "test" as const,
      argv: { executable: "node", args: ["--test", "src/backend.test.ts"] },
    },
    {
      id: "V-002",
      kind: "test" as const,
      argv: { executable: "node", args: ["--test", "src/ui.test.ts"] },
    },
  ];

  return {
    protocol_version: "2.0",
    raw_intent: intent,
    risk_class: "S1",
    requirements,
    tasks,
    verifiers,
    known: ["Existing UI components exist in src/components"],
    assumed: [],
    unresolved: [],
    requires_user: [],
    impact: {
      owning_modules: ["src/components", "src/theme", "src/backend"],
      dependency_breadth: "direct_only",
      public_api: [],
      schema_data: [],
      security_boundaries: [],
      reference_dependencies: [],
      relevant_tests: ["src/backend.test.ts", "src/ui.test.ts"],
      active_decisions: [],
    },
  };
}

describe("Native Plan-Mode Supervision & Requirement Ledger", () => {
  it("extracts MUST obligations and HIGHEST priorities from natural user intent", () => {
    const raw = "Quan trọng nhất: sửa lỗi crash backend API domain_a khi nhận request. Ngoài ra chỉnh nút checkout bị lệch và đổi màu theme dark mode.";
    const ledger = extractRequirementLedger(raw);

    expect(ledger.items.length).toBeGreaterThanOrEqual(2);
    const domainA = ledger.items.find((i) => i.affected_domain === "domain_a" || i.affected_domain === "backend");
    expect(domainA).toBeDefined();
    expect(domainA?.priority).toBe("HIGHEST");
    expect(domainA?.obligation).toBe("MUST");

    const frozen = freezeRequirementLedger(ledger);
    expect(frozen.is_frozen).toBe(true);
    expect(frozen.frozen_hash).toBeDefined();
  });

  it("evaluates candidate plan and rejects when MUST obligation requirement is dropped", () => {
    const raw = "Top priority: Fix domain_a critical defect. Also adjust checkout button layout.";
    const ledger = extractRequirementLedger(raw);
    const req = createWorkRequest({ raw_intent: raw });

    // Plan that drops Domain A defect
    const flawedPlan = validMultiRequirementContract(raw, false);
    const evalResult = evaluateCandidatePlan({
      request: req,
      ledger,
      contract: flawedPlan,
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa"],
    });

    expect(evalResult.verdict).toBe("NEEDS_REPLAN");
    expect(evalResult.missing_mandatory.length).toBeGreaterThan(0);
    expect(evalResult.findings.some((f) => f.code === "MANDATORY_REQUIREMENT_MISSING" || f.code === "HIGHEST_PRIORITY_DROPPED")).toBe(true);
  });

  it("passes evaluation when 100% of MUST obligations are covered with verifiers", () => {
    const raw = "Fix domain_a calculation defect. Also adjust button styling and dark mode.";
    const ledger = extractRequirementLedger(raw);
    const req = createWorkRequest({ raw_intent: raw });

    const completePlan = validMultiRequirementContract(raw, true);
    const evalResult = evaluateCandidatePlan({
      request: req,
      ledger,
      contract: completePlan,
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa", "synthetic-domain-a-skill"],
    });

    expect(evalResult.verdict).toBe("PASS");
    expect(evalResult.missing_mandatory.length).toBe(0);
  });

  it("detects epistemic integrity violations when HYPOTHESIS is asserted as FACT in known", () => {
    const raw = "Có thể do backend connection pool bị cạn kiệt. Cần kiểm tra và sửa.";
    const ledger = extractRequirementLedger(raw);
    const req = createWorkRequest({ raw_intent: raw });

    const contract = validMultiRequirementContract(raw, true);
    contract.known = ["backend connection pool bị cạn kiệt"]; // Unproven assumption asserted as known fact

    const evalResult = evaluateCandidatePlan({
      request: req,
      ledger,
      contract,
      availableSkills: ["frontend-architect", "frontend-design-contract", "ui-taste", "browser-qa", "synthetic-domain-a-skill"],
    });

    expect(evalResult.findings.some((f) => f.code === "EPISTEMIC_CONVERSION_VIOLATION")).toBe(true);
  });

  it("normalizes raw markdown native plan into PlannerContract with preserved obligations", () => {
    const raw = "Top priority: Fix domain_a defect. Also fix UI layout.";
    const ledger = extractRequirementLedger(raw);
    const req = createWorkRequest({ raw_intent: raw });

    const rawMarkdown = `
# Candidate Plan
## Tasks
- Implement Domain A calculation fix
- Fix UI button styling
## Verification
- npm test
    `;

    const normalized = normalizeNativePlanArtifact(
      {
        host: "codex",
        raw_text: rawMarkdown,
        format: "markdown",
        captured_at: new Date().toISOString(),
      },
      ledger,
      req
    );

    expect(normalized.protocol_version).toBe("2.0");
    expect(normalized.requirements.length).toBe(ledger.items.length);
    expect(normalized.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it("builds correct strong planner invocations across hosts", () => {
    const claudeInv = buildStrongPlannerInvocation("claude", "test prompt");
    expect(claudeInv.executable).toBe("claude");
    expect(claudeInv.args).toContain("--permission-mode");
    expect(claudeInv.args).toContain("plan");

    const codexInv = buildStrongPlannerInvocation("codex", "test prompt");
    expect(codexInv.executable).toBe("codex");

    const opencodeInv = buildStrongPlannerInvocation("opencode", "test prompt");
    expect(opencodeInv.executable).toBe("opencode");

    const antigravityInv = buildStrongPlannerInvocation("antigravity", "test prompt");
    expect(antigravityInv.executable).toBe("agy");

    const cursorInv = buildStrongPlannerInvocation("cursor", "test prompt");
    expect(cursorInv.executable).toBe("cursor-agent");
  });
});
