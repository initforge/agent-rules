import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { compileWorkRequest, type WorkRequestEntrypointInput } from "../services/intent-compiler.js";
import { northStarIngest } from "./northstar-ux.js";

const ADAPTERS = ["conversation", "command", "cli", "api", "native_host"] as const;

/**
 * Canonical prompt-first ingestion. Ordinary conversation is the primary
 * portable entrypoint; optional slash commands, CLI/API requests, and native
 * host actions compile into the same canonical WorkRequest while recording
 * adapter identity. The OpenCode /goal command stays an optional emulated
 * convenience and is never required for this path.
 */
export async function ingestCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const json = positional.find((arg) => arg.endsWith(".json"));
  let adapter: WorkRequestEntrypointInput["adapter"] = "conversation";
  let prompt: string | undefined;
  if (positional.length > 1 && (ADAPTERS as readonly string[]).includes(positional[0])) {
    adapter = positional[0] as WorkRequestEntrypointInput["adapter"];
    prompt = positional.slice(1).join(" ");
  } else {
    prompt = positional.join(" ");
  }
  const planIndex = args.indexOf("--plan");
  const planId = planIndex >= 0 ? args[planIndex + 1] : undefined;

  if (!json && !prompt) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: ingest <trigger-envelope.json> | ingest [adapter] <prompt text> [--plan <plan-id>]",
    };
  }

  try {
    if (prompt) {
      const receipt = compileWorkRequest({ adapter, intent: prompt, planId });
      return {
        exitCode: ExitCode.Success,
        message: `WorkRequest compiled from ${adapter} entrypoint (${receipt.work_id})`,
        data: { receipt, workId: receipt.work_id, semanticSha256: receipt.semantic_sha256, adapter },
      };
    }

    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(fs.default.readFileSync(path.default.resolve(process.cwd(), json!), "utf8")) as unknown;
    const queued = northStarIngest(process.cwd(), raw);
    const receipt = compileWorkRequest({
      adapter,
      intent: queued.request.raw_intent,
      ...(queued.request.explicit_constraints?.length ? { constraints: queued.request.explicit_constraints } : {}),
      ...(queued.request.explicit_non_goals?.length ? { nonGoals: queued.request.explicit_non_goals } : {}),
      ...(queued.request.reference_inputs?.length ? { references: queued.request.reference_inputs } : {}),
      ...(queued.request.risk_hint ? { riskHint: queued.request.risk_hint } : {}),
      planId,
    });
    return {
      exitCode: ExitCode.Success,
      message: `Trigger normalized and WorkRequest compiled via ${adapter} adapter`,
      data: { request: queued.request, path: queued.path, created: queued.created, receipt },
    };
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Ingest failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
