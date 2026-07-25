import { ExitCode, type CommandResult, type CliOptions } from "../types.js";

/**
 * Dashboard: stub — not yet implemented.
 * Future: serve a web dashboard for harness health, benchmarks, and evaluations.
 */
export async function dashboard(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const data: Record<string, unknown> = {
    status: "not-implemented",
    port: undefined,
    pid: undefined,
  };

  if (!options.json) {
    console.log("Dashboard is not yet implemented.");
    console.log("");
    console.log("Future capabilities:");
    console.log("  - Harness health overview");
    console.log("  - Benchmark result visualization");
    console.log("  - Evaluation timeline");
    console.log("  - Platform status");
    console.log("");
    console.log("For now, use other CLI commands to inspect state:");
    console.log("  agent-rules doctor    — health checks");
    console.log("  agent-rules platform  — platform info");
    console.log("  agent-rules eval results — benchmark results");
  }

  return {
    exitCode: ExitCode.NotImplemented,
    message: "Dashboard not yet implemented",
    data,
  };
}
