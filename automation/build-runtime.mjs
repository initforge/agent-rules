#!/usr/bin/env node
/**
 * Node-only canonical runtime build. Replaces the PowerShell pipeline:
 * generates per-platform runtime builds (rules, overlays, runtime contract,
 * manifest with sha256 inventory) plus the context graph.
 *
 * Parity contract with the legacy PowerShell build:
 * - resolves per-host home tokens (__CODEX_HOME__/__CLAUDE_HOME__) in BOTH the
 *   generated core imports and the AGENTS body;
 * - preserves the full 9-platform inventory and the opencode manifest
 *   exclusion of runtime-contract.json (contract metadata, not an installed
 *   artifact);
 * - JSON whitespace differences are allowed, but installed behavior/path/hash
 *   inventory must never drift;
 * - the legacy PowerShell script stays in place (not deleted); the canonical
 *   npm pipeline is Node-only.
 *
 * Load policy is read from rules/manifest.yaml via YAML and shared with the
 * context graph builder (both use the same parsed manifest).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(root, 'generated', 'runtime-build');

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function writeNoBom(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { encoding: 'utf8' });
}

function loadManifest() {
  const text = fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8');
  const parsed = YAML.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('rules/manifest.yaml is malformed');
  if (!Array.isArray(parsed.load_order) || parsed.load_order.length === 0) throw new Error('rules/manifest.yaml load_order is missing');
  const contracts = parsed.rule_contracts ?? {};
  if (typeof contracts !== 'object') throw new Error('rules/manifest.yaml rule_contracts is malformed');
  // YAML-aware load policy: load_order gives order, rule_contracts[].trigger
  // gives the load policy. Defaults preserve the historical always-load
  // behavior only for rules listed without a contract.
  const rules = parsed.load_order.map((name, index) => {
    const contract = contracts[name] ?? null;
    const trigger = contract?.trigger ?? 'always-load';
    return { name: String(name), index, trigger: String(trigger), owner: contract?.owner ?? `rules/${name}` };
  });
  for (const rule of rules) {
    if (!/^[\w.-]+\.md$/.test(rule.name)) throw new Error(`manifest load_order has invalid rule name: ${rule.name}`);
    if (!fs.existsSync(path.join(root, 'rules', rule.name))) throw new Error(`manifest load_order references missing rule: ${rule.name}`);
  }
  return { rules, contracts };
}

function buildContextGraph() {
  execFileSync(process.execPath, [path.join(root, 'automation', 'build-context-graph.mjs')], { stdio: 'inherit' });
}

/** Per-host home token resolution (legacy parity: imports AND body). */
function resolveHomeTokens(platform, body, imports) {
  const homeTokens = {
    codex: ' __CODEX_HOME__',
    claude: ' __CLAUDE_HOME__',
  };
  const token = homeTokens[platform]?.trim();
  if (!token) return { body, imports };
  // imports: `@__CODEX_HOME__/rules/…` → `@./rules/…` (legacy ResolvedHome '.')
  const importLines = imports.map((line) => line.replace(token, '.'));
  const resolvedBody = body.replaceAll(token, '.');
  return { body: resolvedBody, imports: importLines };
}

function buildPlatform(platform, contract, manifest) {
  const target = path.join(buildRoot, platform);
  const rulesDir = path.join(target, 'rules');
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  writeNoBom(path.join(target, 'runtime-contract.json'), `${JSON.stringify({
    version: 1,
    platform,
    source: 'platforms/platform-contracts.json',
    contract,
  }, null, 2)}\n`);

  // Host activation body: replace generated core imports with the manifest's
  // load policy — only always-load rules (the compact global core 00/10/20)
  // become @import lines; trigger-scoped rules (30 build/diagnostic, 40
  // repo-local) stay discoverable through the manifest itself. Then resolve
  // per-host home tokens in BOTH imports and body.
  const agentsSource = path.join(root, 'platforms', platform, 'AGENTS.md');
  if (fs.existsSync(agentsSource)) {
    let body = fs.readFileSync(agentsSource, 'utf8');
    const imports = manifest.rules.filter((rule) => rule.trigger === 'always-load').map((rule) => `@./rules/${rule.name}`);
    body = body.replace('@__GENERATED_CORE_IMPORTS__', imports.join('\n'));
    const resolved = resolveHomeTokens(platform, body, imports);
    body = resolved.body;
    body = body.replace('@__GENERATED_CORE_IMPORTS__', resolved.imports.join('\n'));
    body = body.replaceAll('__AGENT_RULES_ROOT__', '.');
    writeNoBom(path.join(target, 'AGENTS.md'), body);
  }

  for (const rule of manifest.rules) {
    // Copy every canonical rule file (including 30/40) so the installed rules
    // tree stays complete for build/diagnostic and repo-local authority.
    fs.copyFileSync(path.join(root, 'rules', rule.name), path.join(rulesDir, rule.name));
  }
  writeNoBom(path.join(rulesDir, 'manifest.yaml'), fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8'));

  const overlay = path.join(root, 'platforms', platform, `${platform}-overlay.md`);
  if (fs.existsSync(overlay)) fs.copyFileSync(overlay, path.join(rulesDir, `${platform}-overlay.md`));

  // Deterministic inventory (Ordinal byte order of the relative path).
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(target);
  let manifestItems = files
    .map((file) => ({ path: path.relative(target, file).split(path.sep).join('/'), sha256: sha256(file) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // opencode parity: runtime-contract.json is contract metadata, not an
  // installed artifact; the installer observes the installed set, so it must
  // be absent from the manifest listing or observed==listed fails closed.
  if (platform === 'opencode') {
    manifestItems = manifestItems.filter((item) => item.path !== 'runtime-contract.json');
  }
  writeNoBom(path.join(target, 'manifest.json'), `${JSON.stringify({
    version: 1,
    platform,
    generated_from: { core: 'rules', overlays: `platforms/${platform}` },
    files: manifestItems,
  }, null, 2)}\n`);
}

const manifestText = fs.readFileSync(path.join(root, 'rules', 'manifest.yaml'), 'utf8');
const manifest = loadManifest();
const platformContracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms', 'platform-contracts.json'), 'utf8'));
const platforms = Object.keys(platformContracts.native_contracts ?? {});
if (platforms.length === 0) throw new Error('platforms/platform-contracts.json exposes no native contracts');

fs.rmSync(buildRoot, { recursive: true, force: true });
buildContextGraph();
for (const platform of platforms) buildPlatform(platform, platformContracts.native_contracts[platform], manifest);

// Sanity: manifest text round-trips through the same YAML parser the graph
// builder uses, so the regex-based legacy loader can never disagree with the
// YAML-aware policy above.
const legacyNames = [...manifestText.matchAll(/^\s+-\s+(\S+\.md)\s*$/gm)].map((m) => m[1]);
for (const name of legacyNames) {
  if (!manifest.rules.some((rule) => rule.name === name)) throw new Error(`manifest drift: ${name} is in load_order but missing from parsed rules`);
}

console.log(`Runtime builds created: ${buildRoot} (${platforms.length} platforms, ${manifest.rules.length} rules)`);
