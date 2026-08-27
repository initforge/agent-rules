import { handlerForRegistryEntry, resolveIntegrationManifestDir } from "../integration/installer-registry.js";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { getRepoRoot } from "../adapters/repo.js";
import {
  ALL_MCP_HOSTS,
  convergeHostMcpConfig,
  inspectHostMcpRegistration,
  registerHostMcpAdapters,
  setMcpRegistrationEnabled,
  type HostName,
} from "../runtime/mcp-convergence.js";
import { NativeHostProbe } from "../native/probe.js";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

/**
 * Public integration actions. Legacy aliases (install/verify/uninstall) were
 * removed from the public contract and are rejected explicitly below.
 */
type IntegrationAction = "list" | "enable" | "disable" | "doctor";
type IntegrationHandlerAction = "install" | "verify" | "uninstall";

const LEGACY_ALIASES: IntegrationHandlerAction[] = ["install", "verify", "uninstall"];
const PUBLIC_ACTIONS: IntegrationAction[] = ["list", "enable", "disable", "doctor"];

// Enable installs a provider only when necessary and then registers it with
// native hosts. Disable removes only registration we can prove is ours; it
// never uninstalls a package that may serve another host.
const ACTION_TO_HANDLER: Record<"enable" | "doctor", IntegrationHandlerAction> = {
  enable: "install",
  doctor: "verify",
};

const GENERIC_MCP_HOSTS = ALL_MCP_HOSTS.filter((host) => host !== "deepseek-harness" && host !== "command-code");

async function mutateNativeMcpRegistration(repoRoot: string, id: string, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  setMcpRegistrationEnabled(id, enabled);
  const probe = new NativeHostProbe();
  const reports: string[] = [];
  let ok = true;
  for (const host of GENERIC_MCP_HOSTS) {
    const detection = await probe.detect(host);
    if (!detection.present) continue;
    if (enabled) {
      const result = await registerHostMcpAdapters(repoRoot, host, { integrationIds: [id] });
      if (result.status === "FAILED" || result.status === "NEEDS_USER") ok = false;
      reports.push(`${host}:${result.status}`);
    } else {
      const result = await convergeHostMcpConfig(repoRoot, host, { globalMcpProfile: "none", integrationIds: [id] });
      if (result.status === "NEEDS_USER" || Boolean(result.error && !result.error.startsWith("dry-run"))) ok = false;
      reports.push(`${host}:${result.status}`);
    }
  }
  for (const host of ["deepseek-harness", "command-code"] as const) {
    const detection = await probe.detect(host);
    if (!detection.present) continue;
    try {
      if (host === "deepseek-harness") {
        const { setDshMcpRegistration } = await import("../services/deepseek-native.js");
        const result = setDshMcpRegistration(detection, [id], enabled);
        reports.push(`${host}:${result.changed ? (enabled ? "REGISTERED" : "REMOVED") : "UNCHANGED"}`);
      } else {
        const { writeCommandCodeMcpConfig, removeManagedCommandCodeMcp } = await import("../services/command-code-native.js");
        const changed = enabled
          ? Boolean(writeCommandCodeMcpConfig(detection.homeDir, [id]))
          : removeManagedCommandCodeMcp(detection.homeDir, [id]);
        reports.push(`${host}:${changed ? (enabled ? "REGISTERED" : "REMOVED") : "UNCHANGED"}`);
      }
    } catch (error) {
      ok = false;
      reports.push(`${host}:FAILED(${(error as Error).message})`);
    }
  }
  return { ok, message: `${enabled ? "registered" : "disabled"} native MCP ${id}; ${reports.join(", ") || "no installed host detected"}` };
}

