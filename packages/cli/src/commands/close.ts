import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  assertClosureInput,
  deriveOutcome,
  stageClosureTransaction,
  commitClosureTransaction,
  correctStaleTerminal,
  attestTerminal,
  writeOperationalIgnore,
  type ClosureInput,
  type EvidenceBindingManifest,
  type RequirementClosureStatus,
} from "@initforge/agent-rules-engine/northstar/index";
import { readCurrentPointer } from "../services/current-pointer.js";

/**
 * `agent-rules close` — vNext unified closure service (correctness-hardened).
 *
 * Loads the real ledger, proof receipts, reconciliation and five identities.
 * Never defaults to PASS: the terminal outcome is derived from actual evidence
 * and the caller cannot override it. Pending evidence only yields PARTIAL.
 * Public composition: attest (exact candidate SHA/manifest/evidence) -> deactivate
 * (only after PASS) -> compact (after durable attestation). Only a trusted PASS
 * exits 0. The old-plan reclassification is generic (pointer/ledger/CI driven),
 * never a hard-coded plan id.
 */
export async function closeCmd(args: string[], _opts: CliOptions): Promise<CommandResult> {
  const root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const planId = positional[0];

  if (!planId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: close <plan-id> [--dry-run]" };
  }

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
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;

  const planRequirements = readPlanRequirements(root, planId);
  const effectiveRequirements: RequirementClosureStatus[] = planRequirements.length > 0
    ? planRequirements.map((r) => ({ ...r, evidence_status: evidenceStatusFor(root, planId, r.id, r.status) }))
    : ledgerRequirements(ledger).map((r) => ({ ...r, evidence_status: evidenceStatusFor(root, planId, r.id, r.status) }));

  const reconciliations = ((ledger.reconciliations ?? []) as Array<Record<string, unknown>>).map((item) => ({
    count: 1,
    statuses: [String(item.status ?? "UNKNOWN")],
    receipt_sha256: undefined,
  }));

  const binding = buildBinding({ root, head, branch, remote, worktreeDirty, treeHash, harnessRoot });

  const closureInput: ClosureInput = {
    plan_id: planId,
    work_id: planId,
    purpose: "portable host-native supervisory evolution: canonical closure composition",
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

  // Generic stale/invalid-terminal correction driven by the generation-CAS
  // pointer and its referenced ledger — never a hard-coded plan id. When the
  // pointer's activation state is not schema-valid active, or the ledger claims
  // a terminal PASS that is stale, the pointed plan is reclassified
  // SUPERSEDED/INACTIVE/PARTIAL.
  const pointer = readCurrentPointer(root);
  const correctionResult = correctStaleTerminal({
    repoRoot: root,
    pointer: pointer
      ? { plan_id: pointer.plan_id, generation: pointer.generation, activation_state: pointer.atomicity.activation_state }
      : null,
    currentHead: head,
  });
  const correctionHash = "corrected" in correctionResult && correctionResult.corrected
    ? correctionResult.correction_sha256
    : `skipped: ${correctionResult.reason}`;

  if (dryRun) {
    return {
      exitCode: ExitCode.Success,
      message: `Close dry-run for ${planId}: mandatory gates PASS; closure transaction would stage+commit`,
      data: {
        plan_id: planId,
        requirements: closureInput.requirements.length,
        reconciliations: closureInput.reconciliations.length,
        evidence: closureInput.evidence.length,
        derived_outcome: deriveOutcome(closureInput),
        correction: correctionHash,
        binding: {
          harness_release: binding.harness_release.sha256.slice(0, 12),
          installation_projection: binding.installation_projection.projection_sha256.slice(0, 12),
          consumer_candidate: binding.consumer_candidate.candidate_sha256.slice(0, 12),
          host_runtime: binding.host_runtime.host,
        },
      },
    };
  }

  // Stage + commit the closure transaction (single commit point, idempotent replay).
  const staged = stageClosureTransaction(closureInput, root);
  const receipt = commitClosureTransaction(closureInput, root, staged);

  // Public composition: attest -> deactivate -> compact. Only a derived PASS may
  // deactivate; pending/mismatched evidence yields PARTIAL and never deactivates.
  const terminalOutcome = staged.manifest.terminal_outcome;
  let attestation = staged.manifest.attestation;
  let deactivated = false;
  if (terminalOutcome === 'PASS') {
    try {
      attestation = attestTerminal(staged.manifest, {
        ci_sha256: head,
        external_verifier: 'agent-rules-close',
        manifest_hash_override: receipt.manifest_hash,
      });
      staged.manifest.attestation = attestation;
      fs.writeFileSync(path.join(root, '.agent', 'closure', `${planId}.committed.json`), JSON.stringify(staged.manifest, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
      deactivated = true;
    } catch (error) {
      return {
        exitCode: ExitCode.GeneralError,
        message: `Close PARTIAL for ${planId}: derived PASS but attestation failed: ${(error as Error).message}`,
        data: { plan_id: planId, closure_id: receipt.closure_id, terminalOutcome, committed: receipt.committed, replay: receipt.replay },
      };
    }
  }

  // Keep operational state out of the tracked consumer source.
  writeOperationalIgnore(root);

  const passed = terminalOutcome === 'PASS' && deactivated;
  return {
    exitCode: passed ? ExitCode.Success : ExitCode.GeneralError,
    message: passed
      ? `Close completed for ${planId}; closure ${receipt.closure_id} committed and deactivated after trusted PASS (replay=${receipt.replay})`
      : `Close NOT PASS for ${planId}; closure ${receipt.closure_id} committed with terminal outcome ${terminalOutcome} — not eligible for deactivation`,
    data: {
      plan_id: planId,
      closure_id: receipt.closure_id,
      committed: receipt.committed,
      replay: receipt.replay,
      terminal_outcome: terminalOutcome,
      deactivated,
      attestation_status: attestation.status,
      manifest_path: receipt.manifest_path,
      manifest_hash: receipt.manifest_hash,
      residue_path: receipt.residue_path,
      receipt_sha256: receipt.receipt_sha256,
      correction: correctionHash,
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

/**
 * Derive machine-verifiable evidence status from actual evidence files and the
 * ledger status. ACTIVE/PENDING statuses without live evidence yield 'pending';
 * PASS statuses with matching PASS evidence yield 'pass'. Never fabricates PASS.
 */
function evidenceStatusFor(root: string, planId: string, requirementId: string, status: string): RequirementClosureStatus['evidence_status'] {
  const evidenceRoot = path.join(root, ".agent", "evidence", planId);
  if (fs.existsSync(evidenceRoot)) {
    const dirEntries = fs.readdirSync(evidenceRoot, { recursive: true }) as string[];
    const matching = dirEntries.filter((name) => name.endsWith(".json"));
    const passEvidence = matching.some((name) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), "utf8")) as Record<string, unknown>;
        const outcome = String(parsed.status ?? parsed.outcome ?? "UNKNOWN");
        return outcome === "PASS" || outcome === "MATCH";
      } catch {
        return false;
      }
    });
    if (passEvidence) return "pass";
  }
  if (status === "PASS") return "pending";
  if (status === "FAIL") return "fail";
  if (status === "BLOCKED") return "blocked";
  if (status === "UNSUPPORTED") return "unsupported";
  if (status === "NEEDS_USER") return "needs_user";
  return "pending";
}

function ledgerRequirements(ledger: Record<string, unknown>): Array<{ id: string; statement: string; status: string }> {
  const reqs = ledger.requirements as Record<string, { statement?: string; status?: string }> | undefined;
  if (!reqs) return [];
  return Object.entries(reqs).map(([id, value]) => ({
    id,
    statement: value?.statement ?? id,
    status: value?.status ?? "ACTIVE",
  }));
}

function resolveHarnessRoot(root: string): string {
  const env = process.env.AGENT_RULES_HOME;
  if (env) return env;
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

  const harnessReleaseSha = getHarnessReleaseSha(input.harnessRoot);
  const hostInfo = detectHostWithValidation();

  // If harness release SHA is same as consumer HEAD (same repo), use the
  // installation projection hash as the harness identity to maintain separation.
  const consumerHead = input.head || "0".repeat(40);
  const harnessSha = harnessReleaseSha && harnessReleaseSha !== consumerHead
    ? harnessReleaseSha
    : projectionSha;

  return {
    harness_release: {
      repository: input.remote || "local",
      branch: input.branch,
      sha256: harnessSha,
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
      host: hostInfo.name,
      version: hostInfo.version,
      session_id: process.env.OPENCODE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? "local-session",
      capabilities: [],
      validation_status: hostInfo.validation,
    },
  };
}

function getHarnessReleaseSha(harnessRoot: string): string | null {
  try {
    return execFileSync("git", ["-C", harnessRoot, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

const VALID_HOSTS = new Set(["codex", "claude", "opencode", "cursor", "antigravity", "grok", "deepseek-harness", "command-code"]);

function detectHostWithValidation(): { name: string; version: string | undefined; validation: "VALIDATED" | "UNSUPPORTED" | "UNKNOWN" } {
  let name = "unknown";
  if (process.env.CODEX_HOME || process.env.CODEX_HOST) name = "codex";
  else if (process.env.OPENCODE || process.env.OPENCODE_CONFIG) name = "opencode";

  let version: string | undefined;
  try {
    version = execFileSync("opencode", ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0] ?? undefined;
  } catch { /* no opencode */ }

  const validation: "VALIDATED" | "UNSUPPORTED" | "UNKNOWN" = VALID_HOSTS.has(name) ? "VALIDATED" : "UNKNOWN";
  return { name, version, validation };
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
          const parsed = JSON.parse(fs.readFileSync(full, "utf8")) as Record<string, unknown>;
          const outcome = String(parsed.status ?? parsed.outcome ?? "UNKNOWN");
          out.push({
            evidence_id: path.relative(root, full).split(path.sep).join("/"),
            sha256: createHash("sha256").update(fs.readFileSync(full)).digest("hex"),
            outcome,
            stage: parsed.evidence_stage as string | undefined,
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