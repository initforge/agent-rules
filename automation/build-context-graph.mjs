#!/usr/bin/env node
/**
 * build-context-graph.mjs — canonical context graph (v3).
 *
 * Reads the SAME parsed rules/manifest.yaml (YAML load policy) as the runtime
 * build, plus registry/skills.yaml (SkillRegistryV2) for skill origin, role,
 * activation, compatibility, requires/supports/conflicts/exclusive group and
 * exact content hash. Emits per-node description token/character contribution
 * and a compact provenance block in the manifest for installer/doctor only.
 *
 * The runtime model never consumes this graph for implicit semantic
 * activation; host-native discovery reads the exact skill name and description.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'generated', 'context-graph.json'));
const nodes = [];

const posix = (value) => value.split(path.sep).join('/');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tokens = (text) => Math.ceil(text.replace(/\r\n?/g, '\n').length / 3.6);
const metadataList = (value) => Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];

function frontmatter(body, file) {
  const match = body.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return {};
  const parsed = YAML.parse(match[1]) ?? {};
  return parsed;
}

function skillRouting(file, body, profile) {
  const meta = frontmatter(body, file).metadata ?? {};
  return {
    routing: {
      signals: metadataList(meta.signals),
      excludes: metadataList(meta.excludes),
      priority: Number(meta.priority ?? 0),
      requires: metadataList(meta.requires),
      supports: metadataList(meta.supports),
      project_scope: String(meta.project_scope ?? (profile || '')),
      platform_scope: String(meta.platform_scope ?? 'all'),
      default: false,
    },
    source: file,
  };
}

function addNode({ id, layer, file, loadPolicy, owner, routing = {}, routingSource = file, provenance = {}, role = null, activation = null, conflicts = [], exclusiveGroup = null }) {
  const source = posix(path.relative(root, file));
  if (nodes.some((node) => node.id === id)) throw new Error(`duplicate context node: ${id}`);
  const body = fs.readFileSync(file, 'utf8');
  const front = frontmatter(body, file);
  const description = String(front.description ?? '');
  nodes.push({
    id,
    layer,
    source,
    load_policy: loadPolicy,
    owner,
    trigger: `path:${source}`,
    requires: routing.requires ?? [],
    routing,
    source_hash: hash(file),
    routing_source: posix(path.relative(root, routingSource)),
    routing_hash: hash(routingSource),
    token_estimate: tokens(body),
    description_contribution: {
      characters: description.length,
      tokens: tokens(description),
    },
    ...(role ? { role } : {}),
    ...(activation ? { activation } : {}),
    conflicts,
    exclusive_group: exclusiveGroup,
    ...(Object.keys(provenance).length > 0 ? { provenance } : {}),
  });
}

// ── shared YAML load policy ─────────────────────────────────────────────────
const manifestParsed = YAML.parse(fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8'));
const manifestContracts = manifestParsed?.rule_contracts ?? {};
const alwaysRules = new Set(
  (manifestParsed?.load_order ?? [])
    .map((name) => String(name))
    .filter((name) => manifestContracts[name]?.trigger === 'always-load'),
);
for (const entry of fs.readdirSync(path.join(root, 'rules'), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
  const file = path.join(root, 'rules', entry.name);
  const loadPolicy = alwaysRules.has(entry.name) ? 'always' : 'router';
  addNode({ id: `rule:${path.basename(entry.name, '.md')}`, layer: 'rules', file, loadPolicy, owner: posix(path.relative(root, file)), routing: { default: loadPolicy === 'always' } });
}

// ── registry /v2 (SkillRegistryV2) ─────────────────────────────────────────
const registryFile = path.join(root, 'registry', 'skills.yaml');
let registryById = new Map();
let registryHash = null;
if (fs.existsSync(registryFile)) {
  const registryText = fs.readFileSync(registryFile, 'utf8');
  registryHash = hash(registryFile);
  const registry = YAML.parse(registryText);
  if (registry?.schema !== 'agent-rules/skill-registry/v2' || !Array.isArray(registry.skills)) {
    throw new Error('registry/skills.yaml is not a SkillRegistryV2 document');
  }
  registryById = new Map(registry.skills.map((entry) => [String(entry.id), entry]));
}

function addSkills(base, profile = '') {
  if (!fs.existsSync(base)) return;
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(base, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const body = fs.readFileSync(file, 'utf8');
    const resolved = skillRouting(file, body, profile);
    if (profile && !resolved.routing.project_scope) resolved.routing.project_scope = profile;
    const registryEntry = registryById.get(entry.name);
    const provenance = registryEntry
      ? {
          origin: registryEntry.origin,
          role: registryEntry.role,
          activation: registryEntry.activation,
          registry_source: posix(path.relative(root, registryFile)),
          registry_hash: registryHash,
          compatibility: registryEntry.compatibility ?? {},
          requires: registryEntry.requires ?? [],
          supports: registryEntry.supports ?? [],
          conflicts: registryEntry.conflicts ?? [],
          exclusive_group: registryEntry.exclusive_group ?? null,
          content_hash: registryEntry.upstream?.content_hash ?? null,
          lifecycle: registryEntry.lifecycle,
        }
      : {};
    const routing = {
      ...resolved.routing,
      requires: registryEntry?.requires ?? resolved.routing.requires,
      supports: registryEntry?.supports ?? resolved.routing.supports,
      compatibility: registryEntry?.compatibility ?? {},
    };
    addNode({
      id: `skill:${entry.name}`,
      layer: 'skills',
      file,
      loadPolicy: 'skill',
      owner: posix(path.relative(root, file)),
      routing,
      routingSource: registryEntry ? registryFile : resolved.source,
      provenance,
      role: registryEntry?.role ?? (profile ? 'domain' : null),
      activation: registryEntry?.activation ?? (profile ? 'explicit-only' : null),
      conflicts: registryEntry?.conflicts ?? [],
      exclusiveGroup: registryEntry?.exclusive_group ?? null,
    });
  }
}
addSkills(path.join(root, 'skills'));
const profiles = path.join(root, 'profiles');
if (fs.existsSync(profiles)) for (const entry of fs.readdirSync(profiles, { withFileTypes: true })) if (entry.isDirectory()) addSkills(path.join(profiles, entry.name, 'skills'), entry.name);

const skillNodes = nodes.filter((node) => node.layer === 'skills' && node.id.startsWith('skill:'));
const skillById = new Map(skillNodes.map((node) => [node.id.slice(6), node]));
const visiting = new Set();
const visited = new Set();
function validateSkillDependencies(slug, trail = []) {
  if (visited.has(slug)) return;
  if (visiting.has(slug)) throw new Error(`skill dependency cycle: ${[...trail, slug].join(' -> ')}`);
  const node = skillById.get(slug);
  if (!node) throw new Error(`skill dependency is missing: ${trail.at(-1) ?? 'catalog'} requires ${slug}`);
  visiting.add(slug);
  for (const dependency of node.routing.requires ?? []) validateSkillDependencies(dependency, [...trail, slug]);
  visiting.delete(slug);
  visited.add(slug);
}
for (const slug of skillById.keys()) validateSkillDependencies(slug);

// Registry conflicts symmetry + exclusive-group consistency fail closed.
for (const entry of registryById.values()) {
  for (const conflict of entry.conflicts ?? []) {
    const other = registryById.get(conflict);
    if (other && !(other.conflicts ?? []).includes(entry.id)) {
      throw new Error(`registry conflict is not symmetric: ${entry.id} <-> ${conflict}`);
    }
  }
}

const externalRegistry = path.join(root, 'references', 'external-skills', 'registry.json');
if (fs.existsSync(externalRegistry)) {
  const external = JSON.parse(fs.readFileSync(externalRegistry, 'utf8'));
  if (external.schema !== 'agent-rules/external-skill-reference/v1' || !Array.isArray(external.references)) throw new Error('external skill reference registry is malformed');
  const ids = new Set();
  for (const reference of external.references) {
    if (typeof reference?.id !== 'string' || ids.has(reference.id)) throw new Error('external skill reference registry has duplicate or invalid id');
    if (typeof reference.source !== 'string' || !/^https:\/\//.test(reference.source)) throw new Error(`external skill reference has invalid source: ${reference.id}`);
    if (typeof reference.commit !== 'string' || !/^[a-f0-9]{40}$/i.test(reference.commit)) throw new Error(`external skill reference has invalid commit: ${reference.id}`);
    if (typeof reference.tree !== 'string' || !/^[a-f0-9]{40}$/i.test(reference.tree)) throw new Error(`external skill reference has invalid tree: ${reference.id}`);
    if (!['reference_only', 'materialized_subset', 'blocked'].includes(reference.status)) throw new Error(`external skill reference has invalid status: ${reference.id}`);
    if (typeof reference.authority !== 'string' || reference.authority.length === 0) throw new Error(`external skill reference has invalid authority: ${reference.id}`);
    if (reference.status === 'blocked' ? reference.license !== null : typeof reference.license !== 'string' || reference.license.length === 0) throw new Error(`external skill reference has invalid license: ${reference.id}`);
    if (skillById.has(reference.id)) throw new Error(`external reference remains selectable: ${reference.id}`);
    ids.add(reference.id);
  }
}

const platforms = path.join(root, 'platforms');
for (const entry of fs.readdirSync(platforms, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(platforms, entry.name, `${entry.name}-overlay.md`);
  if (fs.existsSync(file)) addNode({ id: `platform:${entry.name}`, layer: 'platform', file, loadPolicy: 'platform', owner: `platforms/${entry.name}` });
}

const registry = path.join(root, 'integrations', 'registry.json');
if (fs.existsSync(registry)) addNode({ id: 'integration:registry', layer: 'integration', file: registry, loadPolicy: 'router', owner: 'integrations/registry.json' });

nodes.sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id));
const graph = {
  version: 3,
  generated_from: ['rules/manifest.yaml', 'registry/skills.yaml', 'skills/**/SKILL.md', 'profiles/*/skills/**/SKILL.md', 'platforms/*/*-overlay.md', 'integrations/registry.json'],
  source_of_truth: { rules: 'rules/manifest.yaml (YAML load policy)', skills: 'registry/skills.yaml + SKILL.md frontmatter', platforms: 'platform overlays', integrations: 'integrations/registry.json' },
  nodes,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Context graph written to ${output} (v${graph.version}, ${nodes.length} nodes)`);
