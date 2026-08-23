import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ExitCode, type CliOptions, type CommandResult } from "../types.js";
import {
  runHostCanary,
  REGISTRY_HOSTS,
  type HostProbeResult,
} from "@initforge/agent-rules-kernel";
import type { HostId } from "@initforge/agent-rules-kernel";

const PROBE_COMMANDS: Partial<Record<HostId, { binary: string; args: string[] }>> = {
  codex: { binary: "codex", args: ["--version"] },
  claude: { binary: "claude", args: ["--version"] },
  opencode: { binary: "opencode", args: ["--version"] },
  cursor: { binary: "cursor", args: ["--version"] },
  antigravity: { binary: "antigravity", args: ["--version"] },
  grok: { binary: "grok", args: ["--version"] },
  "deepseek-harness": { binary: "dsh", args: ["--version"] },
  "command-code": { binary: "command-code", args: ["--version"] },
};

function probeBinary(host: HostId): HostProbeResult | undefined {
  const spec = PROBE_COMMANDS[host];
  if (!spec) return undefined;
  let resolved: string | null = null;
  try {
    const where = execFileSync(process.platform === "win32" ? "where" : "which", [spec.binary], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
    resolved = where.split("\n")[0]?.trim() || null;
  } catch {
    resolved = null;
  }
  // npm global shims resolve to .cmd/.ps1 on Windows; prefer the .cmd launcher
  // which execFileSync can run directly.
  if (resolved && process.platform === "win32" && fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const cmdShim = path.join(resolved, `${spec.binary}.cmd`);
      resolved = fs.existsSync(cmdShim) ? cmdShim : null;
    } else if (!/\.(cmd|exe|bat|ps1)$/i.test(resolved)) {
      const sibling = path.join(path.dirname(resolved), `${spec.binary}.cmd`);
      if (fs.existsSync(sibling)) resolved = sibling;
    }
  }
  if (!resolved) return { ok: false, error: `${spec.binary} not found on PATH` };
  try {
    const isCmdOrBat = process.platform === "win32" && (resolved.endsWith(".cmd") || resolved.endsWith(".bat"));
    const actualCmd = isCmdOrBat ? (process.env.ComSpec || "cmd.exe") : resolved;
    const actualArgs = isCmdOrBat ? ["/d", "/s", "/c", resolved, ...spec.args] : spec.args;
    const out = execFileSync(actualCmd, actualArgs, { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"], shell: false, windowsHide: true });
    const version = out.trim().split("\n")[0] || undefined;
    // A successful version probe confirms the binary runs; capability-specific
    // confirmation is supplied by the caller or defaults to STATIC_CONFORMED.
    return { ok: true, binary_path: resolved, version };
  } catch (error) {
    return { ok: false, error: `probe failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * `agent-rules host-canary <host>` — run the per-host capability certification
 * canary (REQ-011/REQ-018). LIVE_CERTIFIED only from a live probe; absent
 * binaries are NOT_LIVE_VERIFIED, never fake green.
 */
export async function hostCanaryCmd(args: string[], _opts: CliOptions): Promise<CommandResult> {
  const root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const host = positional[0] as HostId | undefined;
  if (!host) {
    return { exitCode: ExitCode.InvalidArgument, message: `Usage: host-canary <host> (one of: ${REGISTRY_HOSTS.join(", ")})` };
  }
  if (!(REGISTRY_HOSTS as readonly string[]).includes(host)) {
    return { exitCode: ExitCode.InvalidArgument, message: `unknown host ${host}; expected one of ${REGISTRY_HOSTS.join(", ")}` };
  }
  try {
    const probe = probeBinary(host);
    const result = runHostCanary({ repoRoot: root, host, probe });
    return {
      exitCode: ExitCode.Success,
      message: `${host}: ${result.state} (probe=${probe ? (probe.ok ? "OK" : "FAILED") : "none"})`,
      data: { host, state: result.state, capability_fingerprint: result.facts.capability_fingerprint, probe: probe ?? null, certifications: result.certifications },
    };
  } catch (error) {
    return { exitCode: ExitCode.GeneralError, message: `host-canary failed closed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
