import { describe, expect, it } from "vitest";
import path from "node:path";
import { hookProbePaths } from "../src/commands/doctor.js";

describe("doctor host hook probes", () => {
  it("checks hooks at the host entrypoint rather than the transactional mirror", () => {
    const probe = hookProbePaths("codex", "/tmp/codex-home");
    expect(probe).toEqual({
      configPath: path.join("/tmp/codex-home", "hooks.json"),
      scriptPath: path.join("/tmp/codex-home", "scripts", "skill-gate.py"),
      needle: "apply_patch",
    });
    expect(probe?.configPath).not.toContain("agent-rules-runtime");
  });

  it("does not invent a hook surface for providers without a host hook contract", () => {
    expect(hookProbePaths("opencode", "/tmp/opencode-home")).toBeNull();
    expect(hookProbePaths("claude", "/tmp/claude-home")).toBeNull();
  });
});
