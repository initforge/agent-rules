import { createHash } from "node:crypto";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { compileWorkRequest } from "../services/intent-compiler.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function logicalSha(body: Record<string, unknown>, selfField: string): string {
  const rest = { ...body };
  delete rest[selfField];
  return createHash("sha256").update(JSON.stringify(canonicalize(rest))).digest("hex");
}

/**
 * Emulated OpenCode /goal compatibility command. This is optional host
 * ergonomics backed by the same canonical bundle: it validates the support
 * pack identity, reports the dependency-ready slice set, and compiles the
 * invocation into the canonical WorkRequest with `command` adapter identity.
 * It never claims native durable-goal capability.
 */
export async function goalCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const planId = args[0];
  if (!planId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: goal <plan-id> [--intent <text>]" };
  }
  const packDir = `.agent/artifacts/${planId}/support-pack`;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = process.cwd();
  const packPath = path.join(root, packDir, "pack.json");
  if (!fs.default.existsSync(packPath)) {
    return { exitCode: ExitCode.GeneralError, message: `Support pack not found for ${planId}: ${packPath} (compile the plan first)` };
  }
  try {
    const pack = JSON.parse(fs.default.readFileSync(packPath, "utf8")) as { packSha256?: string; manifest?: { manifestSha256?: string; recipes?: Array<{ taskId: string; sha256: string }>; planRevision?: number; claimIds?: string[]; requirementIds?: string[] } };
    const manifest = pack.manifest;
    if (!manifest || !pack.packSha256 || !manifest.manifestSha256) throw new Error("support pack manifest is incomplete");
    const actualPack = logicalSha(pack, "packSha256");
    const actualManifest = logicalSha(manifest as Record<string, unknown>, "manifestSha256");
    if (actualPack !== pack.packSha256) throw new Error(`support pack identity mismatch: got ${actualPack}, expected ${pack.packSha256}`);
    if (actualManifest !== manifest.manifestSha256) throw new Error(`support pack manifest identity mismatch: got ${actualManifest}, expected ${manifest.manifestSha256}`);
    const intentArg = args.indexOf("--intent");
    const intent = intentArg >= 0 ? args.slice(intentArg + 1).filter((arg) => !arg.startsWith("--")).join(" ") : `Execute goal bundle for ${planId}`;
    const receipt = compileWorkRequest({ adapter: "command", intent, planId });
    const readyTasks = (manifest.recipes ?? []).map((recipe) => ({ taskId: recipe.taskId, sha256: recipe.sha256.slice(0, 16) }));
    return {
      exitCode: ExitCode.Success,
      message: `Goal ${planId} bundle validated (EMULATED adapter)`,
      data: {
        planId,
        planRevision: manifest.planRevision,
        requirementCount: manifest.requirementIds?.length ?? 0,
        claimCount: manifest.claimIds?.length ?? 0,
        packSha256: pack.packSha256,
        manifestSha256: manifest.manifestSha256,
        capability: "EMULATED",
        readyTasks,
        workRequest: receipt,
      },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Goal ${planId} failed closed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
