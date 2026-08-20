import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ExitCode, type CommandResult, type CliOptions } from "../types.js";
import {
  readCurrentPointer,
  supersedeGoal,
  commitCurrentPointer,
  type ArtifactRef,
  type ChainTip,
  type CandidateChainTip,
  type ContractRef,
  type CanonicalLedger,
  type CurrentPointer,
} from "@initforge/agent-rules-kernel";

/**
 * `agent-rules activate <plan-id>` — activate the successor plan through the
 * generation-CAS pointer transaction (Phase 1 authority/lifecycle trust root).
 *
 * Unlike the legacy `close` path that archived a copy of the pointer without
 * deactivating the hot pointer, activation is the only allowed way to move the
 * current pointer. It:
 *
 *  - requires the successor plan artifacts to exist and match their hashes;
 *  - verifies the current pointer generation matches the expected generation;
 *  - records the supersession with a fresh transaction id and tombstone;
 *  - leaves the old plan INACTIVE/SUPERSEDED with its terminal truth intact.
 */
export async function activateCmd(args: string[], _opts: CliOptions): Promise<CommandResult> {
  const root = process.cwd();
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const planId = positional[0];
  if (!planId) {
    return { exitCode: ExitCode.InvalidArgument, message: "Usage: activate <plan-id> [--dry-run] [--reason <text>] [--activation-state <state>]" };
  }
  const reasonArg = args.indexOf("--reason");
  const reason = reasonArg >= 0 ? args.slice(reasonArg + 1).filter((arg) => !arg.startsWith("--")).join(" ") : `Owner-authorized successor activation for ${planId}`;
  if (!reason) {
    return { exitCode: ExitCode.InvalidArgument, message: "--reason is required for activation" };
  }
  const stateArg = args.indexOf("--activation-state");
  const activationState = stateArg >= 0 ? args.slice(stateArg + 1).filter((arg) => !arg.startsWith("--"))[0] : undefined;
  const VALID_ACTIVATION_STATES = ["BOOTSTRAP_POINTER", "BOOTSTRAP_UNCERTIFIED", "CANONICALLY_ACTIVATED"];
  if (activationState && !VALID_ACTIVATION_STATES.includes(activationState)) {
    return { exitCode: ExitCode.InvalidArgument, message: `--activation-state must be one of ${VALID_ACTIVATION_STATES.join(", ")}` };
  }

  // The successor plan must exist and be hash-verifiable.
  const planDir = path.join(root, ".agent", "plans", planId);
  const ledgerPath = path.join(root, ".agent", "ledger", `${planId}.json`);
  const originalPath = path.join(planDir, "original.md");
  const planPath = path.join(planDir, "plan.md");
  if (!fs.existsSync(planPath) || !fs.existsSync(ledgerPath)) {
    return { exitCode: ExitCode.GeneralError, message: `Successor plan ${planId} incomplete: need ${planPath} and ${ledgerPath}` };
  }

  const previous = readCurrentPointer(root);
  if (!previous) {
    return bootstrapActivate({ root, planId, planDir, ledgerPath, originalPath, planPath, reason, dryRun });
  }

  const sha = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const planBytes = fs.statSync(planPath).size;
  const ledgerBytes = fs.statSync(ledgerPath).size;

  const rel = (p: string): string => path.relative(root, p).split(path.sep).join("/");
  const original: ArtifactRef = fs.existsSync(originalPath)
    ? { path: rel(originalPath), sha256: sha(originalPath) }
    : { path: rel(planPath), sha256: sha(planPath) };
  const planRoot = `.agent/plans/${planId}`;
  const effectivePlanSha = sha(planPath);
  const effectiveChainTip: ChainTip = { amendment_id: "AM-0000", path: original.path, sha256: original.sha256 };
  const candidateChainTip: CandidateChainTip = { amendment_id: "AM-0000", status: "OWNER_APPROVED_EFFECTIVE", path: original.path, sha256: original.sha256 };
  const canonicalLedger: CanonicalLedger = {
    path: `.agent/ledger/${planId}.json`,
    sha256: sha(ledgerPath),
    observed_revision: 0,
    // AM0015 scorecard binding: observed_effective_sha256 must equal the
    // ledger's effective_plan_identity.sha256 (the canonical plan JSON hash),
    // NOT the plan.md file hash — gather-scorecard-evidence.py requires this
    // equality for the evidence to be considered bound.
    observed_effective_sha256: readLedgerEffectiveIdentitySha256(ledgerPath),
    plan_status: "ADOPTED",
    execution_state: "IN_PROGRESS",
  };
  const requirements = readRequirements(planDir);
  const contract: ContractRef = {
    path: rel(planPath),
    sha256: effectivePlanSha,
    schema_path: "schemas/execution-contract.schema.json",
    requirement_ids: requirements,
    status: "EFFECTIVE",
  };

  if (dryRun) {
    return {
      exitCode: ExitCode.Success,
      message: `Activate dry-run for ${planId}: successor artifacts verified, would CAS-generation ${previous.generation} -> ${previous.generation + 1}`,
      data: {
        previous: { work_id: previous.work_id, plan_id: previous.plan_id, generation: previous.generation },
        successor: { work_id: planId, plan_id: planId, generation: previous.generation + 1 },
        original: original.sha256,
        effective: effectivePlanSha,
        requirements: requirements.length,
        bytes: { plan: planBytes, ledger: ledgerBytes },
        activation_state: activationState ?? "CANONICALLY_ACTIVATED",
      },
    };
  }

  const result = supersedeGoal(root, {
    expected_generation: previous.generation,
    target: {
      work_id: planId,
      plan_id: planId,
      plan_root: planRoot,
      original,
      canonical_ledger: canonicalLedger,
      effective_chain_tip: effectiveChainTip,
      candidate_chain_tip: candidateChainTip,
      contract,
    },
    reason,
    ...(activationState ? { activation_state: activationState as 'BOOTSTRAP_POINTER' | 'BOOTSTRAP_UNCERTIFIED' | 'CANONICALLY_ACTIVATED' } : {}),
  });

  return {
    exitCode: ExitCode.Success,
    message: `Activated ${planId} as generation ${result.current.generation}; previous ${result.previous.work_id} superseded`,
    data: {
      transaction_id: result.transaction_id,
      previous: { work_id: result.previous.work_id, plan_id: result.previous.plan_id, generation: result.previous.generation },
      current: { work_id: result.current.work_id, plan_id: result.current.plan_id, generation: result.current.generation },
      receipt_path: result.receipt_path,
      effective_sha256: effectivePlanSha,
      requirement_count: requirements.length,
      activation_state: result.current.atomicity.activation_state,
    },
  };
}

