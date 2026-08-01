import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { WorktreeTrain } from "@initforge/agent-rules-engine/worktree-train";
import { spawnSync } from "node:child_process";

/**
 * `agent-rules train` — C3 rolling integration train (AM-0019 §5).
 * Accepted work merges immediately into the train; no wave barrier.
 * Deterministic merge order: epoch ordinal, dependency rank, task id.
 */

function parseOptions(args: string[]): { positionals: string[]; options: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith("--")) {
      const eq = argument.indexOf("=");
      if (eq >= 0) {
        options[argument.slice(2, eq)] = argument.slice(eq + 1);
        continue;
      }
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[argument.slice(2)] = next;
        index += 1;
      } else {
        options[argument.slice(2)] = true;
      }
    } else {
      positionals.push(argument);
    }
  }
  return { positionals, options };
}

function optionString(options: Record<string, string | boolean>, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function trainIntegrate(rest: string[]): Promise<CommandResult> {
  const { positionals, options } = parseOptions(rest);
  if (positionals.length === 0) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: train integrate <task-id...> [--root <repo>] [--worktrees-dir <dir>] [--train <branch>] [--validate-cmd <shell>] [--allow-unreviewed]. Order: integrate BEFORE `worktree release` — release flips the lease RELEASED and removes the worktree.",
    };
  }
  const root = optionString(options, "root") ?? process.cwd();
  const validateCmd = optionString(options, "validate-cmd");
  const allowUnreviewed = options["allow-unreviewed"] === true || optionString(options, "allow-unreviewed") !== undefined;
  try {
    const train = new WorktreeTrain(root, {
      worktreeRoot: optionString(options, "worktrees-dir"),
      trainBranch: optionString(options, "train"),
      validate: validateCmd
        ? (taskId, worktreePath) => {
            const result = spawnSync(validateCmd, { cwd: worktreePath, shell: true, encoding: "utf8", stdio: "pipe" });
            if (result.status !== 0) {
              // Validation failure is a refusal, not an engine error.
              return false;
            }
            void taskId;
            return true;
          }
        : undefined,
    });
    const receipt = await train.integrate(positionals, { allowUnreviewed });
    return {
      exitCode: ExitCode.Success,
      message: `integrated ${receipt.mergeOrder.length} of ${positionals.length} into ${receipt.trainBranch} @ ${receipt.integrationHead.slice(0, 12)}${receipt.refused.length ? ` (refused: ${receipt.refused.map((r) => `${r.taskId}:${r.reason}`).join(", ")})` : ""}`,
      data: { receipt },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `train integrate failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function trainStatus(rest: string[]): Promise<CommandResult> {
  const { options } = parseOptions(rest);
  const root = optionString(options, "root") ?? process.cwd();
  try {
    const train = new WorktreeTrain(root, {
      worktreeRoot: optionString(options, "worktrees-dir"),
      trainBranch: optionString(options, "train"),
    });
    const state = await train.readTrainState();
    const active = await train.listActive();
    return {
      exitCode: ExitCode.Success,
      message: state
        ? `train ${state.trainBranch} @ ${state.head.slice(0, 12)} (${state.receiptCount} receipt(s))`
        : `no integration receipt yet for ${train.trainBranch}`,
      data: { state, active: active.map((lease) => lease.taskId) },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `train status failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function trainCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  void opts;
  const subcommand = args[0]?.toLowerCase();
  const rest = args.slice(1);
  switch (subcommand) {
    case "integrate":
      return trainIntegrate(rest);
    case "status":
      return trainStatus(rest);
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown train subcommand: ${subcommand}. Available: integrate, status. Example: train integrate T1 T2 --root .`,
      };
  }
}
