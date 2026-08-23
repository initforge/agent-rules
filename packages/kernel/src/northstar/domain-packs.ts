import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DomainPackStage = 'planning' | 'implementation' | 'parity-pass' | 'visual-parity';

export interface DomainPackDescriptor {
  version: 1;
  id: string;
  activation: 'explicit-project-profile';
  core_dependency: false;
  behavior_contract: string;
  source_evidence?: string;
  module_map: string;
  ui_contract: string;
  source_lock: string;
  rules: string[];
  source_gate: {
    required_for: DomainPackStage[];
    planning_allowed_when_unverified: boolean;
  };
}

interface SourceIntegrity { algorithm: 'sha256'; hash: string }
interface SourceLock {
  sourceKind?: 'git' | 'bundled-snapshot';
  repository?: string;
  commitSha?: unknown;
  referencePath?: unknown;
  manifestPath?: unknown;
  integrity?: SourceIntegrity | null;
  artifactIntegrity?: SourceIntegrity;
  verificationState?: string;
}

interface BundledSourceManifest {
  version: 1;
  source_kind: 'owner-supplied-rar-snapshot';
  source_archive_sha256: string;
  tree_sha256: string;
  file_count: number;
  uncompressed_bytes: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export interface DomainSourcePointer {
  path: string;
  line: number;
  contains: string;
  label: string;
  sha256: string;
}

export interface DomainSourceEvidence {
  version: 1;
  pack: string;
  authority: string;
  reference_tree_sha256: string;
  requirements: Record<string, DomainSourcePointer[]>;
}

export interface LoadedDomainPack {
  descriptor: DomainPackDescriptor;
  root: string;
  behaviorContract: unknown;
  sourceEvidence: DomainSourceEvidence | null;
  sourceLock: unknown;
  sourceVerified: boolean;
  sourceRoot: string | null;
  sourceManifest: BundledSourceManifest | null;
  sourceVerification: { kind: 'git' | 'bundled-snapshot'; state: 'verified' | 'unverified'; detail: string };
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

function safeRelative(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative)) throw new Error(`domain-pack path must be relative: ${relative}`);
  const resolved = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) throw new Error(`domain-pack path escapes pack root: ${relative}`);
  return resolved;
}

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walkRegularFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`bundled source may not contain symlink: ${relative}`);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) out.push(relative);
      else throw new Error(`bundled source contains unsupported filesystem entry: ${relative}`);
    }
  };
  visit(root);
  return out.sort();
}

function assertBundledManifest(value: unknown): asserts value is BundledSourceManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bundled source manifest must be an object');
  const m = value as Record<string, unknown>;
  if (m.version !== 1 || m.source_kind !== 'owner-supplied-rar-snapshot') throw new Error('unsupported bundled source manifest');
  for (const key of ['source_archive_sha256', 'tree_sha256'] as const) {
    if (typeof m[key] !== 'string' || !/^[a-f0-9]{64}$/.test(m[key] as string)) throw new Error(`invalid bundled source manifest ${key}`);
  }
  if (!Number.isInteger(m.file_count) || Number(m.file_count) < 1) throw new Error('invalid bundled source file_count');
  if (!Number.isInteger(m.uncompressed_bytes) || Number(m.uncompressed_bytes) < 1) throw new Error('invalid bundled source uncompressed_bytes');
  if (!Array.isArray(m.files) || m.files.length !== m.file_count) throw new Error('bundled source manifest files/file_count mismatch');
}

/**
 * Recomputes every source-file digest and the exact file set. Extra files,
 * missing files, symlinks, manifest drift, or content changes invalidate the
 * source receipt. This keeps reference-source use fail-closed.
 */
