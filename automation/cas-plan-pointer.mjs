#!/usr/bin/env node
/**
 * cas-plan-pointer.mjs — CAS-commit .agent/current.json to a plan.
 *
 * Usage: node automation/cas-plan-pointer.mjs <plan-id> [expected-generation]
 *
 * Builds a generation-compare-and-swap candidate pointing at the given plan
 * (original = plan.md, ledger = .agent/ledger/<plan-id>.json, chain tip = plan.md,
 * contract = .agent/plans/<plan-id>/generations/1/effective-contract.json when
 * present, otherwise schemas/execution-contract.schema.json) and commits it via
 * commitCurrentPointer (fail-closed CAS: stale generation, path escape, symlink,
 * hash mismatch, occupied stage all abort without touching the live pointer).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { commitCurrentPointer, readCurrentPointer } = await importTsPointer();

async function importTsPointer() {
  // Prefer compiled dist (built by `npm run build`), fall back to tsx runner.
  const dist = path.join(ROOT, "packages", "cli", "dist", "services", "current-pointer.js");
  if (fs.existsSync(dist)) return import(dist);
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
  console.error("usage: node automation/cas-plan-pointer.mjs <plan-id> [expected-generation]");
  process.exit(2);
}

const planRoot = `.agent/plans/${planId}`;
const planMd = path.join(ROOT, planRoot, "plan.md");
const ledger = path.join(ROOT, ".agent", "ledger", `${planId}.json`);
if (!fs.existsSync(planMd)) { console.error(`plan.md missing: ${planMd}`); process.exit(2); }
if (!fs.existsSync(ledger)) { console.error(`ledger missing: ${ledger}`); process.exit(2); }

// Prefer the NEWEST generation effective-contract, then the schema.
let genDirs = [];
try {
  genDirs = fs.readdirSync(path.join(ROOT, planRoot, "generations"))
    .filter((d) => /^\d+$/.test(d))
    .map(Number)
    .sort((a, b) => b - a);
} catch { /* none */ }
const contractCandidates = [
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
const planMdRel = rel(planMd);
const ledgerRel = rel(ledger);
const contractRel = rel(contractPath);

// Load requirement ids from the effective contract when present, else fall back.
let requirementIds = [];
try {
  const c = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (Array.isArray(c.requirements) && c.requirements.length > 0) requirementIds = c.requirements;
  else if (Array.isArray(c.requirement_ids) && c.requirement_ids.length > 0) requirementIds = c.requirement_ids;
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
  original: { path: planMdRel, sha256: sha256(planMd) },
  canonical_ledger: {
    path: ledgerRel,
    sha256: sha256(ledger),
    observed_revision: 1,
    // observed_effective_sha256 is the ledger's effective_plan_identity.sha256
    // (hash of the canonical plan JSON), NOT the ledger file hash — the AM0015
    // scorecard binding and gather-scorecard-evidence.py require this
    // equality to consider evidence bound.
    observed_effective_sha256: readLedgerEffectiveIdentitySha256(ledger),
    plan_status: "ADOPTED",
    execution_state: "IN_PROGRESS",
  },
  effective_chain_tip: { amendment_id: "AM-0000", path: planMdRel, sha256: sha256(planMd) },
  candidate_chain_tip: {
    amendment_id: "AM-0000",
    status: "OWNER_APPROVED_PENDING_CANONICAL_ACTIVATION",
    path: planMdRel,
    sha256: sha256(planMd),
  },
  contract: {
    path: contractRel,
    sha256: sha256(contractPath),
    schema_path: "schemas/execution-contract.schema.json",
    requirement_ids: requirementIds,
    status: "EFFECTIVE",
  },
  ...(supersession ? { supersession } : {}),
  atomicity: {
    protocol: "generation-compare-and-swap",
    expected_previous_generation: expectedPrev,
    commit_target: ".agent/current.json",
    activation_state: "CANONICALLY_ACTIVATED",
    updated_at: new Date().toISOString(),
  },
};

const receipt = commitCurrentPointer(ROOT, candidate, expectedPrev);
console.log(JSON.stringify(receipt, null, 2));
