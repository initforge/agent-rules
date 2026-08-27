#!/usr/bin/env node
/**
 * cas-plan-pointer.mjs — CAS-commit .agent/current.json to a plan.
 *
 * Usage: node automation/cas-plan-pointer.mjs <plan-id> [expected-generation]
 *
 * Builds a generation-compare-and-swap candidate pointing at the given plan.
 * It supports both legacy `.agent/plans/<id>/plan.md` artifacts and the current
 * resumable `.agent/runs/<id>/plan.json` artifact. The latter is its own contract.
 * It then commits via
 * commitCurrentPointer (fail-closed CAS: stale generation, path escape, symlink,
 * hash mismatch, occupied stage all abort without touching the live pointer).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { commitCurrentPointer, readCurrentPointer } = await importTsPointer();

async function importTsPointer() {
  // Prefer compiled dist (built by `npm run build`), fall back to tsx runner.
  const dist = path.join(ROOT, "packages", "cli", "dist", "services", "current-pointer.js");
  if (fs.existsSync(dist)) return import(pathToFileURL(dist).href);
  const src = path.join(ROOT, "packages", "cli", "src", "services", "current-pointer.ts");
  if (fs.existsSync(path.join(ROOT, "node_modules", ".bin", "tsx"))) {
    const { pathToFileURL } = await import("node:url");
    const { default: tsx } = await import(pathToFileURL(path.join(ROOT, "node_modules", "tsx", "dist", "loader.mjs")).href).catch(() => ({}));
    if (!tsx) {
      // Spawn tsx as a subprocess with a tiny bridge instead.
      const { execFileSync } = await import("node:child_process");
      const code = `
        const { commitCurrentPointer, readCurrentPointer } = require(${JSON.stringify(src)});
        process.stdout.write(JSON.stringify({ commit: commitCurrentPointer.toString(), read: readCurrentPointer.toString() }));
      `;
      // tsx cannot require ESM ts directly; use dynamic import through a data URL.
      const out = execFileSync(
        path.join(ROOT, "node_modules", ".bin", "tsx"),
        ["-e", `import(${JSON.stringify(pathToFileURL(src).href)}).then(m => process.stdout.write(JSON.stringify({commit: typeof m.commitCurrentPointer, read: typeof m.readCurrentPointer}))).catch(e => { console.error(e); process.exit(1); })`],
        { cwd: ROOT, encoding: "utf8" },
      );
      const r = JSON.parse(out.trim());
      if (r.commit !== "function") throw new Error("tsx bridge did not load current-pointer.ts");
      const { pathToFileURL: ptu } = await import("node:url");
      return import(ptu(src).href);
    }
    return import(pathToFileURL(src).href);
  }
  throw new Error("no compiled dist and no tsx available to load current-pointer.ts");
}

function sha256(p) {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** Read effective_plan_identity.sha256 from a ledger file (AM0015 binding). */
function readLedgerEffectiveIdentitySha256(ledgerPath) {
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const id = ledger.effective_plan_identity;
    if (id && typeof id.sha256 === "string" && /^[a-f0-9]{64}$/.test(id.sha256)) return id.sha256;
  } catch { /* fall through */ }
  return sha256(ledgerPath);
}

const planId = process.argv[2];
if (!planId) {
  console.error("usage: node automation/cas-plan-pointer.mjs <plan-id> [expected-generation] [--activation-state <state>]");
  process.exit(2);
}

const stateIdx = process.argv.indexOf("--activation-state");
const activationState = stateIdx >= 0 ? process.argv[stateIdx + 1] : "CANONICALLY_ACTIVATED";
const VALID_STATES = ["BOOTSTRAP_POINTER", "BOOTSTRAP_UNCERTIFIED", "CANONICALLY_ACTIVATED"];
if (!VALID_STATES.includes(activationState)) {
  console.error(`invalid --activation-state ${activationState}; must be one of ${VALID_STATES.join(", ")}`);
  process.exit(2);
}

const legacyPlanRoot = `.agent/plans/${planId}`;
const runtimePlanRoot = `.agent/runs/${planId}`;
const legacyPlan = path.join(ROOT, legacyPlanRoot, "plan.md");
const runtimePlan = path.join(ROOT, runtimePlanRoot, "plan.json");
const planPath = fs.existsSync(runtimePlan) ? runtimePlan : legacyPlan;
const planRoot = fs.existsSync(runtimePlan) ? runtimePlanRoot : legacyPlanRoot;
const ledger = path.join(ROOT, ".agent", "ledger", `${planId}.json`);
if (!fs.existsSync(planPath)) { console.error(`plan artifact missing: ${planPath}`); process.exit(2); }
if (!fs.existsSync(ledger)) { console.error(`ledger missing: ${ledger}`); process.exit(2); }

