import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { RUNTIME_PLATFORMS } from "../runtime/installer.js";
import { NativeInstaller } from "../services/native-installer.js";
import type { HostId } from "@initforge/agent-rules-kernel/northstar/host-adapters.js";

export async function uninstallCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const targetPlatforms = args.filter((a) => !a.startsWith("-"));
  const validPlatforms = [...RUNTIME_PLATFORMS, "all"] as const;

  for (const p of targetPlatforms) {
    if (!(validPlatforms as readonly string[]).includes(p)) {
      return { exitCode: ExitCode.InvalidArgument, message: `Invalid platform: ${p}. Valid: ${[...validPlatforms].join(", ")}` };
    }
  }

  const platformsToUninstall = targetPlatforms.length === 0 || targetPlatforms.includes("all")
    ? [...RUNTIME_PLATFORMS]
    : targetPlatforms;

  const nativeInstaller = new NativeInstaller();

  async function doUninstall(p: string): Promise<{ ok: boolean; error?: string }> {
    try {
      // Native uninstall removes managed host content and its owned skills only.
      await nativeInstaller.uninstall(p as HostId);
      return { ok: true };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  }

  const results: Record<string, { ok: boolean; error?: string }> = {};
  for (const p of platformsToUninstall) results[p] = await doUninstall(p);
  const allOk = Object.values(results).every(r => r.ok);

  if (platformsToUninstall.length === 1 && !targetPlatforms.includes("all")) {
    const single = platformsToUninstall[0];
    const r = results[single];
    return {
      exitCode: r.ok ? ExitCode.Success : ExitCode.GeneralError,
      message: r.ok ? `${single} uninstalled (owned content only)` : `${single} uninstall failed: ${r.error}`,
      data: { platform: single, ...r }
    };
  }

  return {
    exitCode: allOk ? ExitCode.Success : ExitCode.GeneralError,
    message: allOk ? `All ${platformsToUninstall.length} platforms uninstalled (owned content only)` : `Some uninstalls failed`,
    data: { results }
  };
}
