import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExitCode } from "../src/types.js";

const mockInstall = vi.fn(async () => ({ ok: true }));

vi.mock("../src/runtime/installer.js", () => ({
  RuntimeInstaller: vi.fn().mockImplementation(() => ({
    install: mockInstall,
  })),
  RUNTIME_PLATFORMS: ["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code"],
}));

vi.mock("../src/adapters/repo.js", () => ({
  getRepoRoot: () => "/tmp",
}));

vi.mock("../src/runtime/composed-installer.js", () => ({
  projectSkillsToGlobal: vi.fn().mockResolvedValue(undefined),
  uninstallOwnedGlobalProjections: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/native-installer.js", () => ({
  NativeInstaller: vi.fn().mockImplementation(() => ({
    install: vi.fn().mockResolvedValue({ status: "Ready" }),
    uninstall: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../src/runtime/mcp-convergence.js", () => ({
  convergeAllHostMcpConfigs: vi.fn().mockResolvedValue([]),
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
    expect(mockInstall).toHaveBeenCalledTimes(8);
  });

  it("installs for a single platform", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["codex"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    // The mock should have been called for codex
    expect(mockInstall).toHaveBeenCalledWith("codex", "install");
  });

  it("reports failure when a platform install fails", async () => {
    mockInstall.mockRejectedValueOnce(new Error("simulated native failure"));
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.LegacyFailed);
  });
});