export function verifyBundledSnapshot(packRoot: string, lock: SourceLock): { sourceRoot: string; manifest: BundledSourceManifest } {
  if (lock.sourceKind !== 'bundled-snapshot') throw new Error('source lock is not a bundled snapshot');
  if (typeof lock.referencePath !== 'string' || typeof lock.manifestPath !== 'string') throw new Error('bundled snapshot requires referencePath and manifestPath');
  if (lock.verificationState !== 'verified') throw new Error(`bundled snapshot is ${lock.verificationState ?? 'unverified'}`);
  if (lock.commitSha !== null) throw new Error('bundled snapshot must not masquerade as a Git commit');
  if (lock.integrity?.algorithm !== 'sha256' || !/^[a-f0-9]{64}$/.test(lock.integrity.hash)) throw new Error('bundled snapshot requires sha256 tree integrity');

  const sourceRoot = safeRelative(packRoot, lock.referencePath);
  const manifestPath = safeRelative(packRoot, lock.manifestPath);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) throw new Error(`bundled source root missing: ${lock.referencePath}`);
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) throw new Error(`bundled source manifest missing: ${lock.manifestPath}`);
  const raw = readJson(manifestPath);
  assertBundledManifest(raw);
  const manifest = raw;
  if (manifest.tree_sha256 !== lock.integrity.hash) throw new Error('source-lock tree digest does not match bundled manifest');
  if (lock.artifactIntegrity && (lock.artifactIntegrity.algorithm !== 'sha256' || lock.artifactIntegrity.hash !== manifest.source_archive_sha256)) {
    throw new Error('source-lock archive digest does not match bundled manifest');
  }

  const actual = walkRegularFiles(sourceRoot);
  const declared = manifest.files.map((entry) => entry.path).sort();
  if (new Set(declared).size !== declared.length) throw new Error('bundled source manifest contains duplicate paths');
  if (actual.length !== declared.length || actual.some((item, index) => item !== declared[index])) {
    throw new Error('bundled source file set differs from source manifest');
  }

  const tree = crypto.createHash('sha256');
  let totalBytes = 0;
  for (const entry of manifest.files) {
    const file = safeRelative(sourceRoot, entry.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`bundled source entry is not a regular file: ${entry.path}`);
    const digest = sha256File(file);
    if (digest !== entry.sha256 || stat.size !== entry.bytes) throw new Error(`bundled source integrity mismatch: ${entry.path}`);
    totalBytes += stat.size;
    tree.update(entry.path); tree.update('\0'); tree.update(digest); tree.update('\0'); tree.update(String(stat.size)); tree.update('\n');
  }
  if (totalBytes !== manifest.uncompressed_bytes) throw new Error('bundled source byte count differs from manifest');
  if (tree.digest('hex') !== manifest.tree_sha256) throw new Error('bundled source tree digest mismatch');
  return { sourceRoot, manifest };
}

function collectBehaviorRequirementIds(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  const ids: string[] = [];
  const roles = root.canonical_roles;
  if (roles && typeof roles === 'object' && !Array.isArray(roles)) {
    for (const role of Object.values(roles as Record<string, unknown>)) {
      if (!role || typeof role !== 'object' || Array.isArray(role)) continue;
      const requirements = (role as Record<string, unknown>).owner_requirements;
      if (!Array.isArray(requirements)) continue;
      for (const requirement of requirements) {
        if (requirement && typeof requirement === 'object' && !Array.isArray(requirement) && typeof (requirement as Record<string, unknown>).id === 'string') {
          ids.push((requirement as Record<string, unknown>).id as string);
        }
      }
    }
  }
  if (Array.isArray(root.relationship_rules)) {
    for (const rule of root.relationship_rules) {
      if (rule && typeof rule === 'object' && !Array.isArray(rule) && typeof (rule as Record<string, unknown>).id === 'string') ids.push((rule as Record<string, unknown>).id as string);
    }
  }
  return [...new Set(ids)].sort();
}

