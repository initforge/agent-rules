#!/usr/bin/env node
/**
 * generate-ns0-fixture.mjs
 *
 * Generates a minimal, self-contained, deterministic NS0 activation test fixture
 * under fixtures/ns0-activation/.  All SHA-256 constants are derived from the
 * generated content and printed at the end so they can be pasted into the test.
 *
 * Usage:  node generate-ns0-fixture.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'ns0-activation');

const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
const PLAN_DIR = 'plans/' + PLAN_ID;
const LEDGER_REL = 'ledger/' + PLAN_ID + '.json';
const AMENDMENT_DIR = PLAN_DIR + '/amendments';
const LINEAGE_DIR = PLAN_DIR + '/lineage';
const SHADOW_DIR = PLAN_DIR + '/shadow';
const AUDIT_DIR = 'audits/' + PLAN_ID;
const HANDOFF_DIR = 'handoffs/' + PLAN_ID;

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha256s = (s) => sha256(Buffer.from(s, 'utf-8'));

/* ─── stableJson — must match ledger-activation.ts ─────────────────── */
function stableJson(v) {
  if (v === null || typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (typeof v === 'object') {
    const k = Object.keys(v).sort();
    return '{' + k.map(k2 => stableJson(k2) + ':' + stableJson(v[k2])).join(',') + '}';
  }
  return 'null';
}

/* ─── Compute plan identity (matches computeIdentity) ─────────────── */
function computeIdentity(origSha, approved) {
  const m = {
    algorithm: 'SHA-256',
    approved_amendments: approved,
    composition: 'original-plus-ordered-approved-amendment-sha256',
    original_plan_sha256: origSha,
    version: 1,
  };
  const c = stableJson(m);
  return { sha256: sha256s(c), canonical: c, bytes: Buffer.byteLength(c, 'utf-8') };
}

/* ─── Print SHA constants for the test file ────────────────────────── */
function printSha(prefix, val) {
  console.log(`  const ${prefix} = '${val}';`);
}

/* ─── Helper: write file with parent dir creation ──────────────────── */
function write(absPath, content) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
}

/* ═══════════════════════════════════════════════════════════════════
   1.  original.md — minimal plan document
   ═══════════════════════════════════════════════════════════════════ */
const ORIGINAL_CONTENT = `# Harness v3 Successor — minimal test fixture

## 1. Identity

- \`plan_id\`: \`${PLAN_ID}\`
- This is a minimal fixture for NS0 activation tests.

## 2. Requirements

Minimal fixture requirements for ledger-activation.test.ts.
`;
const ORIGINAL_SHA256 = sha256s(ORIGINAL_CONTENT);
write(path.join(FIXTURE_DIR, PLAN_DIR, 'original.md'), ORIGINAL_CONTENT);

/* ═══════════════════════════════════════════════════════════════════
   2.  Amendment files 0001–0011 (pre-0012, OWNER_APPROVED_EFFECTIVE)
   ═══════════════════════════════════════════════════════════════════ */
const AMENDMENT_IDS = [
  '0001-execution-authorization',
  '0002-adaptive-execution-optimization',
  '0003-owner-closure-decisions',
  '0005-terminal-convergence-control-plane-redesign',
  '0006-three-mode-orchestration-and-opencode-federation',
  '0007-cost-aware-deepseek-routing-and-release-convergence',
  '0008-parallel-opencode-supervision-and-speed',
  '0009-session-scoped-child-pool-and-cache',
  '0010-dual-supervisor-balanced-concurrency',
  '0011-claude-first-class-host-and-permanent-convergence',
];

const amShas = {}; // full amendment ID -> sha256

for (const stem of AMENDMENT_IDS) {
  const num = stem.split('-')[0];
  const amNum = `AM-${num}`;
  const content = `# ${amNum} — Minimal fixture amendment ${num}\n\nStatus: \`OWNER_APPROVED_EFFECTIVE\`\n\nMinimal content for fixture.\n`;
  const sha = sha256s(content);
  amShas[amNum] = sha;
  write(path.join(FIXTURE_DIR, AMENDMENT_DIR, `${stem}.md`), content);
}

