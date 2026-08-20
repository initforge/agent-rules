import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { planM11 } from "../src/commands/plan.js";
import { ExitCode } from "../src/types.js";
import {
  candidateEpochHash,
  CANDIDATE_EPOCH_SCHEMA,
  type CandidateEpoch,
} from "@initforge/agent-rules-engine/candidate-epoch";

const PLAN_ID = "test-m11-plan";
const IDENTITY = "e".repeat(64);
const ARTIFACT = "c".repeat(64);

// Git fixture: the terminal gate now requires a real repository HEAD.
// Init a bare git repo so `runHeadCommit(root)` succeeds in planM11.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plan-m11-test-"));
execFileSync("git", ["init", "-q"], { cwd: tmpRoot });
execFileSync("git", ["config", "user.email", "test@local"], { cwd: tmpRoot });
execFileSync("git", ["config", "user.name", "test"], { cwd: tmpRoot });
fs.writeFileSync(path.join(tmpRoot, ".gitkeep"), "");
execFileSync("git", ["add", "-A"], { cwd: tmpRoot });
execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: tmpRoot });
// ponytail: real HEAD from git rev-parse. Skipped: multi-commit HEAD history
// (single-commit HEAD is sufficient for terminal-gate binding). Add when plan
// evolution over multiple commits needs testing.
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmpRoot }).toString().trim();

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeEpoch(): CandidateEpoch {
  return {
    schema: CANDIDATE_EPOCH_SCHEMA,
    source_tree_sha: "b".repeat(40),
    candidate_commit_or_tree: HEAD, // must bind actual repository HEAD
    artifact_digest: ARTIFACT,
    container_image_digests: [],
    dependency_lock_hash: "d".repeat(64),
    migration_set_hash: "e".repeat(64),
    environment_hash: "f".repeat(64),
    fixture_hash: "g".repeat(64),
    topology_hash: "h".repeat(64),
    created_at: new Date().toISOString(),
    build_critical_manifest: [],
    notes: {},
  };
}

function baseLedger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const epoch = makeEpoch();
  const requirements = Array.from({ length: 15 }, (_, i) => ({
    id: `REQ-${String(i + 1).padStart(3, "0")}`,
    status: "MATCH",
    evidence: [{ evidenceHash: "d".repeat(64), fresh: true, observedAt: new Date().toISOString(), identity: IDENTITY }],
  }));
  const scorecard = Array.from({ length: 18 }, (_, i) => ({
    id: `d${String(i + 1).padStart(2, "0")}`,
    score: 9,
    status: "VERIFIED",
  }));
  const ledger: Record<string, unknown> = {
    plan_id: PLAN_ID,
    original_plan: { sha256: "d".repeat(64) },
    effective_plan_identity: { sha256: IDENTITY },
    shadow_revision: 1,
    headCommit: HEAD, // must bind actual repository HEAD
    commitSha: HEAD,  // must bind actual repository HEAD
    execution_state: "EXECUTING",
    status: "EXECUTING",
    findings: [],
    orphanFindings: [],
    attestations: ["codex", "claude", "grok", "opencode", "antigravity"].map((host) => ({
      host,
      commitSha: HEAD, // must bind actual repository HEAD
    })),
    candidate_epoch: epoch,
    milestones: { M8: { requirements, scorecard: { dimensions: scorecard } } },
    ...overrides,
  };
  return ledger;
}

// ponytail: real envelopeSha256 via computeEnvelopeSha256. Skipped: envelope
// tampering detection (covered by engine loadM11TerminalEvidenceEnvelope negative
// cases). Add when loading from a write-producer path.
function computeEnvelopeSha256(env: Record<string, unknown>): string {
  const { envelopeSha256: _drop, ...rest } = env;
  return createHash("sha256").update(JSON.stringify(rest, null, 2)).digest("hex");
}

