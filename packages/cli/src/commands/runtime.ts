import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import {
  RUNTIME_PLATFORMS,
  RuntimeInstaller,
  isRuntimePlatform,
  type RuntimePlatform,
} from "../runtime/installer.js";
import { reconcileAll } from "../runtime/reconcile.js";

interface RuntimeArguments {
  platforms: RuntimePlatform[];
  root?: string;
  migrateLegacy: boolean;
}

function parseRuntimeArguments(args: string[]): RuntimeArguments | string {
  const platform = args[0] ?? "all";
  if (platform !== "all" && !isRuntimePlatform(platform)) {
    return `Invalid platform: ${platform}. Valid: ${[...RUNTIME_PLATFORMS, "all"].join(", ")}`;
  }
  let root: string | undefined;
  let migrateLegacy = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      root = args[++index];
      if (!root) return "--root requires an absolute path";
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      if (!root) return "--root requires an absolute path";
    }
    else if (arg === "--migrate-legacy") migrateLegacy = true;
    else return `Unknown runtime option: ${arg}. Supported: --root <absolute-path>, --migrate-legacy`;
  }
  if (root && platform === "all") return "--root requires a single platform target";
  if (migrateLegacy && platform === "all") return "--migrate-legacy requires a single platform target";
  if (root && !root.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(root)) return "--root must be an absolute path";
  return { platforms: platform === "all" ? [...RUNTIME_PLATFORMS] : [platform], root, migrateLegacy };
}

async function runLifecycle(
  operation: "install" | "update" | "rollback" | "reinstall" | "uninstall" | "recover",
  args: string[],
  opts: CliOptions,
): Promise<CommandResult> {
  const parsed = parseRuntimeArguments(args);
  if (typeof parsed === "string") return { exitCode: ExitCode.InvalidArgument, message: parsed };
  if (parsed.migrateLegacy && operation !== "install" && operation !== "update") {
    return { exitCode: ExitCode.InvalidArgument, message: "--migrate-legacy is supported only for runtime install or update" };
  }
  const roots = parsed.root ? { [parsed.platforms[0]]: parsed.root } : undefined;
  const installer = new RuntimeInstaller({ repositoryRoot: getRepoRoot(), platformRoots: roots, dryRun: opts.dryRun });
  try {
    const results = [];
    for (const platform of parsed.platforms) {
      if (parsed.migrateLegacy) results.push(await installer.migrateLegacy(platform));
      else if (operation === "install") results.push(await installer.install(platform));
      else if (operation === "update") results.push(await installer.install(platform, "update"));
      else if (operation === "rollback") results.push(await installer.rollback(platform));
      else if (operation === "reinstall") results.push(await installer.install(platform, "update"));
      else if (operation === "recover") results.push(await installer.recover(platform));
      else results.push(await installer.uninstall(platform));
    }
    return {
      exitCode: ExitCode.Success,
      message: opts.dryRun ? `Dry-run: runtime ${operation} validated` : `Runtime ${operation} completed`,
      data: { operation, platforms: parsed.platforms, results },
    };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: `Runtime ${operation} failed: ${(error as Error).message}` };
  }
}

export async function runtimeInstall(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  return runLifecycle("install", args, opts);
}

export async function runtimeUpdate(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  return runLifecycle("update", args, opts);
}

export async function runtimeRollback(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  return runLifecycle("rollback", args, opts);
}

export async function runtimeUninstall(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  return runLifecycle("uninstall", args, opts);
}

export async function runtimeReconcile(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const installedOnly = args.includes("--installed-only");
  const reportOnly = args.includes("--report-only") || opts.dryRun;
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const target = positional[0] ?? "all";
  if (target !== "all" && !isRuntimePlatform(target)) {
    return { exitCode: ExitCode.InvalidArgument, message: `Invalid host: ${target}. Valid: all, ${RUNTIME_PLATFORMS.join(", ")}` };
  }
  try {
    const hosts = target === "all" ? [...RUNTIME_PLATFORMS] : [target as RuntimePlatform];
    const result = await reconcileAll({ installedOnly, reportOnly, root: getRepoRoot() });
    const requested = result.reconciled.filter((item) => hosts.includes(item.host as RuntimePlatform));
    // REQ-011: reconcile exit code reflects MCP BLOCKED/NEEDS_USER state on
    // the profile-scoped gating surface (explicit-only/optional entries the
    // operator never selected cannot poison it). The full inventory is still
    // reported as providerProvisioning.
    const gating = result.providerGating;
    const mcpsBlocked = gating.status === "BLOCKED" || gating.status === "NEEDS_USER" || !gating.success;
    return {
      exitCode: mcpsBlocked ? ExitCode.LegacyFailed : ExitCode.Success,
      message: `Runtime reconcile: ${requested.filter((item) => item.installed).length} installed, ${requested.filter((item) => item.status === "unsupported").length} unsupported, ${requested.filter((item) => item.skipped).length} skipped (${reportOnly ? "report-only" : "repair-enabled"}); MCP gating ${gating.status} (full inventory ${result.providerProvisioning.status})${mcpsBlocked ? " — reconcile NOT green" : ""}`,
      data: {
        installedOnly,
        reportOnly,
        hosts: requested.map((item) => ({
          host: item.host,
          status: item.status,
          installed: item.installed,
          staleEvidence: item.detection.staleEvidence,
          signals: item.detection.signals.map((signal) => ({ kind: signal.kind, live: signal.live })),
          runtimeReceipt: item.inventory?.runtimeReceipt ?? null,
          drift: item.projection?.drift ?? null,
          receiptStatus: item.receipt?.status ?? null,
          mutated: item.receipt?.mutated ?? false,
        })),
        receipts: result.receipts.filter((receipt) => hosts.includes(receipt.host as RuntimePlatform)),
        mcps: result.providerProvisioning,
        mcps_gating: result.providerGating,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Runtime reconcile failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function runtimeCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();
  const rest = args.slice(1);

  switch (subcommand) {
    case "install":
      return runtimeInstall(rest, opts);
    case "update":
      return runtimeUpdate(rest, opts);
    case "rollback":
      return runtimeRollback(rest, opts);
    case "reinstall":
      return runLifecycle("reinstall", rest, opts);
    case "recover":
      return runLifecycle("recover", rest, opts);
    case "uninstall":
      return runtimeUninstall(rest, opts);
    case "reconcile":
      return runtimeReconcile(rest, opts);
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown runtime subcommand: ${subcommand}. Available: install, update, rollback, reinstall, uninstall, recover, reconcile`,
      };
  }
}
