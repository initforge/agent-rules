#!/usr/bin/env node
/**
 * Validate the durable closure receipt against the canonical ledger and pointer.
 * The receipt records observed verifier/CI results; this script only accepts a
 * closed phase when those claims are hash-bound and all requirements are MATCH.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
};

const receiptPath = '.agent/evidence/v3-decision-fabric-closure.json';
const ledgerPath = '.agent/ledger/v3-decision-fabric.json';
const receipt = readJson(receiptPath);
const ledger = readJson(ledgerPath);
const pointer = readJson('.agent/current.json');
const receiptHash = sha256(receiptPath);
const requirementRows = ledger.milestones?.M8?.requirements ?? [];
const requiredJobs = [
  'python-tests',
  'security',
  'quality (linux, ubuntu-latest)',
  'quality (macos, macos-latest)',
  'quality (windows, windows-latest)',
  'quality-aggregate',
];

check('receipt-status', receipt.schema === 'harness/v3-decision-fabric-closure/v1' && receipt.status === 'PASS', 'closure receipt has PASS status');
check('receipt-integrity', receiptHash === ledger.closure_evidence?.sha256, `receipt hash is ledger-bound: ${receiptHash}`);
check('criteria-closure', receipt.criteria_audit?.criteria === 101 && receipt.criteria_audit?.result === 'PASS', '101-section audit has PASS status');
check('hard-truth-closure', receipt.hard_truth_audit?.directive_section === 94 && receipt.hard_truth_audit?.gate_count === 20 && receipt.hard_truth_audit?.result === 'PASS', '20 hard-truth gates are audited');
check('local-closure', receipt.local_verification?.result === 'PASS' && receipt.local_verification?.failed === 0 && receipt.local_verification?.missing_or_unreported_suites === 0, 'verify:all is clean');
check('quality-closure', receipt.quality_verification?.result === 'PASS', 'local quality is PASS');
check('remote-closure', receipt.remote_ci?.result === 'PASS' && requiredJobs.every((job) => receipt.remote_ci.required_jobs?.includes(job)), 'all required GitHub CI jobs are recorded PASS');
check('ledger-closure', ledger.plan_id === receipt.plan_id && ledger.status === 'COMPLETED' && ledger.execution_state === 'COMPLETED', 'canonical ledger is completed');
check('requirements-closure', requirementRows.length === 24 && requirementRows.every((row) => row.status === 'MATCH' && row.proofStatus === 'MATCH' && row.evidenceRefs?.some((ref) => ref.path === receiptPath && ref.sha256 === receiptHash)), `${requirementRows.length} requirement rows are hash-bound MATCH`);
check('pointer-closure',
  (pointer.generation >= 2 && pointer.work_id === receipt.plan_id && pointer.canonical_ledger.sha256 === sha256(ledgerPath) && pointer.canonical_ledger.execution_state === 'COMPLETED') ||
  (pointer.generation > 3 && pointer.work_id === 'v3.1-external-first' && fs.existsSync(path.join(root, ledgerPath)) && ledger.status === 'COMPLETED' && ledger.execution_state === 'COMPLETED'),
  pointer.work_id === receipt.plan_id ? 'current pointer binds the completed V3 ledger' : 'completed V3 ledger remains hash-verifiable as historical authority');

console.log(JSON.stringify({ schema: 'harness/v3-closure-audit/v1', status: 'PASS', checks }, null, 2));
