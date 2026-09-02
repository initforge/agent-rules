/**
 * northstar/skill-registry.ts — SkillRegistryV2.
 *
 * Governance registry for every skill (internal | upstream | system | profile).
 * The runtime model never reads this registry; host-native skill discovery
 * keeps using the exact upstream/internal `name` and `description`. The
 * registry serves build, audit, conflict resolution, installer and doctor.
 *
 * v2 contract:
 * - activation is only `implicit` or `explicit-only`; roles (auditor,
 *   verifier, design, domain, process) are `role`, never `activation`.
 * - requires/supports/conflicts must reference existing IDs; self-reference,
 *   duplicate edges and dependency cycles are rejected; conflicts are
 *   symmetric.
 * - an exclusive group may contain all-upstream skills.
 * - active upstream skills require a complete source pin (repository,
 *   source_path, commit, tree, license, license_evidence, content_hash).
 * - blocked upstream skills may lack license/tree/hash when they carry a
 *   source URL/path and a precise blocker reason.
 * - active internal/upstream skills must have a matching canonical folder and
 *   frontmatter name (validated against the tree, not just the document).
 * - system skills are never materialized under skills/; profile skills never
 *   appear in the global catalog.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const SKILL_REGISTRY_SCHEMA = 'agent-rules/skill-registry/v2' as const;

export type SkillOrigin = 'internal' | 'upstream' | 'system' | 'profile';
export type SkillLifecycle = 'active' | 'blocked' | 'deprecated' | 'retired';
export type TrustTier = 'owner-approved' | 'pinned-upstream' | 'reference-only' | 'untrusted';
export type SkillActivation = 'implicit' | 'explicit-only';
export type SkillRegistryRole = 'auditor' | 'verifier' | 'design' | 'domain' | 'process';

export interface UpstreamPin {
  readonly repository: string;
  readonly source_path: string;
  /** Required for active upstream; optional when blocked with a precise blocker. */
  readonly commit?: string;
  readonly tree?: string;
  readonly license?: string;
  readonly license_evidence?: string;
  /** sha256 over the canonical skill folder bytes (sorted file paths). */
  readonly content_hash?: string;
}

export interface SkillRegistryEntry {
  readonly id: string;
  readonly origin: SkillOrigin;
  readonly role: SkillRegistryRole;
  readonly activation: SkillActivation;
  readonly compatibility: Readonly<Record<string, string>>;
  readonly requires?: readonly string[];
  readonly supports?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly supersedes?: readonly string[];
  readonly superseded_by?: readonly string[];
  readonly exclusive_group?: string;
  readonly lifecycle: SkillLifecycle;
  readonly upstream?: UpstreamPin;
  readonly trust_tier: TrustTier;
  readonly trust_basis: string;
  readonly network: 'none' | 'read' | 'write';
  readonly side_effects: readonly string[];
  readonly update_policy: 'manual_review';
  readonly blocked_reason?: string;
  readonly failure_target?: string;
  readonly removal_condition?: string;
  /** Required for retired/deprecated entries (why the status changed). */
  readonly status_reason?: string;
}

export interface SkillRegistryDocument {
  readonly schema: typeof SKILL_REGISTRY_SCHEMA;
  readonly skills: readonly SkillRegistryEntry[];
}

export interface SkillRegistryValidationIssue {
  readonly entry: string | null;
  readonly message: string;
}

export interface SkillRegistryValidation {
  readonly ok: boolean;
  readonly issues: readonly SkillRegistryValidationIssue[];
}

export interface SkillRegistryTreeCheck {
  readonly ok: boolean;
  readonly issues: readonly SkillRegistryValidationIssue[];
}

