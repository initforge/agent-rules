import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import type { ParityPair } from "@initforge/agent-rules-engine/parity-runner";

/**
 * Parity: run paired reference/target browser parity (AM-0019 §9).
 *
 * Usage:
 *   parity run <manifest.yaml|json> [--reference-url <url>] [--target-url <url>]
 *                                     [--candidate-hash <hash>] [--headless]
 *
 * The manifest binds ParityPair contracts; per-pair URLs may be overridden by
 * the CLI flags for a candidate run against a live reference checkout.
 */
export async function parityCmd(
  args: string[],
  options: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0] || "run";
  if (subcommand !== "run") {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Unknown parity subcommand: ${subcommand}. Use: run <manifest>`,
    };
  }

  const manifestPath = args[1];
  if (!manifestPath) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "parity run requires a manifest path (yaml or json)",
    };
  }

  const flagValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
  };
  const referenceUrl = flagValue("--reference-url");
  const targetUrl = flagValue("--target-url");
  const candidateHash = flagValue("--candidate-hash");
  const headless = args.includes("--headless");

  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(manifestPath), "utf-8");
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Cannot read parity manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = /\.ya?ml$/i.test(manifestPath) ? loadYaml(raw) : JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Invalid parity manifest: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const manifest = parsed as { name?: string; pairs?: unknown[] };
  if (!manifest || !Array.isArray(manifest.pairs)) {
    return {
      exitCode: ExitCode.GeneralError,
      message: "Parity manifest must contain a top-level pairs array",
    };
  }

  const pairs = manifest.pairs.map((pair, index) => {
    const p = pair as Record<string, unknown>;
    const base = typeof p === "object" && p !== null ? p : {};
    return {
      ...base,
      id: String(base.id ?? `pair-${index + 1}`),
      referenceUrl: String(referenceUrl ?? base.referenceUrl ?? ""),
      targetUrl: String(targetUrl ?? base.targetUrl ?? ""),
      candidateHash: candidateHash ?? (base.candidateHash as string | undefined),
    };
  });

  try {
    const { runParityManifest } = await import("@initforge/agent-rules-engine/parity-runner");
    const run = await runParityManifest({ name: manifest.name, pairs: pairs as ParityPair[] }, { headless });

    if (!options.json) {
      console.log(`Parity manifest: ${run.name} (${run.summary.total} pairs)`);
      for (const result of run.results) {
        console.log(`  ${result.pairId}: ${result.verdict}${result.reasons.length ? ` — ${result.reasons.join("; ")}` : ""}`);
      }
    }

    if (run.summary.fail > 0) {
      return {
        exitCode: ExitCode.ValidationFailed,
        message: `Parity FAILED: ${run.summary.fail} of ${run.summary.total} cases failed`,
        data: { summary: run.summary, cases: run.results.map((r) => ({ pairId: r.pairId, verdict: r.verdict, reasons: r.reasons })) },
      };
    }
    if (run.summary.waitingExternal > 0) {
      return {
        exitCode: ExitCode.ValidationFailed,
        message: `Parity incomplete: ${run.summary.waitingExternal} case(s) wait on external review`,
        data: { summary: run.summary, cases: run.results.map((r) => ({ pairId: r.pairId, verdict: r.verdict, reasons: r.reasons })) },
      };
    }
    return {
      exitCode: ExitCode.Success,
      message: `Parity PASS: ${run.summary.total}/${run.summary.total} cases`,
      data: { summary: run.summary },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Parity run failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
