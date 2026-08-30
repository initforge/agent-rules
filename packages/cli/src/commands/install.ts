import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { COORDINATOR_HOSTS, createInstallationCoordinator } from "../runtime/installation-coordinator.js";

/**
 * Install agent-rules runtime for one or all platforms.
 * Main CLI calls InstallationCoordinator only.
 */
export async function installCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const targetPlatforms = args.filter((a) => !a.startsWith("-"));
  const validPlatforms = [...COORDINATOR_HOSTS, "all"] as const;

  for (const p of targetPlatforms) {
    if (!(validPlatforms as readonly string[]).includes(p)) {
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Invalid platform: ${p}. Valid: ${[...validPlatforms].join(", ")}`,
      };
    }
  }

  const platformsToInstall = targetPlatforms.length === 0 || targetPlatforms.includes("all")
    ? [...COORDINATOR_HOSTS]
    : targetPlatforms;

  const installIntegrations = !args.includes("--no-integrations");
  const coordinator = createInstallationCoordinator({ dryRun: options.dryRun, enableMcp: installIntegrations });

  try {
    const receipt = await coordinator.install(platformsToInstall);
    const results: Record<string, { ok: boolean; skipped: boolean; action: string; tier: string; candidate_id: string; reason?: string }> = {};
    for (const host of platformsToInstall) {
      const readback = receipt.readback?.[host];
      const skipped = readback?.authority_tier === "UNAVAILABLE" && !receipt.errors?.[host];
      const nativeMcpClaim = receipt.native?.[host]?.claims.NATIVE_MCP;
      const nativeMcpDetail = nativeMcpClaim && !["PASS", "UNSUPPORTED"].includes(nativeMcpClaim.status)
        ? nativeMcpClaim.evidence
            .map((entry) => entry && typeof entry === "object" ? (entry as { detail?: unknown }).detail : undefined)
            .find((detail): detail is string => typeof detail === "string" && detail.length > 0)
        : undefined;
      const reason = receipt.errors?.[host]
        ?? nativeMcpDetail
        ?? readback?.error
        ?? "fresh native static readback is incomplete";
      const ok = readback?.native === true && readback.static === true;
      const tier = readback?.authority_tier ?? "UNAVAILABLE";
      results[host] = {
        ok,
        skipped,
        action: skipped ? "host not locally available; no files changed" : ok && tier === "NATIVE_ENFORCED" ? "installed and native-enforced" : ok ? "installed with advisory authority" : "verification incomplete",
        tier,
        candidate_id: receipt.candidate_id,
        ...(ok || skipped ? {} : { reason }),
      };
    }
    const failed = Object.values(results).filter((result) => !result.ok && !result.skipped);
    const skipped = Object.values(results).filter((result) => result.skipped);
    const advisory = Object.values(results).filter((result) => result.ok && result.tier !== "NATIVE_ENFORCED");
    return {
      exitCode: failed.length > 0 ? ExitCode.LegacyFailed : ExitCode.Success,
      message: failed.length > 0
        ? `${failed.length} host(s) installed without complete live verification`
        : advisory.length > 0 || skipped.length > 0
          ? `${Object.values(results).filter((result) => result.ok).length} present host(s) installed; ${advisory.length} advisory; ${skipped.length} unavailable skipped`
          : platformsToInstall.length === 1 ? `${platformsToInstall[0]}: installed and native-enforced` : `All ${platformsToInstall.length} platforms native-enforced`,
      data: { candidate_id: receipt.candidate_id, hosts: platformsToInstall, results, readback: receipt.readback ?? {}, errors: receipt.errors ?? {} },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: (error as Error).message,
      data: { hosts: platformsToInstall, error: (error as Error).message },
    };
  }
}
