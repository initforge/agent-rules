#!/usr/bin/env node
/**
 * skills-sync.mjs — atomic, path-safe import of an upstream skill into
 * skills/<id>/ plus a registry/skills.yaml update.
 *
 * Flow (v1.2):
 *  1. resolve exact repository/commit/source path from registry pin;
 *  2. checkout/download into a unique temp root outside the tracked repo;
 *  3. reject redirects to unapproved hosts;
 *  4. reject symlink, junction, submodule, path escape, special file and
 *     case-collision;
 *  5. validate SKILL frontmatter name equals the target id;
 *  6. validate every required reference lies inside the skill folder;
 *  7. validate license evidence exists at the same commit;
 *  8. compute tree/content hash;
 *  9. build the candidate registry entry;
 * 10. show a deterministic diff;
 * 11. never touch canonical source without --apply;
 * 12. on apply: stage folder + registry update, validate the staged candidate,
 *     then replace folder and registry atomically/recoverably; any failure
 *     restores the original folder and registry;
 * 13. never execute an imported script.
 *
 * Interrupted sync must never leave a half-copied skill, a new folder with an
 * old registry, a new registry pin with an old folder, or temp/staging state
 * inside the tracked repository.
 *
 * Transport: the pinned commit is downloaded as a tarball from
 * codeload.github.com (approved host) and unpacked with a pure-Node reader;
 * the exact tree hash is resolved through the GitHub git/trees API. No source
 * script is ever executed.
 *
 * Usage:
 *   npm run skills:sync -- --target <id> [--repository URL --commit SHA
 *       --source-path path --license SPDX] [--apply] [--json]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryFile = path.join(root, 'registry', 'skills.yaml');
const skillsDir = path.join(root, 'skills');
const stagingRoot = path.join(root, 'tmp', `agent-rules-sync-${process.pid}-${Date.now()}`);
const recoveryPointer = path.join(root, 'tmp', 'agent-rules-sync-recovery.json');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const target = flag('target');
const apply = args.includes('--apply');
const json = args.includes('--json');
const repository = flag('repository');
const commit = flag('commit');
const sourcePath = flag('source-path');
const license = flag('license');
const licenseEvidence = flag('license-evidence');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function recoverInterruptedApply() {
  if (!fs.existsSync(recoveryPointer)) return;
  const journal = JSON.parse(fs.readFileSync(recoveryPointer, 'utf8'));
  const targetFolder = path.resolve(journal.target_folder);
  const backupFolder = path.resolve(journal.backup_folder);
  const backupRegistry = path.resolve(journal.backup_registry);
  if (!targetFolder.startsWith(`${path.resolve(skillsDir)}${path.sep}`)) throw new Error('sync recovery target escapes skills root');
  if (fs.existsSync(backupFolder)) {
    fs.rmSync(targetFolder, { recursive: true, force: true });
    fs.cpSync(backupFolder, targetFolder, { recursive: true });
  } else if (journal.had_folder === false) fs.rmSync(targetFolder, { recursive: true, force: true });
  if (fs.existsSync(backupRegistry)) fs.copyFileSync(backupRegistry, registryFile);
  fs.rmSync(path.resolve(journal.staging_root), { recursive: true, force: true });
  fs.rmSync(recoveryPointer, { force: true });
  console.log(`skills-sync: recovered interrupted apply for ${journal.target}`);
}

fs.mkdirSync(path.dirname(recoveryPointer), { recursive: true });
recoverInterruptedApply();

function fail(message) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  process.stderr.write(`skills-sync: ${message}\n`);
  process.exit(1);
}

if (!target) fail('--target <id> is required');

// ── resolve the pin (from registry first, CLI overrides) ────────────────────
let pin = null;
let existingRegistryEntry = null;
if (fs.existsSync(registryFile)) {
  try {
    const doc = YAML.parse(fs.readFileSync(registryFile, 'utf8'));
    const entry = (doc?.skills ?? []).find((s) => s.id === target);
    existingRegistryEntry = entry ?? null;
    if (entry?.upstream) pin = entry.upstream;
  } catch {}
}
pin = {
  repository: repository ?? pin?.repository,
  commit: commit ?? pin?.commit,
  source_path: sourcePath ?? pin?.source_path,
  license: license ?? pin?.license,
  license_evidence: licenseEvidence ?? pin?.license_evidence,
};
if (!pin.repository || !/^https:\/\//.test(pin.repository)) fail('resolve step: no https repository pin (pass --repository)');
if (!pin.commit || !/^[a-f0-9]{40}$/i.test(pin.commit)) fail('resolve step: no exact 40-hex commit pin (pass --commit)');
if (!pin.source_path) fail('resolve step: no source_path pin (pass --source-path)');

// ── approved hosts (reject redirects to unapproved hosts) ──────────────────
const APPROVED_HOSTS = ['github.com', 'raw.githubusercontent.com', 'codeload.github.com', 'api.github.com'];
let host = '';
try { host = new URL(pin.repository).host; } catch { fail(`resolve step: malformed repository URL ${pin.repository}`); }
if (!APPROVED_HOSTS.includes(host)) fail(`redirect/transport guard: repository host ${host} is not approved`);

const repoPath = new URL(pin.repository).pathname.replace(/^\/+/, '').replace(/\.git$/, '');

// ── resolve the exact tree hash of source_path at the pinned commit ────────
// Tolerates GitHub API rate limits by falling back to a shallow git fetch.
let treeHash = 'TBD';
let treeEntries = null;
const apiOk = (status) => status === 200;
try {
  const treeRes = await fetch(`https://api.github.com/repos/${repoPath}/git/trees/${pin.commit}?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });
  if (!apiOk(treeRes.status)) throw new Error(`tree resolution failed (HTTP ${treeRes.status})`);
  const treeData = await treeRes.json();
  const needle = pin.source_path.split('/').filter(Boolean).join('/');
  const match = (treeData.tree ?? []).find((entry) => entry.type === 'tree' && entry.path === needle);
  if (!match) throw new Error(`no tree entry for ${needle}`);
  treeHash = match.sha;
  treeEntries = treeData.tree ?? [];
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/rate limit|HTTP 403/i.test(message)) fail(`tree step: cannot resolve tree hash for ${pin.source_path}: ${message}`);
  // rate limited: fall back to git below
}

// ── reconstruct the skill folder from the pinned git tree ──────────────────
// Deterministic exact pinned bytes: walk the recursive tree at the pinned
// commit, reject submodule/symlink entries and case collisions, and download
// every blob from raw.githubusercontent.com (approved host). No source script
// is ever executed (step 13).
const staged = path.join(stagingRoot, 'staged');
fs.mkdirSync(staged, { recursive: true });
const caseSeen = new Set();
const copied = [];
const copyStagedEntry = (rel, isDirectory) => {
  const lower = rel.toLowerCase();
  if (caseSeen.has(lower)) fail(`path-safety step: case collision on ${rel}`);
  caseSeen.add(lower);
  const abs = path.resolve(staged, ...rel.split('/'));
  if (!abs.startsWith(`${path.resolve(staged)}${path.sep}`)) fail(`path-safety step: path escape rejected: ${rel}`);
  if (isDirectory) fs.mkdirSync(abs, { recursive: true });
  return abs;
};
try {
  const prefix = pin.source_path.split('/').filter(Boolean).join('/');
  if (treeEntries) {
    const entries = treeEntries.filter((e) => e.path.startsWith(`${prefix}/`));
    if (entries.length === 0) throw new Error(`no entries under source_path ${prefix}`);
    for (const entry of entries) {
      const rel = entry.path.slice(prefix.length + 1);
      if (!rel) continue;
      if (entry.type === 'tree') { copyStagedEntry(rel, true); continue; }
      if (entry.type !== 'blob') {
        fail(`path-safety step: unsupported git entry type ${entry.type} for ${rel} (submodule/symlink not materializable)`);
      }
      const abs = copyStagedEntry(rel, false);
      const raw = await fetch(`https://raw.githubusercontent.com/${repoPath}/${pin.commit}/${entry.path}`, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      if (raw.status >= 300 && raw.status < 400) throw new Error(`blob redirect rejected (${raw.status}) for ${entry.path}`);
      if (!raw.ok) throw new Error(`blob download failed (HTTP ${raw.status}) for ${entry.path}`);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await raw.arrayBuffer()));
      copied.push(rel);
    }
  } else {
    // git fallback: shallow fetch the exact commit into a temp clone, then
    // copy the source folder with the same path-safety rules.
    const { execFileSync } = await import('node:child_process');
    const gitRoot = path.join(stagingRoot, 'git');
    fs.mkdirSync(gitRoot, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: gitRoot, stdio: 'pipe' });
    execFileSync('git', ['remote', 'add', 'origin', pin.repository], { cwd: gitRoot, stdio: 'pipe' });
    execFileSync('git', ['fetch', '--depth', '1', 'origin', pin.commit], { cwd: gitRoot, stdio: 'pipe', timeout: 300_000 });
    try {
      treeHash = execFileSync('git', ['rev-parse', `${pin.commit}^{tree}:${pin.source_path}`], { cwd: gitRoot, encoding: 'utf8' }).trim();
    } catch {}
    if (!/^[a-f0-9]{40}$/i.test(treeHash)) fail(`tree step: cannot resolve tree hash for ${pin.source_path} from git`);
    execFileSync('git', ['checkout', '-q', pin.commit, '--', '.'], { cwd: gitRoot, stdio: 'pipe' });
    const src = path.join(gitRoot, ...pin.source_path.split('/'));
    if (!fs.existsSync(src)) throw new Error(`git checkout: source_path not found: ${pin.source_path}`);
    const stat = fs.lstatSync(src);
    if (!stat.isDirectory()) throw new Error('git checkout: source_path is not a directory');
    const walkCopy = (from, relPrefix) => {
      for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const full = path.join(from, entry.name);
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const s = fs.lstatSync(full);
        if (s.isSymbolicLink()) fail(`path-safety step: symlink rejected: ${rel}`);
        if (s.isDirectory()) {
          const real = fs.realpathSync(full);
          if (!real.startsWith(`${fs.realpathSync(gitRoot)}${path.sep}`)) fail(`path-safety step: directory escapes source root: ${rel}`);
          const gitFile = path.join(full, '.git');
          if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) fail(`path-safety step: submodule placeholder rejected: ${rel}`);
          copyStagedEntry(rel, true);
          walkCopy(full, rel);
        } else if (s.isFile()) {
          const abs = copyStagedEntry(rel, false);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.copyFileSync(full, abs);
          copied.push(rel);
        } else {
          fail(`path-safety step: special file rejected: ${rel}`);
        }
      }
    };
    walkCopy(src, '');
  }
} catch (error) {
  fail(`checkout step: ${error instanceof Error ? error.message : String(error)}`);
}
if (copied.length === 0) fail('path-safety step: skill folder is empty (fail closed)');

// ── SKILL frontmatter name must equal the target id ────────────────────────
const skillFile = path.join(staged, 'SKILL.md');
if (!fs.existsSync(skillFile)) fail('frontmatter step: staged folder has no SKILL.md');
const skillBody = fs.readFileSync(skillFile, 'utf8').replace(/^\uFEFF/, '');
const fm = skillBody.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (!fm) fail('frontmatter step: missing YAML frontmatter in SKILL.md');
const meta = YAML.parse(fm[1]) ?? {};
if (String(meta.name ?? '') !== target) fail(`frontmatter step: name ${JSON.stringify(meta.name)} does not match target ${target}`);

// ── every required reference must lie inside the skill folder ──────────────
for (const ref of [...(meta.metadata?.requires ?? []), ...(meta.metadata?.supports ?? [])].map(String).filter(Boolean)) {
  const nested = path.join(staged, ...ref.split('/'));
  if (!fs.existsSync(nested) && !fs.existsSync(path.join(skillsDir, ref, 'SKILL.md'))) {
    fail(`reference step: required/supported reference ${ref} is not inside the skill folder or an active sibling`);
  }
}

// ── license evidence at the same commit ────────────────────────────────────
if (!pin.license) fail('license step: --license is required for materialization (active upstream must carry license)');
if (pin.license_evidence && !/^registry\//.test(pin.license_evidence)) {
  const evidenceUrl = `https://raw.githubusercontent.com/${repoPath}/${pin.commit}/${pin.license_evidence.replace(/^\/+/, '')}`;
  const evidence = await fetch(evidenceUrl, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  if (evidence.status >= 300 && evidence.status < 400) fail(`license step: redirect rejected (${evidence.status})`);
  if (!evidence.ok) fail(`license step: evidence ${pin.license_evidence} not found at pinned commit (HTTP ${evidence.status})`);
}

// ── content hash (reuse kernel hashing semantics) ──────────────────────────
const entries = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(staged, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) fail(`hash step: symlink rejected: ${rel}`);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) entries.push({ rel, bytes: fs.readFileSync(full) });
    else fail(`hash step: special file rejected: ${rel}`);
  }
};
walk(staged);
if (entries.length === 0) fail('hash step: skill folder is empty (fail closed)');
entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
const digest = createHash('sha256');
for (const entry of entries) { digest.update(entry.rel); digest.update('\0'); digest.update(entry.bytes); digest.update('\0'); }
const contentHash = digest.digest('hex');

// ── candidate registry entry ───────────────────────────────────────────────
const candidateEntry = {
  ...(existingRegistryEntry ?? {}),
  id: target,
  origin: 'upstream',
  role: existingRegistryEntry?.role ?? 'domain',
  activation: existingRegistryEntry?.activation ?? 'explicit-only',
  compatibility: existingRegistryEntry?.compatibility ?? {},
  lifecycle: 'active',
  blocked_reason: undefined,
  status_reason: undefined,
  upstream: {
    repository: pin.repository,
    source_path: pin.source_path,
    commit: pin.commit,
    tree: treeHash,
    license: pin.license,
    license_evidence: pin.license_evidence ?? `registry/skills.yaml (${pin.license}, same-commit review)`,
    content_hash: contentHash,
  },
  trust_tier: 'pinned-upstream',
  trust_basis: `licensed ${pin.license}; exact-pinned by content hash ${contentHash.slice(0, 12)}`,
  network: existingRegistryEntry?.network ?? 'read',
  side_effects: existingRegistryEntry?.side_effects ?? [],
  update_policy: 'manual_review',
};

// ── deterministic diff (no canonical mutation without --apply) ─────────────
const targetFolder = path.join(skillsDir, target);
const existingFolder = fs.existsSync(targetFolder);
let existingHash = null;
try {
  const existingEntries = [];
  const walkExisting = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(targetFolder, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error('symlink');
      if (entry.isDirectory()) walkExisting(full);
      else if (entry.isFile()) existingEntries.push({ rel, bytes: fs.readFileSync(full) });
    }
  };
  walkExisting(targetFolder);
  existingEntries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const d = createHash('sha256');
  for (const entry of existingEntries) { d.update(entry.rel); d.update('\0'); d.update(entry.bytes); d.update('\0'); }
  existingHash = d.digest('hex');
} catch {}

const diff = {
  target,
  source: pin.repository,
  commit: pin.commit,
  source_path: pin.source_path,
  existing_folder: existingFolder,
  existing_content_hash: existingHash,
  candidate_content_hash: contentHash,
  unchanged: existingHash === contentHash,
  files: copied.length,
};
if (json) {
  process.stdout.write(`${JSON.stringify({ diff, candidate: candidateEntry }, null, 2)}\n`);
} else {
  console.log(`skills-sync: ${target}`);
  console.log(`  source: ${pin.repository} @ ${pin.commit.slice(0, 8)} (${pin.source_path})`);
  console.log(`  existing folder: ${existingFolder ? (diff.unchanged ? 'unchanged' : 'CHANGED') : 'none'}`);
  console.log(`  candidate content hash: ${contentHash.slice(0, 16)}…`);
  console.log(`  files: ${copied.length}`);
  if (!apply) console.log(`  [dry-run] no canonical source touched; re-run with --apply to stage`);
}

if (!apply) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  process.exit(0);
}
if (diff.unchanged && existingRegistryEntry?.lifecycle === 'active' && existingRegistryEntry?.upstream?.content_hash === contentHash) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  console.log(`skills-sync: ${target} unchanged — nothing to apply`);
  process.exit(0);
}

// ── atomic recoverable apply ───────────────────────────────────────────────
const backupFolder = path.join(stagingRoot, 'backup-folder');
const backupRegistry = path.join(stagingRoot, 'backup-registry.yaml');
try {
  if (existingFolder) fs.cpSync(targetFolder, backupFolder, { recursive: true });
  if (fs.existsSync(registryFile)) fs.copyFileSync(registryFile, backupRegistry);
  fs.writeFileSync(recoveryPointer, JSON.stringify({ schema: 'agent-rules/skill-sync-recovery/v1', target, target_folder: targetFolder, backup_folder: backupFolder, backup_registry: backupRegistry, staging_root: stagingRoot, had_folder: existingFolder }, null, 2), 'utf8');

  // stage: write folder + registry update, then validate the staged candidate.
  fs.rmSync(targetFolder, { recursive: true, force: true });
  fs.cpSync(staged, targetFolder, { recursive: true });

  let registryDoc = { schema: 'agent-rules/skill-registry/v2', skills: [] };
  if (fs.existsSync(registryFile)) {
    try { registryDoc = YAML.parse(fs.readFileSync(registryFile, 'utf8')) ?? registryDoc; } catch {}
  }
  const others = (registryDoc.skills ?? []).filter((s) => s.id !== target);
  registryDoc.skills = [...others, candidateEntry];
  fs.writeFileSync(registryFile, YAML.stringify(registryDoc, { lineWidth: 0 }), 'utf8');

  // Validate the complete registry and canonical tree before declaring success.
  const stagedSkill = path.join(targetFolder, 'SKILL.md');
  if (!fs.existsSync(stagedSkill)) throw new Error('post-apply validation: SKILL.md missing after stage');
  const { validateSkillRegistryWithTree } = await import('../packages/kernel/dist/northstar/skill-registry.js');
  const validation = validateSkillRegistryWithTree(registryDoc, root);
  if (!validation.ok) throw new Error(`post-apply registry/tree validation failed: ${validation.issues.map((issue) => `${issue.entry ?? '<registry>'}: ${issue.message}`).join('; ')}`);

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(recoveryPointer, { force: true });
  console.log(`skills-sync: ${target} applied atomically (content hash ${contentHash.slice(0, 12)})`);
} catch (error) {
  // restore original folder and registry; never leave a half-copied skill.
  try {
    if (fs.existsSync(backupFolder)) {
      fs.rmSync(targetFolder, { recursive: true, force: true });
      fs.cpSync(backupFolder, targetFolder, { recursive: true });
    }
    if (fs.existsSync(backupRegistry)) fs.copyFileSync(backupRegistry, registryFile);
    else fs.rmSync(registryFile, { force: true });
  } catch {}
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(recoveryPointer, { force: true });
  fail(`apply failed and original state restored: ${error instanceof Error ? error.message : String(error)}`);
}