/* ═══════════════════════════════════════════════════════════════════
   3.  Amendment 0012 — must have the NS sections that parseAmendment
       expects (## 11., ## 12., NS0-NS9 subsections, 20 AC items).
   ═══════════════════════════════════════════════════════════════════ */
const AM012_STEM = '0012-native-swarm-artifact-handoff-and-fitness-closure';
const nsSections = [];
for (let i = 0; i <= 9; i++) {
  nsSections.push({ id: `AM0012-NS${i}`, heading: `### NS${i} — Minimal section ${i}` });
}

const acItems = [];
for (let i = 1; i <= 20; i++) {
  acItems.push(`${i}. AC-${String(i).padStart(2, '0')}: Minimal acceptance criterion ${i}`);
}

const AM012_CONTENT = `# AM-0012 — Minimal NS0 activation fixture

Status: \`OWNER_APPROVED_PENDING_ACTIVATION\`

Immutable original SHA-256:
\`${ORIGINAL_SHA256}\`

## 11. Native swarm sections

${nsSections.map(s => `${s.heading}\n\nContinued content for ${s.id}.\n`).join('\n')}

## 12. Acceptance criteria

${acItems.join('\n')}
`;
const AM012_SHA256 = sha256s(AM012_CONTENT);
write(path.join(FIXTURE_DIR, AMENDMENT_DIR, `${AM012_STEM}.md`), AM012_CONTENT);
amShas['AM-0012'] = AM012_SHA256;

/* ═══════════════════════════════════════════════════════════════════
   4.  Amendments 0013, 0014, 0015 (OWNER_APPROVED_PENDING_ACTIVATION)
   ═══════════════════════════════════════════════════════════════════ */
const AM013_STEM = '0013-rolling-wavefront-critical-path-pipeline';
const AM014_STEM = '0014-clustered-native-swarm-and-resource-safety';
const AM015_STEM = '0015-progressive-quality-release-and-main-history-consolidation';

function makePendingAmendment(title, stem) {
  const content = `# ${title}\n\nStatus: \`OWNER_APPROVED_PENDING_ACTIVATION\`\n\nImmutable original SHA-256:\n\`${ORIGINAL_SHA256}\`\n\nMinimal continuation fixture.\n`;
  write(path.join(FIXTURE_DIR, AMENDMENT_DIR, `${stem}.md`), content);
  return sha256s(content);
}

const AM013_SHA256 = makePendingAmendment('AM-0013 — Minimal rolling wavefront', AM013_STEM);
const AM014_SHA256 = makePendingAmendment('AM-0014 — Minimal clustered swarm', AM014_STEM);
const AM015_SHA256 = makePendingAmendment('AM-0015 — Minimal progressive quality', AM015_STEM);
amShas['AM-0013'] = AM013_SHA256;
amShas['AM-0014'] = AM014_SHA256;
amShas['AM-0015'] = AM015_SHA256;

/* ═══════════════════════════════════════════════════════════════════
   5.  Audit & handoff files (referenced by capture files)
   ═══════════════════════════════════════════════════════════════════ */
const AUDIT_FILES = {
  '2026-07-29-micro-fitness-baseline.md': '# Micro fitness baseline audit\n\nMinimal audit for fixture.\n',
  '2026-07-29-cluster-and-resource-ground-truth.md': '# Cluster and resource ground truth\n\nMinimal audit for fixture.\n',
  '2026-07-29-progressive-quality-baseline.md': '# Progressive quality baseline\n\nMinimal audit for fixture.\n',
};
const auditShas = {};
for (const [fn, content] of Object.entries(AUDIT_FILES)) {
  auditShas[fn] = sha256s(content);
  write(path.join(FIXTURE_DIR, AUDIT_DIR, fn), content);
}

