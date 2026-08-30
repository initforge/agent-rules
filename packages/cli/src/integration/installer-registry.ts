import fs from "node:fs";
import path from "node:path";
import { binaryInstall, binaryUninstall, binaryVerify } from "./handlers/binary.js";
import { npmInstall, npmUninstall, npmVerify } from "./handlers/npm.js";
import { shellInstall, shellUninstall, shellVerify } from "./handlers/shell.js";
import { detectPlatform, defaultNpmInstallDir, resolveInstallDir } from "./platform-detect.js";
import type { RegistryEntry } from "./inventory.js";

/** Result every platform-specific handler produces. `status` classifies a
 *  failure (UNSUPPORTED when the host cannot provide the seam, NEEDS_USER
 *  when owner action is required); absence of `status` means BLOCKED. */
export interface HandlerResult {
  ok: boolean;
  message: string;
  status?: "BLOCKED" | "UNSUPPORTED" | "NEEDS_USER" | "PARTIAL";
  version?: string;
  location?: string;
}

export interface IntegrationHandler {
  install(manifestDir: string): Promise<HandlerResult>;
  verify(manifestDir: string): Promise<HandlerResult>;
  uninstall(manifestDir: string): Promise<HandlerResult>;
}

async function readManifest(dir: string): Promise<Record<string, unknown>> {
  const manifestPath = path.join(dir, "manifest.json");
  const raw = await import("node:fs/promises").then((fs) => fs.readFile(manifestPath, "utf8"));
  return JSON.parse(raw);
}

/**
 * The registry is the only source of integration ids; handlers are derived
 * from each registry entry's `install.type` plus its per-integration manifest.
 * No module may append hard-coded provider ids outside `integrations/registry.json`.
 */
export function handlerForRegistryEntry(repoRoot: string, entry: RegistryEntry): IntegrationHandler | undefined {
  const override = HANDLER_OVERRIDES.get(entry.id);
  if (override) return override;
  const type = entry.install?.type;
  switch (type) {
    case "binary":
      return binaryHandler();
    case "npm-npx":
    case "npm-global":
      return npmHandler(entry);
    case "shell":
      return shellHandler(repoRoot, entry);
    case "builtin":
      return builtinHandler(repoRoot, entry);
    default:
      // Unknown/missing install type fails closed upstream (never silently skipped).
      return undefined;
  }
}

function builtinHandler(repoRoot: string, entry: RegistryEntry): IntegrationHandler {
  const relative = entry.install?.script;
  const verify = async (): Promise<HandlerResult> => {
    if (!relative) return { ok: false, status: 'BLOCKED', message: `${entry.id}: builtin asset is not declared` };
    const asset = path.resolve(repoRoot, relative);
    if (!asset.startsWith(`${path.resolve(repoRoot)}${path.sep}`) || !fs.existsSync(asset) || !fs.statSync(asset).isFile()) {
      return { ok: false, status: 'BLOCKED', message: `${entry.id}: builtin asset missing: ${asset}` };
    }
    return { ok: true, message: `package-owned launcher available`, location: asset, version: entry.source?.version };
  };
  return {
    install: async () => verify(),
    verify: async () => verify(),
    uninstall: async () => ({ ok: true, message: 'package-owned launcher remains with the installed agent-rules package' }),
  };
}

function binaryHandler(): IntegrationHandler {
  return {
    install: (dir) => binaryInstall(path.join(dir, "manifest.json")),
    verify: (dir) => binaryVerify(path.join(dir, "manifest.json")),
    uninstall: (dir) => binaryUninstall(path.join(dir, "manifest.json")),
  };
}