const ORIGINS: readonly SkillOrigin[] = ['internal', 'upstream', 'system', 'profile'];
const LIFECYCLES: readonly SkillLifecycle[] = ['active', 'blocked', 'deprecated', 'retired'];
const TRUST_TIERS: readonly TrustTier[] = ['owner-approved', 'pinned-upstream', 'reference-only', 'untrusted'];
const ACTIVATIONS: readonly SkillActivation[] = ['implicit', 'explicit-only'];
const ROLES: readonly SkillRegistryRole[] = ['auditor', 'verifier', 'design', 'domain', 'process'];
const COMMIT_RE = /^[a-f0-9]{40}$/i;
const TREE_RE = /^[a-f0-9]{40}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/i;

function issue(entry: string | null, message: string): SkillRegistryValidationIssue {
  return { entry, message };
}

/** Fail closed for any entry shape that contradicts its lifecycle/origin. */
function lifecycleContradictions(e: Record<string, unknown>, add: (message: string) => void): void {
  if (e.lifecycle === 'retired' || e.lifecycle === 'deprecated') {
    if (typeof e.status_reason !== 'string' || !e.status_reason.trim()) add(`${e.lifecycle} entries require status_reason`);
  }
  if (e.lifecycle === 'blocked') {
    if (typeof e.blocked_reason !== 'string' || !e.blocked_reason.trim()) add('blocked entries require a precise blocked_reason');
  } else if (e.blocked_reason !== undefined) {
    add('blocked_reason is only valid for lifecycle=blocked');
  }
  if (e.lifecycle === 'active' && e.origin === 'system') {
    add('system skills are never active in the global catalog');
  }
  if (e.lifecycle === 'active' && e.activation === 'explicit-only') {
    // allowed: an active skill may be explicit-only (e.g. upstream exact pins)
  }
  if (e.origin === 'profile') {
    add('profile skills must not appear in the global catalog');
  }
}