const HANDOFF_FILES = {
  'continue-from-am0012.md': '# Continue from AM-0012\n\nMinimal handoff.\n',
  'opencode-continuation-prompt.md': '# OpenCode continuation prompt\n\nMinimal prompt.\n',
  'rolling-wavefront-steer.md': '# Rolling wavefront steer\n\nMinimal steer.\n',
  'opencode-am0013-full-continuation-prompt.md': '# AM-0013 full continuation\n\nMinimal prompt.\n',
  'continue-from-am0014-clustered-native-swarm.md': '# Continue from AM-0014\n\nMinimal handoff.\n',
  'claude-code-context-scaffold-prompt.md': '# Claude scaffold prompt\n\nMinimal prompt.\n',
  'claude-code-implementation-prompt.md': '# Claude implementation prompt\n\nMinimal prompt.\n',
  'continue-from-am0015-progressive-release.md': '# Continue from AM-0015\n\nMinimal handoff.\n',
  'opencode-am0015-delta-rescaffold-prompt.md': '# AM-0015 delta rescaffold\n\nMinimal prompt.\n',
  'opencode-am0015-implementation-prompt.md': '# AM-0015 implementation\n\nMinimal prompt.\n',
};
const handoffShas = {};
for (const [fn, content] of Object.entries(HANDOFF_FILES)) {
  handoffShas[fn] = sha256s(content);
  write(path.join(FIXTURE_DIR, HANDOFF_DIR, fn), content);
}

/* ═══════════════════════════════════════════════════════════════════
   6.  Capture files (am0012 through am0015)
   ═══════════════════════════════════════════════════════════════════ */
const captureShas = {};

function makeCapture(id, extra) {
  const doc = {
    schema_version: 1,
    plan_id: PLAN_ID,
    amendment_id: `AM-${id}`,
    status: 'OWNER_APPROVED_PENDING_ACTIVATION',
    source_kind: 'owner-chat',
    captured_at: '2026-07-29T00:00:00.000Z',
    original: {
      path: `.agent/${PLAN_DIR}/original.md`,
      sha256: ORIGINAL_SHA256,
    },
    amendment: {
      path: `.agent/${AMENDMENT_DIR}/${extra.stem}.md`,
      sha256: amShas[`AM-${id}`],
    },
    ...extra.fields,
    repository_baselines: {
      canonical_main: '0000000000000000000000000000000000000000',
      active_integration: '0000000000000000000000000000000000000000',
    },
    activation_rule: 'Minimal fixture rule.',
  };
  const json = JSON.stringify(doc, null, 2);
  const stem = `am${String(id).padStart(4, '0')}-capture.json`;
  write(path.join(FIXTURE_DIR, LINEAGE_DIR, stem), json);
  captureShas[id] = sha256s(json);
}

makeCapture('0012', {
  stem: AM012_STEM,
  fields: {
    audit: { path: `.agent/${AUDIT_DIR}/2026-07-29-micro-fitness-baseline.md`, sha256: auditShas['2026-07-29-micro-fitness-baseline.md'] },
    handoff: { path: `.agent/${HANDOFF_DIR}/continue-from-am0012.md`, sha256: handoffShas['continue-from-am0012.md'] },
    continuation_prompt: { path: `.agent/${HANDOFF_DIR}/opencode-continuation-prompt.md`, sha256: handoffShas['opencode-continuation-prompt.md'] },
  },
});

makeCapture('0013', {
  stem: AM013_STEM,
  fields: {
    prior_amendment: {
      path: `.agent/${AMENDMENT_DIR}/${AM012_STEM}.md`,
      sha256: AM012_SHA256,
    },
    steer: { path: `.agent/${HANDOFF_DIR}/rolling-wavefront-steer.md`, sha256: handoffShas['rolling-wavefront-steer.md'] },
    full_continuation_prompt: { path: `.agent/${HANDOFF_DIR}/opencode-am0013-full-continuation-prompt.md`, sha256: handoffShas['opencode-am0013-full-continuation-prompt.md'] },
  },
});

