import { describe, expect, it, vi, beforeEach } from "vitest";
import { shellInstall, shellVerify, shellUninstall } from "../../src/integration/handlers/shell.js";

/**
 * Shell handler regression tests: scripts run through argv (never curl | sh or
 * shell interpolation); a missing interpreter is UNSUPPORTED; exit code is
 * required for PASS; uninstall is never a pretend no-op.
 */

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mocks.execFile(...args),
}));

vi.mock("node:util", () => ({
  promisify: (fn: (...args: unknown[]) => unknown) => fn,
}));

describe("shell handler", () => {
  beforeEach(() => {
    mocks.execFile.mockReset();
  });

  it("runs the install script via argv with the interpreter, never curl|sh", async () => {
    mocks.execFile.mockResolvedValue({ stdout: "installed ok", stderr: "" });
    const result = await shellInstall({
      command: ["bash", "/repo/integrations/optional/pencil-mcp/install.sh"],
      verifyCommand: [],
      uninstallCommand: [],
    });
    expect(result.ok).toBe(true);
    const call = mocks.execFile.mock.calls[0];
    expect(call[0]).toBe("bash");
    expect(call[1]).toEqual(["/repo/integrations/optional/pencil-mcp/install.sh"]);
    expect(call[1].join(" ")).not.toMatch(/curl|\|.*sh/);
  });

  it("maps a missing interpreter to UNSUPPORTED on this host", async () => {
    mocks.execFile.mockRejectedValue(Object.assign(new Error("spawn bash ENOENT"), { code: "ENOENT" }));
    const result = await shellVerify(["bash", "/repo/integrations/optional/serena/verify.sh"]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.message).toContain("bash");
  });

  it("classifies a missing prerequisite (non-ENOENT) as NEEDS_USER", async () => {
    mocks.execFile.mockRejectedValue(Object.assign(new Error("uv is required for Serena"), { code: 1 }));
    const result = await shellVerify(["bash", "/repo/integrations/optional/serena/verify.sh"]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("NEEDS_USER");
    expect(result.message).toContain("uv is required");
  });

  it("uninstall never pretends success without a real uninstall script", async () => {
    const result = await shellUninstall(["bash", "/repo/integrations/optional/pencil-mcp/uninstall.sh"]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("BLOCKED");
  });
});