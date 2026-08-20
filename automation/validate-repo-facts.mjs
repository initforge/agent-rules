#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const file = path.join(root, 'generated', 'repo-facts.json');
if (!fs.existsSync(file)) throw new Error('generated/repo-facts.json is missing; run npm run build');
const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
if (artifact.schema !== 'harness/repo-facts/v1' || artifact.version !== 1 || !Array.isArray(artifact.facts)) throw new Error('RepoFacts schema/version mismatch');
const seen = new Set();
for (const fact of artifact.facts) {
  if (!fact?.fact_id || seen.has(fact.fact_id + JSON.stringify(fact.value))) throw new Error(`duplicate or malformed fact: ${fact?.fact_id ?? '<missing>'}`);
  seen.add(fact.fact_id + JSON.stringify(fact.value));
  if (!['observed', 'conflict', 'unknown'].includes(fact.status)) throw new Error(`invalid fact status: ${fact.fact_id}`);
  if (!Array.isArray(fact.sources) || fact.sources.length === 0) throw new Error(`fact lacks provenance: ${fact.fact_id}`);
  for (const source of fact.sources) {
    const target = path.resolve(root, source.path);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`fact source missing/outside workspace: ${source.path}`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if (digest !== source.sha256) throw new Error(`fact source hash mismatch: ${source.path}`);
  }
}
if (artifact.facts.some((fact) => String(fact.fact_id).startsWith('domain'))) throw new Error('RepoFacts must not infer business domain');
process.stdout.write(JSON.stringify({ status: 'PASS', facts: artifact.facts.length, workspace: artifact.workspace_root }) + '\n');