function envelopeLedger(): Record<string, unknown> {
  const epoch = makeEpoch();
  // Build the envelope content (all fields except envelopeSha256) to compute
  // the real SHA-256 content hash.  The loader recomputes and rejects mismatches
  // (AM-0020 §4 — envelopeSha256 is no longer decorative).
  const envelopeContent: Record<string, unknown> = {
    headCommit: HEAD,       // must bind actual repository HEAD
    effectivePlanIdentity: IDENTITY,
    observedAt: new Date().toISOString(),
    fresh: true,
    ciSha: HEAD,            // must bind actual repository HEAD
    certifiedArtifactSha256: ARTIFACT,
    installedArtifactSha256: ARTIFACT,
    installedFrom: "certified-local-main",
    reconciliationHeadCommit: HEAD, // must bind actual repository HEAD
    parity: "COMPLETE",
    topology: "COMPLETE",
    reviews: [
      { dimension: "architecture", accepted: true, reviewId: "R1", stale: false },
      { dimension: "security", accepted: true, reviewId: "R2", stale: false },
      { dimension: "maintainability", accepted: true, reviewId: "R3", stale: false },
      { dimension: "UX", accepted: true, reviewId: "R4", stale: false },
      { dimension: "operations", accepted: true, reviewId: "R5", stale: false },
    ],
    candidate_epoch_hash: candidateEpochHash(epoch), // must bind candidateEpochHash(ledger.candidate_epoch)
  };
  const envelopeSha256 = computeEnvelopeSha256(envelopeContent);
  return baseLedger({
    candidate_epoch: epoch,
    m11_terminal_evidence: { ...envelopeContent, envelopeSha256 },
  });
}

function writeFixture(ledger: Record<string, unknown>): string {
  const planDir = path.join(tmpRoot, ".agent", "plans", PLAN_ID);
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, "original.md"), "# Test plan\n", "utf8");
  const ledgerDir = path.join(tmpRoot, ".agent", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, `${PLAN_ID}.json`);
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledgerPath;
}

describe("plan m11 (terminal evidence envelope plumbing)", () => {
  it("fails closed when the ledger has no engine-generated m11_terminal_evidence envelope", async () => {
    const ledgerPath = writeFixture(baseLedger());
    const before = fs.readFileSync(ledgerPath, "utf8");

    const result = await planM11([PLAN_ID, tmpRoot], {});

    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("no engine-generated m11_terminal_evidence envelope");
    expect((result.data as { failedGates: string[] }).failedGates).toEqual(["M11_TERMINAL_EVIDENCE_ENVELOPE"]);
    // Fail-closed: zero mutation of the ledger.
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(before);
  });

  it("fails closed when the envelope is incomplete (missing required field)", async () => {
    const ledger = envelopeLedger();
    const env = ledger.m11_terminal_evidence as Record<string, unknown>;
    delete env.installedArtifactSha256;
    const ledgerPath = writeFixture(ledger);
    const before = fs.readFileSync(ledgerPath, "utf8");

    const result = await planM11([PLAN_ID, tmpRoot], {});

    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("installedArtifactSha256");
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(before);
  });

  it("fails closed when the envelope candidate_epoch_hash does not bind the ledger candidate_epoch", async () => {
    const ledger = envelopeLedger();
    (ledger.m11_terminal_evidence as Record<string, unknown>).candidate_epoch_hash = "f".repeat(64);
    const ledgerPath = writeFixture(ledger);
    const before = fs.readFileSync(ledgerPath, "utf8");

    const result = await planM11([PLAN_ID, tmpRoot], {});

    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("candidate_epoch_hash");
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(before);
  });

  it("accepts a complete envelope, binds the epoch hash, and reaches the evaluator", async () => {
    const ledger = envelopeLedger();
    const ledgerPath = writeFixture(ledger);
    const before = fs.readFileSync(ledgerPath, "utf8");

    const result = await planM11([PLAN_ID, tmpRoot], {});

    const data = result.data as { eligible: boolean; failedGates: string[]; gates: Array<{ name: string; status: string }> };
    expect(data.failedGates).not.toContain("M11_TERMINAL_EVIDENCE_ENVELOPE");
    expect(data.failedGates).not.toContain("M11_CANDIDATE_EPOCH_BOUND");
    expect(data.gates.find((g) => g.name === "M11_CANDIDATE_EPOCH_BOUND")?.status).toBe("PASS");
    expect(data.gates.find((g) => g.name === "M11_EFFECTIVE_REQUIREMENTS_MATCH")?.status).toBe("PASS");
    // Pure evaluator run: never emits the terminal token.
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(before);
    expect(data.eligible).toBe(true);
    expect(result.exitCode).toBe(ExitCode.Success);
  });

  it("--finalize still requires the envelope: absent envelope mutates nothing", async () => {
    const ledgerPath = writeFixture(baseLedger());
    const before = fs.readFileSync(ledgerPath, "utf8");

    const result = await planM11([PLAN_ID, tmpRoot, "--finalize"], {});

    expect(result.exitCode).toBe(ExitCode.GeneralError);
    expect(result.message).toContain("no engine-generated m11_terminal_evidence envelope");
    expect(fs.readFileSync(ledgerPath, "utf8")).toBe(before);
  });
});
