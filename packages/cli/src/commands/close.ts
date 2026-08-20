import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  assertClosureInput,
  stageClosureTransaction,
  commitClosureTransaction,
  correctInvalidClosure,
  writeOperationalIgnore,
  type ClosureInput,
  type EvidenceBindingManifest,
} from "@initforge/agent-rules-engine/northstar/index";

/**
 * `agent-rules close` — vNext unified closure service (Phase 1 trust root).
 *
 * Consolidates the legacy close/closeout/certify paths. Close succeeds only
 * when the unified closure transaction passes:
 *
 *  - mandatory input gates (non-empty requirements, non-empty reconciliation,
 *    non-empty bound evidence, no unresolved requirements, 64-hex behavioral
 *    baseline, complete four-identity evidence binding);
 *  - the transaction is staged and committed through a single commit point
 *    with idempotent replay;
 *  - the old invalid v1 closure (pointer hot while ledger claimed
 *    RETIRED/CLOSED with shallow evidence) is corrected to SUPERSEDED/INACTIVE
 *    with terminal PARTIAL before any successor activation.
 *
 * This command never accepts shallow `verified:true` receipts, never treats
 * empty reconciliation as success, and never hard-codes residue facts.
 */
export async function closeCmd(args: string[], _opts: CliOptions): Promise<CommandResult> {
  const root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const planId = positional[0] ?? "terminal-harness-vnext";

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
  const remote = git(["remote", "get-url", "origin"]) || "";
  const porcelain = git(["status", "--porcelain"]);
  const worktreeDirty = porcelain.length > 0;
  const treeHash = git(["write-tree"]) || "";
  const harnessRoot = resolveHarnessRoot(root);

  const ledgerPath = path.join(root, ".agent", "ledger", `${planId}.json`);
  if (!fs.existsSync(ledgerPath)) {
    return { exitCode: ExitCode.InvalidArgument, message: `No ledger for plan ${planId}: ${ledgerPath}` };
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
    plan_id?: string;
    execution_state?: string;
    status?: string;
    reconciliations?: Array<{ status?: string; claim_id?: string }>;
    requirements?: Record<string, { statement?: string; status?: string }>;
    milestones?: Record<string, { status?: string }>;
  };

  const planRequirements = readPlanRequirements(root, planId);
  const effectiveRequirements = planRequirements.length > 0
    ? planRequirements
    : ledgerRequirements(ledger);

  const reconciliations = (ledger.reconciliations ?? []).map((item: { status?: string; claim_id?: string }) => ({
    count: 1,
    statuses: [item.status ?? "UNKNOWN"],
    receipt_sha256: undefined,
  }));

  const binding = buildBinding({ root, head, branch, remote, worktreeDirty, treeHash, harnessRoot });

  const closureInput: ClosureInput = {
    plan_id: planId,
    work_id: planId,
    purpose: "vNext terminal harness: authority/lifecycle/closure trust root",
    effective_contract_sha256: effectiveContractSha(root, planId),
    requirements: effectiveRequirements,
    reconciliations,
    evidence: collectEvidence(root, planId),
    changed_surfaces: changedSurfaces(root, planId),
    diff_stat: `${porcelain.split("\n").filter(Boolean).length} changed entries`,
    binding,
    behavioral_baseline: head,
  };

  // Mandatory input gates fail closed (never false PASS).
  try {
    assertClosureInput(closureInput);
  } catch (error) {
    return {
      exitCode: ExitCode.GeneralError,
      message: `Close BLOCKED for ${planId}: ${(error as Error).message}`,
      data: { plan_id: planId, head, branch, worktree_dirty: worktreeDirty },
    };
  }

  if (dryRun) {
    return {
      exitCode: ExitCode.Success,
      message: `Close dry-run for ${planId}: mandatory gates PASS; closure transaction would stage+commit`,
      data: {
        plan_id: planId,
        requirements: closureInput.requirements.length,
        reconciliations: closureInput.reconciliations.length,
        evidence: closureInput.evidence.length,
        binding: {
          harness_release: binding.harness_release.sha256.slice(0, 12),
          installation_projection: binding.installation_projection.projection_sha256.slice(0, 12),
          consumer_candidate: binding.consumer_candidate.candidate_sha256.slice(0, 12),
          host_runtime: binding.host_runtime.host,
        },
      },
    };
  }

  // Correct the invalid v1 closure before any successor activation.
  const correction = correctInvalidClosure({
    repoRoot: root,
    plan_id: "northstar-on-demand-portable-harness",
    pointer: readPointer(root),
    ledger: { status: ledger.status ?? null, execution_state: ledger.execution_state ?? null },
    reason: "v1 closure accepted shallow verified:true evidence, empty reconciliation, hard-coded residue and pointer copy without deactivation; corrected to SUPERSEDED/INACTIVE with terminal PARTIAL",
  });

  // Stage + commit the closure transaction (single commit point, idempotent replay).
  const staged = stageClosureTransaction(closureInput, root);
  const receipt = commitClosureTransaction(closureInput, root, staged);

  // Keep operational state out of the tracked consumer source.
  writeOperationalIgnore(root);

  return {
    exitCode: ExitCode.Success,
    message: `Close completed for ${planId}; closure ${receipt.closure_id} committed (replay=${receipt.replay}); old invalid closure corrected to SUPERSEDED/INACTIVE`,
    data: {
      plan_id: planId,
      closure_id: receipt.closure_id,
      committed: receipt.committed,
      replay: receipt.replay,
      manifest_path: receipt.manifest_path,
      residue_path: receipt.residue_path,
      receipt_sha256: receipt.receipt_sha256,
      correction: correction.correction_sha256,
      evidence_binding: {
        harness_release: binding.harness_release.sha256,
        installation_projection: binding.installation_projection.projection_sha256,
        consumer_repository: binding.consumer_repository.worktree_path,
        consumer_candidate: binding.consumer_candidate.candidate_sha256,
        host_runtime: binding.host_runtime.host,
      },
    },
  };
}

