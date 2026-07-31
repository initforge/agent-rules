import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getAutomationDir, getRepoRoot } from "../adapters/powershell.js";
import fs from "node:fs/promises";
import path from "node:path";

interface PlatformInfo {
  name: string;
  contractPath: string;
  contractExists: boolean;
  agentsDir: string;
  agentsExist: boolean;
  overlay: string;
  overlayExists: boolean;
}

/**
 * Platform: inspect platform contracts and overlays.
 *
 * Subcommands:
 *   list       — list configured platforms
 *   show <name> — show platform contract details
 *
 * Read-only; does not deploy or modify platforms.
 */
export async function platformCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0] || "list";
  const root = getRepoRoot();
  const platformsDir = path.join(root, "platforms");
  const platformNames = ["codex", "grok", "antigravity", "cursor", "opencode"];

  if (options.dryRun) {
    console.log(`[dry-run] Would run platform ${subcommand}`);
    return {
      exitCode: ExitCode.Success,
      message: `Dry-run: platform ${subcommand} skipped`,
    };
  }

  switch (subcommand) {
    case "list": {
      const platforms: PlatformInfo[] = [];
      for (const name of platformNames) {
        const pDir = path.join(platformsDir, name);
        const overlay = path.join(pDir, `${name}-overlay.md`);
        const agents = path.join(pDir, "agents");

        let overlayExists = false;
        let agentsExist = false;
        try {
          await fs.access(overlay);
          overlayExists = true;
        } catch { /* empty */ }
        try {
          await fs.access(agents);
          agentsExist = true;
        } catch { /* empty */ }

        platforms.push({
          name,
          contractPath: path.join(pDir, `platform-contracts.json`),
          contractExists: false,
          agentsDir: agents,
          agentsExist,
          overlay,
          overlayExists,
        });
      }

      // Read shared platform contracts
      const contractPath = path.join(root, "platforms", "platform-contracts.json");
      let contractData: Record<string, unknown> = {};
      try {
        contractData = JSON.parse(
          await fs.readFile(contractPath, "utf-8")
        );
      } catch { /* empty */ }

      if (!options.json) {
        console.log("Configured platforms:");
        for (const p of platforms) {
          console.log(`  ${p.name}: overlay=${p.overlayExists}, agents=${p.agentsExist}`);
        }
      }

      return {
        exitCode: ExitCode.Success,
        message: `Found ${platforms.length} platform(s)`,
        data: { platforms, contractsPath: contractPath },
      };
    }

    case "show": {
      const name = args[1];
      if (!name || !platformNames.includes(name)) {
        return {
          exitCode: ExitCode.InvalidArgument,
          message: `Usage: agent-rules platform show <name>. Valid: ${platformNames.join(", ")}`,
        };
      }

      const pDir = path.join(platformsDir, name);
      const overlay = path.join(pDir, `${name}-overlay.md`);
      let overlayContent = "";
      try {
        overlayContent = await fs.readFile(overlay, "utf-8");
      } catch { /* empty */ }

      if (!options.json) {
        console.log(`Platform: ${name}`);
        console.log(`Overlay: ${overlay}`);
        if (overlayContent) {
          console.log("---");
          console.log(overlayContent);
        }
      }

      return {
        exitCode: ExitCode.Success,
        message: `Platform ${name} details`,
        data: { name, overlay: overlayContent },
      };
    }

    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown platform subcommand: ${subcommand}. Use: list, show <name>`,
      };
  }
}
