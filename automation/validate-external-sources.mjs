#!/usr/bin/env node
/**
 * V-007 / C-007 — Immutable external source governance.
 *
 * Enforces, for every external source record (skills/tools/MCP/apps) in
 * skills/candidate-fabric.json:
 *   - a pinned immutable revision (commit SHA, tag, or version) — mutable refs
 *     (branch names such as "main") fail closed, so a repository moving its
 *     default branch never silently changes what a record pins;
 *   - a content hash (sha256 or git tree OID) bound to the pinned revision;
 *   - license, trust, security-review, portability, route-precision, benchmark,
 *     and install/rollback records;
 *   - hard gates + weighted qualification (score >= 70) against
 *     no-skill/local composition as a valid outcome; rejected or
 *     below-threshold candidates stay catalog-only and are never materialized.
 *
 * The plan-local source-lock seed is the policy authority; the fabric mirror
 * must stay equal. Negative fixtures prove that mutable, hash-mismatched,
 * unlicensed, unsafe, non-rollbackable, conflicting, and below-threshold
 * candidates are rejected with explicit reasons.
 *
 * Exit 0 only when every governance invariant holds; otherwise exit 1.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const fabric = readJson('skills/candidate-fabric.json');
const seed = readJson('.agent/plans/harness-universal-reconciliation-v1/source-lock.seed.json');
const schema = readJson('schemas/skill-fabric-candidate.schema.json');
const catalog = readJson('skills/catalog.json');
const platformContracts = readJson('platforms/platform-contracts.json');

const REGISTERED_HOSTS = new Set([
  ...Object.keys(platformContracts.platforms ?? {}),
  ...(platformContracts.parity_contract?.certification_required_hosts ?? []),
  ...(platformContracts.parity_contract?.deferred_supported_targets ?? []),
]);

const COMMIT_RE = /^[0-9a-f]{40}$/;
const TAG_RE = /^v?\d+\.\d+(\.\d+)?$/;
const VERSION_RE = /^\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TREE_RE = /^[0-9a-f]{40}$/;
const ID_RE = /^[0-9a-z][0-9a-z-]*$/;

const failures = [];
const fail = (message) => failures.push(message);

function isImmutableRevision(rev) {
  if (!rev || typeof rev !== 'object') return false;
  if (rev.kind === 'commit') return typeof rev.value === 'string' && COMMIT_RE.test(rev.value);
  if (rev.kind === 'tag') return typeof rev.value === 'string' && TAG_RE.test(rev.value);
  if (rev.kind === 'version') return typeof rev.value === 'string' && VERSION_RE.test(rev.value);
  return false;
}

function isContentHash(hash) {
  if (!hash || typeof hash !== 'object') return false;
  if (hash.algorithm === 'sha256') return typeof hash.value === 'string' && SHA256_RE.test(hash.value);
  if (hash.algorithm === 'git-tree-sha1') return typeof hash.value === 'string' && TREE_RE.test(hash.value);
  return false;
}

/**
 * Verify a sha256 content hash against a materialized repo-local file. This is
 * the only hash class a validator can recompute offline; git tree OIDs are
 * recorded-at-resolution provenance and cannot be recomputed from a partial
 * checkout.
 */
function verifyMaterializedHash(hash) {
  if (hash.algorithm !== 'sha256' || !String(hash.source).startsWith('file:')) return true;
  const file = path.join(ROOT, hash.source.slice('file:'.length));
  if (!fs.existsSync(file)) return false;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return actual === hash.value;
}

/**
 * Weighted qualification. Scores are recomputed deterministically from the
 * record's lock/benchmark evidence; the recorded receipt must match exactly.
 * Weights (total 100): source_integrity 25, license 15, security_review 15,
 * verified_task_success 15, portability 10, route_precision 10,
 * maintenance_cost 10.
 */