function ledgerRequirements(ledger: { requirements?: Record<string, { statement?: string; status?: string }> }): Array<{ id: string; statement: string; status: string }> {
  return Object.entries(ledger.requirements ?? {}).map(([id, value]) => ({
    id,
    statement: value?.statement ?? id,
    status: value?.status ?? "ACTIVE",
  }));
}

function resolveHarnessRoot(root: string): string {
  const env = process.env.AGENT_RULES_HOME;
  if (env) return env;
  // Auto-resolve to the repository root that contains packages/kernel.
  let dir = root;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "packages", "kernel", "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return root;
}

function buildBinding(input: { root: string; head: string; branch: string; remote: string; worktreeDirty: boolean; treeHash: string; harnessRoot: string }): EvidenceBindingManifest {
  const projectionCandidates = [
    path.join(input.harnessRoot, "generated"),
    path.join(input.root, "generated"),
    path.join(input.root, "dist"),
  ];
  let projectionSha = "0".repeat(64);
  for (const candidate of projectionCandidates) {
    if (fs.existsSync(candidate)) {
      projectionSha = sha256Dir(candidate);
      break;
    }
  }
  return {
    harness_release: {
      repository: input.remote || "local",
      branch: input.branch,
      sha256: input.head || "0".repeat(40),
    },
    installation_projection: {
      installation_root: input.harnessRoot,
      projection_sha256: projectionSha,
    },
    consumer_repository: {
      repository_url: input.remote || undefined,
      worktree_path: input.root,
      git_head: input.head || undefined,
      worktree_dirty: input.worktreeDirty,
      tree_hash: input.treeHash || undefined,
    },
    consumer_candidate: {
      candidate_sha256: input.head || "0".repeat(40),
      candidate_branch: input.branch,
      tree_hash: input.treeHash || undefined,
    },
    host_runtime: {
      host: detectHost(),
      version: detectHostVersion(),
      session_id: process.env.OPENCODE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? "local-session",
      capabilities: [],
    },
  };
}