export function validateSkillRegistry(value: unknown): SkillRegistryValidation {
  const issues: SkillRegistryValidationIssue[] = [];
  if (typeof value !== 'object' || value === null) return { ok: false, issues: [issue(null, 'registry document is not an object')] };
  const doc = value as Record<string, unknown>;
  if (doc.schema !== SKILL_REGISTRY_SCHEMA) issues.push(issue(null, `schema must be ${SKILL_REGISTRY_SCHEMA}`));
  if (!Array.isArray(doc.skills)) return { ok: false, issues: [...issues, issue(null, 'skills must be an array')] };

  const seen = new Set<string>();
  doc.skills.forEach((raw, index) => {
    const id = typeof (raw as Record<string, unknown>)?.id === 'string' ? (raw as { id: string }).id : `#skills[${index}]`;
    const e = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const add = (message: string) => issues.push(issue(id, message));

    if (!e.id || typeof e.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) add('id must be a kebab-case string');
    else if (seen.has(e.id)) add('duplicate id');
    else seen.add(e.id);

    if (!ORIGINS.includes(e.origin as SkillOrigin)) add(`origin must be one of ${ORIGINS.join('|')}`);
    if (!ROLES.includes(e.role as SkillRegistryRole)) add(`role must be one of ${ROLES.join('|')} (roles are not activation)`);
    if (!ACTIVATIONS.includes(e.activation as SkillActivation)) add(`activation must be one of ${ACTIVATIONS.join('|')}`);
    if (typeof e.compatibility !== 'object' || e.compatibility === null || Array.isArray(e.compatibility)) add('compatibility must be a mapping');
    if (!LIFECYCLES.includes(e.lifecycle as SkillLifecycle)) add(`lifecycle must be one of ${LIFECYCLES.join('|')}`);
    if (!TRUST_TIERS.includes(e.trust_tier as TrustTier)) add(`trust_tier must be one of ${TRUST_TIERS.join('|')}`);
    if (typeof e.trust_basis !== 'string' || !e.trust_basis) add('trust_basis must be a non-empty string');
    if (!['none', 'read', 'write'].includes(e.network as string)) add('network must be none|read|write');
    if (!Array.isArray(e.side_effects)) add('side_effects must be an array');
    if (e.update_policy !== 'manual_review') add('update_policy must be manual_review');

    for (const listField of ['requires', 'supports', 'conflicts', 'supersedes', 'superseded_by', 'side_effects'] as const) {
      if (e[listField] !== undefined && (!Array.isArray(e[listField]) || (e[listField] as unknown[]).some((x) => typeof x !== 'string'))) add(`${listField} must be an array of strings`);
      else if (Array.isArray(e[listField])) {
        const values = e[listField] as string[];
        if (new Set(values).size !== values.length) add(`${listField} contains duplicate edges`);
        if (values.includes(String(e.id))) add(`${listField} must not self-reference ${String(e.id)}`);
      }
    }
    if (e.exclusive_group !== undefined && (typeof e.exclusive_group !== 'string' || !e.exclusive_group)) add('exclusive_group must be a non-empty string');
    lifecycleContradictions(e, add);

    if (e.origin === 'upstream') {
      const u = e.upstream as Record<string, unknown> | undefined;
      if (typeof u !== 'object' || u === null) { add('upstream entries require upstream pin'); return; }
      if (typeof u.repository !== 'string' || !/^https:\/\//.test(u.repository)) add('upstream.repository must be an https URL');
      if (typeof u.source_path !== 'string' || !u.source_path) add('upstream.source_path must be a non-empty string');
      const active = e.lifecycle === 'active';
      if (active) {
        // Active upstream: complete source pin + license + hash required.
        if (typeof u.commit !== 'string' || !COMMIT_RE.test(u.commit)) add('active upstream.commit must be a 40-hex commit');
        if (typeof u.tree !== 'string' || !TREE_RE.test(u.tree)) add('active upstream.tree must be a 40-hex tree hash');
        if (typeof u.license !== 'string' || !u.license) add('active upstream.license must be a non-empty string');
        if (typeof u.license_evidence !== 'string' || !u.license_evidence) add('active upstream.license_evidence must be a non-empty path/reference');
        if (typeof u.content_hash !== 'string' || !SHA256_RE.test(u.content_hash)) add('active upstream.content_hash must be sha256 hex');
      } else if (e.lifecycle === 'blocked') {
        // Blocked upstream may lack license/tree/hash; source URL/path + precise blocker must exist.
        if (typeof u.commit !== 'undefined' && typeof u.commit !== 'string') add('upstream.commit must be a string');
        if (typeof u.tree !== 'undefined' && typeof u.tree !== 'string') add('upstream.tree must be a string');
        if (typeof u.license !== 'undefined' && typeof u.license !== 'string') add('upstream.license must be a string');
        if (typeof u.content_hash !== 'undefined' && typeof u.content_hash !== 'string') add('upstream.content_hash must be a string');
      }
      if (u.commit !== undefined && typeof u.commit === 'string' && !COMMIT_RE.test(u.commit)) add('upstream.commit must be a 40-hex commit');
      if (u.tree !== undefined && typeof u.tree === 'string' && !TREE_RE.test(u.tree)) add('upstream.tree must be a 40-hex tree hash');
      if (u.content_hash !== undefined && typeof u.content_hash === 'string' && !SHA256_RE.test(u.content_hash)) add('upstream.content_hash must be sha256 hex');
    } else if (e.upstream !== undefined) {
      add('upstream pin is only valid for origin=upstream');
    }

    if (e.origin === 'system' || e.origin === 'profile') {
      if (e.trust_tier !== 'owner-approved' && e.trust_tier !== 'untrusted') add('system/profile trust_tier must be owner-approved or untrusted');
    }
    if (e.origin === 'internal' && e.trust_tier !== 'owner-approved') {
      add('internal skills are owner-approved by definition');
    }
    if (e.origin === 'internal' && e.lifecycle === 'active') {
      if (typeof e.failure_target !== 'string' || !e.failure_target.trim()) add('active internal skills require failure_target');
      if (typeof e.removal_condition !== 'string' || !e.removal_condition.trim()) add('active internal skills require removal_condition');
    }
  });

  // Cross-entry checks: reference existence, cycles, conflicts symmetry, groups.
  const byId = new Map<string, SkillRegistryEntry>();
  for (const raw of doc.skills) {
    const e = raw as unknown as SkillRegistryEntry;
    if (e && typeof e.id === 'string') byId.set(e.id, e);
  }
  for (const entry of byId.values()) {
    for (const listField of ['requires', 'supports', 'conflicts', 'supersedes', 'superseded_by'] as const) {
      for (const reference of entry[listField] ?? []) {
        if (!byId.has(reference)) issues.push(issue(entry.id, `${listField} references missing id: ${reference}`));
      }
    }
    for (const conflict of entry.conflicts ?? []) {
      const other = byId.get(conflict);
      if (other && !(other.conflicts ?? []).includes(entry.id)) {
        issues.push(issue(entry.id, `conflict is not symmetric: ${conflict} does not list ${entry.id}`));
      }
    }
    for (const predecessor of entry.supersedes ?? []) {
      const prior = byId.get(predecessor);
      if (prior && !(prior.superseded_by ?? []).includes(entry.id)) {
        issues.push(issue(entry.id, `supersedes relation is not mirrored by ${predecessor}.superseded_by`));
      }
    }
    for (const successor of entry.superseded_by ?? []) {
      const next = byId.get(successor);
      if (next && !(next.supersedes ?? []).includes(entry.id)) {
        issues.push(issue(entry.id, `superseded_by relation is not mirrored by ${successor}.supersedes`));
      }
    }
  }
  // requires graph: no cycles.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: readonly string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      issues.push(issue(id, `requires dependency cycle: ${[...trail, id].join(' -> ')}`));
      return;
    }
    visiting.add(id);
    for (const dependency of byId.get(id)?.requires ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id, []);

  // Exclusive groups: may be all-upstream; members must share one role.
  const groups = new Map<string, string[]>();
  for (const entry of byId.values()) {
    if (entry.exclusive_group) {
      const list = groups.get(entry.exclusive_group) ?? [];
      list.push(entry.id);
      groups.set(entry.exclusive_group, list);
    }
  }
  for (const [group, members] of groups) {
    const groupEntries = members.map((id) => byId.get(id)!);
    if (new Set(groupEntries.map((e) => e.role)).size !== 1) {
      issues.push(issue(null, `exclusive group ${group} members must share one role`));
    }
  }

  return { ok: issues.length === 0, issues };
}

