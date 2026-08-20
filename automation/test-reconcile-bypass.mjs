#!/usr/bin/env node
/**
 * test-reconcile-bypass.mjs — regression: direct provider configs that
 * bypass mcp-guardian must be detected (and rejected) by the reconcile scan.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { scanMcpBypass } = await import(pathToFileURL(path.join(ROOT, 'automation', 'reconcile-opencode-mcp.mjs')).href);

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) { failures += 1; console.error(`FAIL: ${name} — ${detail}`); }
  else console.log(`PASS: ${name}`);
};

// 1. Current repo must not contain a direct bypass.
check('repo has no direct bypass', scanMcpBypass().length === 0, JSON.stringify(scanMcpBypass().slice(0, 3)));

// 2. A project config with a direct provider entry must be detected.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bypass-'));
fs.writeFileSync(path.join(tmp, 'opencode.json'), JSON.stringify({
  mcp: {
    playwright: { type: 'stdio', command: ['npx', '-y', '@playwright/mcp@0.0.78'] },
    'chrome-devtools': { type: 'stdio', command: ['npx', '-y', 'chrome-devtools-mcp@1.7.0'] },
  },
}, null, 2));
const bypasses = scanMcpBypass(tmp);
check('direct provider entries detected as bypass', bypasses.length === 2, JSON.stringify(bypasses));
check('playwright bypass identified', bypasses.some((b) => b.key === 'playwright'), 'missing playwright entry');
check('devtools bypass identified', bypasses.some((b) => b.key === 'chrome-devtools'), 'missing chrome-devtools entry');

// 3. A guardian-wrapped config must NOT be flagged.
const wrapped = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-wrapped-'));
fs.writeFileSync(path.join(wrapped, 'opencode.json'), JSON.stringify({
  mcp: {
    playwright: { type: 'stdio', command: ['node', '/path/to/mcp-guardian.mjs', 'npx', '@playwright/mcp@0.0.78'] },
  },
}, null, 2));
check('guardian-wrapped entry not flagged', scanMcpBypass(wrapped).length === 0, JSON.stringify(scanMcpBypass(wrapped)));

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(wrapped, { recursive: true, force: true });
if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('PASS: reconcile bypass scan regression');
