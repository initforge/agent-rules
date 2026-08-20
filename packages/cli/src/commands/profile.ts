import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot, getAutomationDir } from "../adapters/repo.js";
import { installProfile } from "../automation/install-profile.js";
import { doctorProfile } from "../automation/doctor-profile.js";
import { discoverProfiles } from "../automation/discover-profiles.js";
import { removeProfile } from "../automation/remove-profile.js";
import { updateProfile } from "../automation/update-profile.js";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Profile: view or manage installation profiles.
 *
 * Subcommands:
 *   list       — list available profiles
 *   show <name> — show profile details
 *   apply <name> [project-root] — apply a profile
 *   doctor [name] — check profile health
 *   discover  — discover available profiles
 *   remove <name> — remove a profile
 *   update <name> — update a profile
 */
export async function profileCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0] || "list";
  const root = getRepoRoot();
  const profilesDir = getAutomationDir();
  const automationProfilesDir = path.join(profilesDir, "profiles");

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
        const dir = await fs.readdir(automationProfilesDir);
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
        }
        return {
          exitCode: ExitCode.Success,
          message: "No profiles found",
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
          path.join(automationProfilesDir, `${name}.json`),
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
          message: "Usage: agent-rules profile apply <name>",
        };
      }
      const result = await installProfile({ name, repoRoot: root, force: args.includes("--force") });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.message);
      }
      return {
        exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError,
        message: result.message,
      };
    }

    case "doctor": {
      const name = args[1];
      const result = await doctorProfile(root, name || undefined);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.ok ? "Profile health OK" : "Profile health FAILED");
      }
      return {
        exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError,
        message: result.ok ? "Profile health OK" : "Profile health FAILED",
      };
    }

    case "discover": {
      const profiles = await discoverProfiles(root);
      if (profiles.length === 0) {
        console.log("No profiles available.");
      } else {
        console.log("Available profiles:\n");
        for (const p of profiles) {
          const flag = p.enabledByDefault ? "[default]" : "[optional]";
          console.log(`  ${p.name} ${flag}`);
          if (p.displayName) console.log(`    Name: ${p.displayName}`);
          if (p.version) console.log(`    Version: ${p.version}`);
          if (p.description) console.log(`    ${p.description}`);
          console.log("");
        }
      }
      return {
        exitCode: ExitCode.Success,
        message: "Profiles discovered",
      };
    }

    case "remove": {
      const name = args[1];
      if (!name) {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: "Usage: agent-rules profile remove <name>",
        };
      }
      const result = await removeProfile({ name, repoRoot: root, force: args.includes("--force") });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.message);
      }
      return {
        exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError,
        message: result.message,
      };
    }

    case "update": {
      const name = args[1];
      if (!name) {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: "Usage: agent-rules profile update <name>",
        };
      }
      const result = await updateProfile({ name, repoRoot: root, force: args.includes("--force") });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.message);
      }
      return {
        exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError,
        message: result.message,
      };
    }

    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown profile subcommand: ${subcommand}. Use: list, show, apply, doctor, discover, remove, update`,
      };
  }
}