function computeQualification(record) {
  const lock = record.lock;
  const factors = {};

  const pinned = isImmutableRevision(lock.immutable_revision);
  const hashed = isContentHash(lock.content_hash);
  factors.source_integrity = { score: pinned && hashed ? 25 : 0, max: 25 };

  const licenseEstablished = Boolean(lock.license) && !['unresolved', 'unknown', ''].includes(lock.license.spdx);
  factors.license = {
    score: licenseEstablished ? (lock.license.review_state === 'reviewed' ? 15 : 8) : 0,
    max: 15,
  };

  factors.security_review = { score: lock.security_review.state === 'approved' ? 15 : 0, max: 15 };
  factors.verified_task_success = { score: lock.benchmark.state === 'passed' ? 15 : 0, max: 15 };
  factors.portability = { score: lock.portability.skillmd && lock.portability.route_sidecar ? 10 : 0, max: 10 };
  factors.route_precision = { score: { high: 10, medium: 5, low: 0 }[lock.route_precision.precision] ?? 0, max: 10 };
  factors.maintenance_cost = {
    score: lock.benchmark.state !== 'rejected' && lock.route_precision.precision !== 'low' ? 10 : 0,
    max: 10,
  };

  const score = Object.values(factors).reduce((sum, f) => sum + f.score, 0);

  const reasons = [];
  if (!pinned) reasons.push(`unpinned: ${lock.immutable_revision?.value ?? '(missing)'} is not an immutable commit/tag/version pin`);
  if (!hashed) reasons.push('unhashable: content hash missing or malformed');
  if (!verifyMaterializedHash(lock.content_hash)) reasons.push('hash-mismatch: content hash does not match materialized file');
  if (!licenseEstablished) reasons.push('unlicensed: license not established');
  else if (lock.license.review_state !== 'reviewed') reasons.push('license-unreviewed: license_review_required unsatisfied');
  if (lock.security_review.state === 'rejected') reasons.push('unsafe: security review rejected');
  else if (lock.security_review.state !== 'approved') reasons.push('security-review-pending: not approved');
  if (!lock.rollback?.plan) reasons.push('non-rollbackable: missing rollback plan');
  if (score < 70) reasons.push(`below-threshold: score ${score} < 70`);
  return { score, factors, reasons };
}

/** Hard selection gates. A record may be selected only when every gate passes. */
function selectionGatesPass(record) {
  const reasons = computeQualification(record).reasons;
  const gateKinds = ['unpinned:', 'unhashable:', 'hash-mismatch:', 'unlicensed:', 'license-unreviewed:', 'unsafe:', 'non-rollbackable:', 'implicit-install:'];
  return !reasons.some((r) => gateKinds.some((g) => r.startsWith(g)));
}

function unresolvedConflicts(record, selected) {
  if (!selected) return [];
  return (record.conflicts ?? [])
    .filter((c) => c.resolved === false)
    .map((c) => `conflict-unresolved: ${c.with} requires explicit resolution`);
}

