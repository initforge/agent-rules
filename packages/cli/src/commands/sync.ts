import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { build } from "./build.js";
import { verifyMirrors } from "./verify-mirrors.js";
import { installCmd } from "./install.js";

/**
 * Sync: orchestrates build + install + verify mirrors.
 * Uses native TS build, install, and verify-mirrors.
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

  // Step 2: Install using native installer
  const installResult = await installCmd([platform, "--force"], options);
  if (installResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at install step",
      data: { step: "install", exitCode: installResult.exitCode },
    };
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
      installExitCode: installResult.exitCode,
      verifyExitCode: verifyResult.exitCode,
    },
  };
}