function validateSourceEvidence(value: unknown, packId: string, behaviorContract: unknown, sourceRoot: string, manifest: BundledSourceManifest): DomainSourceEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('domain source evidence must be an object');
  const evidence = value as Record<string, unknown>;
  if (evidence.version !== 1 || evidence.pack !== packId) throw new Error('domain source evidence identity/version mismatch');
  if (evidence.reference_tree_sha256 !== manifest.tree_sha256) throw new Error('domain source evidence tree digest drift');
  if (typeof evidence.authority !== 'string' || !evidence.authority.trim()) throw new Error('domain source evidence authority is required');
  if (!evidence.requirements || typeof evidence.requirements !== 'object' || Array.isArray(evidence.requirements)) throw new Error('domain source evidence requirements are required');
  const requirements = evidence.requirements as Record<string, unknown>;
  const expected = collectBehaviorRequirementIds(behaviorContract);
  const actual = Object.keys(requirements).sort();
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) throw new Error('domain source evidence requirement coverage mismatch');
  const manifestByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
  for (const requirementId of expected) {
    const pointers = requirements[requirementId];
    if (!Array.isArray(pointers) || pointers.length === 0) throw new Error(`domain source evidence missing pointers: ${requirementId}`);
    for (const raw of pointers) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`domain source evidence pointer malformed: ${requirementId}`);
      const pointer = raw as Record<string, unknown>;
      if (typeof pointer.path !== 'string' || !Number.isInteger(pointer.line) || Number(pointer.line) < 1 || typeof pointer.contains !== 'string' || !pointer.contains || typeof pointer.label !== 'string' || !pointer.label || typeof pointer.sha256 !== 'string') {
        throw new Error(`domain source evidence pointer malformed: ${requirementId}`);
      }
      const entry = manifestByPath.get(pointer.path);
      if (!entry) throw new Error(`domain source evidence path is not manifest-bound: ${pointer.path}`);
      if (entry.sha256 !== pointer.sha256) throw new Error(`domain source evidence digest drift: ${pointer.path}`);
      const file = safeRelative(sourceRoot, pointer.path);
      const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)[Number(pointer.line) - 1] ?? '';
      if (!line.includes(pointer.contains)) throw new Error(`domain source evidence line/needle drift: ${pointer.path}:${pointer.line}`);
    }
  }
  return value as DomainSourceEvidence;
}

export function assertDomainPackDescriptor(value: unknown): asserts value is DomainPackDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('domain-pack descriptor must be an object');
  const d = value as Record<string, unknown>;
  const exact = ['version','id','activation','core_dependency','behavior_contract','source_evidence','module_map','ui_contract','source_lock','rules','source_gate'];
  for (const key of Object.keys(d)) if (!exact.includes(key)) throw new Error(`unknown domain-pack key: ${key}`);
  if (d.version !== 1) throw new Error('unsupported domain-pack version');
  if (typeof d.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(d.id)) throw new Error('invalid domain-pack id');
  if (d.activation !== 'explicit-project-profile') throw new Error('domain packs must be explicitly activated by project profile');
  if (d.core_dependency !== false) throw new Error('generic core must not depend on a domain pack');
  for (const key of ['behavior_contract','module_map','ui_contract','source_lock'] as const) {
    if (typeof d[key] !== 'string' || !d[key]) throw new Error(`domain-pack ${key} is required`);
  }
  if (d.source_evidence !== undefined && (typeof d.source_evidence !== 'string' || !d.source_evidence)) throw new Error('domain-pack source_evidence must be a non-empty path');
  if (!Array.isArray(d.rules) || d.rules.some((x) => typeof x !== 'string')) throw new Error('domain-pack rules must be string paths');
  if (!d.source_gate || typeof d.source_gate !== 'object' || Array.isArray(d.source_gate)) throw new Error('domain-pack source_gate is required');
  const g = d.source_gate as Record<string, unknown>;
  const allowed: DomainPackStage[] = ['planning','implementation','parity-pass','visual-parity'];
  if (!Array.isArray(g.required_for) || g.required_for.some((x) => !allowed.includes(x as DomainPackStage))) throw new Error('invalid source-gate stages');
  if (typeof g.planning_allowed_when_unverified !== 'boolean') throw new Error('planning_allowed_when_unverified must be boolean');
}

