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
import path from "node:path";
import fs from "node:fs";

function resolveStoreBase(root?: string): string {
  return root ?? process.cwd();
}

function makeStore(basePath: string): DurableStore {
  return new DurableStore(basePath);
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
        const originalPath = path.join(".agent", "plans", planId, "original.md");
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
  await store.updateState(runId, "COMPLETED");
  return {
    exitCode: ExitCode.Success,
    message: `Plan ${runId} finalized`,
    data: { runId, state: "COMPLETED" },
  };
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
    default:
      return {
        exitCode: ExitCode.InvalidArgument,
        message: `Unknown plan subcommand: ${subcommand}. Available: inventory, adopt, status, checkpoint, lineage, reconcile, repair, export, finalize`,
      };
  }
}
