#!/usr/bin/env node
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
  if (!match) throw new Error(`missing YAML frontmatter: ${posix(path.relative(root, file))}`);
  const parsed = YAML.parse(match[1]) ?? {};
  return parsed;
}

function skillRouting(file, body, profile) {
  if (profile) {
    const sidecar = path.join(path.dirname(file), 'ROUTE.json');
    if (fs.existsSync(sidecar)) return { routing: JSON.parse(fs.readFileSync(sidecar, 'utf8')), source: sidecar };
  }
  const meta = frontmatter(body, file).metadata ?? {};
  return {
    routing: {
      signals: metadataList(meta.signals),
      excludes: metadataList(meta.excludes),
      priority: Number(meta.priority ?? 0),
      requires: metadataList(meta.requires),
      supports: metadataList(meta.supports),
      project_scope: String(meta.project_scope ?? ''),
      platform_scope: String(meta.platform_scope ?? 'all'),
      default: false,
    },
    source: file,
  };
}

function addNode({ id, layer, file, loadPolicy, owner, routing = {} , routingSource = file }) {
  const source = posix(path.relative(root, file));
  if (nodes.some((node) => node.id === id)) throw new Error(`duplicate context node: ${id}`);
  const body = fs.readFileSync(file, 'utf8');
  nodes.push({
    id,
    layer,
    source,
    load_policy: loadPolicy,
    owner,
    trigger: `path:${source}`,
    requires: [],
    routing,
    source_hash: hash(file),
    routing_source: posix(path.relative(root, routingSource)),
    routing_hash: hash(routingSource),
    token_estimate: tokens(body),
  });
}

const manifest = fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8');
const alwaysRules = new Set([...manifest.matchAll(/^\s+-\s+(\S+\.md)\s*$/gm)].map((match) => match[1]));
for (const entry of fs.readdirSync(path.join(root, 'rules'), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;
  const file = path.join(root, 'rules', entry.name);
  addNode({ id: `rule:${path.basename(entry.name, '.md')}`, layer: 'rules', file, loadPolicy: alwaysRules.has(entry.name) ? 'always' : 'router', owner: posix(path.relative(root, file)), routing: { default: alwaysRules.has(entry.name) } });
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
    addNode({ id: `skill:${entry.name}`, layer: 'skills', file, loadPolicy: 'skill', owner: posix(path.relative(root, file)), routing: resolved.routing, routingSource: resolved.source });
  }
}
addSkills(path.join(root, 'skills'));
const profiles = path.join(root, 'profiles');
if (fs.existsSync(profiles)) for (const entry of fs.readdirSync(profiles, { withFileTypes: true })) if (entry.isDirectory()) addSkills(path.join(profiles, entry.name, 'skills'), entry.name);

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
  version: 2,
  generated_from: ['rules/manifest.yaml', 'skills/**/SKILL.md', 'profiles/*/skills/**/SKILL.md', 'platforms/*/*-overlay.md', 'integrations/registry.json'],
  source_of_truth: { rules: 'rules/manifest.yaml', skills: 'SKILL.md frontmatter', platforms: 'platform overlays', integrations: 'integrations/registry.json' },
  nodes,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Context graph written to ${output} (v${graph.version}, ${nodes.length} nodes)`);
