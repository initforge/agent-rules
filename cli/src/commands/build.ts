import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript } from "../adapters/powershell.js";

/**
 * Build: currently delegated to 01-build-runtime.ps1.
 * Future: native build logic will replace PowerShell backend.
 */
export async function build(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const scriptArgs: string[] = [];
  if (args.length > 0) {
    scriptArgs.push(`-Root`, args[0]);
  }

  const result = await runScript("01-build-runtime", scriptArgs, {
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
        ? "Build completed via 01-build-runtime.ps1"
        : "Build failed",
    data: { legacyScript: "01-build-runtime.ps1", exitCode: result.exitCode },
  };
}
