import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import {
  compileAdversarial,
  runProbes,
  assertNegativeProbeOrDeterministicProof,
  type PlanInvariantProfile,
  type ClaimDef,
  type ProbeSubject,
  type Counterexample,
} from "@initforge/agent-rules-engine/adversarial-compiler";
import { compileTopology, type SystemTopology } from "@initforge/agent-rules-engine/topology-compiler";

const EMPTY_TOPOLOGY = `
services:
  - id: svc
    kind: process
    status: EXISTS
`;

/** Data shape for --subject: JSON cannot carry functions, so map it here. */
interface SubjectSpec {
  readonly id: string;
  /** Probe surfaces (domain or surface key) present on the implementation. */
  readonly surfaces: string[];
  /** Probe ids rejected as expected; use "all" to reject every probe. */
  readonly rejects: string[] | 'all';
}

function subjectFromSpec(spec: SubjectSpec): ProbeSubject {
  return {
    id: spec.id,
    hasSurface: (probe: Counterexample) =>
      spec.surfaces.includes(probe.domain) || spec.surfaces.includes(probe.surface),
    execute: (probe: Counterexample) =>
      spec.rejects === 'all' || spec.rejects.includes(probe.probe_id)
        ? { rejected: true, observed: `rejected ${probe.probe_id}` }
        : { rejected: false, observed: `accepted ${probe.probe_id}` },
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function resolveTopology(topologyArg?: string): SystemTopology {
  if (topologyArg) {
    return compileTopology(fs.readFileSync(path.resolve(topologyArg), "utf8")).topology;
  }
  return compileTopology(EMPTY_TOPOLOGY).topology;
}

/**
 * adversarial <compile|run> <plan.json> [--claims <claims.json>] [--topology <yaml>] [--subject <subject.json>]
 *
 * compile: compile negative probes from plan invariants + topology + claim
 *          scope (AM-0020 §7). Fails when a plan-required domain generator is empty.
 * run:     compile, then gate every claim (T2/T3 need a negative probe or a
 *          recorded deterministic proof) and optionally execute probes against
 *          a subject; any FAIL or rejected claim fails the run.
 */
export async function adversarialCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const sub = (args[0] ?? "compile").toLowerCase();
  if (sub !== "compile" && sub !== "run") {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Unknown adversarial subcommand: compile | run",
    };
  }
  const planFile = args[1];
  if (!planFile) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Usage: adversarial ${sub} <plan.json> [--claims <claims.json>] [--topology <yaml>] [--subject <subject.json>]`,
    };
  }
  try {
    const plan = readJson<PlanInvariantProfile>(path.resolve(planFile));
    const topoIdx = args.indexOf("--topology");
    const topology = resolveTopology(topoIdx !== -1 ? args[topoIdx + 1] : undefined);
    const claimsIdx = args.indexOf("--claims");
    const claims = claimsIdx !== -1 && args[claimsIdx + 1]
      ? readJson<ClaimDef[]>(path.resolve(args[claimsIdx + 1]))
      : [];
    const compiled = compileAdversarial(plan, topology, claims);

    const base: Record<string, unknown> = {
      plan_id: plan.plan_id,
      probes: compiled.probes.length,
      coverage: compiled.coverage,
      empty_required_domains: compiled.empty_required_domains,
      claims_gated: [],
      probe_results: [],
    };
    const reasons: string[] = [];
    let exitCode = compiled.empty_required_domains.length > 0 ? ExitCode.GeneralError : ExitCode.Success;
    if (compiled.empty_required_domains.length > 0) {
      reasons.push(`empty probe generators for plan-required domains: ${compiled.empty_required_domains.join(', ')}`);
    }

    if (sub === "run") {
      for (const claim of claims) {
        const gate = assertNegativeProbeOrDeterministicProof(claim, compiled.probes);
        (base.claims_gated as unknown[]).push(gate);
        if (!gate.accepted) {
          reasons.push(gate.reason);
          exitCode = ExitCode.GeneralError;
        }
      }
      const subjectIdx = args.indexOf("--subject");
      if (subjectIdx !== -1 && args[subjectIdx + 1]) {
        const subject = subjectFromSpec(readJson<SubjectSpec>(path.resolve(args[subjectIdx + 1])));
        const results = runProbes(compiled.probes, subject);
        base.probe_results = results;
        const failed = results.filter((r) => r.outcome === "FAIL");
        if (failed.length > 0) {
          reasons.push(`${failed.length} probe(s) accepted by subject ${subject.id} — false-green detected`);
          exitCode = ExitCode.GeneralError;
        }
      }
    }

    return {
      exitCode,
      message: reasons.length > 0
        ? `adversarial ${sub}: ${reasons.join('; ')}`
        : `adversarial ${sub}: ${compiled.probes.length} probes across ${Object.values(compiled.coverage).filter((n) => n > 0).length} domain(s)`,
      data: base,
    };
  } catch (err) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `adversarial failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
