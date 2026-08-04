import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { deletePaths, inventoryPaths, rescuePaths } from "../cleanup/index.js";

/**
 * `agent-rules cleanup` — SS-24 (R-042) cleanup, migration and garbage collection.
 * Subcommands:
 *   inventory <path...>  Classify exact paths (delete/rescue/keep)
 *   rescue    <path...>  Move exact paths into quarantine; receipt = rollback
 *   delete    <path...>  Guarded removal of exact-named junk; irreversibility receipt
 */

interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
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

export async function cleanupCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();
  const { positionals, options } = parseArgs(args.slice(1));
  const root = path.resolve(typeof options.root === "string" ? options.root : process.cwd());
  const dryRun =
    options["dry-run"] === true || options["dry-run"] === "true" || opts.dryRun;
  const optionPath = (name: string): string | undefined =>
    typeof options[name] === "string" && options[name] !== "" ? options[name] : undefined;

  try {
    switch (subcommand) {
      case "inventory": {
        if (positionals.length === 0) {
          return usage("inventory <path...> [--root <repo>]");
        }
        const items = inventoryPaths(positionals, root);
        return {
          exitCode: ExitCode.Success,
          message: `inventoried ${items.length} path(s)`,
          data: { items },
        };
      }
      case "rescue": {
        if (positionals.length === 0) {
          return usage("rescue <path...> [--root <repo>] [--quarantine <dir>] [--dry-run]");
        }
        const quarantineRoot = path.resolve(
          optionPath("quarantine") ?? path.join(root, ".cleanup-quarantine")
        );
        const receipt = rescuePaths(positionals, { repoRoot: root, quarantineRoot, dryRun });
        return {
          exitCode: ExitCode.Success,
          message: `rescued ${receipt.items.length} path(s)${dryRun ? " (dry-run)" : ""}; receipt ${receipt.receiptId}${receipt.quarantineDir ? ` -> ${receipt.quarantineDir}` : ""}`,
          data: { receipt },
        };
      }
      case "delete": {
        if (positionals.length === 0) {
          return usage("delete <path...> [--root <repo>] [--receipts <dir>] [--dry-run]");
        }
        const receiptsDir = path.resolve(
          optionPath("receipts") ?? path.join(root, ".cleanup-receipts")
        );
        const receipt = deletePaths(positionals, { repoRoot: root, receiptsDir, dryRun });
        return {
          exitCode: ExitCode.Success,
          message: `deleted ${receipt.items.length} path(s) (irreversible)${dryRun ? " (dry-run)" : ""}; receipt ${receipt.receiptId}`,
          data: { receipt },
        };
      }
      default:
        return usage("inventory|rescue|delete");
    }
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `cleanup ${subcommand ?? ""} failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function usage(sub: string): CommandResult {
  return {
    exitCode: ExitCode.InvalidArgument,
    message: `Usage: cleanup ${sub}\n  --root <repo>      repo root (default: cwd)\n  --dry-run          classify/plan without mutating\n  --quarantine <dir> rescue destination (default: <root>/.cleanup-quarantine)\n  --receipts <dir>   delete receipt dir (default: <root>/.cleanup-receipts)`,
  };
}
