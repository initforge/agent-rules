import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript } from "../adapters/powershell.js";

/**
 * Install: currently delegated to 02-install-runtime.ps1.
 * Future: native install logic.
 */
export async function installCmd(
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

  const result = await runScript("02-install-runtime", [`-Platform ${platform}`], {
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
        ? `Install completed for ${platform} via 02-install-runtime.ps1`
        : "Install failed",
    data: { platform, legacyScript: "02-install-runtime.ps1", exitCode: result.exitCode },
  };
}
