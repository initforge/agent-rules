import { handlerForRegistryEntry, resolveIntegrationManifestDir } from "../integration/installer-registry.js";
import { loadIntegrationInventory } from "../integration/inventory.js";
import { getRepoRoot } from "../adapters/repo.js";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

/**
 * Public integration actions. Legacy aliases (install/verify/uninstall) were
 * removed from the public contract and are rejected explicitly below.
 */
type IntegrationAction = "list" | "enable" | "disable" | "doctor";
type IntegrationHandlerAction = "install" | "verify" | "uninstall";

const LEGACY_ALIASES: IntegrationHandlerAction[] = ["install", "verify", "uninstall"];
const PUBLIC_ACTIONS: IntegrationAction[] = ["list", "enable", "disable", "doctor"];

// Public actions share the install/verify/uninstall implementations:
// enable -> install, disable -> uninstall, doctor -> verify.
const ACTION_TO_HANDLER: Record<"enable" | "disable" | "doctor", IntegrationHandlerAction> = {
  enable: "install",
  disable: "uninstall",
  doctor: "verify",
};

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

  const handlerAction = ACTION_TO_HANDLER[action];

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
      if (handlerAction === "install") {
        results[id] = await handler.install(dir);
      } else if (handlerAction === "verify") {
        results[id] = await handler.verify(dir);
      } else {
        results[id] = await handler.uninstall(dir);
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