/** Validate one record structurally and against its recorded qualification receipt. */
function validateRecord(record, index) {
  const id = record?.id ?? `(missing id at index ${index})`;
  const bad = (message) => fail(`${id}: ${message}`);

  if (typeof id !== 'string' || !ID_RE.test(id)) bad('id must match ^[0-9a-z][0-9a-z-]*$');
  if (typeof record.source !== 'string' || !/^https:\/\//.test(record.source)) bad('source must be HTTPS');
  if (!['reference', 'candidate', 'selected-explicit', 'selected-adapter', 'materialized'].includes(record.selection)) bad(`invalid selection: ${record.selection}`);
  if (!['reference-or-on-demand', 'on-demand-binding', 'diagnostic-only'].includes(record.adoption)) bad(`invalid adoption: ${record.adoption}`);
  if (!['candidate', 'selected', 'rejected', 'materialized'].includes(record.status)) bad(`invalid status: ${record.status}`);

  const install = record.install ?? {};
  if (install.mode !== 'never-implicit') bad('implicit install is forbidden (install.mode must be never-implicit)');
  if (install.shell_strings !== 'forbidden') bad('shell_strings must be forbidden (policy shell_strings_forbidden)');
  if (install.materialization === 'explicit' && record.selection !== 'selected-explicit') bad('explicit materialization requires selection selected-explicit');

  const lock = record.lock ?? {};
  if (!isImmutableRevision(lock.immutable_revision)) bad(`mutable or unpinned ref fails closed: ${lock.immutable_revision?.kind ?? 'missing'}=${lock.immutable_revision?.value ?? '(none)'}`);
  if (!isContentHash(lock.content_hash)) bad('content hash must be sha256 (64 hex) or git-tree-sha1 (40 hex)');
  if (!['pending-review', 'reviewed', 'blocked', 'unresolved'].includes(lock.license?.review_state)) bad(`invalid license.review_state: ${lock.license?.review_state}`);
  if (!['pending', 'approved', 'rejected'].includes(lock.security_review?.state)) bad(`invalid security_review.state: ${lock.security_review?.state}`);
  if (lock.portability?.skillmd !== true || lock.portability?.route_sidecar !== true) bad('portability requires portable SKILL.md + harness-owned ROUTE.json sidecar');
  for (const host of lock.portability?.hosts ?? []) {
    if (!REGISTERED_HOSTS.has(host)) bad(`portability lists unknown host: ${host}`);
  }
  if (!['high', 'medium', 'low'].includes(lock.route_precision?.precision)) bad(`invalid route_precision.precision: ${lock.route_precision?.precision}`);
  if (lock.route_precision?.sidecar !== 'ROUTE.json') bad('route sidecar must stay harness-owned ROUTE.json (DEC-007)');
  if (!['pending', 'passed', 'rejected'].includes(lock.benchmark?.state)) bad(`invalid benchmark.state: ${lock.benchmark?.state}`);
  if (!lock.rollback?.plan) bad('rollback plan is required (policy rollback_required)');
  if (install.materialization === 'none' && lock.rollback?.record !== null && lock.rollback?.record !== undefined) bad('rollback record must be null while nothing is materialized');

  for (const c of record.conflicts ?? []) {
    const known = (catalog.skills ?? []).some((s) => s.id === c.with);
    if (!known) bad(`conflict references unknown canonical skill: ${c.with}`);
    if (c.resolved === false && c.resolution !== null) bad(`conflict ${c.with}: resolution must be null while unresolved`);
  }

  // Qualification receipt must match the deterministic recomputation.
  const expected = computeQualification(record);
  const qual = record.qualification ?? {};
  if (qual.threshold !== 70) bad('qualification threshold must be 70 (policy selected_skill_score_minimum)');
  if (qual.score !== expected.score) bad(`recorded score ${qual.score} != recomputed ${expected.score}`);
  if (qual.result === 'passed' && !selectionGatesPass(record)) bad('qualification.result passed while hard gates fail');
  const factorNames = Object.keys(expected.factors);
  for (const name of factorNames) {
    const f = qual.factors?.[name];
    if (!f || f.score !== expected.factors[name].score || f.max !== expected.factors[name].max) {
      bad(`qualification factor ${name} mismatch: recorded ${JSON.stringify(f)} != expected ${JSON.stringify(expected.factors[name])}`);
    }
  }
  const conflictReasons = unresolvedConflicts(record, qual.result === 'passed' || record.status === 'selected');
  const allReasons = [...expected.reasons, ...conflictReasons];
  const recordedReasons = [...(qual.reasons ?? [])].sort();
  const expectedReasons = [...allReasons].sort();
  if (JSON.stringify(recordedReasons) !== JSON.stringify(expectedReasons)) {
    bad(`rejection reasons mismatch\n  recorded: ${JSON.stringify(recordedReasons)}\n  expected: ${JSON.stringify(expectedReasons)}`);
  }

  return { id, score: expected.score, reasons: expected.reasons, selection: record.selection, status: record.status };
}

// ---- 1. Policy parity with the plan-local seed (authority) ----
const policyKeys = Object.keys(seed.policy);
const fabricPolicy = fabric.source_lock_policy ?? {};
for (const key of policyKeys) {
  if (fabricPolicy[key] !== seed.policy[key]) fail(`source_lock_policy.${key} differs from source-lock seed (seed=${seed.policy[key]}, fabric=${fabricPolicy[key]})`);
}
for (const key of Object.keys(fabricPolicy)) {
  if (!(key in seed.policy)) fail(`source_lock_policy carries unknown key: ${key}`);
}

// ---- 2. Schema lockstep: records must match the schema's required keys ----
const schemaRequired = [...(schema.$defs?.externalSource?.required ?? [])].sort();
const sources = fabric.external_source_matrix;
if (!Array.isArray(sources) || sources.length === 0) fail('candidate fabric external_source_matrix is empty');
const ids = new Set();
const receipts = [];
sources.forEach((source, index) => {
  if (source?.id && ids.has(source.id)) fail(`duplicate external source id: ${source.id}`);
  ids.add(source?.id);
  const keys = Object.keys(source ?? {}).sort();
  const schemaAllowed = new Set([...schemaRequired, ...Object.keys(schema.$defs?.externalSource?.properties ?? {})]);
  const missingKeys = schemaRequired.filter((k) => !keys.includes(k));
  const extraKeys = keys.filter((k) => !schemaAllowed.has(k));
  if (missingKeys.length || extraKeys.length) {
    fail(`${source?.id ?? index}: record keys diverge from schema $defs.externalSource.required (missing: ${missingKeys.join(',') || 'none'}; extra: ${extraKeys.join(',') || 'none'})`);
  }
  receipts.push(validateRecord(source, index));
});

// ---- 3. Selected set invariants (unselected candidates are never materialized) ----
const selectedRecords = receipts.filter((r) => r.status === 'selected');
for (const r of selectedRecords) {
  if (!selectionGatesPass(sources.find((s) => s.id === r.id))) fail(`${r.id}: selected while hard gates fail`);
  if (r.score < 70) fail(`${r.id}: selected below qualification threshold`);
}
// Materialized records must carry a lockable pin/hash even though content may
// still be BLOCKED; the selected (runtime-ready) set is separate.
const materializedRecords = receipts.filter((r) => r.status === 'materialized');
for (const r of materializedRecords) {
  const src = sources.find((s) => s.id === r.id);
  if (!src) continue;
  if (!isImmutableRevision(src.lock?.immutable_revision)) fail(`${r.id}: materialized source lacks immutable pin`);
  if (!isContentHash(src.lock?.content_hash)) fail(`${r.id}: materialized source lacks content hash`);
}
const selectedIds = materializedRecords
  .filter((r) => !new Set(['mobile-provider', 'mcp-server', 'app-mcp']).has(sources.find((x) => x.id === r.id)?.kind))
  .map((r) => r.id);

// ---- Full-adoption materialization checks (AM-0002) ----
const GENERIC_ROUTE_KEYWORDS = new Set(['design','ui','frontend','backend','database','test','qa','browser','mobile','security','docs','api']);
const ACTIVATION_CLASSES = new Set(['NATIVE','POLICY','ROUTED','EXPLICIT','ON_DEMAND','PROVIDER_ROUTE','SEMANTIC_DISCOVERY']);
const providerKinds = new Set(['mobile-provider','mcp-server','app-mcp']);
const fileSha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT, file))).digest('hex');
const REGISTERED_PROVIDER_IDS = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'registry.json'), 'utf8')).integrations.map((i) => i.id),
);
for (const r of receipts) {
  const src = sources.find((s) => s.id === r.id);
  if (!src || (r.status !== 'materialized' && r.selection !== 'materialized')) continue;
  const isProvider = providerKinds.has(src.kind);
  const artifactPath = isProvider
    ? `integrations/recommended/${src.id}/manifest.json`
    : `skills/${src.id}/SKILL.md`;
  const routePath = isProvider
    ? `integrations/recommended/${src.id}/manifest.json`
    : `skills/${src.id}/ROUTE.json`;
  if (!exists(artifactPath)) fail(`${src.id}: materialized ${isProvider ? 'provider' : 'skill'} artifact missing: ${artifactPath}`);
  if (!isProvider && !exists(routePath)) fail(`${src.id}: materialized skill missing route: ${routePath}`);
  const receipt = src.materialization_receipt;
  if (!receipt || receipt.status !== (isProvider ? 'MATERIALIZED_PROVIDER' : 'MATERIALIZED_SKILL')) {
    fail(`${src.id}: materialization receipt missing or wrong status`);
  } else {
    if (receipt.artifact_path !== artifactPath) fail(`${src.id}: materialization receipt artifact_path mismatch`);
    if (exists(artifactPath) && receipt.sha256 !== fileSha256(artifactPath)) fail(`${src.id}: materialization receipt hash mismatch`);
  }
  const routeReceipt = src.route_receipt;
  if (!routeReceipt || !ACTIVATION_CLASSES.has(routeReceipt.activation_class)) fail(`${src.id}: route receipt missing activation class`);
  if (!isProvider) {
    const route = JSON.parse(fs.readFileSync(path.join(ROOT, routePath), 'utf8'));
    if (!ACTIVATION_CLASSES.has(route.activation_class)) fail(`${src.id}: ROUTE.json missing valid activation class`);
    const signals = route.signals ?? [];
    if (!Array.isArray(signals) || signals.length === 0) fail(`${src.id}: ROUTE.json has no triggers`);
    for (const s of signals) {
      if (GENERIC_ROUTE_KEYWORDS.has(String(s).toLowerCase())) fail(`${src.id}: keyword-only route signal "${s}" (invariant: no generic keyword triggers)`);
    }
    if (route.activation_class === 'ROUTED' && route.priority === undefined) fail(`${src.id}: ROUTED route requires priority`);
  } else {
    if (!exists(artifactPath)) fail(`${src.id}: provider artifact missing`);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, artifactPath), 'utf8'));
    if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) fail(`${src.id}: provider lacks capability route`);
    if (!REGISTERED_PROVIDER_IDS.has(src.id)) fail(`${src.id}: provider missing from integrations/registry.json (registry/fabric divergence)`);
  }
  // License/security gates cannot be bypassed by materialization: without
  // established license AND approved security review, upstream content must be
  // BLOCKED, only the harness-owned projection may be materialized.
  const content = src.content_materialization;
  const licenseOk = src.lock?.license?.review_state === 'reviewed';
  const securityOk = src.lock?.security_review?.state === 'approved';
  if (licenseOk && securityOk) {
    if (content && content.status !== 'MATERIALIZED') fail(`${src.id}: content materialization must be MATERIALIZED when license+security evidence exist`);
  } else {
    if (!content || content.status !== 'BLOCKED') fail(`${src.id}: content materialization must be BLOCKED without license/security evidence`);
    if (!content.reason) fail(`${src.id}: BLOCKED content requires an exact reason`);
  }
}


