#!/usr/bin/env node
// Enforces the .agent/ protocol documented in .agent/README.md.
//
// The protocol exists because the previous layout accumulated 23 amendment files
// (4,933 lines) against an 824-line plan, with two files numbered 0023 and no 0004,
// and a global contract hash that desynchronized from its own lineage (HASH-001).
// Prose alone did not prevent that, so the limits are checked here.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(REPO_ROOT, '.agent');

export const LIMITS = {
  maxChangesPerPlan: 20,
  maxChangeLines: 150,
  allowedRootEntries: new Set([
    'README.md',
    'state',
    'plans',
    'archive',
    'research',
    // Durable, hash-bound certification and audit receipts. This is distinct
    // from `.agent/tmp`, which is disposable command output and checkpoints.
    'evidence',
    'tombstones',
    'runs',
    'artifacts',
    'tmp',
    // Bootstrap artifacts needed for the runtime installer and execution-contract
    // schema validation to boot cleanly on fresh checkout. Both are committed
    // per the protocol (harness must boot without manual setup).
    'ledger',
    'current.json',
    'cleanup-policy.json',
    // Created by the harness's own northstar run path: the CLI's durable
    // per-repo northstar config and the planner receipt/log dir. Protocol
    // artifacts, not scratch (scratch still belongs in .agent/tmp/).
    'northstar.json',
    'planner',
  ]),
  requiredPlanFiles: ['plan.md', 'requirements.yaml'],
  validStatuses: new Set(['active', 'superseded', 'dropped', 'blocked']),
};

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** `.agent/` root holds only protocol-defined entries; everything else is scratch. */
function checkRoot() {
  for (const entry of readdirSync(AGENT_DIR)) {
    if (!LIMITS.allowedRootEntries.has(entry)) {
      fail(`stray entry at .agent/ root: ${entry} (scratch belongs in .agent/tmp/)`);
    }
  }
  if (!existsSync(path.join(AGENT_DIR, 'README.md'))) fail('.agent/README.md is missing');
}

/** Exactly one pointer, and it must resolve. */
function checkState() {
  const pointerPath = path.join(AGENT_DIR, 'current.json');
  if (!existsSync(pointerPath)) {
    warn('.agent/current.json missing — no active plan');
    return null;
  }
  let pointer;
  try {
    pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  } catch (e) {
    fail(`.agent/current.json is not valid JSON: ${e.message}`);
    return null;
  }
  for (const key of ['plan_id', 'plan_root']) {
    if (!pointer[key]) fail(`.agent/current.json missing "${key}"`);
  }
  if (pointer.plan_root && !existsSync(path.join(REPO_ROOT, pointer.plan_root))) {
    fail(`current.json plan_root does not exist: ${pointer.plan_root}`);
  }
  return pointer;
}

/** The cleanup lifecycle is durable policy, not an agent-local convention. */
function checkCleanupPolicy() {
  const policyPath = path.join(AGENT_DIR, 'cleanup-policy.json');
  if (!existsSync(policyPath)) {
    fail('.agent/cleanup-policy.json is missing — cleanup must be policy-bound');
    return;
  }
  let policy;
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch (e) {
    fail('.agent/cleanup-policy.json is not valid JSON: ' + e.message);
    return;
  }
  if (policy?.schema !== 'harness/plan-cleanup-policy' || policy?.version !== 1) {
    fail('.agent/cleanup-policy.json has an unsupported schema or version');
  }
  for (const key of ['lifecycle', 'artifact_classes', 'ownership', 'history_receipt', 'operations']) {
    if (!policy?.[key] || typeof policy[key] !== 'object') {
      fail('.agent/cleanup-policy.json is missing object "' + key + '"');
    }
  }
  const requiredClasses = [
    'intent_and_contract',
    'requirements_claims_tasks',
    'durable_evidence',
    'generated_support',
    'ephemeral_helper_or_test',
    'shared_artifact',
    'historical_archive',
  ];
  for (const key of requiredClasses) {
    if (!policy?.artifact_classes?.[key]) {
      fail('.agent/cleanup-policy.json is missing artifact class "' + key + '"');
    }
  }
}

/** Change files: unique strictly-increasing numbers, bounded count and length. */
function checkChanges(planDir, planId) {
  const changesDir = path.join(planDir, 'changes');
  if (!existsSync(changesDir)) return;

  const files = readdirSync(changesDir).filter((f) => f.endsWith('.md'));
  if (files.length > LIMITS.maxChangesPerPlan) {
    fail(
      `${planId}: ${files.length} change files exceeds limit ${LIMITS.maxChangesPerPlan} — ` +
        `a plan needing more scope churn should become a new plan`
    );
  }

  const byNumber = new Map();
  for (const file of files) {
    const match = /^(\d{4})-/.exec(file);
    if (!match) {
      fail(`${planId}/changes/${file}: must be named NNNN-<slug>.md`);
      continue;
    }
    const num = match[1];
    if (byNumber.has(num)) {
      fail(`${planId}/changes: duplicate change number ${num} (${byNumber.get(num)} and ${file})`);
    }
    byNumber.set(num, file);

    const lines = readFileSync(path.join(changesDir, file), 'utf8').split('\n').length;
    if (lines > LIMITS.maxChangeLines) {
      fail(`${planId}/changes/${file}: ${lines} lines exceeds limit ${LIMITS.maxChangeLines}`);
    }
  }
}

