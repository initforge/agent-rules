#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = YAML.parse(fs.readFileSync(path.join(root, 'registry', 'skills.yaml'), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'skills', 'activation.json'), 'utf8'));
const issues = [];
if (corpus.schema !== 'agent-rules/skill-activation-eval/v1' || !Array.isArray(corpus.cases)) issues.push('activation corpus schema is invalid');
const implicit = (registry.skills ?? []).filter((skill) => skill.lifecycle === 'active' && skill.activation === 'implicit');
const rows = [];
for (const skill of implicit) {
  const cases = corpus.cases.filter((entry) => entry.skill === skill.id);
  if (!cases.some((entry) => entry.kind === 'positive')) issues.push(`${skill.id} has no positive semantic fixture`);
  if (!cases.some((entry) => entry.kind === 'hard_negative')) issues.push(`${skill.id} has no hard-negative semantic fixture`);
  if (!cases.some((entry) => entry.language && entry.language !== 'en')) issues.push(`${skill.id} has no cross-language semantic fixture`);
  const file = path.join(root, 'skills', skill.id, 'SKILL.md');
  const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const description = fm ? String(YAML.parse(fm[1])?.description ?? '') : '';
  if (!description) issues.push(`${skill.id} has no description`);
  rows.push({ id: skill.id, description_chars: description.length, body_tokens: Math.ceil(body.length / 3.6), positives: cases.filter((entry) => entry.kind === 'positive').length, hard_negatives: cases.filter((entry) => entry.kind === 'hard_negative').length, cross_language: cases.filter((entry) => entry.language && entry.language !== 'en').length });
}
const contracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms', 'platform-contracts.json'), 'utf8')).native_contracts ?? {};
const taskPathTemplate = Object.values(contracts).map((contract) => contract?.paths?.repositorySkillPath).filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? '.agents/skills/<skill>/SKILL.md';
const textExtensions = new Set(['.c', '.cc', '.cfg', '.conf', '.cpp', '.css', '.csv', '.graphql', '.h', '.hcl', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.md', '.mjs', '.mts', '.py', '.rb', '.rs', '.sh', '.sql', '.source', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml']);
const textBasenames = new Set(['LICENSE', 'NOTICE', 'README']);
function textCategory(folder, file) {
  const relative = path.relative(folder, file).replace(/\\/g, '/');
  const buffer = fs.readFileSync(file);
  const basename = path.basename(relative);
  const extension = path.extname(basename).toLowerCase();
  const textCandidate = textExtensions.has(extension) || textBasenames.has(basename.toUpperCase()) || buffer.subarray(0, 2).toString('utf8') === '#!';
  if (!textCandidate || buffer.includes(0)) return { category: 'binary_asset', bytes: buffer.length, chars: 0 };
  const chars = buffer.toString('utf8').replace(/\r\n?/g, '\n').length;
  if (relative === 'SKILL.md') return { category: 'skill_body', bytes: buffer.length, chars };
  if (/^(reference|references|agents)\//.test(relative)) return { category: 'reference', bytes: buffer.length, chars };
  if (/^scripts\//.test(relative)) return { category: 'script', bytes: buffer.length, chars };
  return { category: 'supporting_text', bytes: buffer.length, chars };
}
const explicitRows = [];
for (const skill of (registry.skills ?? []).filter((entry) => entry.lifecycle === 'active' && entry.activation === 'explicit-only')) {
  const folder = path.join(root, 'skills', skill.id);
  const file = path.join(folder, 'SKILL.md');
  if (!fs.existsSync(file)) { issues.push(`${skill.id} explicit contract has no canonical folder`); continue; }
  const body = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const metadata = fm ? YAML.parse(fm[1]) : {};
  if (metadata?.name !== skill.id) issues.push(`${skill.id} explicit contract name does not match exact ID`);
  const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) entry.isDirectory() ? walk(path.join(dir, entry.name)) : files.push(path.join(dir, entry.name)); };
  walk(folder);
  const costs = files.map((item) => textCategory(folder, item));
  const charsFor = (category) => costs.filter((item) => item.category === category).reduce((sum, item) => sum + item.chars, 0);
  const filesFor = (category) => costs.filter((item) => item.category === category).length;
  const skillBodyChars = charsFor('skill_body');
  const referenceChars = charsFor('reference');
  const scriptChars = charsFor('script');
  const supportingTextChars = charsFor('supporting_text');
  const binaryAssetBytes = costs.filter((item) => item.category === 'binary_asset').reduce((sum, item) => sum + item.bytes, 0);
  const description = String(metadata?.description ?? '');
  explicitRows.push({
    id: skill.id,
    role: skill.role,
    requires: skill.requires ?? [],
    conflicts: skill.conflicts ?? [],
    canonical_hash: skill.upstream?.content_hash ?? null,
    projected_description_path_chars: skill.id.length + 1 + description.length + 1 + taskPathTemplate.replace('<skill>', skill.id).length,
    skill_body_tokens: Math.ceil(skillBodyChars / 3.6),
    reference_tokens: Math.ceil(referenceChars / 3.6),
    body_reference_tokens: Math.ceil((skillBodyChars + referenceChars) / 3.6),
    script_text_tokens: Math.ceil(scriptChars / 3.6),
    supporting_text_tokens: Math.ceil(supportingTextChars / 3.6),
    text_loadable_files: costs.length - filesFor('binary_asset'),
    binary_asset_files: filesFor('binary_asset'),
    binary_asset_bytes: binaryAssetBytes,
    projection_contract: 'task-local exact-id selection; transactional replace/remove covered by task-state installer tests',
  });
}
const result = { schema: 'agent-rules/skill-activation-eval-result/v2', ok: issues.length === 0, implicit_activation: rows, explicit_contracts: explicitRows, issues, note: 'Implicit corpus validates semantic boundaries; explicit contracts validate exact selection, provenance, dependency/conflict metadata and task-local projection cost without requiring prompt triggering.' };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 2);
