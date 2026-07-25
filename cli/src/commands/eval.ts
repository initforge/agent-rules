import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { runScript, getRepoRoot } from "../adapters/powershell.js";
import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Eval: run benchmarks and agent quality evaluations.
 *
 * Subcommands:
 *   list         — list available benchmark suites
 *   run [suite]  — run a benchmark suite (delegated to run-live-benchmark.py)
 *   results      — show benchmark results
 *
 * Not yet migrated: delegates to Python benchmark runner.
 */
export async function evalCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0] || "list";
  const root = getRepoRoot();

  if (options.dryRun) {
    console.log(`[dry-run] Would run eval ${subcommand}`);
    return {
      exitCode: ExitCode.Success,
      message: `Dry-run: eval ${subcommand} skipped`,
    };
  }

  switch (subcommand) {
    case "list": {
      if (!options.json) {
        console.log("Available benchmark suites:");
        console.log("  agent-quality    — Agent quality benchmark (test-agent-quality-benchmark.py)");
        console.log("  live-adapter     — Live agent adapter tests (test-live-agent-adapter.py)");
        console.log("  context-router   — Context routing conformance (test-context-router.py)");
        console.log("");
        console.log("Eval is not yet migrated. Use legacy Python scripts directly:");
        console.log("  python automation/run-live-benchmark.py");
      }
      return {
        exitCode: ExitCode.NotImplemented,
        message: "Eval listing provided; run not yet migrated",
        data: { suites: ["agent-quality", "live-adapter", "context-router"] },
      };
    }

    case "run": {
      const suite = args[1] || "agent-quality";
      console.log(`Eval run is not yet migrated from legacy scripts.`);
      console.log(`Would run suite "${suite}" via Python benchmark runner.`);
      return {
        exitCode: ExitCode.NotImplemented,
        message: `Eval run not yet migrated; would invoke suite "${suite}" via Python`,
        data: { suite },
      };
    }

    case "results": {
      const resultsDir = path.join(root, ".agent", "benchmarks", "results");
      try {
        const content = await import("node:fs/promises").then((fs) =>
          fs.readFile(path.join(resultsDir, "live-results.jsonl"), "utf-8")
        );
        const lines = content.trim().split("\n").filter(Boolean);
        if (!options.json) {
          console.log(`Benchmark results: ${lines.length} result(s) found`);
          for (const line of lines.slice(-5)) {
            try {
              const entry = JSON.parse(line);
              console.log(`  ${entry.case_id}: ${entry.outcome} (${entry.platform})`);
            } catch {
              console.log(`  (unparseable line)`);
            }
          }
        }
        return {
          exitCode: ExitCode.Success,
          message: `${lines.length} benchmark result(s)`,
          data: { count: lines.length },
        };
      } catch {
      if (!options.json) {
          console.log("No benchmark results found in .agent/benchmarks/results/");
        }
        return {
          exitCode: ExitCode.Success,
          message: "No results found",
          data: { count: 0 },
        };
      }
    }

    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown eval subcommand: ${subcommand}. Use: list, run [suite], results`,
      };
  }
}
