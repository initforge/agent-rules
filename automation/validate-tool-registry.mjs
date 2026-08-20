#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const registryPath = path.resolve(process.argv[3] || path.join(root, 'integrations', 'registry.json'));
const fail = (m) => { throw new Error(`registry: ${m}`); };
const exists = (p) => fs.existsSync(path.resolve(root, p));

let registry;
try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (e) { fail(`invalid or missing JSON ${registryPath}: ${e.message}`); }
const version = Number(registry.version);
if (![1, 2].includes(version)) fail(`expected version 1 or 2, got ${registry.version}`);
if (!Array.isArray(registry.integrations) || registry.integrations.length === 0) fail('integrations must be a non-empty array');
if (version >= 2 && (!registry.effect_schema || !exists(registry.effect_schema))) fail('v2 registry must bind an existing effect_schema');

const REQUIRED_V1 = ['name','policy','path','triggerClasses','capabilityClass','sideEffects','tokenClass','nativeHosts','fallback','proofStatus'];
const REQUIRED_V2 = ['id','displayName','kind','policy','profiles','source','integrity','trust','capabilities','triggers','sideEffects','tokenClass','permissions','install','nativeHosts','fallback','deprecatedAliases','effect'];
const POLICIES = new Set(['required','recommended','optional']);
const KINDS = new Set(['mcp','tool','adapter','native','cli-tool']);
const TOKEN_CLASSES = new Set(['low','medium','high']);
const TRUST = new Set(['advisory-only','declared','adapter-verified','native-live']);
const SOURCE_TYPES = new Set(['github','npm','git','local','rust-cargo']);
const INSTALL_TYPES = new Set(['binary','npm-global','npm-npx','npx-github','git','local','shell','cargo']);
const EFFECT_LEVELS = new Set(['read-only','interactive','write','destructive']);
const EFFECT_ENVIRONMENTS = new Set(['local','browser','network','host']);
const EFFECT_APPROVALS = new Set(['policy','task-scope','explicit-provider','owner']);
const EFFECT_CREDENTIALS = new Set(['none','optional','required']);
const EFFECT_EVIDENCE = new Set(['static-only','health-probe','live-receipt']);

const contracts = JSON.parse(fs.readFileSync(path.join(root, 'platforms', 'platform-contracts.json'), 'utf8'));
const hosts = new Set(Object.keys(contracts.platforms || {}));
const ids = new Set();
const identifiers = new Set();