function looksLikeHarnessRoot(candidate: string): boolean {
  if (!fs.existsSync(candidate)) return false;
  if (fs.existsSync(path.join(candidate, 'packages', 'kernel')) || fs.existsSync(path.join(candidate, 'packages', 'engine'))) {
    return true;
  }
  if (fs.existsSync(path.join(candidate, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
      if (typeof pkg.name === 'string' && (pkg.name.includes('agent-rules') || pkg.name.includes('@initforge/agent-rules'))) {
        return true;
      }
    } catch {
      // ignore JSON parse errors
    }
  }
  if (fs.existsSync(path.join(candidate, 'rules', 'manifest.yaml')) || fs.existsSync(path.join(candidate, 'skills', 'catalog.json'))) {
    return true;
  }
  return false;
}

function findMonorepoRoot(candidate: string): string {
  let curr = path.resolve(candidate);
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(curr, 'rules', 'manifest.yaml')) && fs.existsSync(path.join(curr, 'packages', 'kernel'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(candidate);
}

/**
 * Resolve the immutable harness installation independently from the active
 * workspace. Projects may opt into a domain pack without copying the pack or
 * its authoritative reference source into their repository.
 */
export function resolveHarnessRoot(workspaceRoot: string, explicitRoot?: string): string {
  if (explicitRoot !== undefined && explicitRoot !== null && explicitRoot.trim().length > 0) {
    if (looksLikeHarnessRoot(explicitRoot)) return findMonorepoRoot(explicitRoot);
    throw new Error(`explicit harnessRoot is not a valid harness installation: ${explicitRoot}`);
  }
  if (process.env.AGENT_RULES_HOME && looksLikeHarnessRoot(process.env.AGENT_RULES_HOME)) {
    return findMonorepoRoot(process.env.AGENT_RULES_HOME);
  }
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  if (looksLikeHarnessRoot(moduleRoot)) return findMonorepoRoot(moduleRoot);
  const moduleRoot2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (looksLikeHarnessRoot(moduleRoot2)) return findMonorepoRoot(moduleRoot2);
  const moduleRoot3 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  if (looksLikeHarnessRoot(moduleRoot3)) return findMonorepoRoot(moduleRoot3);
  if (looksLikeHarnessRoot(workspaceRoot)) return findMonorepoRoot(workspaceRoot);

  throw new Error('agent-rules harness root not found; set AGENT_RULES_HOME or pass harnessRoot');
}

export function loadDomainPack(harnessRoot: string, packId: string): LoadedDomainPack {
  // Deliberately explicit: no prompt/content keyword routing is allowed here.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(packId)) throw new Error(`invalid domain-pack id: ${packId}`);
  const packRoot = path.resolve(harnessRoot, 'profiles', packId);
  const descriptorPath = path.join(packRoot, 'domain-pack.json');
  if (!fs.existsSync(descriptorPath)) throw new Error(`domain pack is not installed: ${packId}`);
  const descriptorRaw = readJson(descriptorPath);
  assertDomainPackDescriptor(descriptorRaw);
  if (descriptorRaw.id !== packId) throw new Error(`domain-pack id mismatch: requested ${packId}, descriptor ${descriptorRaw.id}`);

  const requiredPaths = [descriptorRaw.behavior_contract, ...(descriptorRaw.source_evidence ? [descriptorRaw.source_evidence] : []), descriptorRaw.module_map, descriptorRaw.ui_contract, descriptorRaw.source_lock, ...descriptorRaw.rules];
  for (const relative of requiredPaths) {
    const file = safeRelative(packRoot, relative);
    if (!fs.existsSync(file)) throw new Error(`domain-pack required file missing: ${relative}`);
  }

  const behaviorContract = readJson(safeRelative(packRoot, descriptorRaw.behavior_contract));
  const sourceEvidenceRaw = descriptorRaw.source_evidence ? readJson(safeRelative(packRoot, descriptorRaw.source_evidence)) : null;
  const sourceLock = readJson(safeRelative(packRoot, descriptorRaw.source_lock));
  const lock = (sourceLock as { sourceLock?: SourceLock }).sourceLock;
  let sourceVerified = false;
  let sourceRoot: string | null = null;
  let sourceManifest: BundledSourceManifest | null = null;
  let sourceEvidence: DomainSourceEvidence | null = null;
  let sourceVerification: LoadedDomainPack['sourceVerification'] = { kind: 'git', state: 'unverified', detail: 'no verified source receipt' };

  if (lock?.sourceKind === 'bundled-snapshot') {
    try {
      const verified = verifyBundledSnapshot(packRoot, lock);
      sourceVerified = true;
      sourceRoot = verified.sourceRoot;
      sourceManifest = verified.manifest;
      sourceEvidence = sourceEvidenceRaw ? validateSourceEvidence(sourceEvidenceRaw, packId, behaviorContract, verified.sourceRoot, verified.manifest) : null;
      sourceVerification = { kind: 'bundled-snapshot', state: 'verified', detail: `verified ${verified.manifest.file_count} files; tree sha256 ${verified.manifest.tree_sha256}` };
    } catch (error) {
      sourceVerification = { kind: 'bundled-snapshot', state: 'unverified', detail: error instanceof Error ? error.message : String(error) };
    }
  } else if (lock) {
    sourceVerified = lock.verificationState === 'verified'
      && typeof lock.commitSha === 'string'
      && /^[a-f0-9]{40}$/.test(lock.commitSha)
      && lock.integrity?.algorithm === 'sha256'
      && /^[a-f0-9]{64}$/.test(lock.integrity.hash);
    sourceVerification = { kind: 'git', state: sourceVerified ? 'verified' : 'unverified', detail: sourceVerified ? `pinned Git revision ${String(lock.commitSha)}` : 'Git source receipt is not verified' };
  }

  return {
    descriptor: descriptorRaw,
    root: packRoot,
    behaviorContract,
    sourceEvidence,
    sourceLock,
    sourceVerified,
    sourceRoot,
    sourceManifest,
    sourceVerification,
  };
}


export interface DomainReferenceRead {
  pack_id: string;
  path: string;
  sha256: string;
  bytes: number;
  content: string;
}

/**
 * Read one manifest-bound file from a verified bundled domain reference. This
 * broker lets sandboxed workers consume authoritative reference code through
 * the harness without copying the template into the active project.
 */
export function readDomainReference(pack: LoadedDomainPack, relativePath: string, maxBytes = 512_000): DomainReferenceRead {
  if (!pack.sourceVerified || !pack.sourceRoot || !pack.sourceManifest) {
    throw new Error(`domain pack ${pack.descriptor.id} has no verified bundled reference source`);
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 2_000_000) throw new Error('invalid domain reference maxBytes');
  const normalized = relativePath.replace(/\\/g, '/');
  const entry = pack.sourceManifest.files.find((candidate) => candidate.path === normalized);
  if (!entry) throw new Error(`domain reference path is not manifest-bound: ${relativePath}`);
  if (entry.bytes > maxBytes) throw new Error(`domain reference exceeds maxBytes (${entry.bytes} > ${maxBytes}): ${relativePath}`);
  const file = safeRelative(pack.sourceRoot, normalized);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`domain reference is not a regular file: ${relativePath}`);
  const bytes = fs.readFileSync(file);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`domain reference integrity mismatch: ${relativePath}`);
  if (bytes.includes(0)) throw new Error(`domain reference is binary and cannot be emitted as text: ${relativePath}`);
  return { pack_id: pack.descriptor.id, path: normalized, sha256: digest, bytes: bytes.length, content: bytes.toString('utf8') };
}

