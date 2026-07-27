import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

export async function modelsRefresh(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  return {
    exitCode: ExitCode.Success,
    message: "Model catalog refreshed",
    data: { refreshed: true },
  };
}

export async function modelsCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case "refresh":
      return modelsRefresh(args.slice(1), opts);
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown models subcommand: ${subcommand}. Available: refresh`,
      };
  }
}
