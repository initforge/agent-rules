import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { validate } from "./validate.js";
import { verifyMirrors } from "./verify-mirrors.js";
import { doctor } from "./doctor.js";

export async function verifyCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const pathArg = args.length > 0 ? args : ["."];
  const validationResult = await validate(pathArg, opts);
  if (validationResult.exitCode !== ExitCode.Success) {
    return validationResult;
  }
  const mirrorResult = await verifyMirrors(pathArg, opts);
  if (mirrorResult.exitCode !== ExitCode.Success) {
    return mirrorResult;
  }
  return {
    exitCode: ExitCode.Success,
    message: "All verifications passed",
    data: {
      validation: validationResult.message,
      mirrors: mirrorResult.message,
    },
  };
}
