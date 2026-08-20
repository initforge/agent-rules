#!/usr/bin/env node
/**
 * mcp-no-bypass-audit.mjs — static audit (R-018, post-broker-removal).
 *
 * The MCP broker package (SQLite/lease/HTTP/X11) has been removed; the
 * canonical path is: host native MCP -> pinned provider command -> stdio.
 * GUI providers (playwright/chrome-devtools) are guardian-wrapped by
 * `packages/kernel/src/runner/mcp-config.ts` at materialization time.
 *
 * This audit verifies:
 *  1. Registry stays the only source of provider commands: no generated
 *     host config calls a raw provider binary directly with a hand-edited
 *     command (generated/ is machine-owned; registry is the origin).
 *  2. No @latest or floating versions anywhere in registry-driven outputs.
 *  3. No secrets (tokens / API keys in plaintext) in projections/receipts.
 *  4. No shared-HTTP default: the registry must NOT carry a default
 *     httpEndpoint for any provider (shared HTTP is explicit opt-in only).
 *  5. The kernel guardian materialization does not contain allowUnbound=true
 *     or a guardian-disable path in production code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. Registry is the only provider source: generated host configs must not
//    embed a raw provider command that differs from the registry pin.
const generated = walk(path.join(ROOT, 'generated')).filter((p) => /\.(json|toml|yaml|yml)$/.test(p));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrations', 'registry.json'), 'utf8'));
const providerBins = new Map();
for (const i of registry.integrations) {
  if (i.kind === 'mcp' || i.kind === 'cli-tool') {
    providerBins.set(i.id, {
      commandName: i.source?.commandName,
      package: i.source?.package,
      version: i.source?.version,
    });
  }
}
for (const f of generated) {
  const text = fs.readFileSync(f, 'utf8');
  for (const [id, info] of providerBins) {
    if (!info.commandName && !info.package) continue;
    const names = [info.commandName, info.package].filter(Boolean);
    for (const name of names) {
      // A generated config may only reference the provider via its registry
      // pin (package@version or command name); never an unversioned raw name.
      if (new RegExp(`["'\\s]${name}(?:@[^"'\\s]+)?["']`, 'm').test(text)) {
        const pinned = new RegExp(`(?:${name})@${info.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(text);
        const isWindowsExe = name.endsWith('.exe');
        if (!pinned && !isWindowsExe) {
          errors.push(`${path.relative(ROOT, f)}: provider "${name}" (${id}) referenced without its registry pin @${info.version}`);
        }
      }
    }
  }
}

// 2. No @latest or floating versions in the registry itself.
for (const i of registry.integrations) {
  const v = i.source?.version;
  if (v === 'latest' || v === '*' || !v || (i.source?.versionPolicy !== 'pinned' && !/^\d+\.\d+\.\d+/.test(v ?? ''))) {
    errors.push(`integrations/registry.json ${i.id}: version "${v}" is not pinned`);
  }
}

// 3. No secrets in projections / receipts / skills.
const scanDirs = [
  path.join(ROOT, 'generated'),
  path.join(ROOT, '.agent', 'tmp', 'certify'),
  path.join(ROOT, '.agent', 'tmp', 'host-receipts'),
  path.join(ROOT, 'packages', 'kernel', 'src'),
  path.join(ROOT, 'packages', 'kernel', 'test'),
];
for (const dir of scanDirs) {
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

// 4. No shared-HTTP default: registry must not define a default httpEndpoint.
for (const i of registry.integrations) {
  if (i.httpEndpoint) {
    errors.push(`integrations/registry.json ${i.id}: default httpEndpoint "${i.httpEndpoint}" — shared HTTP must be explicit opt-in, never a default`);
  }
}

// 5. Kernel guardian materialization: no allowUnbound=true or guardian
//    disable path in production code (test fixtures may use it for
//    headless legacy opt-out; production paths must not).
const kernelRunner = path.join(ROOT, 'packages', 'kernel', 'src', 'runner');
for (const f of walk(kernelRunner)) {
  const text = fs.readFileSync(f, 'utf8');
  if (/allowUnbound\s*[:=]\s*true/.test(text)) {
    errors.push(`${path.relative(ROOT, f)}: allowUnbound=true present in production source`);
  }
  if (/guardian_disable\s*[:=]\s*true|disableGuardian\s*\(/.test(text)) {
    errors.push(`${path.relative(ROOT, f)}: guardian disable path present in production source`);
  }
}

if (errors.length > 0) {
  console.error(`mcp-no-bypass-audit: FAIL (${errors.length})`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
for (const w of warnings) console.warn('WARN ' + w);
console.log(`mcp-no-bypass-audit: OK (registry is the only provider source; ${generated.length} generated files scanned; no default httpEndpoint, no @latest, no plaintext secrets, no production allowUnbound)`);
process.exit(0);
