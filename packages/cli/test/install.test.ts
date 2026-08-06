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

describe("install wrapper", () => {
  beforeEach(() => {
    mockInstall.mockClear();
  });

  it("installs for all platforms via native installer", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(mockInstall).toHaveBeenCalledTimes(7);
  });

  it("installs for a single platform", async () => {
    const { installCmd } = await import("../src/commands/install.js");
    const result = await installCmd(["mimocode"], { dryRun: false, verbose: false, json: false });
    expect(result.exitCode).toBe(ExitCode.Success);
    // The mock should have been called at least once
    expect(mockInstall).toHaveBeenCalled();
  });
});