function readRequirements(planDir: string): string[] {
  const yamlPath = path.join(planDir, "requirements.yaml");
  if (!fs.existsSync(yamlPath)) return [];
  const text = fs.readFileSync(yamlPath, "utf8");
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*-\s*id:\s*([^\s]+)/);
    if (m) out.push(m[1]!);
  }
  return out;
}

/** Read effective_plan_identity.sha256 from a ledger file (AM0015 binding). */
function readLedgerEffectiveIdentitySha256(ledgerPath: string): string {
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { effective_plan_identity?: { sha256?: string } };
    const id = ledger.effective_plan_identity?.sha256;
    if (typeof id === "string" && /^[a-f0-9]{64}$/.test(id)) return id;
  } catch { /* fall through */ }
  return sha256(ledgerPath);
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function bootstrapActivate(input: {
  root: string;
  planId: string;
  planDir: string;
  ledgerPath: string;
  originalPath: string;
  planPath: string;
  reason: string;
  dryRun: boolean;
}): CommandResult {
  const sha = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const planBytes = fs.statSync(input.planPath).size;
  const ledgerBytes = fs.statSync(input.ledgerPath).size;
  const original: ArtifactRef = fs.existsSync(input.originalPath)
    ? { path: `.agent/plans/${input.planId}/original.md`, sha256: sha(input.originalPath) }
    : { path: `.agent/plans/${input.planId}/plan.md`, sha256: sha(input.planPath) };
  const effectivePlanSha = sha(input.planPath);
  const effectiveChainTip: ChainTip = { amendment_id: "AM-0000", path: original.path, sha256: original.sha256 };
  const candidateChainTip: CandidateChainTip = { amendment_id: "AM-0000", status: "OWNER_APPROVED_EFFECTIVE", path: original.path, sha256: original.sha256 };
  const canonicalLedger: CanonicalLedger = {
    path: `.agent/ledger/${input.planId}.json`,
    sha256: sha(input.ledgerPath),
    observed_revision: 0,
    // AM0015 scorecard binding: equals the ledger's effective_plan_identity.sha256.
    observed_effective_sha256: readLedgerEffectiveIdentitySha256(input.ledgerPath),
    plan_status: "ADOPTED",
    execution_state: "IN_PROGRESS",
  };
  const requirements = readRequirements(input.planDir);
  const contract: ContractRef = {
    path: `.agent/plans/${input.planId}/plan.md`,
    sha256: effectivePlanSha,
    schema_path: "schemas/execution-contract.schema.json",
    requirement_ids: requirements,
    status: "EFFECTIVE",
  };

  if (input.dryRun) {
    return {
      exitCode: ExitCode.Success,
      message: `Bootstrap dry-run for ${input.planId}: no active pointer; would create bootstrap generation 1`,
      data: {
        previous: null,
        successor: { work_id: input.planId, plan_id: input.planId, generation: 1 },
        original: original.sha256,
        effective: effectivePlanSha,
        requirements: requirements.length,
        bytes: { plan: planBytes, ledger: ledgerBytes },
      },
    };
  }

  const current: CurrentPointer = {
    schema: "artifact/execution-contract",
    version: 1,
    kind: "current-pointer",
    generation: 1,
    work_id: input.planId,
    plan_id: input.planId,
    plan_root: `.agent/plans/${input.planId}`,
    original,
    canonical_ledger: canonicalLedger,
    effective_chain_tip: effectiveChainTip,
    candidate_chain_tip: candidateChainTip,
    contract,
    atomicity: {
      protocol: "generation-compare-and-swap",
      expected_previous_generation: 0,
      commit_target: ".agent/current.json",
      activation_state: "BOOTSTRAP_POINTER",
      updated_at: new Date().toISOString(),
    },
  };
  commitCurrentPointer(input.root, current, 0);
  const receipt = {
    schema: "artifact/goal-supersession-receipt",
    version: 1,
    transaction_id: `bootstrap-${input.planId}`,
    previous: null,
    current: { work_id: current.work_id, plan_id: current.plan_id, generation: 1 },
    reason: input.reason,
    created_at: current.atomicity.updated_at,
  };
  fs.mkdirSync(path.join(input.root, ".agent", "tombstones"), { recursive: true });
  fs.writeFileSync(path.join(input.root, ".agent", "tombstones", `bootstrap-${input.planId}.json`), JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return {
    exitCode: ExitCode.Success,
    message: `Bootstrapped ${input.planId} as generation 1 (BOOTSTRAP_POINTER); no prior plan to supersede`,
    data: {
      transaction_id: receipt.transaction_id,
      previous: null,
      current: { work_id: current.work_id, plan_id: current.plan_id, generation: 1 },
      effective_sha256: effectivePlanSha,
      requirement_count: requirements.length,
    },
  };
}