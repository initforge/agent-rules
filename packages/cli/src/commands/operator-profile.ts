import fs from "node:fs";
import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import {
  loadCanonicalOperatorProfile,
  installOperatorProfile,
  deactivateOperatorProfile,
  setSessionOverride,
  resolveEffectiveProfile,
  detectOwnerInstruction,
} from "@initforge/agent-rules-kernel/northstar/operator-profile.js";
import { projectToAllHosts, operatorProfileStatus } from "../services/host-projection.js";

/**
 * Operator Communication Profile CLI (owner contract REQ-C04).
 * Deliberately a separate command namespace from `profile` (domain packs).
 *
 *   agent-rules operator-profile install vibe-product
 *   agent-rules operator-profile activate vibe-product
 *   agent-rules operator-profile status
 *   agent-rules operator-profile sync --all-hosts
 *   agent-rules operator-profile override --technical on|off|clear
 */
export async function operatorProfileCmd(args: string[], options: CliOptions): Promise<CommandResult> {
  const sub = args[0] ?? "status";
  const root = getRepoRoot();

  switch (sub) {
    case "install":
    case "activate": {
      const profileId = args[1] ?? "vibe-product";
      if (!options.dryRun) {
        loadCanonicalOperatorProfile(root, profileId); // fail closed on invalid canonical source
        installOperatorProfile(root, profileId);
      }
      return { exitCode: ExitCode.Success, message: `operator profile ${profileId} ${sub}ed${options.dryRun ? " (dry-run)" : ""}` };
    }
    case "deactivate": {
      if (!options.dryRun) deactivateOperatorProfile(root);
      return { exitCode: ExitCode.Success, message: `operator profile deactivated${options.dryRun ? " (dry-run)" : ""}` };
    }
    case "override": {
      const mode = args[1] ?? "clear";
      if (!options.dryRun) {
        setSessionOverride(root, mode === "on" ? { technical_mode: true } : mode === "off" ? { technical_mode: false } : null);
      }
      return { exitCode: ExitCode.Success, message: `session override set to ${mode}${options.dryRun ? " (dry-run)" : ""}` };
    }
    case "sync": {
      const allHosts = args.includes("--all-hosts");
      if (!allHosts) return { exitCode: ExitCode.InvalidArgument, message: "sync requires --all-hosts (single-canonical-source projection)" };
      const state = operatorProfileStatus(root);
      const profileId = state.profile_id ?? "vibe-product";
      const reports = options.dryRun ? projectToAllHosts(root, profileId, false) : projectToAllHosts(root, profileId, true);
      const nonSynced = reports.filter((r) => r.status !== "SYNCED");
      return {
        exitCode: ExitCode.Success,
        message: `projected ${profileId} to ${reports.length} hosts; ${nonSynced.length} non-SYNCED`,
        data: { profile_id: profileId, reports },
      };
    }
    case "resolve": {
      // Precedence resolution probe: owner text may flip temporary technical mode.
      const ownerText = args.slice(1).join(" ");
      const resolution = resolveEffectiveProfile({ repoRoot: root, ownerInstructionTechnical: detectOwnerInstruction(ownerText) });
      return { exitCode: ExitCode.Success, message: resolution.effective_technical_mode ? "technical mode" : "default vibe mode", data: resolution as unknown as Record<string, unknown> };
    }
    case "status": {
      const status = operatorProfileStatus(root);
      const resolution = resolveEffectiveProfile({ repoRoot: root });
      if (!options.json) {
        console.log(`installed=${status.installed} active=${status.active} profile=${status.profile_id ?? "-"} version=${status.version ?? "-"}`);
        console.log(`source_sha256=${status.source_sha256 ?? "-"}`);
        console.log(`precedence=${resolution.precedence_chain.join(" > ")}`);
        for (const host of status.hosts) console.log(`  ${host.host}: ${host.status}`);
      }
      return { exitCode: ExitCode.Success, message: `operator-profile status (${status.hosts.filter((h) => h.status === "SYNCED").length}/${status.hosts.length} SYNCED)`, data: { ...status, precedence_chain: resolution.precedence_chain } as unknown as Record<string, unknown> };
    }
    default:
      return { exitCode: ExitCode.InvalidArgument, message: "Usage: agent-rules operator-profile install|activate|deactivate|override|sync|resolve|status" };
  }
}

/** Doctor integration (REQ-C10). */
export function collectOperatorProfileDoctorChecks(root: string): Array<{ platform: string; check: string; status: string; detail: string }> {
  const checks: Array<{ platform: string; check: string; status: string; detail: string }> = [];
  let status;
  try {
    status = operatorProfileStatus(root);
  } catch (error) {
    return [{ platform: "operator-profile", check: "canonical-source", status: "FAIL", detail: (error as Error).message }];
  }
  const resolution = resolveEffectiveProfile({ repoRoot: root });
  checks.push({
    platform: "operator-profile",
    check: "canonical-source",
    status: status.installed ? "OK" : "UNINSTALLED",
    detail: `profile=${status.profile_id ?? "-"} version=${status.version ?? "-"} sha256=${status.source_sha256?.slice(0, 12) ?? "-"} precedence=${resolution.precedence_chain.join(">")} override=${resolution.session_override_active}`,
  });
  for (const host of status.hosts) {
    checks.push({
      platform: "operator-profile",
      check: `projection:${host.host}`,
      status: host.status,
      detail: host.detail,
    });
  }
  void fs;
  void path;
  return checks;
}