/**
 * REQ-013 — reference receipt. The broker returns a receipt (manifest id,
 * source path, anchor, hash and the component/behavior actually used) so the
 * renderer can append a short, evidence-grounded footer ONLY when a reference
 * was really consumed. No receipt -> no footer, no "the forbidden disclosure phrase", no banner.
 */
export interface DomainReferenceReceipt {
  schema: 'agent-rules/domain-reference-receipt';
  version: 1;
  pack_id: string;
  manifest_id: string;
  /** Manifest-bound source path. */
  path: string;
  anchor?: string;
  sha256: string;
  /** Component/behavior the worker actually used this reference for. */
  component: string;
  consumed_at: string;
}

export interface DomainReferenceReadWithReceipt extends DomainReferenceRead {
  receipt: DomainReferenceReceipt;
}

/**
 * Read a manifest-bound reference AND emit its consumption receipt. The
 * `component`/`behavior` is what the worker actually used the reference for.
 */
export function consumeDomainReference(pack: LoadedDomainPack, relativePath: string, options: { component?: string; behavior?: string; anchor?: string; maxBytes?: number } = {}): DomainReferenceReadWithReceipt {
  const read = readDomainReference(pack, relativePath, options.maxBytes);
  const component = options.component ?? options.behavior ?? deriveComponentFromPath(read.path);
  const manifest = pack.sourceManifest;
  const manifestId = manifest?.source_archive_sha256 ?? manifest?.tree_sha256 ?? 'unknown';
  const receipt: DomainReferenceReceipt = {
    schema: 'agent-rules/domain-reference-receipt',
    version: 1,
    pack_id: pack.descriptor.id,
    manifest_id: manifestId,
    path: read.path,
    ...(options.anchor ? { anchor: options.anchor } : {}),
    sha256: read.sha256,
    component,
    consumed_at: new Date().toISOString(),
  };
  return { ...read, receipt };
}

/** Derive a component/behavior label from a manifest-bound path (first two segments). */
export function deriveComponentFromPath(pathValue: string): string {
  const segments = pathValue.split('/').filter(Boolean);
  if (segments.length >= 2) return `${segments[0]}/${segments[1]}`;
  return segments[0] ?? pathValue;
}

