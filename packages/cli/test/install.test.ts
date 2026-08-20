import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExitCode } from "../src/types.js";

const mockInstall = vi.fn(async () => ({ ok: true }));

vi.mock("../src/runtime/installer.js", () => ({
  RuntimeInstaller: vi.fn().mockImplementation(() => ({
    install: mockInstall,
  })),
  RUNTIME_PLATFORMS: ["codex", "grok", "antigravity", "cursor", "opencode", "mimocode", "claude"],
}));

vi.mock("../src/adapters/powershell.js", () => ({
  getRepoRoot: () => "/tmp",
}));

const mockProvision = vi.fn(async () => ({
  kind: "mcp", source: "integrations/registry.json", total: 6,
  status: "PASS", success: true, results: [],
}));

vi.mock("../src/integration/provisioning.js", () => ({
  provisionMcps: (...args: unknown[]) => mockProvision(...args),
}));

describe("install wrapper", () => {
  beforeEach(() => {
    mockInstall.mockClear();
    mockProvision.mockClear();
  });

  it("installs for all platforms via native installer", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(mockInstall).toHaveBeenCalledTimes(7);
    expect(mockProvision).toHaveBeenCalledTimes(1);
  });

  it("installs for a single platform", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["mimocode"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    // The mock should have been called at least once
    expect(mockInstall).toHaveBeenCalled();
  });

  it("never reports all-ready when MCP provisioning fails", async () => {
    mockProvision.mockResolvedValueOnce({
      kind: "mcp", source: "integrations/registry.json", total: 6,
      status: "BLOCKED", success: false,
      results: [{ id: "pencil-mcp", installation: { status: "NEEDS_USER" } }],
    });
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.LegacyFailed);
    expect(result.message).not.toContain("all platforms ready");
    expect(result.message).toContain("MCP provisioning BLOCKED");
  });
});
