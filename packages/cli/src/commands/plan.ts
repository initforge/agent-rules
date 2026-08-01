import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { DurableStore } from "../services/durable-store.js";
import {
  compilePlan,
  validatePlan,
  type CompiledPlan,
} from "../services/plan-compiler.js";
import {
  adoptPlan as engineAdoptPlan,
  finalizePlan as engineFinalizePlan,
  reconcilePlan as engineReconcilePlan,
} from "@initforge/agent-rules-engine/plan-lifecycle";
import { compilePlanReadiness } from "@initforge/agent-rules-engine/plan-readiness";
import { evaluateM11Terminal, M11_TERMINAL_TOKEN, type M11Evidence } from "@initforge/agent-rules-engine/terminal-gate";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

function resolveStoreBase(root?: string): string {
  return root ?? process.cwd();
}

function makeStore(basePath: string): DurableStore {
  return new DurableStore(basePath);
}

function resolveCanonicalOriginal(root: string, planId: string, ledgerPath: string): string {
  const runtime = path.join(root, ".agent", "plans", planId, "original.md");
  if (fs.existsSync(runtime)) return runtime;
  const fixture = path.join(root, "packages", "engine", "test", "fixtures", "plan-identity", "original.md");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { original_plan?: { sha256?: string } };
  const expected = ledger.original_plan?.sha256;
  if (!expected || !fs.existsSync(fixture) || createHash("sha256").update(fs.readFileSync(fixture)).digest("hex") !== expected) {
    throw new Error(`Canonical original fixture unavailable or hash mismatch for ${planId}`);
  }
  return fixture;
}

export async function planInventory(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const basePath = resolveStoreBase(args[0]);
  const store = makeStore(basePath);
  const runIds = await store.listRuns();
  const runs = await Promise.all(
    runIds.map(async (id) => {
      const run = await store.getRun(id);
      return { id, state: run?.state, plan: run?.plan };
    })
  );
  const plans = runs.map((r) => ({
    runId: r.id,
    state: r.state ?? "unknown",
    planSummary:
      (r.plan as CompiledPlan | undefined)?.intent_reference
        ?.summary ?? "untitled",
  }));
  return {
    exitCode: ExitCode.Success,
    message: `Found ${plans.length} plan(s)`,
    data: { plans },
  };
}

export async function planAdopt(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  // New-style: harness plan adopt <source-path> <plan-id>
  if (args.length >= 2) {
    const sourcePath = args[0];
    const planId = args[1];
    try {
      const identity = engineAdoptPlan(sourcePath, planId);
      return {
        exitCode: ExitCode.Success,
        message: `Plan ${identity.planId} adopted (sha256: ${identity.originalSha256.slice(0, 16)}...)`,
        data: {
          planId: identity.planId,
          originalSha256: identity.originalSha256,
          amendmentIds: identity.amendmentIds,
          effectivePlanSha256: identity.effectivePlanSha256,
        },
      };
    } catch (err) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Plan adoption failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Legacy: harness plan adopt <planPath> [basePath]
  const planPath = args[0];
  if (!planPath) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing plan path argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const absolute = path.resolve(
    path.isAbsolute(planPath) ? planPath : path.join(basePath, planPath)
  );
  if (!fs.existsSync(absolute)) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: `Plan file not found: ${absolute}`,
    };
  }
  const raw = JSON.parse(fs.readFileSync(absolute, "utf-8"));
  const validation = validatePlan(raw);
  if (!validation.valid) {
    return {
      exitCode: ExitCode.ValidationFailed,
      message: `Plan validation failed: ${validation.errors.join("; ")}`,
      data: { errors: validation.errors },
    };
  }
  const compiled = compilePlan(raw);
  const runId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const store = makeStore(basePath);
  await store.createRun(runId, compiled);
  return {
    exitCode: ExitCode.Success,
    message: `Plan adopted as run ${runId}`,
    data: { runId },
  };
}