export async function integrationCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const rawAction = args[0] as string | undefined;
  const integrationId = args[1];

  // list is handled directly: it prints the canonical registry inventory.
  if (rawAction === "list") {
    const repoRoot = getRepoRoot();
    const inventory = await loadIntegrationInventory(repoRoot);
    const entries = inventory.entries;
    if (options.json) console.log(JSON.stringify(entries.map((e) => ({ id: e.id, capability: e.capability, transport: e.transport })), null, 2));
    else {
      console.log("Integrations (canonical registry):");
      for (const e of entries) console.log(`  ${e.id}: capability=${(e as Record<string, unknown>).capability ?? "?"} transport=${(e as Record<string, unknown>).transport ?? "?"}`);
    }
    return { exitCode: ExitCode.Success, message: `${entries.length} integrations`, data: { entries } as unknown as Record<string, unknown> };
  }

  // Legacy aliases install/verify/uninstall are no longer accepted public
  // actions — reject them instead of mapping them to handlers.
  if (rawAction && (LEGACY_ALIASES as readonly string[]).includes(rawAction)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `unknown integration action "${rawAction}": legacy alias removed (public actions: list | enable | disable | doctor)`,
    };
  }

  const action = rawAction as Exclude<IntegrationAction, "list">;
  if (!PUBLIC_ACTIONS.includes(action)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `unknown integration action "${rawAction ?? ""}" — usage: integration <list|enable|disable|doctor> [integration-id|all]`,
    };
  }

  const handlerAction = action === "disable" ? null : ACTION_TO_HANDLER[action];

  const repoRoot = getRepoRoot();
  const inventory = await loadIntegrationInventory(repoRoot);
  const entries = inventory.entries;

  const ids = integrationId === "all" || !integrationId
    ? entries.map((entry) => entry.id)
    : [integrationId];

  const results: Record<string, { ok: boolean; message: string }> = {};

  for (const id of ids) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      results[id] = { ok: false, message: `Unknown integration: ${id} (not present in the canonical registry)` };
      continue;
    }
    const handler = handlerForRegistryEntry(repoRoot, entry);
    if (!handler) {
      results[id] = { ok: false, message: `No install handler for ${id} (install.type=${String(entry.install?.type)})` };
      continue;
    }

    const dir = resolveIntegrationManifestDir(repoRoot, id);
    try {
      if (action === "disable" && entry.kind === "mcp") {
        results[id] = await mutateNativeMcpRegistration(repoRoot, id, false);
      } else if (handlerAction === "install") {
        results[id] = await handler.install(dir);
        if (results[id].ok && entry.kind === "mcp") {
          results[id] = await mutateNativeMcpRegistration(repoRoot, id, true);
        }
      } else if (handlerAction === "verify") {
        results[id] = await handler.verify(dir);
        if (results[id].ok && entry.kind === "mcp") {
          const inspections = await Promise.all(ALL_MCP_HOSTS.map((host) => inspectHostMcpRegistration(repoRoot, host)));
          const observed = inspections.flatMap((inspection) => inspection.entries.filter((candidate) => candidate.id === id));
          if (observed.some((candidate) => candidate.status === "MCP_MISSING" || candidate.status === "MCP_NEEDS_USER")) {
            results[id] = { ok: false, message: `provider verifies but native registration is incomplete: ${observed.map((candidate) => candidate.status).join(", ")}` };
          }
        }
      } else {
        results[id] = { ok: false, message: `disable is only supported for MCP registration; ${id} is not an MCP provider` };
      }
    } catch (error) {
      results[id] = { ok: false, message: (error as Error).message };
    }
  }

  const allOk = Object.values(results).every((r) => r.ok);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Integration ${action} results:`);
    for (const [id, r] of Object.entries(results)) {
      const icon = r.ok ? "✓" : "✗";
      console.log(`  ${icon} ${id}: ${r.message}`);
    }
  }

  return {
    exitCode: allOk ? ExitCode.Success : ExitCode.GeneralError,
    message: allOk
      ? `${ids.length} integration(s) ${action} OK`
      : `Some integrations failed ${action}`,
    data: results,
  };
}