function npmHandler(entry: RegistryEntry): IntegrationHandler {
  const fallback = {
    commandName: entry.source?.commandName,
    version: entry.source?.version,
    packageName: entry.source?.package,
  };
  return {
    install: async (dir) => {
      const manifest = await readManifest(dir);
      const info = detectPlatform();
      const installDir = resolveInstallDir(manifest.installDirs as Record<string, string> | undefined, info)
        ?? defaultNpmInstallDir(entry.id, info);
      return npmInstall({
        packageName: (manifest.npmPackage ?? manifest.package ?? fallback.packageName) as string,
        version: typeof manifest.version === "string" ? manifest.version : fallback.version,
        commandName: typeof manifest.commandName === "string" ? manifest.commandName : fallback.commandName,
        installDir,
      });
    },
    verify: async (dir) => {
      const manifest = await readManifest(dir);
      const info = detectPlatform();
      const installDir = resolveInstallDir(manifest.installDirs as Record<string, string> | undefined, info)
        ?? defaultNpmInstallDir(entry.id, info);
      return npmVerify({
        packageName: (manifest.npmPackage ?? manifest.package ?? fallback.packageName) as string,
        version: typeof manifest.version === "string" ? manifest.version : fallback.version,
        commandName: typeof manifest.commandName === "string" ? manifest.commandName : fallback.commandName,
        installDir,
      });
    },
    uninstall: async (dir) => {
      const manifest = await readManifest(dir);
      const info = detectPlatform();
      const installDir = resolveInstallDir(manifest.installDirs as Record<string, string> | undefined, info)
        ?? defaultNpmInstallDir(entry.id, info);
      return npmUninstall({
        packageName: (manifest.npmPackage ?? manifest.package ?? fallback.packageName) as string,
        installDir,
      });
    },
  };
}

/** Pick the interpreter by script extension so scripts run through argv. */
function scriptArgv(repoRoot: string, repoRelativePath: string): string[] {
  const abs = path.resolve(repoRoot, repoRelativePath);
  if (repoRelativePath.endsWith(".sh")) return ["bash", abs];
  if (repoRelativePath.endsWith(".mjs") || repoRelativePath.endsWith(".js")) return ["node", abs];
  if (repoRelativePath.endsWith(".ps1")) return process.platform === "win32" ? ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", abs] : ["pwsh", "-NoProfile", "-File", abs];
  return ["bash", abs];
}

function shellHandler(repoRoot: string, entry: RegistryEntry): IntegrationHandler {
  const script = entry.install?.script;
  const verify = entry.install?.verify;
  const uninstall = entry.install?.uninstall;
  return {
    install: async () => {
      if (!script) return { ok: false, status: "UNSUPPORTED", message: `${entry.id}: registry install has no script` };
      return shellInstall({ command: scriptArgv(repoRoot, script), verifyCommand: [], uninstallCommand: [] });
    },
    verify: async () => {
      if (!verify) return { ok: false, status: "UNSUPPORTED", message: `${entry.id}: registry install has no verify script` };
      return shellVerify(scriptArgv(repoRoot, verify));
    },
    uninstall: async () => {
      if (!uninstall) return { ok: false, status: "UNSUPPORTED", message: `${entry.id}: registry install has no uninstall script` };
      return shellUninstall(scriptArgv(repoRoot, uninstall));
    },
  };
}

/**
 * Resolve the checked-in provider manifest without treating the storage bucket
 * as policy. Providers currently live under recommended/ or optional/; a
 * future required provider should work without changing the control plane.
 */
export function resolveIntegrationManifestDir(repoRoot: string, integrationId: string): string {
  for (const bucket of ["required", "recommended", "optional"]) {
    const dir = path.join(repoRoot, "integrations", bucket, integrationId);
    if (fs.existsSync(path.join(dir, "manifest.json"))) return dir;
  }
  return path.join(repoRoot, "integrations", "recommended", integrationId);
}

/** Extension point for host-specific handler overrides (test fixtures,
 *  platform-specific host adapters). Overrides never add new provider ids to
 *  the canonical inventory; provisioning iterates the registry entries only. */
const HANDLER_OVERRIDES = new Map<string, IntegrationHandler>();

export function registerHandler(integrationId: string, handler: IntegrationHandler): void {
  HANDLER_OVERRIDES.set(integrationId, handler);
}

export function getHandlerOverride(integrationId: string): IntegrationHandler | undefined {
  return HANDLER_OVERRIDES.get(integrationId);
}

export function clearHandlerOverrides(): void {
  HANDLER_OVERRIDES.clear();
}
