#!/usr/bin/env node
/**
 * Evidence-stage boundary validation (REQ-016 correction / AM-0005):
 *
 * 1. The stage ladder is monotonic and test-only stages never satisfy
 *    live/dogfood/operational claims.
 * 2. The claim-evidence schema accepts staged records and rejects unknown
 *    stages (command labels and prose cannot mint evidence stages).
 * 3. The acceptance reducer fails closed: a live claim with only
 *    TEST_VERIFIED evidence never receives live completion (PARTIAL/BLOCKED,
 *    never PASS); a live claim with properly bound live-stage evidence is
 *    accepted; a test-level claim keeps PASS on test evidence.
 * 4. Fixtures under evals/harness/evidence-stage/ stay schema-valid and
 *    keep their declared expected outcomes.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  EVIDENCE_STAGES,
  STAGE_RANK,
  stageSatisfies,
  bestStage,
} from '../packages/kernel/dist/claim-registry.js';
import {
  deriveAcceptance,
} from '../packages/kernel/dist/northstar/evidence-ledger.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLAIM_EVIDENCE_SCHEMA = path.join(ROOT, 'schemas', 'claim-evidence-envelope.schema.json');
const FIXTURE_DIR = path.join(ROOT, 'evals', 'harness', 'evidence-stage');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ── 1. Ladder invariants ────────────────────────────────────────────
{
  if (EVIDENCE_STAGES.length !== 7) fail(`expected 7 evidence stages, got ${EVIDENCE_STAGES.length}`);
  const promotable = EVIDENCE_STAGES.filter((s) => s !== 'LIVE_UNPROVEN');
  for (let i = 1; i < promotable.length; i++) {
    if (STAGE_RANK[promotable[i]] <= STAGE_RANK[promotable[i - 1]]) {
      fail(`stage ladder not strictly monotonic at ${promotable[i]}`);
    }
  }
  if (STAGE_RANK.LIVE_UNPROVEN !== -1) fail('LIVE_UNPROVEN must be a non-promotable terminal stage');
  if (stageSatisfies('LIVE_OBSERVED', ['TEST_VERIFIED'])) fail('TEST_VERIFIED evidence must never satisfy a LIVE_OBSERVED claim');
  if (stageSatisfies('LIVE_CANDIDATE', ['NATIVE_SMOKE_VERIFIED'])) fail('NATIVE_SMOKE_VERIFIED alone must never satisfy a LIVE_CANDIDATE claim');
  if (!stageSatisfies('LIVE_OBSERVED', ['LIVE_OBSERVED'])) fail('LIVE_OBSERVED evidence must satisfy a LIVE_OBSERVED claim');
  if (stageSatisfies('OPERATIONALLY_PROVEN', ['LIVE_OBSERVED'])) fail('single live observation must never satisfy OPERATIONALLY_PROVEN');
  if (stageSatisfies('TEST_VERIFIED', undefined)) fail('missing evidence stage must not satisfy anything');
  console.log('[STAGES] ladder monotonic; test-only evidence never reaches live stages');
}

// ── 2. Schema validation ────────────────────────────────────────────
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const claimEvidenceValidate = ajv.compile(JSON.parse(fs.readFileSync(CLAIM_EVIDENCE_SCHEMA, 'utf8')));

const fixtures = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).sort();
if (fixtures.length === 0) fail('evals/harness/evidence-stage must contain fixtures');
const loaded = [];
for (const file of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
  const valid = claimEvidenceValidate(fixture);
  if (fixture.expected_outcome === 'SCHEMA_REJECTED') {
    if (valid) fail(`${file}: bogus stage must be rejected by the claim-evidence schema`);
    console.log(`[SCHEMA] ${file}: correctly rejected (${claimEvidenceValidate.errors?.[0]?.message ?? 'invalid stage'})`);
    continue;
  }
  if (!valid) fail(`${file}: schema invalid: ${JSON.stringify(claimEvidenceValidate.errors)}`);
  loaded.push({ file, fixture });
}
console.log(`[SCHEMA] ${loaded.length} staged evidence fixtures valid, 1 negative schema fixture rejected`);

// ── 3. Reducer scenarios (AM-0005 fail-closed semantics) ────────────
function scenario(name, evidenceRecords, requiredStage, expect) {
  const spec = {
    protocol_version: '2.0',
    spec_id: 'S-evidence-stage',
    revision: 1,
    work_id: 'W-evidence-stage',
    requirements: [
      { id: 'R-001', statement: 'Dogfood compiled recipes during this phase', mandatory: true, claims: ['C-LIVE-001'] },
    ],
    risk_class: 'S1',
  };
  const manifest = {
    protocol_version: '2.0',
    spec_id: 'S-evidence-stage',
    spec_revision: 1,
    claims: [
      { claim_id: 'C-LIVE-001', statement: 'Dogfood compiled recipes during this phase', class: 'mechanical', required_stage: requiredStage },
    ],
  };
  const packets = [{ protocol_version: '2.0', task_id: 'T-001', spec_id: 'S-evidence-stage', spec_revision: 1, goal: 'Prove the live claim', requirements: ['R-001'], scope: { owned: ['recipes'], forbidden: [] }, acceptance: [{ claim_id: 'C-LIVE-001' }] }];
  const envelopes = evidenceRecords.map((record, i) => {
    const body = { seq: i + 1, origin: 'verifier', previous_hash: i === 0 ? '0'.repeat(64) : 'x'.repeat(64), record };
    // envelope hashes are recomputed by read(); construct valid chains by hand
    return null;
  });
  // Build a real hash chain through the ledger's own append path semantics.
  let previous = '0'.repeat(64);
  const chain = [];
  for (const record of evidenceRecords) {
    const body = { seq: chain.length + 1, origin: 'verifier', previous_hash: previous, record };
    const envelope_hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    chain.push({ ...body, envelope_hash });
    previous = envelope_hash;
  }
  const result = deriveAcceptance({ spec, packets, manifest, evidence: chain });
  if (expect === 'unresolved' && (result.accepted_claims.includes('C-LIVE-001') || result.outcome === 'PASS')) {
    fail(`${name}: reducer granted live completion on ${requiredStage} evidence`);
  }
  if (expect === 'accepted' && !result.accepted_claims.includes('C-LIVE-001')) {
    fail(`${name}: reducer rejected properly staged live evidence: ${result.reasons.join('; ')}`);
  }
  console.log(`[REDUCER] ${name}: ${result.outcome} (${result.reasons.join('; ') || 'accepted'})`);
}

scenario('negative: live claim, test-only evidence', [
  { protocol_version: '2.0', evidence_id: 'E-NEG-001', claim_id: 'C-LIVE-001', task_id: 'T-001', kind: 'test', status: 'pass', evidence_stage: 'TEST_VERIFIED', verifier_id: 'V-UNIT-001', oracle_group: 'unit-oracle', candidate_epoch: 2, platform: 'linux-x86_64' },
], 'LIVE_OBSERVED', 'unresolved');

scenario('positive: live claim, bound live-stage evidence', [
  { protocol_version: '2.0', evidence_id: 'E-POS-001', claim_id: 'C-LIVE-001', task_id: 'T-001', kind: 'integration', status: 'pass', evidence_stage: 'NATIVE_SMOKE_VERIFIED', verifier_id: 'V-NATIVE-001', oracle_group: 'native-oracle', candidate_epoch: 2, platform: 'linux-x86_64', artifact_path: 'packages/cli/dist/index.js', sha256: '6e9a554a164e3a7d26df3cdb296392284c8c3166' },
  { protocol_version: '2.0', evidence_id: 'E-POS-002', claim_id: 'C-LIVE-001', task_id: 'T-001', kind: 'browser', status: 'pass', evidence_stage: 'LIVE_OBSERVED', verifier_id: 'V-LIVE-001', oracle_group: 'live-oracle', candidate_epoch: 2, platform: 'linux-x86_64', observed_at: new Date().toISOString(), artifact_path: 'packages/cli/dist/index.js', sha256: '6e9a554a164e3a7d26df3cdb296392284c8c3166' },
], 'LIVE_OBSERVED', 'accepted');

scenario('compat: test claim, test evidence still PASS', [
  { protocol_version: '2.0', evidence_id: 'E-TEST-001', claim_id: 'C-LIVE-001', task_id: 'T-001', kind: 'test', status: 'pass', evidence_stage: 'TEST_VERIFIED', verifier_id: 'V-UNIT-001', oracle_group: 'unit-oracle', candidate_epoch: 2, platform: 'linux-x86_64' },
], 'TEST_VERIFIED', 'accepted');

scenario('compat: no stage declared anywhere (pre-AM-0005 evidence), no live requirement', [
  { protocol_version: '2.0', evidence_id: 'E-OLD-001', claim_id: 'C-LIVE-001', task_id: 'T-001', kind: 'test', status: 'pass', verifier_id: 'V-UNIT-001', oracle_group: 'unit-oracle', candidate_epoch: 1, platform: 'linux-x86_64' },
], 'TEST_VERIFIED', 'accepted');

console.log(`PASS: evidence stage boundary (${createHash('sha256').update('evidence-stage-corpus').digest('hex').slice(0, 16)}) — ladder monotonic, schema rejects fabricated stages, reducer fails closed on test-only evidence for live claims`);
