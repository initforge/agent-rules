#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];
const forbidden = /RunStore|EvidenceLedger|\.agent\/plans|skill:finish-to-completion|skill:frontend-composition/;
for (const relative of ['generated/behavior-index.md', 'generated/behavior-index.json', 'generated/context-graph.json']) {
  const file = path.join(root, relative);
  if (fs.existsSync(file) && forbidden.test(fs.readFileSync(file, 'utf8'))) issues.push(`${relative} contains retired architecture authority`);
}
const registry = YAML.parse(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8'));
const activeIds = new Set((registry.skills ?? []).filter((entry) => entry.lifecycle === 'active').map((entry) => entry.id));
const graphFile = path.join(root, 'generated', 'context-graph.json');
if (fs.existsSync(graphFile)) {
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
  const graphIds = new Set(graph.nodes.filter((node) => node.layer === 'skills' && !node.source.startsWith('profiles/')).map((node) => node.id.slice(6)));
  for (const id of activeIds) if (!graphIds.has(id)) issues.push(`active registry skill missing from context graph: ${id}`);
  for (const id of graphIds) if (!activeIds.has(id)) issues.push(`context graph exposes non-active skill: ${id}`);
}
for (const file of ['skills/frontend-design-contract/SKILL.md', 'README.md', 'skills/README.md']) {
  const body = fs.readFileSync(path.join(root, file), 'utf8');
  if (/`frontend-composition`|selectable `finish-to-completion`/.test(body)) issues.push(`${file} references a retired authority`);
}
const agent = path.join(root, '.agent');
if (fs.existsSync(agent)) for (const forbiddenDir of ['history', 'runs', 'evidence', 'completed', 'archive']) if (fs.existsSync(path.join(agent, forbiddenDir))) issues.push(`.agent contains forbidden history directory: ${forbiddenDir}`);
console.log(`context-integrity: ${issues.length === 0 ? 'PASS' : 'FAIL'}`);
for (const issue of issues) console.log(`  - ${issue}`);
process.exit(issues.length === 0 ? 0 : 2);
