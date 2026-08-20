#!/usr/bin/env node
/** Validate the durable V3.1 closure receipt, ledger, and generation-CAS pointer. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const hash = (relative) => crypto.createHash('sha256').update(read(relative)).digest('hex');
const receiptPath = '.agent/evidence/v3.1-external-first-closure.json';
const ledgerPath = '.agent/ledger/v3.1-external-first.json';
const receipt = json(receiptPath);
const ledger = json(ledgerPath);
const pointer = json('.agent/current.json');
const receiptHash = hash(receiptPath);
const ledgerHash = hash(ledgerPath);
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
};

const requirements = ledger.milestones?.M8?.requirements ?? [];
const requiredPlatforms = ['codex', 'grok', 'antigravity', 'cursor', 'opencode', 'mimocode', 'claude'];
const requiredJobs = ['quality', 'python_tests', 'security'];

check('receipt-status', receipt.schema === 'harness/v3.1-external-first-closure/v1' && receipt.status === 'PASS', 'closure receipt is PASS');
check('receipt-integrity', ledger.closure_evidence?.path === receiptPath && ledger.closure_evidence?.sha256 === receiptHash, `receipt hash is ledger-bound: ${receiptHash}`);
check('identity-binding', receipt.effective_plan_identity_sha256 === ledger.effective_plan_identity?.sha256 && receipt.effective_plan_identity_sha256 === '963ec943c23edc414cd1512f10bc13e153a27b194cb49836b1a495edb1aae2d6', 'effective-plan identity is stable and bound');
check('criteria-closure', receipt.criteria_audit?.v3 === 101 && receipt.criteria_audit?.v3_1 === 86 && receipt.criteria_audit?.result === 'PASS', '101 V3 criteria and 86 V3.1 criteria are audited');
check('local-closure', receipt.local_verification?.result === 'PASS' && receipt.local_verification.failed === 0 && receipt.local_verification.missing === 0 && receipt.local_verification.unreported === 0, 'local verify:all is clean');
check('hosted-closure', receipt.hosted_ci?.status === 'PASS' && receipt.hosted_ci.self_referential_closure === false && requiredJobs.every((job) => receipt.hosted_ci.required_jobs?.[job] === 'success'), 'hosted CI attestation has all required jobs');
check('installation-closure', receipt.installation?.result === 'PASS' && receipt.installation.doctor_exit_code === 0 && receipt.installation.platforms?.length === requiredPlatforms.length && requiredPlatforms.every((platform) => receipt.installation.platforms.includes(platform)), 'all seven runtime platforms were reinstalled and doctor passed');
check('receipt-bindings', receipt.installation.effective_plan_sha256 === ledger.effective_plan_identity.sha256 && receipt.installation.receipt_sha256?.every((value) => /^[a-f0-9]{64}$/.test(value)), 'installation receipts bind the effective-plan identity');
check('cleanup-closure', receipt.cleanup?.result === 'PASS' && receipt.cleanup.purged === 5 && receipt.cleanup.tombstone === '.agent/tombstones/lifecycle-2026-08-12T01-57-37-174Z.json', 'cleanup lifecycle evidence is retained');
check('residual-capabilities', receipt.residual_capabilities?.native_certification?.status === 'BLOCKED' && receipt.residual_capabilities?.pencil?.status === 'BLOCKED', 'unavailable native/Pencil capabilities remain explicitly BLOCKED');
check('ledger-closure', ledger.plan_id === receipt.plan_id && ledger.status === 'COMPLETED' && ledger.execution_state === 'COMPLETED', 'canonical V3.1 ledger is completed');
check('requirements-closure', requirements.length === 24 && requirements.every((row) => row.status === 'MATCH' && row.proofStatus === 'MATCH' && row.evidenceRefs?.some((ref) => ref.path === receiptPath && ref.sha256 === receiptHash)), 'all 24 requirements are hash-bound MATCH');
check('pointer-closure', pointer.generation === receipt.pointer_generation && pointer.work_id === receipt.plan_id && pointer.canonical_ledger.path === ledgerPath && pointer.canonical_ledger.sha256 === ledgerHash && pointer.canonical_ledger.plan_status === 'COMPLETED' && pointer.canonical_ledger.execution_state === 'COMPLETED', `pointer generation ${pointer.generation} binds completed ledger`);

console.log(JSON.stringify({ schema: 'harness/v3.1-closure-audit/v1', status: 'PASS', checks }, null, 2));
