import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { openPairRepair } from "@initforge/agent-rules-engine/northstar/index";

/**
 * Prompt-first pair repair (REQ-022 / AM-0003): a normal review prompt is
 * bound to the active bundle, classified, impact-computed, and only affected
 * claims reopen in a new evidence epoch. Historical PASS is never rewritten.
 */
export async function repairCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const jsonPath = args.find((arg) => arg.endsWith(".json") && !arg.startsWith("--"));
  const planIndex = args.indexOf("--plan");
  const planId = planIndex >= 0 ? args[planIndex + 1] : undefined;
  const fs = await import("node:fs");
  const path = await import("node:path");

  if (!jsonPath) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: repair <finding.json> [--plan <plan-id>]" };
  }
  try {
    const raw = JSON.parse(fs.default.readFileSync(path.default.resolve(process.cwd(), jsonPath), "utf8")) as {
      finding: string;
      candidate_plans: Array<{ plan_id: string; head_sha: string; worktree_dirty: boolean; ledger_ref: string; diff_ref: string; evidence_refs: string[] }>;
      current_epoch?: number;
      spec?: unknown;
      claim_to_requirements?: Record<string, string[]>;
      accepted_claims?: string[];
      observed_surface?: string;
    };
    const outcome = openPairRepair({
      raw_finding: raw.finding,
      candidate_plans: raw.candidate_plans,
      selected_plan_id: planId,
      current_epoch: raw.current_epoch,
      spec: raw.spec as never,
      claim_to_requirements: raw.claim_to_requirements,
      accepted_claims: raw.accepted_claims,
      observed_surface: raw.observed_surface,
    });
    if (outcome.needs_user) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Pair repair NEEDS_USER: ${outcome.reason}`,
        data: { finding: outcome.finding, needsUser: true, reason: outcome.reason },
      };
    }
    if (!outcome.packet) {
      return {
        exitCode: ExitCode.Success,
        message: `Pair repair classified as ${outcome.finding.classification}: no implementation claims reopened`,
        data: { finding: outcome.finding, impact: outcome.impact, needsUser: false },
      };
    }
    return {
      exitCode: ExitCode.Success,
      message: `Pair repair packet issued: ${outcome.packet.reopened_claims.length} claim(s) reopened in epoch ${outcome.packet.candidate_epoch}`,
      data: { finding: outcome.finding, impact: outcome.impact, packet: outcome.packet },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Pair repair failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
