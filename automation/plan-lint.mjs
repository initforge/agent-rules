#!/usr/bin/env node
/**
 * plan-lint.mjs — repo-level read-only plan contract validation.
 *
 *   npm run plan:lint -- --stdin
 *
 * Reads exactly one transient PlanContractInput JSON document from stdin,
 * validates it with the same kernel validator exported by the kernel API, and
 * prints the validation result to stdout. Exit 0 when valid, non-zero when
 * invalid. Never writes files, receipts, plan artifacts or history; never a
 * mandatory host-turn command; never packaged as a public installed CLI
 * command.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePlanContract } from '../packages/kernel/dist/harness/planning/plan-contract.js';

const args = process.argv.slice(2);
const requireStdin = args.includes('--stdin');
if (args.some((flag) => flag !== '--stdin')) {
  process.stderr.write(`plan-lint: unknown argument(s): ${args.filter((flag) => flag !== '--stdin').join(', ')}\n`);
  process.exit(2);
}

let text = '';
try {
  text = fs.readFileSync(0, 'utf8');
} catch (error) {
  process.stderr.write(`plan-lint: cannot read stdin: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

if (!requireStdin || text.trim().length === 0) {
  process.stderr.write('plan-lint: pass one transient PlanContractInput JSON document via --stdin\n');
  process.exit(2);
}

let input;
try {
  input = JSON.parse(text);
} catch (error) {
  process.stderr.write(`plan-lint: stdin is not valid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

const result = validatePlanContract(input);
process.stdout.write(`${JSON.stringify({
  ok: result.ok,
  unrunnable: result.unrunnable,
  blocked_slices: result.blocked_slices,
  issues: result.issues,
}, null, 2)}\n`);
process.exit(result.ok ? 0 : 1);
