#!/usr/bin/env node
/**
 * validate-canonical-plan.mjs — single machine-readable authority check for
 * artifact/plan documents (steering amendment §3).
 *
 * Validates every current-phase canonical plan artifact against
 * schemas/plan.schema.json. Markdown/native-host plans are projections only.
 *
 * Usage:
 *   node automation/validate-canonical-plan.mjs                # all plans with plan.json
 *   node automation/validate-canonical-plan.mjs <plan-dir>...  # specific plan dirs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'schemas', 'plan.schema.json');

function collectPlanDirs(args) {
  if (args.length > 0) return args.map((a) => path.resolve(root, a));
  const plansRoot = path.join(root, '.agent', 'plans');
  const out = [];
  // Current-phase plans are those with a machine-readable plan.json. Retired
  // historical plans without one are not candidates.
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, 'plan.json'))) out.push(full);
      else walk(full);
    }
  };
  if (fs.existsSync(plansRoot)) walk(plansRoot);
  return out;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

const dirs = collectPlanDirs(process.argv.slice(2));
if (dirs.length === 0) {
  console.log('validate-canonical-plan: no canonical plan.json artifacts found (nothing to validate)');
  process.exit(0);
}

let failures = 0;
let legacySkipped = 0;
for (const dir of dirs) {
  const file = path.join(dir, 'plan.json');
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures += 1;
    console.error(`REJECTED ${path.relative(root, file)}: invalid JSON (${error.message})`);
    continue;
  }
  // Retired historical phases predate the portable contract; they are provenance
  // records, not active authorities. Any NEW plan artifact (not in the retired
  // set) must declare `level` — a current-phase plan without one fails closed.
  const RETIRED_PLAN_DIRS = new Set([
    'harness-universal-reconciliation-v1',
    'mcp-availability-repair-v1',
    'mcp-visible-workspace-isolation-v1',
    'skill-mcp-fabric-v1',
  ]);
  const dirName = path.basename(dir);
  const isCurrentContract = typeof plan.level === 'string';
  if (!isCurrentContract && !RETIRED_PLAN_DIRS.has(dirName)) {
    failures += 1;
    console.error(`REJECTED ${path.relative(root, file)}: current-contract artifact missing required "level" field`);
    continue;
  }
  if (!isCurrentContract) {
    legacySkipped += 1;
    console.log(`LEGACY_SKIP ${path.relative(root, file)} (retired historical artifact; not an active authority)`);
    continue;
  }
  const ok = validate(plan);
  if (!ok) {
    failures += 1;
    console.error(`REJECTED ${path.relative(root, file)}:`);
    for (const err of validate.errors) {
      console.error(`  - ${err.instancePath} ${err.message}`);
    }
  } else {
    console.log(`PASS ${path.relative(root, file)} (level=${plan.level ?? 'legacy'}, schema-valid)`);
  }
}

console.log(`canonical plan validation: ${dirs.length - legacySkipped} current, ${legacySkipped} legacy-skip, ${failures} rejected`);
process.exit(failures === 0 ? 0 : 1);