function detectHost(): string {
  if (process.env.CODEX_HOME || process.env.CODEX_HOST) return "codex";
  if (process.env.OPENCODE || process.env.OPENCODE_CONFIG) return "opencode";
  return "cli";
}

function detectHostVersion(): string | undefined {
  try {
    return execFileSync("opencode", ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0] ?? undefined;
  } catch {
    return undefined;
  }
}

function sha256Dir(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) hash.update(full).update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function readPlanRequirements(root: string, planId: string): Array<{ id: string; statement: string; status: string }> {
  const yamlPath = path.join(root, ".agent", "plans", planId, "requirements.yaml");
  if (!fs.existsSync(yamlPath)) return [];
  const text = fs.readFileSync(yamlPath, "utf8");
  const out: Array<{ id: string; statement: string; status: string }> = [];
  const idRe = /^\s*-\s*id:\s*([^\s]+)/;
  const stRe = /^\s*statement:\s*(.+)$/;
  const statusRe = /^\s*status:\s*([^\s]+)/;
  let current: { id: string; statement: string; status: string } | null = null;
  for (const line of text.split("\n")) {
    const idMatch = line.match(idRe);
    if (idMatch) {
      if (current) out.push(current);
      current = { id: idMatch[1]!, statement: "", status: "ACTIVE" };
      continue;
    }
    if (!current) continue;
    const stMatch = line.match(stRe);
    if (stMatch) current.statement = stMatch[1]!.trim();
    const statusMatch = line.match(statusRe);
    if (statusMatch) current.status = statusMatch[1]!.trim();
  }
  if (current) out.push(current);
  return out;
}

function effectiveContractSha(root: string, planId: string): string {
  const candidates = [
    path.join(root, ".agent", "plans", planId, "plan.md"),
    path.join(root, ".agent", "plans", planId, "original.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
  }
  return "0".repeat(64);
}

function collectEvidence(root: string, planId: string): Array<{ evidence_id: string; sha256: string; outcome: string; stage?: string }> {
  const evidenceRoot = path.join(root, ".agent", "evidence", planId);
  const out: Array<{ evidence_id: string; sha256: string; outcome: string; stage?: string }> = [];
  if (!fs.existsSync(evidenceRoot)) return out;
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, "utf8")) as { status?: string; outcome?: string; evidence_stage?: string; schema?: string };
          const outcome = parsed.status ?? parsed.outcome ?? "UNKNOWN";
          out.push({
            evidence_id: path.relative(root, full).split(path.sep).join("/"),
            sha256: createHash("sha256").update(fs.readFileSync(full)).digest("hex"),
            outcome,
            stage: parsed.evidence_stage,
          });
        } catch {
          /* skip unparseable evidence files */
        }
      }
    }
  };
  walk(evidenceRoot);
  return out;
}

function changedSurfaces(root: string, planId: string): string[] {
  const surfaces = [
    path.join(".agent", "plans", planId),
    path.join(".agent", "ledger", `${planId}.json`),
    path.join(".agent", "evidence", planId),
    path.join(".agent", "closure"),
  ];
  return surfaces.filter((s) => fs.existsSync(path.join(root, s)));
}

function readPointer(root: string): { generation: number; status: string; execution_state: string } | null {
  const pointerPath = path.join(root, ".agent", "current.json");
  if (!fs.existsSync(pointerPath)) return null;
  try {
    const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf8")) as { generation?: number; contract?: { status?: string }; canonical_ledger?: { execution_state?: string; plan_status?: string } };
    return {
      generation: pointer.generation ?? 0,
      status: pointer.contract?.status ?? pointer.canonical_ledger?.plan_status ?? "UNKNOWN",
      execution_state: pointer.canonical_ledger?.execution_state ?? "UNKNOWN",
    };
  } catch {
    return null;
  }
}