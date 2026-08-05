import { describe, expect, it, jest } from "@jest/globals";
import { ExitCode } from "../src/types.js";

const runScript = jest.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
const getRepoRootMock = jest.fn(() => "/tmp");

jest.unstable_mockModule("../src/adapters/powershell.js", () => ({
  runScript,
  getRepoRoot: getRepoRootMock,
}));

describe("install wrapper", () => {
  it(
    "passes PowerShell parameters as separate argv entries",
    async () => {
      const { installCmd } = await import("../src/commands/install.js");

      const result = await installCmd(["all"], { dryRun: false, verbose: false, json: false });

      expect(result.exitCode).toBe(ExitCode.Success);
      expect(runScript).toHaveBeenCalledWith("02-install-runtime", ["-Platform", "all"], { dryRun: false });
    },
    60000,
  );
});
