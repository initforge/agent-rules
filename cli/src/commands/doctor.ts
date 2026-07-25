import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript } from "../adapters/powershell.js";

/**
 * Doctor: currently delegated to 09-doctor.ps1.
 * Future: native health checks.
 */
export async function doctor(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const platform = args[0] || "all";
  const validPlatforms = ["codex", "grok", "antigravity", "cursor", "all"];

  if (!validPlatforms.includes(platform)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Invalid platform: ${platform}. Valid: ${validPlatforms.join(", ")}`,
    };
  }

  const result = await runScript("09-doctor", [`-Platform ${platform}`], {
    dryRun: options.dryRun,
  });

  if (options.verbose) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }

  return {
    exitCode: result.exitCode === 0 ? ExitCode.Success : ExitCode.LegacyFailed,
    message:
      result.exitCode === 0
        ? `Doctor health check passed for ${platform}`
        : "Doctor found issues",
    data: { platform, legacyScript: "09-doctor.ps1", exitCode: result.exitCode },
  };
}
