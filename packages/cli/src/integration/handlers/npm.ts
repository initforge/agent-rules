import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { HandlerResult } from "../installer-registry.js";

const execFileAsync = promisify(execFile);

// Node's execFile neither applies PowerShell command discovery nor reliably
// launches a .cmd shim. Use npm's JavaScript entrypoint under the running Node
// installation on Windows; argv stays data, never shell text.
function npmInvocation(args: string[]): { file: string; args: string[] } {
  if (process.platform !== "win32") return { file: "npm", args };
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return { file: process.execPath, args: [cli, ...args] };
}

async function runInstalledBinary(file: string, args: string[]): Promise<{ stdout: string }> {
  if (process.platform !== "win32" || !file.toLowerCase().endsWith(".cmd")) {
    return execFileAsync(file, args, { timeout: 30_000 });
  }
  // `file` is derived from the managed install directory and a registry
  // commandName. It is not a user prompt; reject anything outside the normal
  // executable-name vocabulary before passing it to cmd's required /c form.
  if (!/^[\w .:\\/-]+\.cmd$/i.test(file) || !args.every((arg) => /^[\w.=:@/-]+$/.test(arg))) {
    throw new Error("unsafe managed npm binary invocation");
  }
  return execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/c", file, ...args], { timeout: 30_000 });
}

export interface NpmInstallOptions {
  packageName: string;
  version?: string;
  commandName?: string;
  installDir?: string;
}

/**
 * npm/npx policy:
 *
 * `npx -y pkg@ver` only populates a transient npx cache and can never count
 * as a full install. A full install requires:
 *   - a pinned version (never `@latest`);
 *   - a durable, managed, user-level installation surface;
 *   - a verifiable binary at that surface;
 *   - an argv-safe spawn (no shell interpolation, no global shell=true).
 *
 * We satisfy this by `npm install --prefix <managed-dir> <pkg>@<pin>` into the
 * integration manifest's declared install directory, then verifying the pinned
 * binary. Re-running is idempotent and independent of MCP activation.
 */

function binFile(commandName: string): string {
  return process.platform === "win32" ? `${commandName}.cmd` : commandName;
}

async function binaryPath(installDir: string, commandName: string): Promise<string | undefined> {
  const candidates = [
    path.join(installDir, "node_modules", ".bin", binFile(commandName)),
    path.join(installDir, "node_modules", ".bin", commandName),
    path.join(installDir, commandName),
  ];
  for (const candidate of candidates) {
    if (await fs.stat(candidate).then(() => true).catch(() => false)) return candidate;
  }
  return undefined;
}

export async function npmInstall(options: NpmInstallOptions): Promise<HandlerResult> {
  const { packageName, version, installDir } = options;
  if (!packageName) return { ok: false, status: "BLOCKED", message: "npm install requires a package name" };
  if (!version) return { ok: false, status: "BLOCKED", message: `npm install requires a pinned version for ${packageName}; @latest is never a full install` };
  if (!installDir) return { ok: false, status: "BLOCKED", message: `npm install requires a managed install directory for ${packageName}` };
  const spec = `${packageName}@${version}`;
  try {
    await fs.mkdir(installDir, { recursive: true });
    const invocation = npmInvocation(["install", "--prefix", installDir, "--no-save", "--no-package-lock", "--no-audit", "--no-fund", spec]);
    await execFileAsync(invocation.file, invocation.args, { timeout: 300_000 });
    if (options.commandName && !(await binaryPath(installDir, options.commandName))) {
      return { ok: false, status: "PARTIAL", message: `npm install of ${spec} completed but managed binary for ${options.commandName} was not found`, location: installDir, version };
    }
    return { ok: true, message: `installed ${spec} at managed surface ${installDir}`, location: installDir, version };
  } catch (error) {
    return { ok: false, status: "BLOCKED", message: `npm install failed for ${spec}: ${(error as Error).message}` };
  }
}

export async function npmVerify(options: NpmInstallOptions): Promise<HandlerResult> {
  const { packageName, version, commandName, installDir } = options;
  if (!commandName || !installDir) {
    return { ok: false, status: "BLOCKED", message: "npm verify requires commandName and installDir" };
  }
  const bin = await binaryPath(installDir, commandName);
  if (!bin) return { ok: false, message: `missing managed binary ${commandName} at ${installDir}` };
  try {
    const { stdout } = await runInstalledBinary(bin, ["--version"]);
    const actual = stdout.trim();
    if (version && !actual.includes(version)) {
      return { ok: false, status: "PARTIAL", message: `version mismatch: expected ${packageName}@${version}, got ${actual}`, location: installDir, version: actual };
    }
    return { ok: true, message: `${packageName} PASS ${actual}`, location: installDir, version: actual };
  } catch (error) {
    return { ok: false, status: "PARTIAL", message: `${packageName} verify failed: ${(error as Error).message}`, location: installDir };
  }
}

export async function npmUninstall(options: NpmInstallOptions): Promise<HandlerResult> {
  const { packageName, installDir } = options;
  if (!packageName || !installDir) return { ok: false, status: "BLOCKED", message: "npm uninstall requires packageName and installDir" };
  if (!(await fs.stat(installDir).then(() => true).catch(() => false))) {
    return { ok: true, message: `not installed: ${installDir}` };
  }
  try {
    const invocation = npmInvocation(["uninstall", "--prefix", installDir, "--no-save", packageName]);
    await execFileAsync(invocation.file, invocation.args, { timeout: 120_000 });
    return { ok: true, message: `uninstalled ${packageName} from ${installDir}` };
  } catch (error) {
    return { ok: false, status: "NEEDS_USER", message: `npm uninstall failed for ${packageName}: ${(error as Error).message}` };
  }
}