const manifest = fabric.selection_manifest ?? {};
for (const host of manifest.detected_hosts ?? []) {
  if (!REGISTERED_HOSTS.has(host)) fail(`selection manifest lists unknown detected host: ${host}`);
}
if (JSON.stringify([...(manifest.selected_external_skills ?? [])].sort()) !== JSON.stringify([...selectedIds].sort())) {
  fail(`selection manifest selected_external_skills does not match selected records (manifest=${JSON.stringify(manifest.selected_external_skills)}, records=${JSON.stringify(selectedIds)})`);
}
for (const skillId of Object.keys(manifest.projection_receipts ?? {})) {
  if (!selectedIds.includes(skillId)) fail(`projection receipt exists for unselected source: ${skillId} (rejected/link-only sources are never materialized)`);
}
for (const r of receipts) {
  if (r.status === 'rejected' && sources.find((s) => s.id === r.id)?.install?.materialization !== 'none') {
    fail(`${r.id}: rejected candidate must have materialization none`);
  }
}

// ---- 4. Negative fixtures (AC-007: mutable, hash-mismatched, unlicensed,
//          unsafe, non-rollbackable, conflicting, below-threshold) ----
const fixtureBase = {
  kind: 'skill-repository',
  domain: 'fixture',
  source: 'https://example.com/fixture/skills',
  selection: 'selected-explicit',
  adoption: 'reference-or-on-demand',
  install: { mode: 'never-implicit', shell_strings: 'forbidden', materialization: 'none' },
  lock: {
    immutable_revision: { kind: 'commit', value: 'a'.repeat(40), resolved_from: 'main', resolved_at: '2026-08-12' },
    content_hash: { algorithm: 'git-tree-sha1', value: 'b'.repeat(40), source: 'fixture' },
    license: { spdx: 'MIT', source_file: 'LICENSE', review_state: 'reviewed' },
    trust: { classification: 'vendor', decision: 'fixture' },
    security_review: { state: 'approved', evidence: [] },
    portability: { skillmd: true, route_sidecar: true, hosts: ['opencode'] },
    route_precision: { route_owner: 'harness-maintainer', sidecar: 'ROUTE.json', precision: 'high', signals: ['fixture signal'] },
    benchmark: { state: 'passed', evidence: [] },
    rollback: { plan: 'remove fixture materialization', record: null },
  },
  conflicts: [],
};
const fixtures = [
  {
    name: 'mutable-ref-rejected',
    mutate: (r) => { r.lock.immutable_revision = { kind: 'branch', value: 'main', resolved_from: 'main', resolved_at: '2026-08-12' }; },
    expect: 'unpinned: main is not an immutable commit/tag/version pin',
  },
  {
    name: 'hash-mismatch-rejected',
    mutate: (r) => {
      r.lock.content_hash = { algorithm: 'sha256', value: 'c'.repeat(64), source: 'file:skills/catalog.json' };
    },
    expect: 'hash-mismatch: content hash does not match materialized file',
  },
  {
    name: 'unlicensed-rejected',
    mutate: (r) => { r.lock.license = { spdx: 'unresolved', source_file: 'none', review_state: 'blocked' }; },
    expect: 'unlicensed: license not established',
  },
  {
    name: 'unsafe-rejected',
    mutate: (r) => { r.lock.security_review.state = 'rejected'; },
    expect: 'unsafe: security review rejected',
  },
  {
    name: 'non-rollbackable-rejected',
    mutate: (r) => { r.lock.rollback = { plan: '', record: null }; },
    expect: 'non-rollbackable: missing rollback plan',
  },
  {
    name: 'conflict-unresolved-rejected',
    mutate: (r) => { r.conflicts = [{ with: 'browser-qa', resolved: false, resolution: null }]; },
    expect: 'conflict-unresolved: browser-qa requires explicit resolution',
  },
  {
    name: 'below-threshold-rejected',
    mutate: (r) => {
      r.lock.security_review.state = 'pending';
      r.lock.benchmark.state = 'pending';
      r.lock.route_precision.precision = 'medium';
    },
    expect: 'below-threshold: score 65 < 70',
  },
];
const fixtureResults = [];
for (const fx of fixtures) {
  const record = structuredClone(fixtureBase);
  fx.mutate(record);
  const qualification = computeQualification(record);
  const reasons = [...qualification.reasons, ...unresolvedConflicts(record, true)];
  const rejected = !selectionGatesPass(record) || qualification.score < 70 || reasons.some((r) => r.startsWith('conflict-unresolved'));
  const hit = reasons.includes(fx.expect);
  fixtureResults.push({ name: fx.name, rejected, reasonFound: hit, score: qualification.score });
  if (!rejected) fail(`fixture ${fx.name}: candidate was not rejected`);
  if (!hit) fail(`fixture ${fx.name}: expected rejection reason not produced: "${fx.expect}" (got ${JSON.stringify(reasons)})`);
}

// ---- 5. Outcome ----
const rejectedSummary = receipts
  .filter((r) => r.status === 'rejected')
  .map((r) => ({ id: r.id, score: r.score, reasons: r.reasons }));

if (failures.length > 0) {
  console.error('FAIL: external source governance');
  for (const f of failures) console.error(' -', f);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  candidates: receipts.length,
  selected: selectedIds,
  rejected: rejectedSummary.length,
  rejected_reasons: rejectedSummary,
  no_skill_outcome: selectedIds.length === 0,
  compared_against: 'no-skill/local-composition',
  bundle_installation: 'forbidden',
  install_mode: 'never-implicit',
  fixtures: fixtureResults,
}, null, 2));
