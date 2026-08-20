#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const packRoot = path.join(repoRoot, 'profiles', '5fedu');
const requireSource = process.argv.includes('--require-source');
const asJson = process.argv.includes('--json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fail(message) { throw new Error(message); }
function assert(cond, message) { if (!cond) fail(message); }
function safeRelative(root, relative) {
  assert(typeof relative === 'string' && relative && !path.isAbsolute(relative), `unsafe relative path: ${String(relative)}`);
  const resolved = path.resolve(root, relative);
  assert(resolved.startsWith(path.resolve(root) + path.sep), `path escapes root: ${relative}`);
  return resolved;
}
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const rel = path.relative(root, absolute).split(path.sep).join('/');
      const stat = fs.lstatSync(absolute);
      assert(!stat.isSymbolicLink(), `bundled reference contains symlink: ${rel}`);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) out.push(rel);
      else fail(`bundled reference contains unsupported entry: ${rel}`);
    }
  };
  visit(root);
  return out.sort();
}
function verifyBundled(lock) {
  assert(lock.sourceKind === 'bundled-snapshot', 'expected bundled-snapshot source lock');
  assert(lock.verificationState === 'verified', 'bundled snapshot must declare verified state');
  assert(lock.commitSha === null, 'bundled snapshot must not masquerade as a Git commit');
  assert(lock.integrity?.algorithm === 'sha256' && /^[a-f0-9]{64}$/.test(lock.integrity.hash ?? ''), 'bundled snapshot needs sha256 tree integrity');
  const sourceRoot = safeRelative(packRoot, lock.referencePath);
  const manifestPath = safeRelative(packRoot, lock.manifestPath);
  assert(fs.statSync(sourceRoot).isDirectory(), 'bundled reference root missing');
  const manifest = readJson(manifestPath);
  assert(manifest.version === 1 && manifest.source_kind === 'owner-supplied-rar-snapshot', 'unsupported source manifest');
  assert(manifest.tree_sha256 === lock.integrity.hash, 'source-lock tree digest differs from manifest');
  assert(lock.artifactIntegrity?.algorithm === 'sha256' && lock.artifactIntegrity.hash === manifest.source_archive_sha256, 'owner archive digest differs from manifest');
  assert(Array.isArray(manifest.files) && manifest.files.length === manifest.file_count, 'source manifest file count mismatch');
  const actual = walk(sourceRoot);
  const declared = manifest.files.map((entry) => entry.path).sort();
  assert(new Set(declared).size === declared.length, 'duplicate source-manifest path');
  assert(actual.length === declared.length && actual.every((x, i) => x === declared[i]), 'bundled reference file set differs from manifest');
  let bytes = 0;
  const tree = crypto.createHash('sha256');
  for (const entry of manifest.files) {
    const file = safeRelative(sourceRoot, entry.path);
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), `reference entry is not a regular file: ${entry.path}`);
    const digest = sha256File(file);
    assert(digest === entry.sha256 && stat.size === entry.bytes, `reference integrity mismatch: ${entry.path}`);
    bytes += stat.size;
    tree.update(entry.path); tree.update('\0'); tree.update(digest); tree.update('\0'); tree.update(String(stat.size)); tree.update('\n');
  }
  assert(bytes === manifest.uncompressed_bytes, 'reference byte count mismatch');
  assert(tree.digest('hex') === manifest.tree_sha256, 'reference tree digest mismatch');
  return manifest;
}

