import { describe, it, expect } from "vitest";
import { compileIntent } from "../src/services/intent-compiler.js";

describe("Intent Compiler", () => {
  it("generates correct structure from a request", () => {
    const request = `Goal: Build a CLI tool
Goal: Support Windows and Linux
Constraint: Must use TypeScript
Non-goal: No GUI
Assumption: Node 18+ is available`;

    const contract = compileIntent(request, {});

    expect(contract.schema).toBe("artifact/intent");
    expect(contract.version).toBe(1);
    expect(contract.originalRequest).toBe(request);
    expect(contract.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.createdAt).toBeTruthy();
    expect(typeof contract.createdAt).toBe("string");

    expect(contract.goals).toEqual(["Build a CLI tool", "Support Windows and Linux"]);
    expect(contract.constraints).toEqual(["Must use TypeScript"]);
    expect(contract.nonGoals).toEqual(["No GUI"]);
    expect(contract.assumptions).toEqual(["Node 18+ is available"]);
    expect(contract.openQuestions).toEqual([]);
  });

  it("produces a deterministic hash", () => {
    const request = "Goal: Do the thing";
    const a = compileIntent(request, {});
    const b = compileIntent(request, {});
    expect(a.requestHash).toBe(b.requestHash);
  });

  it("separates goals, constraints, non-goals correctly", () => {
    const request = `Goal: Ship by Friday
Constraint: Budget under $5k
Non-goal: Mobile support
Assumption: Team has capacity`;

    const contract = compileIntent(request, {});

    expect(contract.goals).toHaveLength(1);
    expect(contract.goals[0]).toBe("Ship by Friday");
    expect(contract.constraints).toHaveLength(1);
    expect(contract.constraints[0]).toBe("Budget under $5k");
    expect(contract.nonGoals).toHaveLength(1);
    expect(contract.nonGoals[0]).toBe("Mobile support");
    expect(contract.assumptions).toHaveLength(1);
    expect(contract.assumptions[0]).toBe("Team has capacity");
  });

  it("assigns sequential RIDs", () => {
    const request = `Goal: A
Constraint: B
Non-goal: C`;

    const contract = compileIntent(request, {});
    expect(contract.requirements).toHaveLength(3);
    expect(contract.requirements[0].id).toBe("R-001");
    expect(contract.requirements[1].id).toBe("R-002");
    expect(contract.requirements[2].id).toBe("R-003");
  });

  it("preserves provenance on requirements", () => {
    const request = "Goal: Be fast";
    const contract = compileIntent(request, {});
    expect(contract.requirements[0].provenance).toBe("Goal: Be fast");
    expect(contract.requirements[0].source).toBe("user");
  });

  it("includes context facts and files", () => {
    const request = "Goal: Integrate with API";
    const contract = compileIntent(request, {
      facts: ["The API uses REST"],
      files: ["api-spec.yaml"],
    });

    const factReq = contract.requirements.find((r) => r.description === "The API uses REST");
    expect(factReq).toBeTruthy();
    expect(factReq!.source).toBe("context.facts");

    const fileReq = contract.requirements.find((r) =>
      r.description.includes("api-spec.yaml")
    );
    expect(fileReq).toBeTruthy();
    expect(fileReq!.source).toBe("context.files");
  });

  it("captures open questions", () => {
    const request = "Goal: Deploy\n? What region?\nQ: Which account?";
    const contract = compileIntent(request, {});
    expect(contract.openQuestions).toHaveLength(2);
    expect(contract.openQuestions).toContain("What region?");
    expect(contract.openQuestions).toContain("Which account?");
  });
});
