import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Closeout preparation (REQ-018 / C-018): compiles exact candidate identity,
 * source-tree digest, CI expectations, branch/worktree targets, runtime
 * receipts, and evidence into a CloseoutReceipt. It never mutates git.
 *
 * The receipt FAILS CLOSED when the worktree is dirty or uncommitted source
 * exists: the candidate head alone is not the exact candidate. Hosted CI on
 * the stale HEAD is never claimed for an uncommitted patch. Git actions
 * (commit/push/main/branch/worktree) require an exact owner-approved receipt.
 */
export async function closeoutCmd(args: string[], opts: CliOptions): Promise<CommandResult> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const sub = positional[0]?.toLowerCase();
  const planId = sub && sub !== "prepare" && sub !== "status" ? positional[0] : (positional[1] ?? "harness-universal-reconciliation-v1");

  const run = (cmd: string, gitArgs: string[], timeoutMs = 30_000): string => {
    try {
      return execFileSync(cmd, gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs }).trim();
    } catch {
      return "";
    }
  };
  const git = (gitArgs: string[], timeoutMs?: number) => run("git", gitArgs, timeoutMs);

  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]) || "main";
  const remoteHead = git(["ls-remote", "origin", "main"], 60_000).split(/\s+/)[0] ?? "";
  const worktrees = git(["worktree", "list"]).split("\n").filter(Boolean);
  const ledgerPath = path.join(root, ".agent", "ledger", `${planId}.json`);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const claims = (ledger.reconciliations ?? []).filter((item: { status: string }) => item.status === "PASS").map((item: { claim_id: string }) => item.claim_id);

  // ── Exact source-tree state (the true candidate identity) ─────────
  const porcelain = git(["status", "--porcelain"]);
  const worktreeDirty = porcelain.length > 0;
  const sourceTreeDigest = createHash("sha256")
    .update([porcelain, git(["diff", "--stat"]), git(["diff", "--cached", "--stat"])].join("\n---\n"))
    .digest("hex");

  // ── M11 / reconciliation truth (never synthesized) ────────────────
  const m11 = (ledger.milestones ?? {}).M11 ?? { status: "NOT_ELIGIBLE" };
  const reconciliationDir = path.join(".agent", "artifacts", planId, "reconciliation");
  const reconcileReceipts = fs.existsSync(reconciliationDir) ? fs.readdirSync(reconciliationDir).filter((name) => name.endsWith(".json")) : [];
  const latestReconcile = reconcileReceipts.length > 0
    ? JSON.parse(fs.readFileSync(path.join(reconciliationDir, reconcileReceipts.sort()[reconcileReceipts.length - 1]), "utf8"))
    : null;
  const reconcileMatch = latestReconcile?.status === "MATCH" && latestReconcile?.reconciled_against?.candidate_head === head;

  const blocked: string[] = [];
  if (worktreeDirty) blocked.push(`worktree has uncommitted source (${porcelain.split("\n").length} changed entries); exact candidate not committed`);
  if (m11.status !== "ALL_CLAIMS_VERIFIED") blocked.push(`M11 terminal truth not established (${m11.status}); engine-owned envelope required`);
  if (!reconcileMatch) blocked.push(`no MATCH reconciliation receipt bound to HEAD ${head.slice(0, 12)}`);

  const receipt = {
    schema: "agent-rules/closeout-receipt",
    version: 1,
    plan_id: planId,
    prepared_at: new Date().toISOString(),
    owner_approval_required: true,
    target_identity: {
      candidate_head: head,
      candidate_branch: branch,
      source_tree_digest: sourceTreeDigest,
      worktree_dirty: worktreeDirty,
      remote_main_head_observed: remoteHead,
      remote_drift: remoteHead !== "" && remoteHead !== head ? "REMOTE_DRIFT" : "MATCH",
    },
    ci_expectations: {
      hosted_quality_required: true,
      self_hosted_certification_required: false,
      // Hosted CI can only ever be claimed for the EXACT committed SHA.
      candidate_ci_sha: worktreeDirty ? null : head,
      candidate_ci_proven: false,
      final_main_ci_sha: worktreeDirty ? null : head,
    },
    evidence: {
      claim_count: claims.length,
      claims,
      evidence_ledger: ".agent/ledger/" + planId + ".json",
      artifacts: ".agent/artifacts/" + planId,
      m11_status: m11.status,
      latest_reconciliation: latestReconcile ? { status: latestReconcile.status, head: latestReconcile.reconciled_against?.candidate_head ?? null } : null,
    },
    branches_to_delete: [branch !== "main" ? branch : ""].filter(Boolean),
    worktrees: worktrees.map((line: string) => line.split(/\s+/)[0]),
    runtime_receipts: [".agent/artifacts/" + planId + "/hosts"],
    status: blocked.length > 0 ? "BLOCKED_EXACT_CANDIDATE_NOT_READY" : "PREPARED_AWAITING_OWNER_APPROVAL",
    approval_state: "NOT_APPROVED",
    blocked_reasons: blocked,
  };
  const body = JSON.parse(JSON.stringify(receipt));
  const sha = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const receiptPath = path.join(".agent", "artifacts", planId, "closeout-receipt.json");
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify({ ...body, receipt_sha256: sha }, null, 2) + "\n", "utf8");
  const ready = blocked.length === 0;
  return {
    exitCode: ready ? ExitCode.Success : ExitCode.GeneralError,
    message: ready
      ? `Closeout prepared for ${planId} (${claims.length} claims PASS, exact candidate) — awaiting owner approval`
      : `Closeout BLOCKED for ${planId}: ${blocked.join('; ')}`,
    data: { ...body, receipt_sha256: sha, receipt_path: receiptPath },
  };
}