makeCapture('0014', {
  stem: AM014_STEM,
  fields: {
    prior_amendments: [
      { amendment_id: 'AM-0012', path: `.agent/${AMENDMENT_DIR}/${AM012_STEM}.md`, sha256: AM012_SHA256 },
      { amendment_id: 'AM-0013', path: `.agent/${AMENDMENT_DIR}/${AM013_STEM}.md`, sha256: AM013_SHA256 },
    ],
    audit: { path: `.agent/${AUDIT_DIR}/2026-07-29-cluster-and-resource-ground-truth.md`, sha256: auditShas['2026-07-29-cluster-and-resource-ground-truth.md'] },
    handoff: { path: `.agent/${HANDOFF_DIR}/continue-from-am0014-clustered-native-swarm.md`, sha256: handoffShas['continue-from-am0014-clustered-native-swarm.md'] },
    claude_scaffold_prompt: { path: `.agent/${HANDOFF_DIR}/claude-code-context-scaffold-prompt.md`, sha256: handoffShas['claude-code-context-scaffold-prompt.md'] },
    claude_implementation_prompt: { path: `.agent/${HANDOFF_DIR}/claude-code-implementation-prompt.md`, sha256: handoffShas['claude-code-implementation-prompt.md'] },
    observed_topology: { worktrees: 1, local_branches: 1, remote_branches: ['main'], canonical_ledger_revision: 46, canonical_ledger_execution_state: 'NEEDS_REMEDIATION', canonical_ledger_chain_tip: 'AM-0011' },
  },
});

makeCapture('0015', {
  stem: AM015_STEM,
  fields: {
    owner_decisions: ['Minimal fixture decision.'],
    prior_amendments: [
      { amendment_id: 'AM-0012', path: `.agent/${AMENDMENT_DIR}/${AM012_STEM}.md`, sha256: AM012_SHA256 },
      { amendment_id: 'AM-0013', path: `.agent/${AMENDMENT_DIR}/${AM013_STEM}.md`, sha256: AM013_SHA256 },
      { amendment_id: 'AM-0014', path: `.agent/${AMENDMENT_DIR}/${AM014_STEM}.md`, sha256: AM014_SHA256 },
    ],
    audit: { path: `.agent/${AUDIT_DIR}/2026-07-29-progressive-quality-baseline.md`, sha256: auditShas['2026-07-29-progressive-quality-baseline.md'] },
    handoff: { path: `.agent/${HANDOFF_DIR}/continue-from-am0015-progressive-release.md`, sha256: handoffShas['continue-from-am0015-progressive-release.md'] },
    delta_rescaffold_prompt: { path: `.agent/${HANDOFF_DIR}/opencode-am0015-delta-rescaffold-prompt.md`, sha256: handoffShas['opencode-am0015-delta-rescaffold-prompt.md'] },
    implementation_prompt: { path: `.agent/${HANDOFF_DIR}/opencode-am0015-implementation-prompt.md`, sha256: handoffShas['opencode-am0015-implementation-prompt.md'] },
    repository_baselines: { canonical_main: '0000000000000000000000000000000000000000', active_integration: '0000000000000000000000000000000000000000', remote_successor: '0000000000000000000000000000000000000000' },
  },
});

/* ═══════════════════════════════════════════════════════════════════
   7.  Ledger — minimal but structurally valid
   ═══════════════════════════════════════════════════════════════════ */
const SHADOW_REVISION = 47; // must match expected in test

