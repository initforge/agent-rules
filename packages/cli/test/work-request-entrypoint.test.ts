import { describe, expect, it } from "vitest";
import { compileWorkRequest, assertSemanticParity } from "../src/services/intent-compiler.js";
import { compilePlanFromWorkRequest, validatePlan } from "../src/services/plan-compiler.js";

describe("prompt-first WorkRequest compilation", () => {
  const intent = "Goal: Compile ordinary prompts and optional commands into one canonical WorkRequest";

  it("compiles a normal prompt without any slash command", () => {
    const receipt = compileWorkRequest({ adapter: "conversation", intent });
    expect(receipt.schema).toBe("harness/entrypoint-parity-receipt");
    expect(receipt.adapter).toBe("conversation");
    expect(receipt.request.raw_intent).toBe(intent);
    expect(receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("proves semantic parity across conversation, command, cli, api, and native_host", () => {
    const receipts = ["conversation", "command", "cli", "api", "native_host"].map((adapter) =>
      compileWorkRequest({ adapter: adapter as "conversation", intent }),
    );
    for (let i = 1; i < receipts.length; i++) {
      expect(() => assertSemanticParity(receipts[0], receipts[i])).not.toThrow();
    }
    expect(new Set(receipts.map((receipt) => receipt.work_id)).size).toBe(1);
  });

  it("records adapter identity honestly for emulated command entrypoints", () => {
    const receipt = compileWorkRequest({ adapter: "command", intent, planId: "harness-universal-reconciliation-v1" });
    expect(receipt.adapter).toBe("command");
    expect(receipt.plan_id).toBe("harness-universal-reconciliation-v1");
  });

  it("fails closed on empty prompts and unknown adapters", () => {
    expect(() => compileWorkRequest({ adapter: "conversation", intent: "  " })).toThrow();
    expect(() => compileWorkRequest({ adapter: "ghost" as never, intent })).toThrow();
  });
});

describe("WorkRequest-bound plan compilation", () => {
  it("binds the canonical work request into a valid plan", () => {
    const receipt = compileWorkRequest({
      adapter: "cli",
      intent: "Goal: Bind work requests to plans",
      constraints: ["One owner per concept"],
    });
    const plan = compilePlanFromWorkRequest(
      { work_id: receipt.work_id, adapter: receipt.adapter, semantic_sha256: receipt.semantic_sha256, raw_intent: receipt.request.raw_intent },
      undefined,
      { branch: "main", sha: "a".repeat(40) },
    );
    expect(plan.schema).toBe("artifact/plan");
    expect(plan.work_request).toEqual({
      work_id: receipt.work_id,
      adapter: "cli",
      semantic_sha256: receipt.semantic_sha256,
    });
    expect(plan.intent_reference.hash).toBe(receipt.semantic_sha256);
    const validation = validatePlan(plan);
    expect(validation.valid).toBe(true);
  });
});
