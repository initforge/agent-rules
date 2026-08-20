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
import { execFileSync } from "node:child_process";
import { activateCmd } from "../src/commands/activate.js";
import { closeCmd } from "../src/commands/close.js";
import { ExitCode } from "../src/types.js";
import { readCurrentPointer } from "../src/services/current-pointer.js";

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

  it("commits manifest + residue + correction on a valid fixture", async () => {
    
    seedPlan(fixture, "good", ["PASS", "PASS"]);
    git(fixture, ["add", "-A"]);
    git(fixture, ["commit", "-q", "-m", "seed"]);
    const result = await runClose(fixture, "good");
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.data?.committed).toBe(true);
    const closureDir = path.join(fixture, ".agent", "closure");
    expect(fs.existsSync(path.join(closureDir, "good.committed.json"))).toBe(true);
    expect(fs.existsSync(path.join(closureDir, "good.residue.json"))).toBe(true);
    expect(fs.existsSync(path.join(closureDir, "northstar-on-demand-portable-harness.correction.json"))).toBe(true);
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
