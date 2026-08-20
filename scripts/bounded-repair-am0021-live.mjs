#!/usr/bin/env node
/**
 * AM0021 boundedRepair on live canonical targets
 * Ground truth: ledger r59 identity 21d0 absent AM0021
 */
import { boundedRepair } from '@initforge/agent-rules-engine/ledger-activation.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const WORKDIR = process.cwd();
const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';

const AM0021_SHA256 = '0dfb45500fe8a7d80f177e57ef8a6c231b44e28f8e4f973b31f85bf7d527cf1c';
const PRIOR_EFFECTIVE_SHA256 = '21d0a8bbaaf40002c0be6a047476e1cbe7b105382c0877056a2252af9a246003';
const ORIGINAL_SHA256 = 'c8798fa621e56d80d32821858edc94c285d911e27f6156584aa6861b35782a31';

const SHADOW_FILES = [
  'tasks.md', 'progress.md', 'amendments.md', 'reconciliation.md',
  'batches/bootstrap/tasks.md', 'batches/bootstrap/progress.md', 'batches/bootstrap/reconciliation.md'
];

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

// Pre-invocation snapshot
const ledgerPath = path.join(WORKDIR, '.agent', 'ledger', `${PLAN_ID}.json`);
const ledgerPre = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));

console.log('=== PRE-INVOCATION STATE ===');
console.log('shadow_revision:', ledgerPre.shadow_revision);
console.log('effective_identity:', ledgerPre.effective_plan_identity?.sha256);
console.log('has_AM0021:', (ledgerPre.amendments || []).map(a => a.amendment_id).includes('AM-0021'));

// Build boundedRepair input
const input = {
  canonicalRoot: WORKDIR,
  ledgerPath: `.agent/ledger/${PLAN_ID}.json`,
  shadowDir: `.agent/plans/${PLAN_ID}/shadow`,
  originalSha256: ORIGINAL_SHA256,
  priorEffectiveSha256: PRIOR_EFFECTIVE_SHA256,
  amendments: [{
    amendmentId: 'AM-0021',
    amendmentPath: `.agent/plans/${PLAN_ID}/amendments/0021-premium-main-context-economy-and-event-driven-orchestration.md`,
    amendmentSha256: AM0021_SHA256,
    capturePath: `.agent/plans/${PLAN_ID}/lineage/am0021-capture.json`,
  }],
};

console.log('\n=== BOUNDED REPAIR INVOCATION ===');
const result = boundedRepair(input);

console.log('success:', result.success);
console.log('error:', result.error);
console.log('mutated:', result.mutated);
console.log('effectiveIdentity:', result.effectiveIdentity);
console.log('shadowRevision:', result.shadowRevision);

// Post-invocation verification
console.log('\n=== POST-INVOCATION VERIFICATION ===');
const ledgerPost = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));

console.log('AM0021 EFFECTIVE:', (ledgerPost.amendments || []).find(a => a.amendment_id === 'AM-0021')?.activation_state === 'EFFECTIVE' ? 'PASS' : 'FAIL');
console.log('effective identity recompute:', ledgerPost.effective_plan_identity?.sha256 === result.effectiveIdentity ? 'PASS' : 'FAIL');
console.log('effective identity changed:', ledgerPost.effective_plan_identity?.sha256 !== PRIOR_EFFECTIVE_SHA256 ? 'PASS' : 'FAIL');
console.log('new shadow_revision:', ledgerPost.shadow_revision);
console.log('shadow_revision incremented:', ledgerPost.shadow_revision === ledgerPre.shadow_revision + 1 ? 'PASS' : 'FAIL');

// Verify 7 live shadow hashes
console.log('\n=== SHADOW HASHES VERIFICATION ===');
let shadowCount = 0;
let shadowPass = true;
for (const f of SHADOW_FILES) {
  const shadowPath = path.join(WORKDIR, '.agent', 'plans', PLAN_ID, 'shadow', f);
  if (fs.existsSync(shadowPath)) {
    shadowCount++;
    const content = fs.readFileSync(shadowPath, 'utf-8');
    const computedHash = sha256Hex(content);
    const expectedHash = ledgerPost.shadow_hashes?.[f];
    const match = computedHash === expectedHash;
    if (!match) shadowPass = false;
    console.log(`  ${f}: ${match ? 'PASS' : 'FAIL'} (${computedHash.substring(0,12)}...)`);
  }
}
console.log(`7 live shadow hashes: ${shadowCount === 7 ? 'PASS' : 'FAIL'} (count: ${shadowCount})`);
console.log(`shadow hashes integrity: ${shadowPass ? 'PASS' : 'FAIL'}`);

// Verify E-BR audit event
console.log('\n=== E-BR AUDIT EVENT ===');
const auditEvents = ledgerPost.audit_events || [];
const ebEvent = auditEvents.find(e => e.type === 'BOUNDED_REPAIR' && e.amendment_ids?.includes('AM-0021'));
if (ebEvent) {
  console.log('E-BR audit event found: PASS');
  console.log('  event_id:', ebEvent.event_id);
  console.log('  summary:', ebEvent.summary);
  console.log('  prior_effective_sha256:', ebEvent.prior_effective_sha256);
  console.log('  new_effective_sha256:', ebEvent.new_effective_sha256);
} else {
  console.log('E-BR audit event: FAIL');
}

// Verify journal absence
console.log('\n=== JOURNAL ABSENCE ===');
const journalExists = fs.existsSync(path.join(WORKDIR, '.activation-journal.json'));
console.log('journal absent:', !journalExists ? 'PASS' : 'FAIL');

// Bounded receipt
console.log('\n=== BOUNDED RECEIPT ===');
console.log('route_identity:', result.effectiveIdentity);
console.log('commands_count: 1');
console.log('result:', result.success ? 'SUCCESS' : `FAILURE: ${result.error}`);

console.log('\n=== FINAL STATUS ===');
if (result.success && result.mutated) {
  console.log('BOUNDED_REPAIR COMPLETE');
} else {
  console.log('BOUNDED_REPAIR FAILED');
  if (result.error) {
    console.log('FAILURE_REASON:', result.error);
  }
}
