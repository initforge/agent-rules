import { describe, expect, it, vi } from "vitest";
import { ExitCode } from "../src/types.js";

const runScript = vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
vi.mock("../src/adapters/powershell.js", () => ({ runScript }));

describe("install wrapper", () => {
  it("passes PowerShell parameters as separate argv entries", async () => {
    const { installCmd } = await import("../src/commands/install.js");

    const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(runScript).toHaveBeenCalledWith("02-install-runtime", ["-Platform", "all"], { dryRun: false });
  });
});
