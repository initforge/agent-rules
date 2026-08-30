import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExitCode } from "../src/types.js";

const mockNativeInstall = vi.fn(async () => ({ status: "Ready" }));
const mockCoordinatorInstall = vi.fn(async () => ({ candidate_id: "c".repeat(64), readback: Object.fromEntries(["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code", "omp"].map((host) => [host, { native: true, static: true, mcp: true, authority_tier: "NATIVE_ADVISORY" }])) }));
const mockCreateCoordinator = vi.fn(() => ({ install: mockCoordinatorInstall }));

vi.mock("../src/runtime/installation-coordinator.js", () => ({
  COORDINATOR_HOSTS: ["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code", "omp"],
  createInstallationCoordinator: (...args: unknown[]) => mockCreateCoordinator(...args),
}));

vi.mock("../src/adapters/repo.js", () => ({
  getRepoRoot: () => "/tmp",
}));

vi.mock("../src/runtime/composed-installer.js", () => ({
  projectSkillsToGlobal: vi.fn().mockResolvedValue({ projected: [], collisions: [], updatedManifest: {} }),
  uninstallOwnedGlobalProjections: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/native-installer.js", () => ({
  NativeInstaller: vi.fn().mockImplementation(() => ({
    install: mockNativeInstall,
    uninstall: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../src/runtime/mcp-convergence.js", () => ({
  convergeAllHostMcpConfigs: vi.fn().mockResolvedValue([]),
  registerHostMcpAdapters: vi.fn().mockResolvedValue({ status: "REGISTERED", conflicts: [] }),
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
    mockNativeInstall.mockReset();
    mockNativeInstall.mockResolvedValue({ status: "Ready" });
    mockCoordinatorInstall.mockReset();
    mockCoordinatorInstall.mockResolvedValue({ candidate_id: "c".repeat(64), readback: Object.fromEntries(["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code", "omp"].map((host) => [host, { native: true, static: true, mcp: true, authority_tier: "NATIVE_ADVISORY" }])) });
    mockCreateCoordinator.mockClear();
    mockProvision.mockClear();
  });

  it("installs for all platforms via native installer", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(mockCoordinatorInstall).toHaveBeenCalledWith(["opencode", "codex", "claude", "grok", "antigravity", "cursor", "deepseek-harness", "command-code", "omp"]);
  });

  it("installs for a single platform", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["codex"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(mockCreateCoordinator).toHaveBeenCalledWith({ dryRun: false, enableMcp: true });
    expect(mockCoordinatorInstall).toHaveBeenCalledWith(["codex"]);
  });

  it("reports failure when a platform install fails", async () => {
    mockCoordinatorInstall.mockRejectedValueOnce(new Error("simulated native failure"));
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.LegacyFailed);
  });

  it("skips an unavailable host without treating absence as an install failure", async () => {
    mockCoordinatorInstall.mockResolvedValueOnce({
      candidate_id: "c".repeat(64),
      readback: { codex: { native: false, static: false, mcp: false, authority_tier: "UNAVAILABLE" } },
    });
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["codex"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.data?.results).toHaveProperty("codex.skipped", true);
  });
});
