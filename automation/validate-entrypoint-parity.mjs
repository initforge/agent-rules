#!/usr/bin/env node
/**
 * Cross-entrypoint semantic parity (REQ-002 / AM-0003 / C-016):
 * ordinary conversation, optional slash commands, CLI/API calls, and native
 * host actions compile into the same canonical WorkRequest. /goal is an
 * optional emulated adapter; its absence never fails readiness or parity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compileWorkRequestEntrypoint, assertEntrypointParityReceipt } from '../packages/kernel/dist/northstar/protocol.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const INTENT = 'Goal: Compile this ordinary prompt into a canonical WorkRequest\nConstraint: Never weaken verification';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ── 1. All five adapters compile to the same semantic identity ──────
const adapters = ['conversation', 'command', 'cli', 'api', 'native_host'];
const receipts = adapters.map((adapter) => {
  const receipt = compileWorkRequestEntrypoint({ adapter, intent: INTENT, plan_id: 'harness-universal-reconciliation-v1' });
  assertEntrypointParityReceipt(receipt);
  if (receipt.request.adapter !== adapter) fail(`adapter identity drift: ${receipt.request.adapter} != ${adapter}`);
  return receipt;
});
const semanticIds = new Set(receipts.map((receipt) => receipt.semantic_sha256));
const workIds = new Set(receipts.map((receipt) => receipt.work_id));
if (semanticIds.size !== 1) fail('adapters must share one semantic fingerprint');
if (workIds.size !== 1) fail('adapters must share one canonical work_id');
if (!/^[a-f0-9]{64}$/.test(receipts[0].semantic_sha256)) fail('semantic_sha256 must be SHA-256');

// ── 2. Equivalent inputs from different adapters are parity-proven ──
const conversation = compileWorkRequestEntrypoint({ adapter: 'conversation', intent: 'Goal: fix the typo' });
const command = compileWorkRequestEntrypoint({ adapter: 'command', intent: 'Goal: fix the typo' });
if (conversation.semantic_sha256 !== command.semantic_sha256) fail('equivalent inputs must share parity');
if (conversation.adapter === command.adapter) fail('adapter identity must differ');

// ── 3. Materially different payloads diverge ────────────────────────
const constrained = compileWorkRequestEntrypoint({ adapter: 'conversation', intent: 'Goal: fix the typo', explicit_constraints: ['do not touch generated/'] });
if (constrained.semantic_sha256 === conversation.semantic_sha256) fail('different payloads must diverge');

// ── 4. /goal absence never fails readiness or parity ────────────────
// The emulated goal.md command is optional host ergonomics. Readiness must
// be provable from the conversation entrypoint alone.
const goalPath = path.join(ROOT, 'platforms', 'opencode', 'commands', 'goal.md');
const goalPresent = fs.existsSync(goalPath);
const emulated = goalPresent ? fs.readFileSync(goalPath, 'utf8') : '';
if (goalPresent && !emulated.includes('EMULATED')) fail('/goal command must honestly attest EMULATED capability');
const readiness = {
  conversation_entrypoint_available: true,
  goal_required: false,
  goal_absent_is_failure: false,
  parity_proven_without_goal: receipts.length === 5 && semanticIds.size === 1,
};
if (readiness.parity_proven_without_goal !== true) fail('parity must be provable without /goal');

// ── 5. Ordinary prompt start/resume/review/repair compile identically ──
for (const [kind, text] of [
  ['start', 'Goal: Start the resumable harness phase'],
  ['resume', 'Goal: Resume the harness phase from its last checkpoint'],
  ['review', 'Goal: Review the current harness implementation'],
  ['repair', 'Bug: the binder drops adapter identity'],
]) {
  const receipt = compileWorkRequestEntrypoint({ adapter: 'conversation', intent: text });
  assertEntrypointParityReceipt(receipt);
  if (!receipt.work_id) fail(`no work_id for ${kind} prompt`);
}

// ── 6. Fail closed on invalid entrypoints ───────────────────────────
try {
  compileWorkRequestEntrypoint({ adapter: 'telepathy', intent: INTENT });
  fail('unknown adapter must fail closed');
} catch { /* expected */ }
try {
  compileWorkRequestEntrypoint({ adapter: 'conversation', intent: '   ' });
  fail('empty intent must fail closed');
} catch { /* expected */ }

console.log(`PASS: entrypoint parity (5 adapters, semantic=${receipts[0].semantic_sha256.slice(0, 16)}, goal_emulated=${goalPresent ? 'present' : 'absent'}, goal_absence_not_failure=true)`);
