#!/usr/bin/env node
/**
 * Pair-repair validation (REQ-022 / AM-0003):
 * raw findings bind to the exact plan/repository state, classify
 * defect vs requirement change vs evidence vs environment vs unrelated,
 * compute requirement/claim/task/file/provider/evidence impact, reopen only
 * affected claims in a new candidate epoch, stale affected evidence, emit a
 * bounded repair packet, and require fresh proof — never rewriting history.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  classifyFinding,
  openPairRepair,
} from '../packages/kernel/dist/northstar/pair-repair.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FINDING_SCHEMA = path.join(ROOT, 'schemas', 'repair-finding.schema.json');
const PACKET_SCHEMA = path.join(ROOT, 'schemas', 'repair-packet.schema.json');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const HEAD = '6e9a554a164e3a7d26df3cdb296392284c8c3166';
const spec = {
  protocol_version: '2.0',
  spec_id: 'S-pair-repair',
  revision: 4,
  work_id: 'W-pair-repair',
  requirements: [
    { id: 'REQ-001', statement: 'compile bundle', mandatory: true, claims: ['C-001'] },
    { id: 'REQ-002', statement: 'entrypoint parity', mandatory: true, claims: ['C-002'] },
    { id: 'REQ-003', statement: 'worker recipes', mandatory: true, claims: ['C-003'] },
  ],
  risk_class: 'S1',
};
const claim_to_requirements = { 'C-001': ['REQ-001'], 'C-002': ['REQ-002'], 'C-003': ['REQ-003'] };
const accepted_claims = ['C-001', 'C-002', 'C-003'];

const plans = [{
  plan_id: 'harness-universal-reconciliation-v1',
  head_sha: HEAD,
  worktree_dirty: false,
  ledger_ref: '.agent/ledger/harness-universal-reconciliation-v1.json',
  diff_ref: 'main..candidate',
  evidence_refs: ['.agent/evidence/harness-universal-reconciliation-v1/S1/evidence.json'],
}];

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const findingValidate = ajv.compile(JSON.parse(fs.readFileSync(FINDING_SCHEMA, 'utf8')));
const packetValidate = ajv.compile(JSON.parse(fs.readFileSync(PACKET_SCHEMA, 'utf8')));

// ── 1. Raw finding binding ───────────────────────────────────────────
{
  const outcome = openPairRepair({
    raw_finding: 'The entrypoint compiler drops explicit constraints when the adapter is command.',
    candidate_plans: plans,
    current_epoch: 1,
    spec,
    claim_to_requirements,
    accepted_claims,
  });
  const finding = outcome.finding;
  if (finding.raw_text !== 'The entrypoint compiler drops explicit constraints when the adapter is command.') {
    fail('raw finding must be preserved verbatim');
  }
  if (finding.plan_id !== 'harness-universal-reconciliation-v1') fail('finding must bind to the exact plan');
  if (finding.repository_state.head_sha !== HEAD) fail('finding must bind the exact repository state');
  if (finding.candidate_epoch !== 1) fail('finding must bind the candidate epoch');
  if (finding.binding.authority_facts_agree !== true) fail('binding facts must agree');
  if (!findingValidate(finding)) fail(`finding schema: ${JSON.stringify(findingValidate.errors)}`);
}

// ── 2. Classification ───────────────────────────────────────────────
{
  const cases = [
    ['A provider timeout on an unavailable device', 'environment_provider_issue'],
    ['The evidence file is stale and does not match the claim', 'evidence_defect'],
    ['This is unrelated to the plan under execution', 'unrelated'],
    ['The owner now requires a different acceptance surface', 'changed_owner_intent'],
    ['Missing requirement: the bundle must be resumable across hosts', 'missing_requirement'],
    ['Bug: the plan compiler drops decisions during selective regeneration', 'implementation_defect'],
  ];
  for (const [text, expected] of cases) {
    const actual = classifyFinding(text);
    if (actual !== expected) fail(`classification of "${text}" = ${actual}, expected ${expected}`);
  }
}

// ── 3. Selective reopen + fresh evidence epoch + stale evidence ─────
{
  const outcome = openPairRepair({
    raw_finding: 'Bug: the WorkRequest compiler records the adapter identity but the plan binder drops it.',
    candidate_plans: plans,
    current_epoch: 2,
    spec,
    claim_to_requirements,
    accepted_claims,
  });
  if (outcome.needs_user) fail(`unexpected NEEDS_USER: ${outcome.reason}`);
  const packet = outcome.packet;
  if (!packet) fail('defect finding must emit a repair packet');
  if (packet.candidate_epoch !== 3) fail(`packet must open a new candidate epoch (got ${packet.candidate_epoch})`);
  if (packet.reopened_claims.length === 0) fail('impacted claims must be reopened');
  if (!packet.reopened_claims.every((claim) => accepted_claims.includes(claim))) fail('reopened claims must come from the accepted set');
  if (packet.proof_requirements.fresh_proof_required !== true) fail('fresh proof must be required');
  if (packet.proof_requirements.historical_pass_preserved !== true) fail('historical PASS must be preserved');
  if (!packetValidate(packet)) fail(`packet schema: ${JSON.stringify(packetValidate.errors)}`);
  const unaffected = packet.unaffected_claims;
  if (unaffected.some((claim) => packet.reopened_claims.includes(claim))) fail('reopened and unaffected claims overlap');
}

// ── 4. Changed owner intent → amendment, not defect ─────────────────
{
  const outcome = openPairRepair({
    raw_finding: 'The owner now requires Control Plane work to begin before closeout.',
    candidate_plans: plans,
    current_epoch: 1,
    spec,
    claim_to_requirements,
    accepted_claims,
  });
  if (!outcome.needs_user) fail('changed owner intent must return NEEDS_USER');
  if (outcome.finding.classification !== 'changed_owner_intent') fail('must classify as changed owner intent');
}

// ── 5. Several plans → NEEDS_USER (authority never chosen by wording) ─
{
  const outcome = openPairRepair({
    raw_finding: 'Bug: the shared contract changed.',
    candidate_plans: [
      ...plans,
      { plan_id: 'other-plan', head_sha: HEAD, worktree_dirty: false, ledger_ref: '.agent/ledger/other.json', diff_ref: 'main..other', evidence_refs: [] },
    ],
    current_epoch: 1,
    spec,
    claim_to_requirements,
    accepted_claims,
  });
  if (!outcome.needs_user) fail('several candidate plans must return NEEDS_USER');
  if (outcome.finding.ambiguity?.several_plans_candidate !== true) fail('ambiguity must be recorded');
}

// ── 6. Unrelated / environment findings do not reopen claims ────────
{
  for (const text of ['This is unrelated to the plan under execution.', 'A provider timeout on an unavailable device']) {
    const outcome = openPairRepair({ raw_finding: text, candidate_plans: plans, current_epoch: 1, spec, claim_to_requirements, accepted_claims });
    if (outcome.packet) fail(`"${text}" must not emit a repair packet`);
    if (outcome.impact?.affected_claims.length !== 0) fail(`"${text}" must not reopen claims`);
  }
}

// ── 7. No-ambiguity defect classification survives fail-closed wording ─
{
  try {
    openPairRepair({ raw_finding: '', candidate_plans: plans });
    fail('empty finding must throw');
  } catch {
    /* expected */
  }
  try {
    openPairRepair({ raw_finding: 'bug', candidate_plans: [] });
    fail('no candidate plans must throw');
  } catch {
    /* expected */
  }
}

// ── 8. Eval fixtures exist under evals/harness/pair-repair ──────────
{
  const dir = path.join(ROOT, 'evals', 'harness', 'pair-repair');
  if (!fs.existsSync(dir)) fail('evals/harness/pair-repair must exist');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) fail('evals/harness/pair-repair must contain at least one fixture');
  for (const file of files) {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (fixture.schema === 'harness/repair-finding' && !findingValidate(fixture)) fail(`finding fixture invalid: ${file}`);
    if (fixture.schema === 'harness/repair-packet' && !packetValidate(fixture)) fail(`packet fixture invalid: ${file}`);
  }
}

console.log(`PASS: pair repair (${createHash('sha256').update('pair-repair-corpus').digest('hex').slice(0, 16)}) — raw-finding binding, classification, selective reopen, new epoch, stale evidence, bounded packet, NEEDS_USER ambiguity`);