// Prefer the resumable plan itself, otherwise the newest legacy effective
// contract, then the schema.
let genDirs = [];
try {
  genDirs = fs.readdirSync(path.join(ROOT, planRoot, "generations"))
    .filter((d) => /^\d+$/.test(d))
    .map(Number)
    .sort((a, b) => b - a);
} catch { /* none */ }
const contractCandidates = [
  ...(planPath === runtimePlan ? [runtimePlan] : []),
  ...genDirs.map((g) => path.join(ROOT, planRoot, "generations", String(g), "effective-contract.json")),
  path.join(ROOT, "schemas", "execution-contract.schema.json"),
];
const contractPath = contractCandidates.find((p) => fs.existsSync(p));
if (!contractPath) { console.error("no contract artifact found"); process.exit(2); }

const current = readCurrentPointer(ROOT);
const expectedPrev = process.argv[3] !== undefined
  ? Number(process.argv[3])
  : (current ? current.generation : 0);

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const planRel = rel(planPath);
const ledgerRel = rel(ledger);
const contractRel = rel(contractPath);

// Load requirement ids from either contract shape.
let requirementIds = [];
try {
  const c = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (Array.isArray(c.requirements) && c.requirements.length > 0) requirementIds = c.requirements;
  else if (Array.isArray(c.requirement_ids) && c.requirement_ids.length > 0) requirementIds = c.requirement_ids;
  if (Array.isArray(c.requirements) && c.requirements.every((item) => item && typeof item === "object" && typeof item.id === "string")) {
    requirementIds = c.requirements.map((item) => item.id);
  }
} catch { /* fall through */ }

const supersession = current && current.work_id && current.work_id !== planId
  ? {
      transaction_id: `CAS-${Math.random().toString(16).slice(2, 12)}`,
      previous_work_id: current.work_id,
      previous_plan_id: current.plan_id,
      reason: "owner-authorized re-adoption: canonical pointer moves to " + planId,
      changed_at: new Date().toISOString(),
    }
  : undefined;

const candidate = {
  schema: "artifact/execution-contract",
  version: 1,
  kind: "current-pointer",
  generation: expectedPrev + 1,
  work_id: planId,
  plan_id: planId,
  plan_root: planRoot,
  original: { path: planRel, sha256: sha256(planPath) },
  canonical_ledger: {
    path: ledgerRel,
    sha256: sha256(ledger),
    observed_revision: (() => {
      try { return Number(JSON.parse(fs.readFileSync(ledger, "utf8")).revision ?? 1); } catch { return 1; }
    })(),
    // observed_effective_sha256 is the ledger's effective_plan_identity.sha256
    // (hash of the canonical plan JSON), NOT the ledger file hash — the AM0015
    // scorecard binding and gather-scorecard-evidence.py require this
    // equality to consider evidence bound.
    observed_effective_sha256: readLedgerEffectiveIdentitySha256(ledger),
    plan_status: "ACTIVE",
    execution_state: "IN_PROGRESS",
  },
  effective_chain_tip: { amendment_id: "AM-0000", path: planRel, sha256: sha256(planPath) },
  candidate_chain_tip: {
    amendment_id: "AM-0000",
    status: activationState === "CANONICALLY_ACTIVATED"
      ? "OWNER_APPROVED_EFFECTIVE"
      : "OWNER_APPROVED_PENDING_CANONICAL_ACTIVATION",
    path: planRel,
    sha256: sha256(planPath),
  },
  contract: {
    path: contractRel,
    sha256: sha256(contractPath),
    schema_path: planPath === runtimePlan ? "schemas/plan.schema.json" : "schemas/execution-contract.schema.json",
    requirement_ids: requirementIds,
    status: "EFFECTIVE",
  },
  ...(supersession ? { supersession } : {}),
  atomicity: {
    protocol: "generation-compare-and-swap",
    expected_previous_generation: expectedPrev,
    commit_target: ".agent/current.json",
    activation_state: activationState,
    updated_at: new Date().toISOString(),
  },
};

const receipt = commitCurrentPointer(ROOT, candidate, expectedPrev);
console.log(JSON.stringify(receipt, null, 2));
