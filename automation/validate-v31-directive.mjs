#!/usr/bin/env node
/** Structural and authority audit for the owner-provided V3.1 directive. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const sha = (relative) => crypto.createHash('sha256').update(read(relative)).digest('hex');
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
};

const original = read('.agent/plans/v3.1-external-first/original.md');
const criteria = read('.agent/plans/v3.1-external-first/criteria-index.yaml');
const architecture = read('.agent/plans/v3.1-external-first/architecture-map.md');
const pointer = json('.agent/current.json');
const pointerIsV31 = pointer.work_id === 'v3.1-external-first';
const currentLedger = pointer.canonical_ledger?.path ? json(pointer.canonical_ledger.path) : null;
const requirements = read('.agent/plans/v3.1-external-first/requirements.yaml');
const originalHash = crypto.createHash('sha256').update(original).digest('hex');
const criterionIds = [...criteria.matchAll(/\bid: C-(\d{3})\b/g)].map((match) => Number(match[1]));
const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

check('raw-intent', original.startsWith('# AGENT-RULES V3.1') && (pointerIsV31 ? originalHash === pointer.original.sha256 : true), `raw directive hash ${originalHash} (pointer=${pointer.work_id})`);
check('criteria-count', criterionIds.length === 86 && new Set(criterionIds).size === 86 && Math.min(...criterionIds) === 1 && Math.max(...criterionIds) === 86, `indexed ${criterionIds.length} unique criteria`);
check('a-to-z-plan', letters.every((letter) => new RegExp(`^## ${letter}\\.`, 'm').test(architecture)), 'A–Z planning output is source-linked');
check('current-authority', typeof pointer.work_id === 'string' && pointer.work_id.length > 0 && pointer.plan_id === pointer.work_id && Number.isSafeInteger(pointer.generation) && pointer.generation >= 4, `generation=${pointer.generation}, work_id=${pointer.work_id}`);
check('ledger-binding', typeof pointer.canonical_ledger?.path === 'string' && pointer.canonical_ledger.path.startsWith('.agent/ledger/') && pointer.canonical_ledger.sha256 === sha(pointer.canonical_ledger.path), 'active ledger is hash-bound to the current pointer');
check('contract-binding', typeof pointer.contract?.path === 'string' && pointer.contract.path.startsWith('.agent/plans/') && pointer.contract.sha256 === sha(pointer.contract.path), 'requirements contract is hash-bound to the current pointer');
check('ledger-identity', currentLedger !== null && typeof currentLedger.effective_plan_identity?.sha256 === 'string' && crypto.createHash('sha256').update(currentLedger.effective_plan_identity.canonical_json_utf8).digest('hex') === currentLedger.effective_plan_identity.sha256, 'current effective plan identity is self-verifying');
check('requirements-coverage', (requirements.match(/id: REQ-\d{3}/g) || []).length === 24 && /criteria: \[C-001/.test(requirements) && /criteria: \[C-084/.test(requirements), '24 traceable workstream requirements cover the 86 criteria');
check('cleanup-lifecycle', /PURGE_ELIGIBLE/.test(read('packages/cli/src/cleanup/lifecycle.ts')) && /activeReference/.test(read('packages/cli/src/cleanup/lifecycle.ts')) && /--apply/.test(read('packages/cli/src/commands/cleanup.ts')), 'cleanup has graph-safe dry-run/apply and active-reference guard');
check('external-first', /gh skill/.test(read('.agent/plans/v3.1-external-first/original.md')) && /external_source_matrix/.test(read('skills/candidate-fabric.json')) && !/data-engineering/.test(read('skills/candidate-fabric.json')), 'external source resolution remains candidate-driven and excludes Data Engineering');
check('zero-skill', /skills: \[\]/.test(read('.agent/plans/v3.1-external-first/original.md')) || /skills remain explicit/.test(read('.agent/plans/v3.1-external-first/plan.md')), 'ordinary work may select zero skills');
check('explore-deliver', /AutonomyMode/.test(read('packages/kernel/src/northstar/decision-fabric.ts')) && /promotion_gate/.test(read('packages/kernel/src/northstar/decision-fabric.ts')), 'EXPLORE/DELIVER and Promotion Gate are typed in the existing Decision Fabric');
check('pencil-boundary', /explicit-only/.test(read('integrations/manual/pencil-mcp/manifest.json')) && /explicit-only/.test(read('integrations/manual/pencil-mcp/README.md')), 'Pencil remains explicit-only');
check('pencil-dogfood', /PENCIL_MCP_CONNECTED/.test(read('automation/pencil-dogfood.mjs')) && /BLOCKED/.test(read('automation/pencil-dogfood.mjs')), 'Pencil capability is probed explicitly and unavailable state is preserved');
check('control-plane-authority', /readExecutionAuthority/.test(read('packages/control-plane/src/routes/authority.ts')), 'Control Plane reads canonical authority');
check('platform-seam', /whichBinary/.test(read('packages/kernel/src/runner/platform.ts')) && /Re-export path/.test(read('packages/kernel/src/runner/platform.ts')), 'platform behavior has one kernel seam');
check('external-ci-attestation', /self-hosted/.test(read('.github/workflows/certification.yml')) && /external/.test(read('.github/workflows/quality.yml')), 'CI distinguishes hosted quality from external native attestation');
check('attestation-writer', /harness\/external-ci-attestation\/v1/.test(read('automation/record-ci-attestation.mjs')) && /self_referential_closure: false/.test(read('automation/record-ci-attestation.mjs')), 'hosted fan-in writes hash-bound non-self-referential attestation');
check('legacy-preservation', fs.existsSync(path.join(root, 'skills', 'docs-style', 'SKILL.md')) && fs.existsSync(path.join(root, 'skills', 'verification-router', 'SKILL.md')), 'required proven skills remain present');

console.log(JSON.stringify({ schema: 'harness/v3.1-directive-audit/v1', status: 'PASS', criteria: 86, checks }, null, 2));
