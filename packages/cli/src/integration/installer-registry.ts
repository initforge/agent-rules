import fs from "node:fs";
import path from "node:path";
import { binaryInstall, binaryUninstall, binaryVerify } from "./handlers/binary.js";
import { npmInstall, npmUninstall, npmVerify } from "./handlers/npm.js";
import { shellInstall, shellUninstall, shellVerify } from "./handlers/shell.js";

export interface IntegrationHandler {
  install(manifestDir: string): Promise<{ ok: boolean; message: string }>;
  verify(manifestDir: string): Promise<{ ok: boolean; message: string }>;
  uninstall(manifestDir: string): Promise<{ ok: boolean; message: string }>;
}

function npmHandler(packageName: string, extraArgs?: string[]): IntegrationHandler {
  return {
    install: async (dir) => {
      const manifest = await readManifest(dir);
      const pkg = (manifest as Record<string, unknown>).npmPackage ?? (manifest as Record<string, unknown>).package ?? packageName;
      const version = (manifest as Record<string, unknown>).version;
      return npmInstall({
        packageName: pkg as string,
        version: typeof version === "string" ? version : undefined,
        extraArgs,
      });
    },
    verify: async (dir) => {
      const manifest = await readManifest(dir);
      const pkg = (manifest as Record<string, unknown>).npmPackage ?? (manifest as Record<string, unknown>).package ?? packageName;
      const version = (manifest as Record<string, unknown>).version;
      return npmVerify(pkg as string, typeof version === "string" ? version : undefined);
    },
    uninstall: () => npmUninstall(packageName),
  };
}

function binaryHandler(): IntegrationHandler {
  return {
    install: (dir) => binaryInstall(path.join(dir, "manifest.json")),
    verify: (dir) => binaryVerify(path.join(dir, "manifest.json")),
    uninstall: (dir) => binaryUninstall(path.join(dir, "manifest.json")),
  };
}

function shellHandler(command: string, verifyCommand: string, installUrl?: string): IntegrationHandler {
  return {
    install: () => shellInstall({ command, verifyCommand, installUrl }),
    verify: () => shellVerify(verifyCommand),
    uninstall: () => shellUninstall(command),
  };
}

const HANDLERS: Record<string, IntegrationHandler> = {
  "codebase-memory-mcp": binaryHandler(),
  "playwright-cli": npmHandler("@playwright/cli"),
  "playwright-mcp": npmHandler("@playwright/mcp"),
  "chrome-devtools-mcp": npmHandler("chrome-devtools-mcp"),
  "context7": npmHandler("@upstash/context7-mcp"),
  "rtk": shellHandler("rtk --version", "rtk --version", "https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh"),
  // Pencil is explicit-only: safe user-space install with official-link
  // fallback; never persist /tmp/.mount_* paths (REQ-012 / AC-012).
  "pencil-mcp": shellHandler(
    "bash integrations/optional/pencil-mcp/install.sh",
    "bash integrations/optional/pencil-mcp/verify.sh",
    "https://docs.pencil.dev/getting-started/installation",
  ),
};

export function getHandler(integrationId: string): IntegrationHandler | undefined {
  return HANDLERS[integrationId];
}

export function registerHandler(integrationId: string, handler: IntegrationHandler): void {
  HANDLERS[integrationId] = handler;
}

export function listRegistrations(): string[] {
  return Object.keys(HANDLERS);
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

async function readManifest(dir: string): Promise<Record<string, unknown>> {
  const fs = await import("node:fs/promises");
  const manifestPath = path.join(dir, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}