export function parseSkillRegistry(text: string): SkillRegistryDocument {
  const parsed = YAML.parse(text);
  const validation = validateSkillRegistry(parsed);
  if (!validation.ok) {
    const detail = validation.issues.map((i) => `${i.entry ?? '<registry>'}: ${i.message}`).join('; ');
    throw new Error(`skill registry validation failed: ${detail}`);
  }
  return parsed as SkillRegistryDocument;
}

export function loadSkillRegistry(root: string): SkillRegistryDocument {
  return parseSkillRegistry(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8'));
}

/**
 * Folder-tree content hash: sha256 over `rel\0bytes\0` entries sorted by the
 * normalized relative path (byte order — never localeCompare). Separators are
 * normalized to '/', so file order, Windows separators and locale can never
 * change the hash; a one-byte content change, rename or path change always
 * does.
 */
export function hashSkillFolder(folder: string): string {
  const resolvedRoot = path.resolve(folder);
  let rootStat;
  try {
    rootStat = fs.statSync(resolvedRoot);
  } catch (error) {
    throw new Error(`skill folder does not exist or is not accessible: ${resolvedRoot} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!rootStat.isDirectory()) throw new Error(`skill folder is not a directory: ${resolvedRoot}`);
  const entries: Array<{ rel: string; bytes: Buffer }> = [];

  const walk = (dir: string): void => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      throw new Error(`cannot read skill folder ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const entry of dirents) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(resolvedRoot, full);
      if (rel.split(path.sep).some((segment) => segment === '..') || path.isAbsolute(rel)) {
        throw new Error(`path escape rejected: ${rel}`);
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`symlink rejected: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        // Reject git submodule placeholders (a directory whose only marker is
        // a `.git` file pointing elsewhere) and nested junctions.
        const real = fs.realpathSync(full);
        if (!real.startsWith(`${fs.realpathSync(resolvedRoot)}${path.sep}`)) {
          throw new Error(`directory escapes skill root (junction/symlink): ${entry.name}`);
        }
        const gitFile = path.join(full, '.git');
        if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) {
          throw new Error(`submodule placeholder rejected: ${entry.name}`);
        }
        walk(full);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`special file rejected (${entry.name}: ${entry.isFIFO() ? 'fifo' : entry.isSocket() ? 'socket' : entry.isCharacterDevice() ? 'character-device' : entry.isBlockDevice() ? 'block-device' : 'unknown'})`);
      }
      entries.push({ rel: rel.split(path.sep).join('/'), bytes: fs.readFileSync(full) });
    }
  };

  walk(resolvedRoot);
  if (entries.length === 0) {
    throw new Error(`skill folder is empty (fail closed): ${resolvedRoot}`);
  }

  // Deterministic byte-order sort on the normalized relative path; the raw
  // file bytes are hashed directly (not a digest of them).
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const digest = createHash('sha256');
  for (const entry of entries) {
    digest.update(entry.rel);
    digest.update('\0');
    digest.update(entry.bytes);
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** Parse `name` from a SKILL.md frontmatter block. */
export function skillFrontmatterName(file: string): string | null {
  const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const parsed = YAML.parse(match[1]) ?? {};
  return typeof parsed.name === 'string' ? parsed.name : null;
}

/**
 * Tree-level validation (requires the canonical repository tree):
 * - active internal/upstream skills must have skills/<id>/SKILL.md whose
 *   frontmatter name equals the id, and (for upstream) whose folder content
 *   hash matches the pin;
 * - system skills must not be materialized under skills/;
 * - profile skills must not be materialized under skills/ (global catalog).
 */
export function validateSkillRegistryTree(doc: SkillRegistryDocument, root: string): SkillRegistryTreeCheck {
  const issues: SkillRegistryValidationIssue[] = [];
  const skillsRoot = path.join(root, 'skills');
  for (const entry of doc.skills) {
    if (entry.origin === 'system' || entry.origin === 'profile') {
      const materialized = path.join(skillsRoot, entry.id, 'SKILL.md');
      if (fs.existsSync(materialized)) {
        issues.push(issue(entry.id, `${entry.origin} skill must not be materialized under skills/`));
      }
      continue;
    }
    if (entry.lifecycle !== 'active') continue;
    const folder = path.join(skillsRoot, entry.id);
    const skillFile = path.join(folder, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      issues.push(issue(entry.id, `active ${entry.origin} skill has no canonical folder skills/${entry.id}/SKILL.md`));
      continue;
    }
    const frontmatterName = skillFrontmatterName(skillFile);
    if (frontmatterName !== entry.id) {
      issues.push(issue(entry.id, `frontmatter name ${JSON.stringify(frontmatterName)} does not match registry id ${entry.id}`));
    }
    if (entry.origin === 'upstream' && entry.upstream?.content_hash) {
      try {
        const actual = hashSkillFolder(folder);
        if (actual !== entry.upstream.content_hash) {
          issues.push(issue(entry.id, `folder content hash ${actual} does not match pinned upstream hash ${entry.upstream.content_hash}`));
        }
      } catch (error) {
        issues.push(issue(entry.id, `cannot hash skill folder: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateSkillRegistryWithTree(value: unknown, root: string): SkillRegistryValidation & { tree: SkillRegistryTreeCheck } {
  const document = validateSkillRegistry(value);
  if (!document.ok) return { ...document, tree: { ok: false, issues: [] } };
  const tree = validateSkillRegistryTree(value as SkillRegistryDocument, root);
  return { ok: document.ok && tree.ok, issues: [...document.issues, ...tree.issues], tree };
}
