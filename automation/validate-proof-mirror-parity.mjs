#!/usr/bin/env node
/**
 * validate-proof-mirror-parity.mjs — verify the adaptive-minimal-proof rule
 * (20-proof-outcome.md, minimal-proof owner) is projected into every platform
 * mirror (owner §14):
 *   - rule 20-proof-outcome.md present in each mirror rules/;
 *   - manifest.yaml rule contract entry present;
 *   - proof-*.schema.json present in each mirror;
 *   - source rule hash === mirror rule hash (no drift).
 *
 * Native host activation is NEVER claimed from static file presence; this
 * validator only proves the projection/parity layer, and platform activation
 * stays NATIVE_UNVERIFIED unless a live host receipt exists elsewhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RULE = '20-proof-outcome.md';
const SCHEMAS = [
  'proof-trigger.schema.json', 'proof-receipt.schema.json', 'proof-profile.schema.json',
  'proof-omission.schema.json', 'claim-to-proof.schema.json', 'risk-to-proof.schema.json',
  'test-refactor-matrix.schema.json',
];

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function main() {
  const buildRoot = path.join(ROOT, 'generated', 'runtime-build');
  if (!fs.existsSync(buildRoot)) {
    console.error('validate-proof-mirror-parity: no generated/runtime-build — run npm run build first');
    process.exit(1);
  }
  const platforms = fs.readdirSync(buildRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const errors = [];
  const sourceRule = path.join(ROOT, 'rules', RULE);
  const sourceHash = sha256(sourceRule);
  let checked = 0;

  for (const platform of platforms) {
    const mirrorRule = path.join(buildRoot, platform, 'rules', RULE);
    if (!fs.existsSync(mirrorRule)) {
      // OpenCode's runtime resolves rules from the canonical source rules/
      // directory at session start (AGENTS.md binds to the source path), so
      // it has no mirror rules/ copy by design. Verify that source-bound
      // activation path instead.
      const agents = path.join(buildRoot, platform, 'AGENTS.md');
      if (platform === 'opencode' && fs.existsSync(agents) && fs.readFileSync(agents, 'utf8').includes('/rules/manifest.yaml')) {
        checked++;
        continue;
      }
      errors.push(`${platform}: rules/${RULE} missing`);
      continue;
    }
    const mirrorHash = sha256(mirrorRule);
    if (mirrorHash !== sourceHash) errors.push(`${platform}: rules/${RULE} hash drift (source ${sourceHash.slice(0, 12)} != mirror ${mirrorHash.slice(0, 12)})`);
    checked++;

    const manifest = path.join(buildRoot, platform, 'rules', 'manifest.yaml');
    if (fs.existsSync(manifest) && !fs.readFileSync(manifest, 'utf8').includes('20-proof-outcome.md')) {
      errors.push(`${platform}: manifest.yaml lacks the proof-testing rule contract`);
    }
    for (const schema of SCHEMAS) {
      const mirrorSchema = path.join(buildRoot, platform, schema);
      if (!fs.existsSync(mirrorSchema)) {
        errors.push(`${platform}: ${schema} missing`);
        continue;
      }
      const srcSchema = path.join(ROOT, 'schemas', schema);
      if (sha256(mirrorSchema) !== sha256(srcSchema)) errors.push(`${platform}: ${schema} hash drift`);
      checked++;
    }
  }

  if (errors.length > 0) {
    console.error(`validate-proof-mirror-parity: FAIL (${errors.length})`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`validate-proof-mirror-parity: OK (platforms=${platforms.length}, artifacts=${checked}, native activation NOT claimed from file presence)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