/**
 * Render the short disclosure footer. Returns '' when there is nothing to
 * disclose (no consumed reference) — never a banner, never "the forbidden disclosure phrase".
 */
export function renderDomainReferenceFooters(receipts: readonly DomainReferenceReceipt[]): string {
  const unique = new Map<string, DomainReferenceReceipt>();
  for (const receipt of receipts) {
    unique.set(`${receipt.path}#${receipt.sha256}`, receipt);
  }
  const lines: string[] = [];
  for (const receipt of unique.values()) {
    const anchor = receipt.anchor ? `#${receipt.anchor}` : '';
    lines.push(`${receipt.pack_id} reference used: ${receipt.component} — ${receipt.path}${anchor}, sha256:${receipt.sha256.slice(0, 12)}`);
  }
  return lines.join('\n');
}

export interface DomainReferenceMatch {
  pack_id: string;
  path: string;
  line: number;
  sha256: string;
  text: string;
}

/**
 * Search the verified bundled source without copying it into the target project.
 * Results are source pointers (path + line + file hash), so workers can ground
 * behavior in code rather than restating a prose template from memory.
 */
export function searchDomainReferences(pack: LoadedDomainPack, query: string, maxMatches = 20): DomainReferenceMatch[] {
  if (!pack.sourceVerified || !pack.sourceRoot || !pack.sourceManifest) {
    throw new Error(`domain pack ${pack.descriptor.id} has no verified bundled reference source`);
  }
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error('domain reference search query must not be empty');
  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 100) throw new Error('domain reference maxMatches must be between 1 and 100');
  const matches: DomainReferenceMatch[] = [];
  for (const entry of pack.sourceManifest.files) {
    if (matches.length >= maxMatches) break;
    const file = safeRelative(pack.sourceRoot, entry.path);
    const bytes = fs.readFileSync(file);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && matches.length < maxMatches; i += 1) {
      if (!lines[i].toLowerCase().includes(needle)) continue;
      matches.push({ pack_id: pack.descriptor.id, path: entry.path, line: i + 1, sha256: entry.sha256, text: lines[i].trim().slice(0, 500) });
    }
  }
  return matches;
}

/**
 * Compact, source-grounded behavior summary for an explicitly active pack.
 * It contains owner constraints plus manifest-bound source pointers, not copied
 * source bodies, so workers are directed to evidence without anchoring on a
 * large template dump.
 */
export function summarizeDomainBehavior(pack: LoadedDomainPack, maxRequirements = 24): string {
  if (!Number.isInteger(maxRequirements) || maxRequirements < 1 || maxRequirements > 100) throw new Error('invalid domain behavior summary limit');
  const contract = pack.behaviorContract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return '';
  const root = contract as Record<string, unknown>;
  const statements = new Map<string, string>();
  const roles = root.canonical_roles;
  if (roles && typeof roles === 'object' && !Array.isArray(roles)) {
    for (const role of Object.values(roles as Record<string, unknown>)) {
      if (!role || typeof role !== 'object' || Array.isArray(role)) continue;
      const requirements = (role as Record<string, unknown>).owner_requirements;
      if (!Array.isArray(requirements)) continue;
      for (const raw of requirements) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.id === 'string' && typeof r.statement === 'string') statements.set(r.id, r.statement);
      }
    }
  }
  if (Array.isArray(root.relationship_rules)) {
    for (const raw of root.relationship_rules) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.id === 'string' && typeof r.statement === 'string') statements.set(r.id, r.statement);
    }
  }
  const lines: string[] = [];
  for (const [id, statement] of [...statements.entries()].slice(0, maxRequirements)) {
    const pointer = pack.sourceEvidence?.requirements[id]?.[0];
    const anchor = pointer ? ` -> ${pointer.path}:${pointer.line}#${pointer.sha256.slice(0, 12)}` : '';
    lines.push(`- ${id}: ${statement}${anchor}`);
  }
  return lines.join('\n');
}

export function assertDomainPackStage(pack: LoadedDomainPack, stage: DomainPackStage): void {
  if (stage === 'planning' && !pack.sourceVerified && pack.descriptor.source_gate.planning_allowed_when_unverified) return;
  if (pack.descriptor.source_gate.required_for.includes(stage) && !pack.sourceVerified) {
    throw new Error(`domain pack ${pack.descriptor.id} is BLOCKED for ${stage}: ${pack.sourceVerification.detail}`);
  }
}
