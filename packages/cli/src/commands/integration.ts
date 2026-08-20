import { getHandler, listRegistrations, resolveIntegrationManifestDir } from "../integration/installer-registry.js";
import { getRepoRoot } from "../adapters/repo.js";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

type IntegrationAction = "install" | "verify" | "uninstall";

export async function integrationCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const action = args[0] as IntegrationAction | undefined;
  const integrationId = args[1];

  if (!action || !["install", "verify", "uninstall"].includes(action)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: integration <install|verify|uninstall> [integration-id|all]",
    };
  }

  const repoRoot = getRepoRoot();

  const ids = integrationId === "all" || !integrationId
    ? listRegistrations()
    : [integrationId];

  const results: Record<string, { ok: boolean; message: string }> = {};

  for (const id of ids) {
    const handler = getHandler(id);
    if (!handler) {
      results[id] = { ok: false, message: `Unknown integration: ${id}` };
      continue;
    }

    const dir = resolveIntegrationManifestDir(repoRoot, id);
    try {
      if (action === "install") {
        results[id] = await handler.install(dir);
      } else if (action === "verify") {
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
