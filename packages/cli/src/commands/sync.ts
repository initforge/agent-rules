import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { build } from "./build.js";
import { verifyMirrors } from "./verify-mirrors.js";
import { installCmd } from "./install.js";
import { provisionMcps } from "../integration/provisioning.js";
import { getRepoRoot } from "../adapters/repo.js";

/**
 * Sync: orchestrates build + install + MCP provisioning + verify mirrors.
 * Uses native TS build, install, and verify-mirrors. MCP provisioning is part
 * of the canonical sync lifecycle and its failures poison the aggregate result.
 */
export async function syncCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const platform = args[0] || "all";

  if (options.dryRun) {
    console.log("[dry-run] Would run: build → install → provision MCPs → verify-mirrors");
    return {
      exitCode: ExitCode.Success,
      message: "Dry-run: sync sequence would execute",
    };
  }

  // Step 1: Build (native TS)
  const buildResult = await build([], options);
  if (buildResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at build step",
      data: { step: "build", exitCode: buildResult.exitCode },
    };
  }

  // Step 2: Install using native installer
  const installResult = await installCmd([platform, "--force"], options);
  if (installResult.exitCode !== 0) {
    return {
      exitCode: ExitCode.LegacyFailed,
      message: "Sync failed at install step",
      data: { step: "install", exitCode: installResult.exitCode },
    };
  }

  // Step 2b: Provision canonical MCPs (shared orchestrator, registry-driven)
  const repoRoot = getRepoRoot();
  let provisioning;
  try {
    provisioning = await provisionMcps(repoRoot, { dryRun: options.dryRun });
  } catch (error) {
    provisioning = { kind: "mcp", source: "integrations/registry.json", total: 0, status: "BLOCKED", success: false, results: [], error: (error as Error).message };
  }

  // Step 3: Verify mirrors (native TS)
  const verifyResult = await verifyMirrors([], options);
  const success = verifyResult.exitCode === 0 && provisioning.success;

  return {
    exitCode: success ? ExitCode.Success : ExitCode.LegacyFailed,
    message: success
      ? `Sync completed for ${platform}; ${provisioning.total} canonical MCP entries provisioned`
      : `Sync completed but mirror verification failed or MCP provisioning ${provisioning.status}`,
    data: {
      platform,
      buildExitCode: buildResult.exitCode,
      installExitCode: installResult.exitCode,
      verifyExitCode: verifyResult.exitCode,
      mcps: provisioning,
    },
  };
}