try {
  const descriptor = readJson(path.join(packRoot, 'domain-pack.json'));
  const modules = readJson(path.join(packRoot, descriptor.module_map));
  const behavior = readJson(path.join(packRoot, descriptor.behavior_contract));
  const sourceEvidence = readJson(path.join(packRoot, descriptor.source_evidence));
  const lockDoc = readJson(path.join(packRoot, descriptor.source_lock));
  const lock = lockDoc.sourceLock;

  assert(descriptor.id === '5fedu', 'descriptor id must be 5fedu');
  assert(descriptor.activation === 'explicit-project-profile', '5fedu must never auto-route from prompt text');
  assert(descriptor.core_dependency === false, 'generic core must not depend on 5fedu');
  assert(behavior.authority?.source_verification_required === true, 'behavior contract must require authoritative source verification');
  assert(behavior.verification?.worker_may_self_attest === false, 'worker self-attestation must be forbidden');
  assert(behavior.authority?.anti_anchor, 'behavior contract must state anti-anchoring policy');

  const source = modules.source_repositories?.['shared-template'];
  assert(source, 'shared-template source descriptor missing');
  assert(lock.repository === source.repository_url, 'source-lock repository must match module-map provenance');

  const state = lock.verificationState;
  assert(['verified','stale','unverified'].includes(state), `invalid verificationState: ${state}`);
  let verified = false;
  let detail = state;
  let verifiedSourceRoot = null;
  let sourceManifestByPath = null;
  if (lock.sourceKind === 'bundled-snapshot') {
    try {
      const manifest = verifyBundled(lock);
      verified = true;
      verifiedSourceRoot = safeRelative(packRoot, lock.referencePath);
      sourceManifestByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
      detail = `${manifest.file_count} files; tree=${manifest.tree_sha256}`;
      assert(source.reference_path === 'profiles/5fedu/reference-source/template', 'module map must point to bundled reference source');
      assert(source.manifest_path === 'profiles/5fedu/reference-source/source-manifest.json', 'module map manifest pointer drift');
      assert(source.integrity_sha256 === manifest.tree_sha256, 'module map source hash drift');
      assert(source.verification_state === 'VERIFIED', 'module map must mark verified bundled source');
    } catch (error) {
      if (state === 'verified') throw error;
      detail = error instanceof Error ? error.message : String(error);
    }
  } else {
    const hasCommit = typeof lock.commitSha === 'string' && /^[a-f0-9]{40}$/.test(lock.commitSha);
    const hasIntegrity = lock.integrity?.algorithm === 'sha256' && /^[a-f0-9]{64}$/.test(lock.integrity?.hash ?? '');
    verified = state === 'verified' && hasCommit && hasIntegrity && source.verification_state === 'VERIFIED';
  }

  assert(sourceEvidence.version === 1 && sourceEvidence.pack === '5fedu', 'source-evidence identity/version mismatch');
  assert(sourceEvidence.reference_tree_sha256 === lock.integrity?.hash, 'source-evidence tree digest drift');
  const ownerRequirementIds = new Set([
    ...Object.values(behavior.canonical_roles ?? {}).flatMap((role) => (role.owner_requirements ?? []).map((req) => req.id)),
    ...(behavior.relationship_rules ?? []).map((req) => req.id),
  ]);
  assert(Object.keys(sourceEvidence.requirements ?? {}).length === ownerRequirementIds.size, 'source-evidence requirement coverage mismatch');
  for (const requirementId of ownerRequirementIds) {
    const pointers = sourceEvidence.requirements?.[requirementId];
    assert(Array.isArray(pointers) && pointers.length > 0, `source evidence missing for ${requirementId}`);
    for (const pointer of pointers) {
      assert(typeof pointer.path === 'string' && Number.isInteger(pointer.line) && pointer.line > 0 && typeof pointer.contains === 'string', `${requirementId}: malformed source pointer`);
      const entry = sourceManifestByPath?.get(pointer.path);
      assert(entry, `${requirementId}: source pointer is not manifest-bound: ${pointer.path}`);
      assert(pointer.sha256 === entry.sha256, `${requirementId}: source pointer digest drift: ${pointer.path}`);
      const lines = fs.readFileSync(safeRelative(verifiedSourceRoot, pointer.path), 'utf8').split(/\r?\n/);
      assert(lines[pointer.line - 1]?.includes(pointer.contains), `${requirementId}: source pointer line/needle drift: ${pointer.path}:${pointer.line}`);
    }
  }

  for (const [name, role] of Object.entries(behavior.canonical_roles ?? {})) {
    assert(typeof role.reference_role === 'string', `${name}: reference_role missing`);
    assert(modules.module_roles?.[role.reference_role], `${name}: unknown reference role ${role.reference_role}`);
    assert(Array.isArray(role.owner_requirements) && role.owner_requirements.length > 0, `${name}: owner requirements missing`);
    assert(Array.isArray(role.source_anchors) && role.source_anchors.length > 0, `${name}: source anchors missing`);
    if (verified && lock.sourceKind === 'bundled-snapshot') {
      const sourceRoot = safeRelative(packRoot, lock.referencePath);
      for (const anchor of role.source_anchors) assert(fs.existsSync(safeRelative(sourceRoot, anchor)), `${name}: source anchor missing: ${anchor}`);
    }
  }

  if (requireSource && !verified) fail(`5fedu source authority is BLOCKED (${detail})`);
  const result = { status: verified ? 'VERIFIED' : 'BLOCKED', structural_contract: 'PASS', source_state: state, source_kind: lock.sourceKind ?? 'git', explicit_activation: true, detail };
  if (asJson) console.log(JSON.stringify(result));
  else console.log(`[5fedu-domain-pack] ${result.structural_contract}; source=${result.status} (${detail})`);
} catch (error) {
  console.error(`[5fedu-domain-pack] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
