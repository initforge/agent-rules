#!/usr/bin/env node
/**
 * build-context-graph.mjs — generate generated/context-graph.json from the
 * canonical rules/ + skills/ sources (REQ-109: catalog and host projections are
 * generated, never hand-edited; SKILL.md is the single routing authority).
 *
 * This is the non-CLI pipeline entry used by 01-build-runtime.ps1 (the public
 * CLI is a strict 8-command surface and does not expose `context-graph`).
 *
 * Usage: node automation/build-context-graph.mjs [output-path]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const output = process.argv[2] ?? path.join(root, 'generated', 'context-graph.json');

// Prefer the compiled dist (built by `npm run build`), fall back to a tsx runner.
const dist = path.join(root, 'packages', 'cli', 'dist', 'services', 'context-graph.js');
if (!fs.existsSync(dist)) {
  console.error(`build-context-graph: compiled context-graph service missing (${dist}); run npm run build first`);
  process.exit(2);
}
const service = await import(pathToFileURL(dist).href);
if (typeof service.buildContextGraph !== 'function') {
  console.error('build-context-graph: buildContextGraph export missing in compiled service');
  process.exit(2);
}
const graph = service.buildContextGraph(root);
const payload = `${JSON.stringify(graph, null, 2)}\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, payload, 'utf8');
console.log(`Context graph written to ${output} (v${graph.version ?? '?'}, ${graph.nodes?.length ?? 0} nodes)`);
process.exit(0);