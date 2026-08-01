import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  WorktreeTrain,
  type WorktreeLeaseInput,
} from "@initforge/agent-rules-engine/worktree-train";
import path from "node:path";

/**
 * `agent-rules worktree` — C3 isolated worker worktrees (AM-0019 §5).
 * Thin client over @initforge/agent-rules-engine/worktree-train.
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

function optionList(options: Record<string, string | boolean>, name: string): string[] {
  const value = optionString(options, name);
  return value ? value.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function makeTrain(repoRoot: string, options: Record<string, string | boolean>): WorktreeTrain {
  return new WorktreeTrain(repoRoot, {
    worktreeRoot: optionString(options, "worktrees-dir"),
    trainBranch: optionString(options, "train"),
  });
}

async function worktreeCreate(rest: string[]): Promise<CommandResult> {
  const { positionals, options } = parseOptions(rest);
  const taskId = positionals[0];
  const baseEpoch = optionString(options, "base");
  if (!taskId || !baseEpoch) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: worktree create <task-id> --base <epoch-sha> [--root <repo>] [--owned a,b] [--semantic r1,r2] [--cluster C4] [--provider p] [--model m] [--effort e] [--deadline iso]",
    };
  }
  const root = optionString(options, "root") ?? process.cwd();
  const input: WorktreeLeaseInput = {
    taskId,
    baseEpoch,
    ownedPaths: optionList(options, "owned"),
    semanticResources: optionList(options, "semantic"),
    clusterId: optionString(options, "cluster"),
    provider: optionString(options, "provider"),
    model: optionString(options, "model"),
    effort: optionString(options, "effort"),
    resourceClass: optionString(options, "resource-class"),
    budget: optionString(options, "budget"),
    expectedDuration: optionString(options, "expected-duration"),
    deadline: optionString(options, "deadline"),
  };
  const rank = optionString(options, "rank");
  if (rank !== undefined) {
    const parsed = parseInt(rank, 10);
    if (!Number.isFinite(parsed)) {
      return { exitCode: ExitCode.InvalidArgument, message: `--rank must be an integer, got: ${rank}` };
    }
    input.dependencyRank = parsed;
  }
  try {
    const train = makeTrain(root, options);
    const lease = await train.createLease(input);
    return {
      exitCode: ExitCode.Success,
      message: `worktree ${lease.branch} created at ${lease.worktreePath} (epoch ${lease.baseEpoch.slice(0, 12)}, rank ${lease.dependencyRank}/${lease.dependencyRankSource})`,
      data: { lease },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `worktree create failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function worktreeRelease(rest: string[]): Promise<CommandResult> {
  const { positionals, options } = parseOptions(rest);
  const taskId = positionals[0];
  if (!taskId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: worktree release <task-id> [--root <repo>] [--exit-codes 0,0]" };
  }
  const root = optionString(options, "root") ?? process.cwd();
  const exitCodes = optionList(options, "exit-codes").map((value) => parseInt(value, 10)).filter((n) => Number.isFinite(n));
  try {
    const train = makeTrain(root, options);
    const receipt = await train.release(taskId, { exitCodes });
    return {
      exitCode: ExitCode.Success,
      message: `worktree ${taskId} released; final ${receipt.finalCommit.slice(0, 12)} fingerprint ${receipt.diffFingerprint.slice(0, 16)}…`,
      data: { receipt },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `worktree release failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function worktreeStatus(rest: string[]): Promise<CommandResult> {
  const { positionals, options } = parseOptions(rest);
  const root = optionString(options, "root") ?? process.cwd();
  try {
    const train = makeTrain(root, options);
    if (positionals.length > 0) {
      const taskId = positionals[0];
      const lease = await train.readLease(taskId);
      const review = await train.reviewStatus(taskId);
      return {
        exitCode: ExitCode.Success,
        message: `task ${taskId}: ${lease.state} (${lease.branch} @ ${lease.baseEpoch.slice(0, 12)})`,
        data: { lease, review },
      };
    }
    const leases = await train.listActive();
    return {
      exitCode: ExitCode.Success,
      message: `${leases.length} active worktree(s)`,
      data: { leases },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `worktree status failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function worktreeCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  void opts;
  const subcommand = args[0]?.toLowerCase();
  const rest = args.slice(1);
  switch (subcommand) {
    case "create":
      return worktreeCreate(rest);
    case "release":
      return worktreeRelease(rest);
    case "status":
      return worktreeStatus(rest);
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown worktree subcommand: ${subcommand}. Available: create, release, status. Example: worktree create T1 --base $(git rev-parse HEAD) --root ${path.resolve(".")}`,
      };
  }
}
