import fs from "node:fs";
import path from "node:path";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { getRepoRoot } from "../adapters/repo.js";
import { platformCmd } from "./platform.js";
import { evalCmd } from "./eval.js";

function latestNorthStarState(root: string): Record<string, unknown> | null {
  const runsRoot = path.join(root, ".agent", "runs");
  if (!fs.existsSync(runsRoot)) return null;
  const states = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const file = path.join(runsRoot, entry.name, "run-state.json");
      if (!fs.existsSync(file)) return [];
      try {
        return [{ run: entry.name, mtime: fs.statSync(file).mtimeMs, state: JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown> }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.mtime - a.mtime);
  return states[0] ? { run: states[0].run, ...states[0].state } : null;
}

/**
 * Read-only harness dashboard snapshot. It deliberately emits data instead of
 * starting a long-lived web server, so the CLI remains deterministic and usable
 * in CI/headless environments. A UI can consume the JSON later without changing
 * the underlying health contract.
 */
export async function dashboard(
  _args: string[],
  options: CliOptions,
): Promise<CommandResult> {
  const root = getRepoRoot();
  const quiet: CliOptions = { ...options, json: true };
  const [platforms, evals] = await Promise.all([
    platformCmd(["list"], quiet),
    evalCmd(["results"], quiet),
  ]);
  const state = latestNorthStarState(root);
  const data: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    northStar: state ?? { status: "idle" },
    platforms: platforms.data ?? { status: platforms.exitCode === ExitCode.Success ? "available" : "error" },
    evaluations: evals.data ?? { status: evals.exitCode === ExitCode.Success ? "available" : "error" },
  };

  if (!options.json) {
    console.log("Agent Rules dashboard snapshot");
    console.log(`  North-Star: ${String((state?.status as string | undefined) ?? "idle")}`);
    const platformCount = Array.isArray((platforms.data as { platforms?: unknown[] } | undefined)?.platforms)
      ? (platforms.data as { platforms: unknown[] }).platforms.length
      : 0;
    console.log(`  Platforms: ${platformCount}`);
    console.log(`  Eval results: ${String((evals.data as { liveRecords?: number } | undefined)?.liveRecords ?? 0)} live record(s)`);
  }

  return {
    exitCode: platforms.exitCode === ExitCode.Success && evals.exitCode === ExitCode.Success ? ExitCode.Success : ExitCode.GeneralError,
    message: "Harness dashboard snapshot",
    data,
  };
}
