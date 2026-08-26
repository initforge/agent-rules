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
  const currentPath = path.join(root, '.agent', 'current.json');
  if (!fs.existsSync(currentPath)) return [];
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  const planRoot = typeof current.plan_root === 'string' ? path.resolve(root, current.plan_root) : '';
  return planRoot && fs.existsSync(path.join(planRoot, 'plan.json')) ? [planRoot] : [];
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
  const isCurrentContract = typeof plan.level === 'string';
  if (!isCurrentContract) {
    failures += 1;
    console.error(`REJECTED ${path.relative(root, file)}: current-contract artifact missing required "level" field`);
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
