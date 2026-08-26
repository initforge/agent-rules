import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { RUNTIME_PLATFORMS } from "../runtime/installer.js";
import { NativeInstaller } from "../services/native-installer.js";
import type { HostId } from "@initforge/agent-rules-kernel/northstar/host-adapters.js";


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
  const targetPlatforms = args.filter((a) => !a.startsWith("-"));
  const validPlatforms = [...RUNTIME_PLATFORMS, "all"] as const;

  for (const p of targetPlatforms) {
    if (!(validPlatforms as readonly string[]).includes(p)) {
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Invalid platform: ${p}. Valid: ${[...validPlatforms].join(", ")}`,
      };
    }
  }

  const platformsToInstall = targetPlatforms.length === 0 || targetPlatforms.includes("all")
    ? [...RUNTIME_PLATFORMS]
    : targetPlatforms;


  const force = args.includes("--force");
  const nativeInstaller = new NativeInstaller();

  async function installOrUpdate(p: string): Promise<{ ok: boolean; action: string; error?: string }> {
    try {
      // NativeInstaller is the only coordinator: plan → snapshot → apply →
      // readback. It projects skills but never globally activates MCP.
      await nativeInstaller.install(p as HostId, { dryRun: options.dryRun, force });
      return { ok: true, action: "installed (native transactional)" };
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("already exists") || msg.includes("activation drift") || msg.includes("not a managed link") || msg.includes("Refusing to overwrite")) {
        if (!force) {
          return { ok: false, action: "skipped", error: `${msg} (use --force to reinstall)` };
        }
        // Force: uninstall then reinstall
        try {
          await nativeInstaller.uninstall(p as HostId);
          await nativeInstaller.install(p as HostId, { dryRun: options.dryRun, force: true });
          return { ok: true, action: "reinstalled (forced, native transactional)" };
        } catch (forceError) {
          return { ok: false, action: "force-failed", error: (forceError as Error).message };
        }
      }
      return { ok: false, action: "install-failed", error: msg };
    }
  }

  const results: Record<string, { ok: boolean; action: string; error?: string }> = {};
  for (const p of platformsToInstall) {
    results[p] = await installOrUpdate(p);
  }

  const allOk = Object.values(results).every((r) => r.ok);
  const failed = Object.entries(results).filter(([, r]) => !r.ok);
  const overallOk = allOk;

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Install results (native per-host, single-host isolation preserved):`);
    for (const [p, r] of Object.entries(results)) {
      const icon = r.ok ? "✓" : "✗";
      const detail = r.ok ? r.action : r.error;
      console.log(`  ${icon} ${p}: ${detail}`);
    }
  }

  if (platformsToInstall.length === 1 && !targetPlatforms.includes("all")) {
    const single = platformsToInstall[0];
    const res = results[single];
    return {
      exitCode: res.ok ? ExitCode.Success : ExitCode.GeneralError,
      message: res.ok
        ? `${single}: ${res.action}`
        : `${single} failed: ${res.error ?? "installation failed"}`,
      data: { platform: single, ...res },
    };
  }

  return {
    exitCode: overallOk ? ExitCode.Success : ExitCode.LegacyFailed,
    message: overallOk
      ? `All ${platformsToInstall.length} platforms ready`
      : `${failed.length} platform(s) failed: ${failed.map(([p]) => p).join(", ")}`,
    data: { results },
  };
}