const approvedPre0012 = [
  { amendment_id: 'AM-0001', sha256: amShas['AM-0001'] },
  { amendment_id: 'AM-0002', sha256: amShas['AM-0002'] },
  { amendment_id: 'AM-0003', sha256: amShas['AM-0003'] },
  { amendment_id: 'AM-0005', sha256: amShas['AM-0005'] },
  { amendment_id: 'AM-0006', sha256: amShas['AM-0006'] },
  { amendment_id: 'AM-0007', sha256: amShas['AM-0007'] },
  { amendment_id: 'AM-0008', sha256: amShas['AM-0008'] },
  { amendment_id: 'AM-0009', sha256: amShas['AM-0009'] },
  { amendment_id: 'AM-0010', sha256: amShas['AM-0010'] },
  { amendment_id: 'AM-0011', sha256: amShas['AM-0011'] },
];

// Identity BEFORE AM-0012 activation
const priorIdentity = computeIdentity(ORIGINAL_SHA256, approvedPre0012);

// Identity AFTER AM-0012 activation (already EFFECTIVE in fixture)
const approvedWith0012 = [
  ...approvedPre0012,
  { amendment_id: 'AM-0012', sha256: AM012_SHA256 },
];
const newIdentity = computeIdentity(ORIGINAL_SHA256, approvedWith0012);

// Build amendment entries with path and SHA.
// NOTE: AM-0013/0014/0015 are EXCLUDED from the ledger — they exist only
// as files + captures for the bounded repair continuation tests.
const amendmentEntries = [
  ...approvedPre0012.map((a, i) => {
    const stem = AMENDMENT_IDS[i];
    const st = fs.statSync(path.join(FIXTURE_DIR, AMENDMENT_DIR, `${stem}.md`));
    return {
      amendment_id: a.amendment_id,
      status: 'OWNER_APPROVED_EFFECTIVE',
      path: `.agent/${AMENDMENT_DIR}/${stem}.md`,
      sha256: a.sha256,
      bytes: st.size,
      lines: 3,
      activation_state: 'EFFECTIVE',
    };
  }),
  {
    amendment_id: 'AM-0012',
    status: 'OWNER_APPROVED_EFFECTIVE',
    path: `.agent/${AMENDMENT_DIR}/${AM012_STEM}.md`,
    sha256: AM012_SHA256,
    bytes: Buffer.byteLength(AM012_CONTENT, 'utf-8'),
    lines: AM012_CONTENT.split('\n').length,
    capture_sha256: captureShas['0012'],
    activation_state: 'EFFECTIVE',
  },
];

/* ─── Pre-existing reviews & assignments for stale-evidence tests ─── */
const nsAssignments = [];
for (let i = 0; i <= 9; i++) {
  nsAssignments.push({
    assignment_id: `ASN-AM0012-NS${i}`,
    task_id: `AM0012-NS${i}`,
    owner: 'engine',
    status: 'NEEDS_REMEDIATION',
    owned_paths: i === 0 ? ['packages/engine/src/ledger-activation.ts'] : [],
    acceptance_criteria: [`AC-NS${i}: test`],
    plan_anchor_requirement_id: `REQ-AM0012-NS${i}`,
  });
}
const preExistingAssignments = [
  { assignment_id: 'ASN-P0-F0', task_id: 'F0', owner: 'test', status: 'CLOSED', owned_paths: ['src/test.ts'], acceptance_criteria: ['pass'], plan_anchor_requirement_id: 'REQ-001' },
  { assignment_id: 'ASN-P1-R1', task_id: 'P1-R1', owner: 'test', status: 'CLOSED', owned_paths: ['src/test2.ts'], acceptance_criteria: ['pass'], plan_anchor_requirement_id: 'REQ-002' },
  ...nsAssignments,
];

const preExistingReviews = [
  { review_receipt_id: 'REV-001', reviewer: 'test', status: 'FINDING_REMEDIATED', finding_id: 'FIND-001', scope: 'test', effective_plan_sha256: priorIdentity.sha256 },
  { review_receipt_id: 'REV-002', reviewer: 'test', status: 'CLOSED', finding_id: 'FIND-002', scope: 'test2', effective_plan_sha256: priorIdentity.sha256, completion_receipt_id: 'CR-001' },
];

