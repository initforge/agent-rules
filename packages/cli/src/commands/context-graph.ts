import path from "node:path";
import { ExitCode, type CliOptions, type CommandResult } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { writeContextGraph } from "./build.js";

export async function contextGraphCmd(args: string[], _options: CliOptions): Promise<CommandResult> {
  if (args[0] !== "build") return { exitCode: ExitCode.InvalidArgument, message: "Usage: context-graph build [output-path]" };
  const root = getRepoRoot();
  const output = args[1] ? path.resolve(args[1]) : path.join(root, "generated", "context-graph.json");
  try {
    await writeContextGraph(root, output);
    return { exitCode: ExitCode.Success, message: `Context graph built: ${output}` };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: error instanceof Error ? error.message : String(error) };
  }
}
