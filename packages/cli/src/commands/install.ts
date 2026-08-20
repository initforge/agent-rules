import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { RuntimeInstaller, RUNTIME_PLATFORMS } from "../runtime/installer.js";
import type { RuntimePlatform } from "../runtime/contracts.js";

/**
 * Install agent-rules runtime for one or all platforms.
 *
 * All platforms now go through the native transactional installer.
 * If runtime already exists, automatically updates instead of failing.
 */
export async function installCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const platform = args[0] || "all";
  const validPlatforms = [...RUNTIME_PLATFORMS, "all"] as const;

  if (!(validPlatforms as readonly string[]).includes(platform)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Invalid platform: ${platform}. Valid: ${[...validPlatforms].join(", ")}`,
    };
  }

  const repoRoot = getRepoRoot();
  const installer = new RuntimeInstaller({
    repositoryRoot: repoRoot,
    dryRun: options.dryRun,
  });

  const force = args.includes("--force");

  async function installOrUpdate(p: string): Promise<{ ok: boolean; action: string; error?: string }> {
    try {
      await installer.install(p as RuntimePlatform, "install");
      return { ok: true, action: "installed" };
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("already exists") || msg.includes("activation drift") || msg.includes("not a managed link") || msg.includes("Refusing to overwrite")) {
        if (!force) {
          return { ok: false, action: "skipped", error: `${msg} (use --force to reinstall)` };
        }
        // Force: uninstall then reinstall
        try {
          await installer.uninstall(p as RuntimePlatform);
          await installer.install(p as RuntimePlatform, "install");
          return { ok: true, action: "reinstalled (forced)" };
        } catch (forceError) {
          return { ok: false, action: "force-failed", error: (forceError as Error).message };
        }
      }
      return { ok: false, action: "install-failed", error: msg };
    }
  }

  if (platform === "all") {
    const results: Record<string, { ok: boolean; action: string; error?: string }> = {};
    for (const p of RUNTIME_PLATFORMS) {
      results[p] = await installOrUpdate(p);
    }

    const allOk = Object.values(results).every((r) => r.ok);
    const failed = Object.entries(results).filter(([, r]) => !r.ok);

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`Install results:`);
      for (const [p, r] of Object.entries(results)) {
        const icon = r.ok ? "✓" : "✗";
        const detail = r.ok ? r.action : r.error;
        console.log(`  ${icon} ${p}: ${detail}`);
      }
    }

    return {
      exitCode: allOk ? ExitCode.Success : ExitCode.LegacyFailed,
      message: allOk
        ? `All ${RUNTIME_PLATFORMS.length} platforms ready`
        : `${failed.length} platform(s) failed: ${failed.map(([p]) => p).join(", ")}`,
      data: results,
    };
  }

  // Single platform
  const result = await installOrUpdate(platform);
  return {
    exitCode: result.ok ? ExitCode.Success : ExitCode.GeneralError,
    message: result.ok
      ? `${platform}: ${result.action}`
      : `${platform} failed: ${result.error}`,
    data: { platform, ...result },
  };
}
