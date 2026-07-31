import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript } from "../adapters/powershell.js";
import { build } from "./build.js";
import { verifyMirrors } from "./verify-mirrors.js";
import { getRepoRoot } from "../adapters/powershell.js";
import { RuntimeInstaller } from "../runtime/installer.js";

/**
 * Sync: orchestrates build + install + verify mirrors.
 * Uses native TS build and verify-mirrors; delegates install to PS.
 */
export async function syncCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const platform = args[0] || "all";

  if (options.dryRun) {
    console.log("[dry-run] Would run: build → install → verify-mirrors");
    return {
      exitCode: ExitCode.Success,
      message: "Dry-run: sync sequence would execute",
    };
  }

  // Step 1: Build (native TS)
  const buildResult = await build([], options);
  if (buildResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at build step",
      data: { step: "build", exitCode: buildResult.exitCode },
    };
  }

  // Step 2: OpenCode uses the native transactional installer; other hosts retain PS dispatch.
  let installExitCode = 0;
  if (platform === "opencode") {
    try {
      await new RuntimeInstaller({ repositoryRoot: getRepoRoot() }).install("opencode");
    } catch (error) {
      return { exitCode: ExitCode.GeneralError, message: `Sync failed at OpenCode install step: ${(error as Error).message}` };
    }
  } else {
    const installResult = await runScript("02-install-runtime", ["-Platform", platform]);
    installExitCode = installResult.exitCode;
    if (installExitCode !== 0) {
      return { exitCode: ExitCode.LegacyFailed, message: "Sync failed at install step", data: { step: "install", exitCode: installExitCode } };
    }
  }

  // Step 3: Verify mirrors (native TS)
  const verifyResult = await verifyMirrors([], options);
  const success = verifyResult.exitCode === 0;

  return {
    exitCode: success ? ExitCode.Success : ExitCode.LegacyFailed,
    message: success
      ? `Sync completed for ${platform}`
      : "Sync completed but mirror verification failed",
    data: {
      platform,
      buildExitCode: buildResult.exitCode,
       installExitCode,
      verifyExitCode: verifyResult.exitCode,
    },
  };
}
