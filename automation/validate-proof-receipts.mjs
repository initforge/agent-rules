#!/usr/bin/env node
/**
 * validate-proof-receipts.mjs — canonical validator for adaptive-minimal-proof-
 * testing artifacts (owner §12/§15).
 *
 * Verifies:
 *  - every proof receipt under .agent/evidence/proof-receipts/ matches
 *    schemas/proof-receipt.schema.json AND the six-status semantics
 *    (BLOCKED/UNSUPPORTED can never be final PASS; empty claims can never be
 *    PASS);
 *  - every proof receipt records at least one selected OR omitted proof;
 *  - positive/negative fixture pairs under schemas/fixtures/proof-* pass the
 *    expected validation outcome.
 *
 * Usage:
 *   node automation/validate-proof-receipts.mjs            # receipts + fixtures
 *   node automation/validate-proof-receipts.mjs --fixtures # fixtures only
 *   node automation/validate-proof-receipts.mjs --receipts <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const Ajv = require('ajv/dist/2020.js').default ?? require('ajv/dist/2020.js');
const addFormats = require('ajv-formats').default ?? require('ajv-formats');

function loadSchema(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', name), 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(raw);
}

const RECEIPT_VALIDATOR = loadSchema('proof-receipt.schema.json');
const TRIGGER_VALIDATOR = loadSchema('proof-trigger.schema.json');
const REFACTOR_VALIDATOR = loadSchema('test-refactor-matrix.schema.json');

const STATUSES = ['PASS', 'PARTIAL', 'BLOCKED', 'UNSUPPORTED', 'PRE-EXISTING', 'NEEDS_USER'];

function validateReceipt(receipt) {
  const errors = [];
  if (!RECEIPT_VALIDATOR(receipt)) {
    errors.push(`schema: ${JSON.stringify(RECEIPT_VALIDATOR.errors?.slice(0, 3) ?? [])}`);
  }
  if (!STATUSES.includes(receipt.final_status)) errors.push(`final_status ${receipt.final_status} not in six-status set`);
  if (receipt.final_status === 'PASS' && receipt.results.some((r) => r.status === 'BLOCKED' || r.status === 'UNSUPPORTED')) {
    errors.push('final PASS with BLOCKED/UNSUPPORTED results — illegal');
  }
  if (receipt.final_status === 'PASS' && receipt.claims.length === 0) {
    errors.push('final PASS with zero claims — illegal');
  }
  if (receipt.selected.length === 0 && receipt.omitted.length === 0) {
    errors.push('receipt with neither selected nor omitted proof — silent skip');
  }
  return errors;
}

function runFixtures() {
  const fixtureDir = path.join(ROOT, 'schemas', 'fixtures');
  const errors = [];
  let checked = 0;
  for (const entry of fs.readdirSync(fixtureDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('proof-')) continue;
    for (const file of fs.readdirSync(path.join(fixtureDir, entry.name))) {
      const full = path.join(fixtureDir, entry.name, file);
      const fixture = JSON.parse(fs.readFileSync(full, 'utf8'));
      const schemaName = fixture.schema_name;
      const expectedValid = fixture.valid === true;
      const validator = schemaName === 'proof-receipt' ? RECEIPT_VALIDATOR
        : schemaName === 'proof-trigger' ? TRIGGER_VALIDATOR
          : schemaName === 'test-refactor-matrix' ? REFACTOR_VALIDATOR
            : null;
      if (!validator) { errors.push(`${entry.name}/${file}: unknown schema_name ${schemaName}`); continue; }
      const valid = validator(fixture.data);
      const semanticErrors = schemaName === 'proof-receipt' && valid ? validateReceipt(fixture.data) : [];
      const ok = valid === expectedValid && semanticErrors.length === 0;
      if (!ok) {
        errors.push(`${entry.name}/${file}: expected valid=${expectedValid} got ${valid}${semanticErrors.length ? ' + ' + semanticErrors.join('; ') : ''}`);
      }
      checked++;
    }
  }
  return { checked, errors };
}

function main() {
  const args = process.argv.slice(2);
  const onlyFixtures = args.includes('--fixtures');
  const receiptsDirArg = args.find((a) => a.startsWith('--receipts='));
  const errors = [];

  if (!onlyFixtures) {
    const receiptsDir = receiptsDirArg ? receiptsDirArg.split('=')[1] : path.join(ROOT, '.agent', 'evidence', 'proof-receipts');
    if (fs.existsSync(receiptsDir)) {
      for (const file of fs.readdirSync(receiptsDir).filter((f) => f.endsWith('.json'))) {
        const receipt = JSON.parse(fs.readFileSync(path.join(receiptsDir, file), 'utf8'));
        for (const e of validateReceipt(receipt)) errors.push(`${file}: ${e}`);
      }
    }
  }

  const fixtures = runFixtures();
  for (const e of fixtures.errors) errors.push(`fixture: ${e}`);

  if (errors.length > 0) {
    console.error(`validate-proof-receipts: FAIL (${errors.length})`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`validate-proof-receipts: OK (fixtures=${fixtures.checked}, receipts validated)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
