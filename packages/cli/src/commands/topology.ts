import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import {
  compileTopology,
  topologyHash,
  verifyLayers,
  type TopologyEvidence,
} from "@initforge/agent-rules-engine/topology-compiler";

function resolveTopologyPath(given?: string): string {
  if (given) return path.resolve(given);
  const plans = path.join(process.cwd(), ".agent", "plans");
  if (fs.existsSync(plans)) {
    const dirs = fs.readdirSync(plans).map((d) => path.join(plans, d));
    for (const dir of dirs.reverse()) {
      const p = path.join(dir, "system-topology.yaml");
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("system-topology.yaml not found; pass an explicit path");
}

/**
 * topology <compile|verify> [path] [--evidence <evidence.json>]
 *
 * compile: parse + validate the topology, fill honest GAP markers, print hash.
 * verify:  run the full layered verification chain (AM-0019 §8). A required
 *          topology gate never PASSes via SKIPPED — it stays WAITING_EXTERNAL.
 */
export async function topologyCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const sub = (args[0] ?? "verify").toLowerCase();
  try {
    if (sub === "compile") {
      const file = resolveTopologyPath(args[1]);
      const compiled = compileTopology(fs.readFileSync(file, "utf8"));
      return {
        exitCode: compiled.valid ? ExitCode.Success : ExitCode.GeneralError,
        message: `topology compile: ${compiled.valid ? "valid" : "invalid"} (${file})`,
        data: {
          file,
          valid: compiled.valid,
          errors: compiled.errors,
          warnings: compiled.warnings,
          topologyHash: topologyHash(compiled.topology),
        },
      };
    }
    if (sub === "verify") {
      const file = resolveTopologyPath(args[1]);
      const compiled = compileTopology(fs.readFileSync(file, "utf8"));
      let evidence: TopologyEvidence[] = [];
      const evIdx = args.indexOf("--evidence");
      if (evIdx !== -1 && args[evIdx + 1]) {
        const raw = JSON.parse(fs.readFileSync(path.resolve(args[evIdx + 1]), "utf8")) as unknown;
        evidence = (Array.isArray(raw) ? raw : [raw]) as TopologyEvidence[];
      }
      const layered = verifyLayers(compiled.topology, evidence);
      return {
        exitCode: layered.verdict === "FAIL" ? ExitCode.GeneralError : ExitCode.Success,
        message: `topology verify: ${layered.verdict} (${file})`,
        data: {
          file,
          valid: compiled.valid,
          errors: compiled.errors,
          warnings: compiled.warnings,
          topologyHash: layered.topologyHash,
          verdict: layered.verdict,
          layers: layered.layers,
          crossLayer: layered.crossLayer,
          requiredGate: layered.requiredGate,
        },
      };
    }
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Unknown topology subcommand: compile | verify",
    };
  } catch (err) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `topology failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