for (const tool of registry.integrations) {
  const v2 = Object.prototype.hasOwnProperty.call(tool, 'id');
  for (const field of (v2 ? REQUIRED_V2 : REQUIRED_V1)) if (!Object.prototype.hasOwnProperty.call(tool, field)) fail(`integration missing '${field}'`);
  const id = v2 ? tool.id : tool.name;
  const policy = tool.policy;
  const proof = v2 ? tool.trust : tool.proofStatus;
  const triggers = v2 ? tool.triggers : tool.triggerClasses;
  const nativeHosts = tool.nativeHosts || [];
  const aliases = v2 ? (tool.deprecatedAliases || []) : [];
  if (!id || typeof id !== 'string') fail('integration id/name must be a non-empty string');
  if (ids.has(id)) fail(`duplicate id '${id}'`);
  ids.add(id);
  if (identifiers.has(id)) fail(`id '${id}' conflicts with existing alias`);
  identifiers.add(id);
  for (const alias of aliases) {
    if (!alias) continue;
    if (identifiers.has(alias)) fail(`alias '${alias}' of '${id}' conflicts with existing id/alias`);
    identifiers.add(alias);
  }
  if (!POLICIES.has(policy)) fail(`${id} has invalid policy '${policy}'`);
  if (!TOKEN_CLASSES.has(tool.tokenClass)) fail(`${id} has invalid tokenClass '${tool.tokenClass}'`);
  if (!TRUST.has(proof)) fail(`${id} has invalid trust '${proof}'`);
  if (!Array.isArray(triggers) || triggers.length === 0) fail(`${id} needs triggers`);
  if (v2 && !KINDS.has(tool.kind)) fail(`${id} has invalid kind '${tool.kind}'`);
  if (v2) {
    const effect = tool.effect;
    if (!effect || typeof effect !== 'object') fail(`${id} needs effect contract`);
    if (!EFFECT_LEVELS.has(effect.effect_level)) fail(`${id} has invalid effect.effect_level`);
    if (!EFFECT_ENVIRONMENTS.has(effect.environment)) fail(`${id} has invalid effect.environment`);
    if (!EFFECT_APPROVALS.has(effect.approval)) fail(`${id} has invalid effect.approval`);
    if (typeof effect.reversible !== 'boolean' || typeof effect.network !== 'boolean') fail(`${id} effect reversible/network must be boolean`);
    if (!EFFECT_CREDENTIALS.has(effect.credentials)) fail(`${id} has invalid effect.credentials`);
    if (!Number.isInteger(effect.timeout_ms) || effect.timeout_ms < 1) fail(`${id} effect.timeout_ms must be a positive integer`);
    if (!EFFECT_EVIDENCE.has(effect.provider_evidence)) fail(`${id} has invalid effect.provider_evidence`);
    if (effect.effect_level === 'destructive' && effect.approval !== 'owner') fail(`${id} destructive effect requires owner approval`);
    if (effect.effect_level === 'read-only' && effect.reversible !== true) fail(`${id} read-only effect must be reversible`);
  }
  if (v2 && tool.source && !SOURCE_TYPES.has(tool.source.type)) fail(`${id} has invalid source type '${tool.source.type}'`);
  if (v2 && tool.install) {
    if (!INSTALL_TYPES.has(tool.install.type)) fail(`${id} has invalid install type '${tool.install.type}'`);
    if (!tool.install.script || !exists(tool.install.script)) fail(`${id} install script missing: ${tool.install.script}`);
  }
  if (v2 && tool.health) {
    if (!tool.health.command) fail(`${id} needs health.command`);
    if (!Array.isArray(tool.health.expectedExitCodes) || tool.health.expectedExitCodes.length === 0) fail(`${id} needs health.expectedExitCodes`);
  }
  if (v2 && tool.schema?.source && !exists(tool.schema.source)) fail(`${id} schema.source path missing: ${tool.schema.source}`);
  for (const host of nativeHosts) if (!hosts.has(host)) fail(`${id} has invalid native host '${host}'`);
  if (!v2 && !exists(tool.path)) fail(`${id} path is missing: ${tool.path}`);
  if (proof === 'native-live' && nativeHosts.length === 0) fail(`${id} cannot be native-live without a native host`);
  if (proof === 'adapter-verified') {
    for (const host of nativeHosts) {
      const extension = host === 'codex' ? 'toml' : 'json';
      let base = tool.path || null;
      if (!base && tool.install?.script) base = path.dirname(tool.install.script);
      if (base && !exists(path.join(base, 'adapters', `${host}.${extension}`))) fail(`${id} lacks ${host} adapter required by adapter-verified proof`);
    }
  }
}

// Manual providers are outside the automatic registry, but they still carry
// the same effect boundary so explicit selection cannot hide an untyped effect.
const manualRoot = path.join(root, 'integrations', 'manual');
if (fs.existsSync(manualRoot)) {
  for (const entry of fs.readdirSync(manualRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(manualRoot, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.effect) fail(`manual provider ${manifest.id || entry.name} needs effect contract`);
    const effect = manifest.effect;
    if (!EFFECT_LEVELS.has(effect.effect_level) || !EFFECT_ENVIRONMENTS.has(effect.environment) || !EFFECT_APPROVALS.has(effect.approval) || !EFFECT_CREDENTIALS.has(effect.credentials) || !EFFECT_EVIDENCE.has(effect.provider_evidence)) fail(`manual provider ${manifest.id || entry.name} has invalid effect enum`);
    if (typeof effect.reversible !== 'boolean' || typeof effect.network !== 'boolean' || !Number.isInteger(effect.timeout_ms) || effect.timeout_ms < 1) fail(`manual provider ${manifest.id || entry.name} has invalid effect scalar`);
  }
}

if (version >= 2 && registry.profiles && typeof registry.profiles === 'object') {
  for (const [name, profile] of Object.entries(registry.profiles)) {
    for (const bucket of ['required','recommended']) {
      for (const ref of profile?.[bucket] || []) if (ref && !ids.has(ref)) fail(`profile '${name}' references unknown integration '${ref}' in ${bucket}`);
    }
  }
}
console.log(`PASS: tool registry v${version} (${registry.integrations.length} integrations, ${identifiers.size} total identifiers)`);
