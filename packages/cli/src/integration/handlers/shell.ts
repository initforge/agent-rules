import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HandlerResult } from "../installer-registry.js";

const execFileAsync = promisify(execFile);

export interface ShellInstallOptions {
  /** argv for the install script (interpreter + script path + args). */
  command: string[];
  /** argv for the verification script/probe. */
  verifyCommand: string[];
  /** argv for the uninstall script. */
  uninstallCommand: string[];
}

/**
 * Shell provisioning policy:
 *   - scripts run through `execFile` argv (no string interpolation, no
 *     `curl | sh`, no global shell=true); on Windows the same argv boundary
 *     is preserved (bash/node/powershell are explicit interpreters);
 *   - a missing interpreter is UNSUPPORTED on this host, never a silent skip;
 *   - an exit 0 is required; stdout/stderr alone never proves PASS;
 *   - uninstall is never a pretend no-op: it either runs the script or
 *     reports an honest UNSUPPORTED/BLOCKED state.
 */

async function run(argv: string[], timeoutMs: number): Promise<{ ok: boolean; message: string; status?: HandlerResult["status"] }> {
  try {
    const { stdout } = await execFileAsync(argv[0], argv.slice(1), { timeout: timeoutMs });
    return { ok: true, message: stdout.trim() };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === "ENOENT") {
      return { ok: false, status: "UNSUPPORTED", message: `required executable not found on this host: ${argv[0]}` };
    }
    const detail = (err.stderr ?? err.stdout ?? err.message ?? String(error)).toString().trim();
    return { ok: false, message: detail || (error as Error).message };
  }
}

function classify(message: string): HandlerResult["status"] | undefined {
  // Missing prerequisite (python/uv/git/interpreter/…): the owner can act,
  // so NEEDS_USER. Everything else is BLOCKED until diagnosed by the caller.
  return /(required|missing|not installed|not found|no such file or directory|prerequisite|install .* first)/i.test(message) ? "NEEDS_USER" : "BLOCKED";
}

export async function shellInstall(options: ShellInstallOptions): Promise<HandlerResult> {
  const result = await run(options.command, 300_000);
  if (result.ok) return { ok: true, message: `installed via ${options.command[0]} ${options.command.slice(1).join(" ")}` };
  return { ok: false, status: result.status ?? classify(result.message), message: `install failed: ${result.message}` };
}

export async function shellVerify(command: string[]): Promise<HandlerResult> {
  const result = await run(command, 60_000);
  if (result.ok) return { ok: true, message: `PASS ${result.message}` };
  return { ok: false, status: result.status ?? classify(result.message), message: `verify failed: ${result.message}` };
}

export async function shellUninstall(command: string[]): Promise<HandlerResult> {
  const result = await run(command, 120_000);
  if (result.ok) return { ok: true, message: "uninstalled" };
  return { ok: false, status: result.status ?? "BLOCKED", message: `uninstall failed: ${result.message}` };
}