const preExistingPlanAnchors = [
  { plan_sha256: ORIGINAL_SHA256, section_heading: '## 1', line_start: 1, line_end: 5, anchor_text_sha256: sha256s('test'), requirement_id: 'REQ-001' },
  ...nsAssignments.map((a, i) => ({
    plan_sha256: ORIGINAL_SHA256,
    section_heading: `### NS${i}`,
    line_start: 10 + i,
    line_end: 10 + i + 1,
    anchor_text_sha256: sha256s(`ns${i}`),
    requirement_id: a.plan_anchor_requirement_id,
    amendment_id: 'AM-0012',
  })),
];

const preExistingBatches = [
  { batch_id: 'P-1', status: 'COMPLETE_BOOTSTRAP', anchor_requirement_id: 'REQ-001', acceptance_criteria: ['test'] },
];

const preExistingReconciliations = [
  { kind: 'initial', result: 'PASS', scope: 'test', review_receipt_id: 'REV-001' },
];

const auditEvents = [
  { event_id: 'E0', type: 'PLAN_ADOPTED', summary: 'Plan adopted', amendment_id: '-', shadow_revision: 1 },
  { event_id: 'E1', type: 'AMENDMENT_CHAIN_ACTIVATION', summary: `Activated AM-0012 identity ${priorIdentity.sha256}→${newIdentity.sha256}`, amendment_id: 'AM-0012', shadow_revision: SHADOW_REVISION, capture_sha256: captureShas['0012'] },
];

/* ─── Shadow files (rendered from ledger content) ──────────────────── */
// Amendment summary for shadows — only includes ledger entries (no 0013/0014/0015)
const shadowAmendMd = '# Amendments\n\n| ID | Status | SHA | Effect |\n|---|---|---|---|\n' + amendmentEntries.map(a => `| ${a.amendment_id} | ${a.status} | ${a.sha256.substring(0, 12)}… | ${a.activation_state ?? '-'} |`).join('\n') + '\n';

// Shadow content MUST match what the engine's renderAll() produces.
// renderTasks: looks up anchor by plan_anchor_requirement_id.
//   If anchor found with line_start, outputs "plan <line_start>" (no amendment_id).
//   If no anchor, falls back to plan_anchor_requirement_id.
const anchorById = {};
for (const a of preExistingPlanAnchors) anchorById[a.requirement_id] = a;
function renderAnchor(assn) {
  const an = anchorById[assn.plan_anchor_requirement_id];
  return an ? ((an.amendment_id ?? 'plan') + ' ' + (an.line_start ?? '')) : (assn.plan_anchor_requirement_id ?? '-');
}
function scopeFromAssn(a) {
  return ((a.acceptance_criteria ?? []).join('; ') || (a.owned_paths ?? []).join(', '));
}
const tasksMd = '# Tasks\n\nDerived from WorkLedger revision ' + SHADOW_REVISION + '.\n\n| Task | Assignment | State | Scope | Anchor |\n|---|---|---|---|---|\n' +
  preExistingAssignments.map(a => `| ${a.task_id} | ${a.assignment_id} | ${a.status} | ${scopeFromAssn(a)} | ${renderAnchor(a)} |`).join('\n') + '\n';

// renderProgress: last 5 events, then appends a chain activation row
const progressEvents = auditEvents.slice(-5).map(e =>
  `| ${e.type} | ${(e.summary ?? '').substring(0, 120)} | ${e.amendment_id ?? '-'} | ${(e.shadow_revision ?? '')} |`
).join('\n');
const progressMd = '# Progress\n\n| Event | Summary | Amendment | Rev |\n|---|---|---|---|\n' + progressEvents +
  '\n| AMENDMENT_CHAIN_ACTIVATION | Activated AM-0012 identity ' + priorIdentity.sha256 + '→' + newIdentity.sha256 + ' | AM-0012 | R' + SHADOW_REVISION + ' |\n';

