import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript, getAutomationDir, getRepoRoot } from "../adapters/powershell.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Profile: view or apply installation profiles.
 *
 * Subcommands:
 *   list       — list available profiles
 *   show <name> — show profile details
 *   apply <name> [project-root] — apply a profile (via 10-sync-project-agents or 08-install-5fedu-context)
 *
 * Not yet migrated: displays profile metadata from automation/profiles/ if available.
 */
export async function profileCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0] || "list";
  const root = getRepoRoot();
  const profilesDir = path.join(root, "automation", "profiles");

  if (options.dryRun) {
    console.log(`[dry-run] Would run profile ${subcommand}`);
    return {
      exitCode: ExitCode.Success,
      message: `Dry-run: profile ${subcommand} skipped`,
    };
  }

  switch (subcommand) {
    case "list": {
      try {
        const dir = await fs.readdir(profilesDir);
        const profiles = dir
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""));
        const data = { profiles };
        if (!options.json) {
          if (profiles.length === 0) {
            console.log("No profiles found in automation/profiles/");
          } else {
            console.log("Available profiles:");
            for (const p of profiles) {
              console.log(`  ${p}`);
            }
          }
        }
        return {
          exitCode: ExitCode.Success,
          message: `Found ${profiles.length} profile(s)`,
          data,
        };
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ profiles: [], note: "profiles directory not found" }));
        } else {
          console.log("No profiles directory found at automation/profiles/");
          console.log("Profile management is not yet migrated from legacy scripts.");
        }
        return {
          exitCode: ExitCode.NotImplemented,
          message: "Profile system not yet migrated",
          data: { profiles: [] },
        };
      }
    }

    case "show": {
      const name = args[1];
      if (!name) {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: "Usage: agent-rules profile show <name>",
        };
      }
      try {
        const content = await fs.readFile(
          path.join(profilesDir, `${name}.json`),
          "utf-8"
        );
        const parsed = JSON.parse(content);
        if (!options.json) {
          console.log(JSON.stringify(parsed, null, 2));
        }
        return {
          exitCode: ExitCode.Success,
          message: `Profile: ${name}`,
          data: parsed,
        };
      } catch {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: `Profile not found: ${name}`,
        };
      }
    }

    case "apply": {
      const name = args[1];
      if (!name) {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: "Usage: agent-rules profile apply <name> [project-root]",
        };
      }
      console.log(
        `Profile apply is not yet migrated from legacy scripts.`
      );
      console.log(`Would apply profile "${name}" via 08-install-5fedu-context.ps1 or 10-sync-project-agents.ps1`);
      return {
        exitCode: ExitCode.NotImplemented,
        message: `Profile apply not yet migrated; would apply "${name}" via legacy scripts`,
        data: { name, projectRoot: args[2] || "" },
      };
    }

    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown profile subcommand: ${subcommand}. Use: list, show <name>, apply <name>`,
      };
  }
}
