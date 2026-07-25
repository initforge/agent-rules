import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript } from "../adapters/powershell.js";

/**
 * Sync: orchestrates build + install + verify mirrors.
 * Currently delegates to 01-build-runtime, 02-install-runtime, 04-verify-mirrors.
 * Future: native sync logic.
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

  // Step 1: Build
  const buildResult = await runScript("01-build-runtime");
  if (buildResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at build step",
      data: { step: "build", exitCode: buildResult.exitCode },
    };
  }

  // Step 2: Install
  const installResult = await runScript("02-install-runtime", [
    `-Platform ${platform}`,
  ]);
  if (installResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at install step",
      data: { step: "install", exitCode: installResult.exitCode },
    };
  }

  // Step 3: Verify mirrors
  const verifyResult = await runScript("04-verify-mirrors");
  const success = verifyResult.exitCode === 0;

  return {
    exitCode: success ? ExitCode.Success : ExitCode.LegacyFailed,
    message: success
      ? `Sync completed for ${platform}`
      : "Sync completed but mirror verification failed",
    data: {
      platform,
      buildExitCode: buildResult.exitCode,
      installExitCode: installResult.exitCode,
      verifyExitCode: verifyResult.exitCode,
    },
  };
}