const reconsMd = '# Reconciliation\n\nStatus: **NEEDS_REMEDIATION**\n\n| Kind | Result | Scope | Evidence |\n|---|---|---|---|\n' +
  preExistingReconciliations.map(r => `| ${r.kind ?? '-'} | ${r.result ?? '-'} | ${(r.scope ?? '').substring(0, 80)} | ${r.review_receipt_id ?? '-'} |`).join('\n') + '\n';

const shadowFiles = {
  'tasks.md': tasksMd,
  'progress.md': progressMd,
  'amendments.md': shadowAmendMd,
  'reconciliation.md': reconsMd,
  'batches/bootstrap/tasks.md': '# Bootstrap tasks\n\n| Batch | Scope | AC |\n|---|---|---|\n| P-1 | Bootstrap plan capture | test |\n',
  'batches/bootstrap/progress.md': '# Bootstrap progress\n\nBootstrap batch status: **COMPLETE_BOOTSTRAP**\n',
  'batches/bootstrap/reconciliation.md': '# Bootstrap reconciliation\n\n| Batch | Status | Anchor |\n|---|---|---|\n| P-1 | COMPLETE_BOOTSTRAP | REQ-001 |\n',
};

// Fix event summaries to match what engine renders (substring 120)
auditEvents[0].summary = auditEvents[0].summary.substring(0, 120);
auditEvents[1].summary = auditEvents[1].summary.substring(0, 120);

const shadowHashes = {};
for (const [fn, content] of Object.entries(shadowFiles)) {
  const sha = sha256s(content);
  shadowHashes[fn] = sha;
  write(path.join(FIXTURE_DIR, SHADOW_DIR, fn), content);
}
// Also write batch bootstrap shadow files
for (const [fn, content] of Object.entries(shadowFiles)) {
  if (fn.startsWith('batches/')) {
    write(path.join(FIXTURE_DIR, SHADOW_DIR, fn), content);
  }
}

/* ─── Assemble ledger ────────────────────────────────────────────── */
const effectivePlanIdentity = {
  algorithm: 'SHA-256 over UTF-8 canonical JSON with no insignificant whitespace, lexicographically sorted object keys, and approved_amendments preserved in approval order',
  input_manifest: {
    algorithm: 'SHA-256',
    approved_amendments: approvedWith0012,
    composition: 'original-plus-ordered-approved-amendment-sha256',
    original_plan_sha256: ORIGINAL_SHA256,
    version: 1,
  },
  canonical_json_utf8: newIdentity.canonical,
  canonical_json_utf8_bytes: newIdentity.bytes,
  sha256: newIdentity.sha256,
};

// Identity used by bounded repair AFTER adding AM-0013/0014/0015
const brFinalIdentity = computeIdentity(ORIGINAL_SHA256, [
  ...approvedPre0012,
  { amendment_id: 'AM-0012', sha256: AM012_SHA256 },
  { amendment_id: 'AM-0013', sha256: AM013_SHA256 },
  { amendment_id: 'AM-0014', sha256: AM014_SHA256 },
  { amendment_id: 'AM-0015', sha256: AM015_SHA256 },
]);

const ledger = {
  schema_version: 1,
  plan_id: PLAN_ID,
  status: 'ADOPTED',
  execution_state: 'NEEDS_REMEDIATION',
  mutation_gate: 'APPROVED',
  original_plan: {
    path: `.agent/${PLAN_DIR}/original.md`,
    sha256: ORIGINAL_SHA256,
    bytes: Buffer.byteLength(ORIGINAL_CONTENT, 'utf-8'),
    encoding: 'utf-8',
    line_endings: 'LF including final terminator',
    source_kind: 'test_fixture',
  },
  shadow_revision: SHADOW_REVISION,
  shadow_hashes: shadowHashes,
  amendments: amendmentEntries,
  effective_plan_identity: effectivePlanIdentity,
  assignments: preExistingAssignments,
  reviews: preExistingReviews,
  plan_anchors: preExistingPlanAnchors,
  batches: preExistingBatches,
  reconciliations: preExistingReconciliations,
  audit_events: auditEvents,
  foundation_slices: [],
  findings: [],
  repair_slices: [],
  orphan_side_effects: [],
  source_acquisition_receipts: [],
  architecture_decisions: [],
  semantic_migrations: [],
  execution_authorization: { mode: 'authorized' },
  repository_baseline: { active_integration: 'test' },
  artifact_lineage: [],
};

