import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { RuntimeInstaller, RUNTIME_PLATFORMS } from "../runtime/installer.js";
import type { RuntimePlatform } from "../runtime/contracts.js";
import { provisionMcps } from "../integration/provisioning.js";
import { convergeAllHostMcpConfigs } from "../runtime/mcp-convergence.js";

import path from "node:path";
import { projectSkillsToGlobal, uninstallOwnedGlobalProjections } from "../runtime/composed-installer.js";

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
  const skillsSource = path.join(repoRoot, "skills");

  async function installOrUpdate(p: string): Promise<{ ok: boolean; action: string; error?: string }> {
    try {
      await installer.install(p as RuntimePlatform, "install");
      await projectSkillsToGlobal(skillsSource, p as RuntimePlatform);
      return { ok: true, action: "installed" };
    } catch (error) {
      const msg = (error as Error).message;
      if (msg.includes("already exists") || msg.includes("activation drift") || msg.includes("not a managed link") || msg.includes("Refusing to overwrite")) {
        if (!force) {
          return { ok: false, action: "skipped", error: `${msg} (use --force to reinstall)` };
        }
        // Force: uninstall then reinstall
        try {
          await uninstallOwnedGlobalProjections(p as RuntimePlatform);
          await installer.uninstall(p as RuntimePlatform);
          await installer.install(p as RuntimePlatform, "install");
          await projectSkillsToGlobal(skillsSource, p as RuntimePlatform);
          return { ok: true, action: "reinstalled (forced)" };
        } catch (forceError) {
          return { ok: false, action: "force-failed", error: (forceError as Error).message };
        }
      }
      return { ok: false, action: "install-failed", error: msg };
    }
  }

  // REQ-008: MCP provisioning is part of the install lifecycle, but ONLY for
  // entries inside the active install profile (AGENT_RULES_INTEGRATION_PROFILE,
  // default core); explicit-only integrations install only when explicitly
  // selected. After provisioning, host configs converge to the global MCP
  // profile (default none): agent-rules-owned entries are removed or disabled.
  let provisioning;
  try {
    provisioning = await provisionMcps(repoRoot, { dryRun: options.dryRun });
  } catch (error) {
    provisioning = { kind: "mcp", source: "integrations/registry.json", total: 0, status: "BLOCKED", success: false, results: [], error: (error as Error).message };
  }
  let convergence;
  try {
    convergence = await convergeAllHostMcpConfigs(repoRoot, undefined, { dryRun: options.dryRun });
  } catch (error) {
    convergence = [{ host: "all", config_path: "", exists: false, status: "SKIPPED", entries: [], error: (error as Error).message }];
  }

  if (platform === "all") {
    const results: Record<string, { ok: boolean; action: string; error?: string }> = {};
    for (const p of RUNTIME_PLATFORMS) {
      results[p] = await installOrUpdate(p);
    }

    const allOk = Object.values(results).every((r) => r.ok);
    const failed = Object.entries(results).filter(([, r]) => !r.ok);
    const mcpsOk = provisioning.success;
    const convergenceOk = !convergence.some((result) => result.status === "NEEDS_USER");
    const overallOk = allOk && mcpsOk && convergenceOk;

    if (options.json) {
      console.log(JSON.stringify({ ...results, mcps: provisioning, mcp_convergence: convergence }, null, 2));
    } else {
      console.log(`Install results:`);
      for (const [p, r] of Object.entries(results)) {
        const icon = r.ok ? "✓" : "✗";
        const detail = r.ok ? r.action : r.error;
        console.log(`  ${icon} ${p}: ${detail}`);
      }
      console.log(`MCP provisioning (${provisioning.total} profile-scoped MCP entries): ${provisioning.status}${provisioning.success ? "" : " — not all MCPs are fully installed"}`);
      const needsUser = convergence.filter((result) => result.status === "NEEDS_USER");
      if (needsUser.length > 0) {
        console.log(`MCP host config convergence NEEDS_USER: ${needsUser.map((result) => `${result.host}: ${result.entries.filter((entry) => entry.disposition === "user-modified").map((entry) => entry.id).join(", ")}`).join("; ")}`);
      }
    }

    return {
      exitCode: overallOk ? ExitCode.Success : ExitCode.LegacyFailed,
      message: overallOk
        ? `All ${RUNTIME_PLATFORMS.length} platforms ready and ${provisioning.total} profile-scoped MCP entries provisioned`
        : `${failed.length} platform(s) failed and/or MCP provisioning ${provisioning.status}${convergenceOk ? "" : " and/or host MCP convergence needs user"}: ${[failed.map(([p]) => p).join(", "), provisioning.status === "PASS" ? "" : `mcp=${provisioning.status}`, convergenceOk ? "" : "mcp-convergence=NEEDS_USER"].filter(Boolean).join("; ")}`,
      data: { results, mcps: provisioning, mcp_convergence: convergence },
    };
  }

  // Single platform
  const result = await installOrUpdate(platform);
  const overallOk = result.ok && provisioning.success && !convergence.some((item) => item.status === "NEEDS_USER");
  return {
    exitCode: overallOk ? ExitCode.Success : ExitCode.GeneralError,
    message: overallOk
      ? `${platform}: ${result.action}; MCP provisioning ${provisioning.status}`
      : `${platform} failed: ${result.error ?? `MCP provisioning ${provisioning.status}`}`,
    data: { platform, ...result, mcps: provisioning, mcp_convergence: convergence },
  };
}
