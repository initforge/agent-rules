import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { validate } from "./validate.js";
import { verifyMirrors } from "./verify-mirrors.js";
import { doctor } from "./doctor.js";
import {
  snapshotCandidateEpoch,
  candidateEpochHash,
} from "@initforge/agent-rules-engine/candidate-epoch";
import path from "node:path";

export async function verifyCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  if ((args[0] ?? "").toLowerCase() === "epoch") {
    const allowDirty = args.includes("--allow-dirty");
    const root = path.resolve(args[1] ?? ".");
    try {
      const epoch = snapshotCandidateEpoch(root, { allowDirty });
      const epochHash = candidateEpochHash(epoch);
      return {
        exitCode: ExitCode.Success,
        message: allowDirty
          ? `Candidate epoch ${epochHash.slice(0, 12)} — dirty snapshot, NOT terminal-eligible`
          : `Candidate epoch ${epochHash.slice(0, 12)} — terminal-eligible`,
        data: {
          epochHash,
          terminalEligible: !allowDirty,
          epoch,
        },
      };
    } catch (err) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Candidate epoch refused: ${err instanceof Error ? err.message : String(err)}`,
        data: { refused: true },
      };
    }
  }

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
