#!/usr/bin/env node
/**
 * copy-mcp-guardian.mjs — copy the focus-safe MCP guardian next to the
 * compiled kernel so `mcpGuardianPath()` resolves it via import.meta.url.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'packages', 'kernel', 'src', 'runner', 'mcp-guardian.mjs');
const targetDir = path.join(ROOT, 'packages', 'kernel', 'dist', 'runner');
const target = path.join(targetDir, 'mcp-guardian.mjs');

if (!fs.existsSync(source)) {
  console.error(`copy-mcp-guardian: source missing ${source}`);
  process.exit(1);
}
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`mcp-guardian copied -> ${path.relative(ROOT, target)}`);
