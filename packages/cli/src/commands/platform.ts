import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getAutomationDir, getRepoRoot } from "../adapters/repo.js";
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
  agentMaterialization: "managed_directory" | "host_native";
  managedSurfaceExpected: boolean;
  managedSurfaceStatus: "PRESENT" | "PARTIAL" | "MISSING" | "HOST_NATIVE_DEFERRED";
}

type PlatformContract = {
  orchestration?: {
    agent_materialization?: "managed_directory" | "host_native";
  };
};

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
  const contractPath = path.join(platformsDir, "platform-contracts.json");
  let contracts: { platforms?: Record<string, unknown> } = {};
  try {
    contracts = JSON.parse(await fs.readFile(contractPath, "utf-8"));
  } catch {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Unable to read canonical platform contracts: ${contractPath}`,
    };
  }
  const platformNames = Object.keys(contracts.platforms ?? {}).sort();
  if (platformNames.length === 0) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Canonical platform contracts contain no platforms: ${contractPath}`,
    };
  }

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

        const contract = contracts.platforms?.[name] as PlatformContract | undefined;
        const agentMaterialization = contract?.orchestration?.agent_materialization ?? "managed_directory";
        const managedSurfaceExpected = agentMaterialization === "managed_directory";
        const managedSurfaceStatus = !managedSurfaceExpected
          ? "HOST_NATIVE_DEFERRED"
          : agentsExist && overlayExists
            ? "PRESENT"
            : agentsExist || overlayExists
              ? "PARTIAL"
              : "MISSING";

        platforms.push({
          name,
          contractPath,
          contractExists: true,
          agentsDir: agents,
          agentsExist,
          overlay,
          overlayExists,
          agentMaterialization,
          managedSurfaceExpected,
          managedSurfaceStatus,
        });
      }

      if (!options.json) {
        console.log("Configured platforms:");
        for (const p of platforms) {
          console.log(`  ${p.name}: materialization=${p.agentMaterialization}, managed-surface=${p.managedSurfaceStatus}`);
        }
      }

      return {
        exitCode: ExitCode.Success,
        message: `Found ${platforms.length} platform(s)`,
        data: { platforms, contractsPath: contractPath, contracts },
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
        data: { name, overlay: overlayContent, contract: contracts.platforms?.[name] ?? null },
      };
    }

    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown platform subcommand: ${subcommand}. Use: list, show <name>`,
      };
  }
}
