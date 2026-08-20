import { describe, expect, it } from "vitest";
import { evalCmd } from "../src/commands/eval.js";

const options = { json: true, dryRun: false, verbose: false } as const;

describe("eval command", () => {
  it("lists real evaluation suites without returning NotImplemented", async () => {
    const result = await evalCmd(["list"], options);
    expect(result.exitCode).toBe(0);
    const suites = (result.data as { suites: Array<{ id: string }> }).suites.map((suite) => suite.id);
    expect(suites).toContain("agent-quality");
    expect(suites).toContain("live-benchmark");
  });

  it("rejects unknown suite ids before spawning anything", async () => {
    const result = await evalCmd(["run", "../../evil"], options);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("Unknown eval suite");
  });

  it("supports dry-run using the fixed argv mapping", async () => {
    const result = await evalCmd(["run", "context-router"], { ...options, dryRun: true });
    expect(result.exitCode).toBe(0);
    expect(result.data).toMatchObject({ suite: "context-router", script: "automation/test-context-router.py" });
  });
});
