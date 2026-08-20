/**
 * Phase 1 — CLI activate + close (unified closure service trust root).
 *
 * These tests exercise the real CLI command functions in a disposable generic
 * fixture repository (G1-style: no prior .agent state, no agent-rules layout).
 * They prove:
 *  - bootstrap activation creates generation 1 pointer via CAS;
 *  - supersession activation advances the generation;
 *  - close rejects empty requirements / empty reconciliation / missing binding;
 *  - close commits a manifest + residue + correction through the single commit
 *    point and keeps the consumer worktree source-clean.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { activateCmd } from "../src/commands/activate.js";
import { closeCmd } from "../src/commands/close.js";
import { ExitCode } from "../src/types.js";
import { commitCurrentPointer, readCurrentPointer, type CurrentPointer } from "../src/services/current-pointer.js";

const roots: string[] = [];
let fixture: string;

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vnext-cli-"));
  roots.push(root);
  return root;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "ignore" });
}

function seedPlan(root: string, planId: string, reqStatuses: string[]): void {
  const planDir = path.join(root, ".agent", "plans", planId);
  const ledgerDir = path.join(root, ".agent", "ledger");
  const evDir = path.join(root, ".agent", "evidence", planId);
  fs.mkdirSync(planDir, { recursive: true });
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.mkdirSync(evDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, "plan.md"), `# ${planId}\n\nFrozen contract.`);
  fs.writeFileSync(path.join(planDir, "original.md"), `# ${planId} original`);
  fs.writeFileSync(path.join(root, ".gitignore"), "# seed fixture\n");
  const reqLines = reqStatuses.map((s, i) => `  - id: REQ-00${i + 1}\n    statement: requirement ${i + 1}\n    status: ${s}`).join("\n");
  fs.writeFileSync(path.join(planDir, "requirements.yaml"), `version: 1\nplan_id: ${planId}\nrequirements:\n${reqLines}\n`);
  const reqs = reqStatuses.reduce<Record<string, { statement: string }>>((acc, _s, i) => {
    acc[`REQ-00${i + 1}`] = { statement: `requirement ${i + 1}` };
    return acc;
  }, {});
  fs.writeFileSync(path.join(ledgerDir, `${planId}.json`), JSON.stringify({
    plan_id: planId,
    status: "ACTIVE",
    execution_state: "IN_PROGRESS",
    reconciliations: reqStatuses.map((_s, i) => ({ claim_id: `c${i}`, status: "PASS" })),
    requirements: reqs,
  }));
  fs.writeFileSync(path.join(evDir, "evidence.json"), JSON.stringify({ schema: "artifact/phase-proof-receipt", status: "COMPLETED_NO_PASS_CLAIM", outcome: "PASS" }));
}

async function runClose(root: string, planId: string, opts: string[] = []): Promise<{ exitCode: number; message: string; data?: Record<string, unknown> }> {
  const cwd = process.cwd();
  process.chdir(root);
  try {
    return await closeCmd([planId, ...opts], { json: false, dryRun: false, verbose: false });
  } finally {
    process.chdir(cwd);
  }
}

async function runActivate(root: string, planId: string, opts: string[] = []): Promise<{ exitCode: number; message: string; data?: Record<string, unknown> }> {
  const cwd = process.cwd();
  process.chdir(root);
  try {
    return await activateCmd([planId, ...opts], { json: false, dryRun: false, verbose: false });
  } finally {
    process.chdir(cwd);
  }
}

beforeEach(() => {
  fixture = makeRepo();
  git(fixture, ["init", "-q"]);
  git(fixture, ["config", "user.email", "t@t.t"]);
  git(fixture, ["config", "user.name", "t"]);
});

afterEach(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe("activate — bootstrap + supersession CAS", () => {
  it("bootstraps the first pointer at generation 1", async () => {
    
    seedPlan(fixture, "terminal-harness-vnext", ["PASS", "PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runActivate(fixture, "terminal-harness-vnext", ["--reason", "owner authorized"]);
    expect(result.exitCode).toBe(ExitCode.Success);
    const pointer = readCurrentPointer(fixture)!;
    expect(pointer.generation).toBe(1);
    expect(pointer.work_id).toBe("terminal-harness-vnext");
  });

  it("advances generation on supersession activation", async () => {
    
    seedPlan(fixture, "old-plan", ["PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed old"]);
    await runActivate(fixture, "old-plan", ["--reason", "initial"]);
    seedPlan(fixture, "new-plan", ["PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed new"]);
    const result = await runActivate(fixture, "new-plan", ["--reason", "supersede old"]);
    expect(result.exitCode).toBe(ExitCode.Success);
    const pointer = readCurrentPointer(fixture)!;
    expect(pointer.generation).toBe(2);
    expect(pointer.plan_id).toBe("new-plan");
    expect(pointer.supersession?.previous_plan_id).toBe("old-plan");
  });
});

describe("close — unified closure transaction (never false PASS)", () => {
  it("blocks empty requirements (never false PASS)", async () => {
    
    seedPlan(fixture, "empty-req", []);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runClose(fixture, "empty-req");
    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("zero requirements");
  });

  it("blocks empty reconciliation", async () => {
    
    seedPlan(fixture, "no-recon", ["PASS"]);
    const ledgerPath = path.join(fixture, ".agent", "ledger", "no-recon.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as { reconciliations: unknown[] };
    ledger.reconciliations = [];
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger));
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runClose(fixture, "no-recon");
    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("zero reconciliations");
  });

  it("commits manifest + residue + generic stale-terminal correction (never false PASS)", async () => {
    seedPlan(fixture, "good", ["PASS", "PASS"]);
    // Seed an active pointer whose plan ledger claims a terminal PASS with a
    // stale final SHA and an invalid activation state. The generic correction
    // must reclassify the pointed plan SUPERSEDED/INACTIVE/PARTIAL — driven by
    // pointer/ledger facts, never a hard-coded plan id.
    const stalePlan = "stale-terminal-plan";
    const planDir = path.join(fixture, ".agent", "plans", stalePlan);
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, "plan.md"), `# ${stalePlan}\n\nFrozen contract.`);
    fs.writeFileSync(path.join(planDir, "original.md"), `# ${stalePlan} original`);
    fs.mkdirSync(path.join(fixture, ".agent", "ledger"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, ".agent", "ledger", `${stalePlan}.json`),
      JSON.stringify({
        plan_id: stalePlan,
        status: "COMPLETED",
        execution_state: "COMPLETED",
        closure: { terminal_outcome: "PASS", final_sha: "1ecb8fd880233cdfd105a4caa825be6b98b1c892" },
      })
    );
    const sha = (p: string) => createHash("sha256").update(fs.readFileSync(path.join(fixture, p))).digest("hex");
    const staleLedgerPath = `.agent/ledger/${stalePlan}.json`;
    const stalePointer: CurrentPointer = {
      schema: "artifact/execution-contract",
      version: 1,
      kind: "current-pointer",
      generation: 1,
      work_id: stalePlan,
      plan_id: stalePlan,
      plan_root: `.agent/plans/${stalePlan}`,
      original: { path: `.agent/plans/${stalePlan}/original.md`, sha256: sha(`.agent/plans/${stalePlan}/original.md`) },
      canonical_ledger: { path: staleLedgerPath, sha256: sha(staleLedgerPath), observed_revision: 1, observed_effective_sha256: "b".repeat(64), plan_status: "COMPLETED", execution_state: "COMPLETED" },
      effective_chain_tip: { amendment_id: "AM-0000", path: `.agent/plans/${stalePlan}/plan.md`, sha256: sha(`.agent/plans/${stalePlan}/plan.md`) },
      candidate_chain_tip: { amendment_id: "AM-0000", status: "OWNER_APPROVED_EFFECTIVE", path: `.agent/plans/${stalePlan}/plan.md`, sha256: sha(`.agent/plans/${stalePlan}/plan.md`) },
      contract: { path: `.agent/plans/${stalePlan}/plan.md`, sha256: sha(`.agent/plans/${stalePlan}/plan.md`), schema_path: "schemas/execution-contract.schema.json", requirement_ids: [], status: "EFFECTIVE" },
      atomicity: { protocol: "generation-compare-and-swap", expected_previous_generation: 0, commit_target: ".agent/current.json", activation_state: "DEACTIVATED_TERMINAL", updated_at: new Date().toISOString() },
    };
    commitCurrentPointer(fixture, stalePointer, 0);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runClose(fixture, "good");
    // The fixture evidence is COMPLETED_NO_PASS_CLAIM, so closure must be PARTIAL
    // and never exit 0 — fail-closed, no false PASS.
    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.data?.terminal_outcome).toBe("PARTIAL");
    expect(result.data?.deactivated).toBe(false);
    expect(result.data?.committed).toBe(true);
    const closureDir = path.join(fixture, ".agent", "closure");
    expect(fs.existsSync(path.join(closureDir, "good.committed.json"))).toBe(true);
    expect(fs.existsSync(path.join(closureDir, "good.residue.json"))).toBe(true);
    // Generic correction reclassified the pointed stale-terminal plan.
    expect(fs.existsSync(path.join(closureDir, `${stalePlan}.correction.json`))).toBe(true);
    const correctedLedger = JSON.parse(fs.readFileSync(path.join(fixture, ".agent", "ledger", `${stalePlan}.json`), "utf8")) as Record<string, unknown>;
    expect(correctedLedger.status).toBe("SUPERSEDED");
    expect(correctedLedger.execution_state).toBe("INACTIVE");
  });

  it("keeps the consumer worktree source-clean after closure", async () => {
    seedPlan(fixture, "clean-repo", ["PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    await runClose(fixture, "clean-repo");
    // The only new untracked path is the operational-state .gitignore marker itself.
    const untracked = execFileSync("git", ["status", "--porcelain"], { cwd: fixture, encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("??"));
    expect(untracked).toEqual([]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "close"]);
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: fixture, encoding: "utf8" }).trim();
    expect(status.length).toBe(0);
  });

  it("dry-run runs the gates without committing", async () => {
    
    seedPlan(fixture, "dry", ["PASS", "PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runClose(fixture, "dry", ["--dry-run"]);
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(path.join(fixture, ".agent", "closure"))).toBe(false);
  });
});