/** requirements.yaml is the single source of scope truth; every field it needs is required. */
function checkRequirements(planDir, planId) {
  const reqPath = path.join(planDir, 'requirements.yaml');
  if (!existsSync(reqPath)) return;

  let doc;
  try {
    doc = parseYaml(readFileSync(reqPath, 'utf8'));
  } catch (e) {
    fail(`${planId}/requirements.yaml: invalid YAML: ${e.message}`);
    return;
  }
  if (!doc || !Array.isArray(doc.requirements)) {
    fail(`${planId}/requirements.yaml: missing top-level "requirements" list`);
    return;
  }

  const ids = new Set();
  // Plans predating the requirement `status` field (legacy/historical plans)
  // are reported, not failed, so migration stays incremental — mirroring the
  // existing "legacy plan (no plan.md or requirements.yaml)" warn path.
  const hasStatusField = doc.requirements.some((r) => r?.status !== undefined);
  if (!hasStatusField) {
    warn(`${planId}/requirements.yaml: legacy plan predates the requirement status field; reported, not failed`);
  }
  for (const req of doc.requirements) {
    const id = req?.id ?? '<missing id>';
    if (!req?.id) fail(`${planId}/requirements.yaml: a requirement has no id`);
    if (ids.has(id)) fail(`${planId}/requirements.yaml: duplicate requirement id ${id}`);
    ids.add(id);

    if (!req?.statement) fail(`${planId}/requirements.yaml: ${id} has no statement`);
    if (!hasStatusField) continue; // legacy format: no status/verification contract to enforce
    if (!LIMITS.validStatuses.has(req?.status)) {
      fail(`${planId}/requirements.yaml: ${id} has invalid status "${req?.status}"`);
    }

    // An active requirement with no command is unfalsifiable, which is how prose
    // acceptance criteria produced review loops that could never close.
    if (req?.status === 'active') {
      if (!Array.isArray(req.verification) || req.verification.length === 0) {
        fail(`${planId}/requirements.yaml: ${id} is active but has no verification command`);
      }
    }
    if (req?.status === 'superseded' && !req.superseded_by) {
      fail(`${planId}/requirements.yaml: ${id} is superseded but has no superseded_by`);
    }
  }

  // Forward pointers must resolve, or the replacement chain is a dead end.
  for (const req of doc.requirements) {
    if (req?.superseded_by && !ids.has(req.superseded_by)) {
      fail(`${planId}/requirements.yaml: ${req.id} superseded_by ${req.superseded_by}, which does not exist`);
    }
  }
}

function checkPlans() {
  const plansDir = path.join(AGENT_DIR, 'plans');
  if (!existsSync(plansDir)) return;

  for (const planId of readdirSync(plansDir)) {
    const planDir = path.join(plansDir, planId);
    if (!statSync(planDir).isDirectory()) {
      fail(`.agent/plans/${planId}: loose file — plans are directories`);
      continue;
    }
    if (/fixture|^tmp$|^test-|^_/.test(planId)) {
      fail(`.agent/plans/${planId}: fixture/test directories must not live among real plans`);
      continue;
    }
    // Legacy plans predating this protocol are reported, not failed, so migration
    // can be incremental.
    const missing = LIMITS.requiredPlanFiles.filter((f) => !existsSync(path.join(planDir, f)));
    if (missing.length === LIMITS.requiredPlanFiles.length) {
      warn(`.agent/plans/${planId}: legacy plan (no plan.md or requirements.yaml)`);
      continue;
    }
    for (const f of missing) fail(`.agent/plans/${planId}: missing required ${f}`);

    checkChanges(planDir, planId);
    checkRequirements(planDir, planId);
  }
}

function main() {
  if (!existsSync(AGENT_DIR)) {
    console.log('validate-agent-dir: no .agent/ directory — nothing to check');
    return 0;
  }

  checkRoot();
  checkState();
  checkCleanupPolicy();
  checkPlans();

  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.error(`FAIL  ${e}`);

  if (errors.length > 0) {
    console.error(`\nvalidate-agent-dir: ${errors.length} violation(s) of .agent/README.md`);
    return 1;
  }
  console.log(`validate-agent-dir: OK${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
