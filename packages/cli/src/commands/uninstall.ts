import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { COORDINATOR_HOSTS, createInstallationCoordinator } from "../runtime/installation-coordinator.js";

export async function uninstallCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const targetPlatforms = args.filter((a) => !a.startsWith("-"));
  const validPlatforms = [...COORDINATOR_HOSTS, "all"] as const;

  for (const p of targetPlatforms) {
    if (!(validPlatforms as readonly string[]).includes(p)) {
      return { exitCode: ExitCode.InvalidArgument, message: `Invalid platform: ${p}. Valid: ${[...validPlatforms].join(", ")}` };
    }
  }

  const platformsToUninstall = targetPlatforms.length === 0 || targetPlatforms.includes("all")
    ? [...COORDINATOR_HOSTS]
    : targetPlatforms;

  const coordinator = createInstallationCoordinator({ dryRun: options.dryRun });
  try {
    const receipt = await coordinator.uninstall(platformsToUninstall);
    if (platformsToUninstall.length === 1 && !targetPlatforms.includes("all")) {
      const single = platformsToUninstall[0];
      return {
        exitCode: ExitCode.Success,
        message: `${single} uninstalled (owned content only)`,
        data: { platform: single, ok: true, candidate_id: receipt.candidate_id },
      };
    }
    return {
      exitCode: ExitCode.Success,
      message: `All ${platformsToUninstall.length} platforms uninstalled (owned content only)`,
      data: { candidate_id: receipt.candidate_id, hosts: platformsToUninstall },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: (error as Error).message,
      data: { hosts: platformsToUninstall, error: (error as Error).message },
    };
  }
}
