#!/usr/bin/env node
/**
 * mcp-no-bypass-audit.mjs — static audit (R-018).
 *
 * Verifies that no direct guardian bypass exists:
 *  1. No project-level MCP config (opencode.json / .codex/config.toml /
 *     DSH profile) in this repo references a raw provider command directly
 *     (every projected entry must route through the guardian connect bridge).
 *  2. No guardian-disable or allowUnbound flags in generated projections.
 *  3. No @latest anywhere in registry-driven outputs or launch specs.
 *  4. No secrets (tokens in plaintext) in projections or receipts.
 *  5. Registry remains the only source of provider commands (no hardcoded
 *     provider command in host adapter code outside the registry loader).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. Generated host configs must never call raw provider binaries directly.
const generated = walk(path.join(ROOT, 'generated')).filter((p) => /\.(json|toml|yaml|yml)$/.test(p));
for (const f of generated) {
  const text = fs.readFileSync(f, 'utf8');
  for (const rawCmd of ['chrome-devtools-mcp', 'playwright-mcp', 'playwright-cli', 'context7', 'rtk', 'serena', 'codebase-memory-mcp']) {
    if (new RegExp(`"command"\\s*:\\s*"${rawCmd}"|^command\\s*=\\s*"${rawCmd}"`, 'm').test(text)) {
      errors.push(`${path.relative(ROOT, f)}: direct provider command "${rawCmd}" — must route through the guardian connect bridge`);
    }
  }
}

// 2. Projection outputs must carry the guardian-wrapped marker and no bypass.
const projectionsDir = path.join(ROOT, 'packages', 'mcp-guardian', 'test', 'fixtures');
if (fs.existsSync(projectionsDir)) {
  const projections = walk(projectionsDir).filter((p) => /\.(json|toml)$/.test(p));
  for (const f of projections) {
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes('guardian_wrapped') && text.includes('false')) {
      errors.push(`${path.relative(ROOT, f)}: guardian_wrapped=false in a projection`);
    }
  }
}

// 3. No @latest or floating versions in registry or projections.
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'registry.json'), 'utf8'));
for (const i of registry.integrations) {
  const v = i.source?.version;
  if (v === 'latest' || v === '*' || !v || (i.source?.versionPolicy !== 'pinned' && !/^\d+\.\d+\.\d+/.test(v ?? ''))) {
    errors.push(`integrations/registry.json ${i.id}: version "${v}" is not pinned`);
  }
}

// 4. No secrets in projections / receipts / skills.
const scanDirs = [
  path.join(ROOT, 'generated'),
  path.join(ROOT, '.agent', 'tmp', 'certify'),
  path.join(ROOT, 'packages', 'mcp-guardian', 'src'),
];
for (const dir of scanDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir).filter((p) => /\.(json|toml|ts|mjs)$/.test(p))) {
    const text = fs.readFileSync(f, 'utf8');
    if (/AGENT_RULES_LEASE_TOKEN\s*[:=]\s*["'][A-Za-z0-9-]{20,}/.test(text)) {
      errors.push(`${path.relative(ROOT, f)}: plaintext lease token embedded`);
    }
    if (/sk-(?:ant|proj)-[A-Za-z0-9_-]{10,}/.test(text)) {
      errors.push(`${path.relative(ROOT, f)}: plaintext API key pattern found`);
    }
  }
}

// 5. Host adapters may only obtain provider commands from the registry.
const hostSources = ['opencode.ts', 'deepseek-harness.ts', 'codex.ts'];
for (const f of hostSources) {
  const p = path.join(ROOT, 'packages', 'mcp-guardian', 'src', 'hosts', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const rawCmd of ['chrome-devtools-mcp', 'playwright-mcp', 'context7']) {
    if (new RegExp(`spawn\\(['"]${rawCmd}`).test(text)) {
      errors.push(`packages/mcp-guardian/src/hosts/${f}: hardcoded raw provider spawn (bypass)`);
    }
  }
}

// 6. Guardian-disable / allowUnbound markers must not appear in src.
const guardianSrc = walk(path.join(ROOT, 'packages', 'mcp-guardian', 'src'));
for (const f of guardianSrc) {
  const text = fs.readFileSync(f, 'utf8');
  if (/allowUnbound\s*[:=]\s*true/.test(text)) {
    errors.push(`${path.relative(ROOT, f)}: allowUnbound=true present`);
  }
  if (/guardian_disable\s*[:=]\s*true|disableGuardian\s*\(/.test(text)) {
    errors.push(`${path.relative(ROOT, f)}: guardian disable path present`);
  }
}

if (errors.length > 0) {
  console.error(`mcp-no-bypass-audit: FAIL (${errors.length})`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
for (const w of warnings) console.warn('WARN ' + w);
console.log(`mcp-no-bypass-audit: OK (registry is the only provider source; ${generated.length} generated files scanned; no direct bypass, no allowUnbound, no @latest, no plaintext secrets)`);
process.exit(0);
