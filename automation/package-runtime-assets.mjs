#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'packages', 'cli', 'runtime-assets');
const skip = new Set(['node_modules', '.git', 'dist', 'coverage', '__pycache__']);

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function walk(start, acc = []) {
  if (!fs.existsSync(start)) return acc;
  const stat = fs.statSync(start);
  if (stat.isFile()) {
    acc.push(start);
    return acc;
  }
  for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
    if (entry.isDirectory() && skip.has(entry.name)) continue;
    walk(path.join(start, entry.name), acc);
  }
  return acc;
}

function copyTree(fromRel, include = () => true) {
  const source = path.join(root, fromRel);
  if (!fs.existsSync(source)) throw new Error(`missing runtime asset source: ${fromRel}`);
  const dest = path.join(target, fromRel);
  fs.cpSync(source, dest, { recursive: true, force: true, filter: (src) => src === source || (!skip.has(path.basename(src)) && include(src)) });
  return walk(dest).map((file) => ({
    path: path.relative(target, file).split(path.sep).join('/'),
    sha256: hash(fs.readFileSync(file)),
  }));
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
const files = [
  ...copyTree('rules'),
  ...copyTree('skills'),
  ...copyTree('registry'),
  ...copyTree('schemas'),
  ...copyTree('platforms', (src) => {
    const rel = path.relative(path.join(root, 'platforms'), src).split(path.sep).join('/');
    return !/\.test\.ts$|\/coordinator-adapter\.ts$|\/native-session-adapter\.ts$/.test(rel);
  }),
  ...copyTree('profiles'),
  ...copyTree('integrations'),
  ...copyTree(path.join('packages', 'kernel', 'dist'), (src) => fs.statSync(src).isDirectory() || src.endsWith('.js')),
];
if (fs.existsSync(path.join(root, 'generated', 'context-graph.json'))) {
  fs.mkdirSync(path.join(target, 'generated'), { recursive: true });
  fs.copyFileSync(path.join(root, 'generated', 'context-graph.json'), path.join(target, 'generated', 'context-graph.json'));
  files.push({ path: 'generated/context-graph.json', sha256: hash(fs.readFileSync(path.join(target, 'generated', 'context-graph.json'))) });
}
if (fs.existsSync(path.join(root, 'generated', 'runtime-build'))) {
  files.push(...copyTree(path.join('generated', 'runtime-build')));
}
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const body = {
  schema: 'agent-rules/runtime-assets-manifest/v2',
  package_id: '@initforge/agent-rules',
  generated_by: 'automation/package-runtime-assets.mjs',
  files,
};
body.manifest_sha256 = hash(Buffer.from(JSON.stringify({ ...body, manifest_sha256: undefined })));
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(body, null, 2) + '\n');
console.log(JSON.stringify({ schema: body.schema, files: files.length, manifest_sha256: body.manifest_sha256 }));