export async function planStatus(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const tasks = (run.tasks as Array<Record<string, unknown>>) ?? [];
  const receipts = (run.receipts as unknown[]) ?? [];
  return {
    exitCode: ExitCode.Success,
    message: `Plan ${runId} state: ${run.state}`,
    data: {
      runId,
      state: run.state,
      planSummary:
        (run.plan as CompiledPlan | undefined)?.intent_reference
          ?.summary ?? "untitled",
      tasks: tasks.map((t) => ({ id: t.id, state: t.state ?? t.status })),
      receiptCount: receipts.length,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
  };
}

export async function planCheckpoint(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const cp = await store.checkpoint(runId);
  return {
    exitCode: ExitCode.Success,
    message: `Checkpoint ${cp.id} saved for run ${runId}`,
    data: { runId, checkpointId: cp.id, state: cp.state },
  };
}

export async function planLineage(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const planHash =
    (run.plan as CompiledPlan | undefined)?.intent_reference?.hash ?? "";

  return {
    exitCode: ExitCode.Success,
    message: `Lineage for ${runId}`,
    data: {
      runId,
      planHash,
      state: run.state,
      createdAt: run.createdAt,
      checkpoints: run.checkpoints.length,
    },
  };
}

export async function planReconcile(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  // New-style: harness plan reconcile <plan-id>
  if (args.length >= 1) {
    const planId = args[0];
    const ledgerPath = path.join(".agent", "ledger", `${planId}.json`);
    if (fs.existsSync(ledgerPath)) {
      try {
        const originalPath = resolveCanonicalOriginal(process.cwd(), planId, ledgerPath);
        const diffFingerprint = opts.dryRun ? "dry-run-fingerprint" : `reconcile-${Date.now()}`;
        const reconciliation = engineReconcilePlan(ledgerPath, originalPath, diffFingerprint);
        return {
          exitCode: ExitCode.Success,
          message: `Reconciliation: ${reconciliation.status} — ${reconciliation.detail}`,
          data: {
            planId,
            status: reconciliation.status,
            reconciledAgainst: reconciliation.reconciledAgainst,
            detail: reconciliation.detail,
          },
        };
      } catch (err) {
        return {
          exitCode: ExitCode.GeneralError,
          message: `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // Legacy: harness plan reconcile <runId> [basePath]
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const tasks = (run.tasks as Array<Record<string, unknown>>) ?? [];
  const total = tasks.length;
  const completed = tasks.filter((t) => {
    const s = t.state ?? t.status;
    return s === "COMPLETED" || s === "VERIFIED" || s === "completed";
  }).length;
  const status = completed === total ? "MATCH" : completed > 0 ? "PARTIAL" : total === 0 ? "MISSING" : "PARTIAL";
  return {
    exitCode: ExitCode.Success,
    message: `Reconciliation: ${status} (${completed}/${total} tasks resolved)`,
    data: { runId, status, completed, total },
  };
}

export async function planRepair(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const tasks = (run.tasks as Array<Record<string, unknown>>) ?? [];
  let repaired = 0;
  for (const t of tasks) {
    const s = t.state ?? t.status;
    if (s === "FAILED" || s === "failed") {
      t.state = "PENDING";
      repaired++;
    }
  }
  await store.updateState(runId, run.state);
  return {
    exitCode: ExitCode.Success,
    message: `Repair: ${repaired} task(s) reset to PENDING`,
    data: { runId, repaired },
  };
}

export async function planExport(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const runId = args[0];
  const outputPath = args[1];
  if (!runId || !outputPath) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: plan export <runId> <outputPath> [basePath]",
    };
  }
  const basePath = resolveStoreBase(args[2]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  const bundle = {
    run: { runId: run.runId, state: run.state, createdAt: run.createdAt, updatedAt: run.updatedAt },
    plan: run.plan,
    tasks: run.tasks,
    receipts: run.receipts,
    checkpoints: run.checkpoints,
    exportedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2));
  return {
    exitCode: ExitCode.Success,
    message: `Plan exported to ${outputPath}`,
    data: { runId, outputPath },
  };
}

export async function planFinalize(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  // New-style: harness plan finalize <plan-id>
  if (args.length >= 1) {
    const planId = args[0];
    const ledgerPath = path.join(".agent", "ledger", `${planId}.json`);
    if (fs.existsSync(ledgerPath)) {
      try {
        const result = engineFinalizePlan(ledgerPath);
        if (result.passed) {
          return {
            exitCode: ExitCode.Success,
            message: `Plan ${planId} finalized`,
            data: { planId, passed: true },
          };
        }
        return {
          exitCode: ExitCode.GeneralError,
          message: `Plan ${planId} finalize blocked: ${result.reason}`,
          data: { planId, passed: false, reason: result.reason },
        };
      } catch (err) {
        return {
          exitCode: ExitCode.GeneralError,
          message: `Finalize failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // Legacy: harness plan finalize <runId> [basePath]
  const runId = args[0];
  if (!runId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Missing runId argument" };
  }
  const basePath = resolveStoreBase(args[1]);
  const store = makeStore(basePath);
  const run = await store.getRun(runId);
  if (!run) {
    return { exitCode: ExitCode.GeneralError, message: `Run not found: ${runId}` };
  }
  // F1: never promote a FAILED/BLOCKED run to COMPLETED.
  if (run.state === "FAILED" || run.state === "BLOCKED") {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Cannot finalize: run is ${run.state}`,
      data: { runId, state: run.state },
    };
  }
  const tasks = (run.tasks as Array<Record<string, unknown>>) ?? [];
  const pending = tasks.filter((t) => {
    const s = t.state ?? t.status;
    return s === "PENDING" || s === "DISPATCHED" || s === "IN_PROGRESS" ||
      s === "CREATED" || s === "pending" || s === "in_progress";
  });
  if (pending.length > 0) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Cannot finalize: ${pending.length} task(s) still pending`,
      data: { runId, pendingTasks: pending.map((t) => t.id ?? t.taskId) },
    };
  }
  if (run.state !== "COMPLETED") {
    const notCompleted = tasks.filter((t) => {
      const s = t.state ?? t.status;
      return s !== "COMPLETED" && s !== "completed" && t.completed !== true;
    });
    if (notCompleted.length > 0) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Cannot finalize: ${notCompleted.length} task(s) not completed (FAILED/BLOCKED/CANCELLED)`,
        data: { runId, failedTasks: notCompleted.map((t) => t.id ?? t.taskId) },
      };
    }
  }
  await store.updateState(runId, "COMPLETED");
  return {
    exitCode: ExitCode.Success,
    message: `Plan ${runId} finalized`,
    data: { runId, state: "COMPLETED" },
  };
}

export async function planReadiness(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const planId = args[0];
  if (!planId) {
    return {
      exitCode: ExitCode.InvalidArgument,
      message: "Usage: plan readiness <plan-id> [repoRoot]",
    };
  }
  const root = resolveStoreBase(args[1]);
  const ledgerPath = path.join(root, ".agent", "ledger", `${planId}.json`);
  if (!fs.existsSync(ledgerPath)) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Ledger not found: ${ledgerPath}`,
    };
  }
  try {
    const planDir = path.join(root, ".agent", "plans", planId);
    const amendmentPath = path.join(
      planDir,
      "amendments",
      "0019-autonomous-native-swarm-whole-system-convergence.md",
    );
    const originalPath = path.join(planDir, "original.md");
    const result = compilePlanReadiness({
      ledgerPath,
      planDir,
      amendmentPath: fs.existsSync(amendmentPath) ? amendmentPath : undefined,
      originalPath: fs.existsSync(originalPath) ? originalPath : undefined,
      headCommit: runHeadCommit(root),
    });
    return {
      exitCode: ExitCode.Success,
      message: `Plan ${result.planId} readiness: ${result.readinessState} (${result.requirementCount} requirements, revision ${result.revision})`,
      data: {
        planId: result.planId,
        readinessState: result.readinessState,
        revision: result.revision,
        effectiveIdentity: result.effectiveIdentity,
        requirementCount: result.requirementCount,
        reasons: result.reasons,
        files: result.files,
      },
    };
  } catch (err) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Plan readiness failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function runHeadCommit(root: string): string | undefined {
  try {
    const out = execFileSync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.trim();
  } catch {
    return undefined;
  }
}

/**
 * Minimal M11 terminal wiring: `plan m11 <plan-id> [repoRoot]` evaluates
 * HV3_M11_LOCAL_COMPLETE eligibility from the real ledger + the dynamically
 * compiled effective requirement set. Evaluator never writes the terminal token.
 */
export async function planM11(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const planId = args[0];
  if (!planId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: plan m11 <plan-id> [repoRoot]" };
  }
  const root = resolveStoreBase(args[1]);
  const ledgerPath = path.join(root, ".agent", "ledger", `${planId}.json`);
  if (!fs.existsSync(ledgerPath)) {
    return { exitCode: ExitCode.GeneralError, message: `Ledger not found: ${ledgerPath}` };
  }
  try {
    const planDir = path.join(root, ".agent", "plans", planId);
    const amendmentPath = path.join(planDir, "amendments", "0019-autonomous-native-swarm-whole-system-convergence.md");
    const originalPath = path.join(planDir, "original.md");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Record<string, unknown> & {
      headCommit?: string; commitSha?: string; milestones?: { M8?: { scorecard?: { dimensions?: Array<{ id: string; score: number | null; status: string }> } }; M11?: { headCommit?: string; observedAt?: string; evidence?: Array<{ evidenceHash?: string }> } };
      reviews?: Array<Record<string, unknown>>; attestations?: Array<{ commitSha?: string }>;
      effective_plan_identity?: { sha256?: string }; reconciliations?: Array<{ headCommit?: string }>;
    };
    const readiness = compilePlanReadiness({
      ledgerPath,
      planDir,
      amendmentPath: fs.existsSync(amendmentPath) ? amendmentPath : undefined,
      originalPath: fs.existsSync(originalPath) ? originalPath : undefined,
      headCommit: runHeadCommit(root) ?? ledger.headCommit,
    });
    const headCommit = ledger.headCommit ?? ledger.commitSha ?? "";
    const m11 = ledger.milestones?.M11;
    const lastRec = (ledger.reconciliations ?? []).at(-1);
    const evidence: M11Evidence = {
      headCommit,
      effectivePlanIdentity: ledger.effective_plan_identity?.sha256 ?? "",
      envelopeSha256: m11?.evidence?.[0]?.evidenceHash ?? "",
      observedAt: m11?.observedAt ?? new Date().toISOString(),
      fresh: headCommit.length > 0 && m11?.headCommit === headCommit,
      ciSha: headCommit,
      certifiedArtifactSha256: "",
      installedArtifactSha256: "",
      installedFrom: "",
      reconciliationHeadCommit: lastRec?.headCommit ?? "",
      parity: "SKIPPED",
      topology: "SKIPPED",
      reviews: [],
    };
    const scorecard = ledger.milestones?.M8?.scorecard?.dimensions ?? [];
    const result = evaluateM11Terminal(ledger, evidence, {
      requirements: readiness.requirements.map((r) => ({ requirement_id: r.requirement_id, status: r.status })),
      scorecard,
      waitingGates: [],
    });
    const eligible = result.passed;
    return {
      exitCode: eligible ? ExitCode.Success : ExitCode.GeneralError,
      message: eligible
        ? `${planId} M11 terminal eligible: ${M11_TERMINAL_TOKEN}`
        : `${planId} M11 terminal NOT eligible: ${result.failedGates.join(', ')}`,
      data: {
        planId,
        terminalToken: M11_TERMINAL_TOKEN,
        eligible,
        requirementCount: readiness.requirementCount,
        failedGates: result.failedGates,
        gates: result.gates,
      },
    };
  } catch (err) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `M11 terminal evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function planCmd(
  args: string[],
  opts: CliOptions
): Promise<CommandResult> {
  const subcommand = args[0]?.toLowerCase();
  const rest = args.slice(1);

  switch (subcommand) {
    case "inventory":
      return planInventory(rest, opts);
    case "adopt":
      return planAdopt(rest, opts);
    case "status":
      return planStatus(rest, opts);
    case "checkpoint":
      return planCheckpoint(rest, opts);
    case "lineage":
      return planLineage(rest, opts);
    case "reconcile":
      return planReconcile(rest, opts);
    case "repair":
      return planRepair(rest, opts);
    case "export":
      return planExport(rest, opts);
    case "finalize":
      return planFinalize(rest, opts);
    case "readiness":
      return planReadiness(rest, opts);
    case "m11":
      return planM11(rest, opts);
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown plan subcommand: ${subcommand}. Available: inventory, adopt, status, checkpoint, lineage, reconcile, repair, export, finalize, readiness, m11`,
      };
  }
}