const LEDGER_JSON = JSON.stringify(ledger, null, 2) + '\n';
const LEDGER_SHA256 = sha256s(LEDGER_JSON);

write(path.join(FIXTURE_DIR, LEDGER_REL), LEDGER_JSON);

/* ═══════════════════════════════════════════════════════════════════
   8.  Print all SHA constants for the test file
   ═══════════════════════════════════════════════════════════════════ */
console.log('=== SHA constants for ledger-activation.test.ts ===\n');
console.log('// File SHAs');
printSha('LEDGER_SHA256', LEDGER_SHA256);
printSha('ORIGINAL_SHA256', ORIGINAL_SHA256);
printSha('AMENDMENT_SHA256', AM012_SHA256);
printSha('PRIOR_EFFECTIVE_SHA256', priorIdentity.sha256);
printSha('NEW_EFFECTIVE_SHA256', newIdentity.sha256);
console.log('');
console.log('// Bounded repair SHAs');
printSha('AM13_SHA256', AM013_SHA256);
printSha('AM14_SHA256', AM014_SHA256);
printSha('AM15_SHA256', AM015_SHA256);
printSha('BR_FINAL_IDENTITY', brFinalIdentity.sha256);
console.log('');
console.log('// Path constants for the test');
console.log(`const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'ns0-activation');`);
console.log(`const LEDGER_REL = '${LEDGER_REL}';`);
console.log(`const AMENDMENT_REL = '${AMENDMENT_DIR}/${AM012_STEM}.md';`);
console.log(`const CAPTURE_REL = '${LINEAGE_DIR}/am0012-capture.json';`);
console.log(`const ORIGINAL_REL = '${PLAN_DIR}/original.md';`);
console.log(`const SHADOW_REL = '${SHADOW_DIR}';`);
console.log(`const AM13_REL = '${AMENDMENT_DIR}/${AM013_STEM}.md';`);
console.log(`const AM14_REL = '${AMENDMENT_DIR}/${AM014_STEM}.md';`);
console.log(`const AM15_REL = '${AMENDMENT_DIR}/${AM015_STEM}.md';`);
console.log(`const CAPTURE13_REL = '${LINEAGE_DIR}/am0013-capture.json';`);
console.log(`const CAPTURE14_REL = '${LINEAGE_DIR}/am0014-capture.json';`);
console.log(`const CAPTURE15_REL = '${LINEAGE_DIR}/am0015-capture.json';`);
console.log('');
console.log(`// Expected shadow_revision in fixture`);
console.log(`const SHADOW_REVISION = ${SHADOW_REVISION};`);
console.log('\nDone.');

// Verify self-consistency
const lk = JSON.parse(LEDGER_JSON);
console.log('\n=== Self-consistency check ===');
console.log('Amendments in ledger:', lk.amendments.length, '(expected 11: 0001-0011 + AM-0012)');
console.log('Shadow hashes in ledger:', Object.keys(lk.shadow_hashes).length);
console.log('Prior identity (pre-AM0012):', priorIdentity.sha256);
console.log('New identity (with AM0012):', newIdentity.sha256);
console.log('BR final identity (with 0013-0015):', brFinalIdentity.sha256);
console.log('Ledger effective identity:', lk.effective_plan_identity.sha256);
console.log('Match:', lk.effective_plan_identity.sha256 === newIdentity.sha256 ? 'YES' : 'NO');
