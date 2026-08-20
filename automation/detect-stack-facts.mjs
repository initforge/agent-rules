#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const registryPath = path.join(here, 'stack-detectors.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const detectorIds = new Set(registry.detectors.map((detector) => detector.id));
const SKIP_DIRS = new Set(['.git', '.agent', 'node_modules', 'dist', 'build', 'coverage', 'generated']);
const SKIP_PREFIXES = ['profiles/5fedu/reference-source/'];
const EXTENSIONS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.js', 'javascript'], ['.jsx', 'javascript'],
  ['.py', 'python'], ['.go', 'go'], ['.rs', 'rust'], ['.java', 'java'], ['.kt', 'kotlin'],
  ['.rb', 'ruby'], ['.php', 'php'],
]);

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function readRegular(workspace, relative) {
  const target = path.resolve(workspace, relative);
  const boundary = path.resolve(workspace) + path.sep;
  if (!target.startsWith(boundary) || !fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  return { path: relative.split(path.sep).join('/'), bytes: fs.readFileSync(target) };
}
function source(workspace, relative) {
  const item = readRegular(workspace, relative);
  return item ? { path: item.path, sha256: sha256(item.bytes) } : null;
}
function addFact(facts, workspace, factId, value, detectorId, confidence, sources, notes = []) {
  if (!detectorIds.has(detectorId)) throw new Error(`unknown detector ${detectorId}`);
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return;
  const normalized = Array.isArray(value) ? [...new Set(value.map(String))].sort() : String(value);
  const key = `${factId}:${JSON.stringify(normalized)}`;
  if (facts.some((fact) => `${fact.fact_id}:${JSON.stringify(fact.value)}` === key)) return;
  facts.push({ fact_id: factId, value: normalized, detector_id: detectorId, confidence, status: 'observed', sources: sources.filter(Boolean), ...(notes.length ? { notes } : {}) });
}
function packageData(workspace) {
  const item = readRegular(workspace, 'package.json');
  if (!item) return null;
  try { return { data: JSON.parse(item.bytes.toString('utf8')), source: { path: item.path, sha256: sha256(item.bytes) } }; }
  catch { return { data: null, source: { path: item.path, sha256: sha256(item.bytes) } }; }
}

function workspaceManifestPaths(workspace, manifest) {
  const raw = manifest?.data?.workspaces;
  const patterns = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray(raw.packages) ? raw.packages : [];
  const paths = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern.trim()) continue;
    const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (normalized.includes('*')) {
      const star = normalized.indexOf('*');
      const parent = normalized.slice(0, star).replace(/\/$/, '') || '.';
      const dir = path.resolve(workspace, parent);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const candidate = path.join(parent, entry.name, 'package.json').split(path.sep).join('/');
        if (readRegular(workspace, candidate)) paths.push(candidate);
      }
    } else {
      const candidate = path.join(normalized, 'package.json').split(path.sep).join('/');
      if (readRegular(workspace, candidate)) paths.push(candidate);
    }
  }
  return [...new Set(paths)].sort();
}

function readPackageAt(workspace, relative) {
  const item = readRegular(workspace, relative);
  if (!item) return null;
  try { return { data: JSON.parse(item.bytes.toString('utf8')), source: { path: item.path, sha256: sha256(item.bytes) } }; }
  catch { return { data: null, source: { path: item.path, sha256: sha256(item.bytes) } }; }
}
function walk(workspace, current = '', output = [], depth = 0) {
  if (depth > 8 || output.length >= 10000) return output;
  const dir = path.resolve(workspace, current);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || (entry.isDirectory() && SKIP_DIRS.has(entry.name))) continue;
    const relative = path.join(current, entry.name);
    if (SKIP_PREFIXES.some((prefix) => relative.split(path.sep).join('/').startsWith(prefix))) continue;
    if (entry.isDirectory()) walk(workspace, relative, output, depth + 1);
    else if (entry.isFile()) output.push(relative.split(path.sep).join('/'));
  }
  return output;
}

export function detectStackFacts(workspace) {
  const workspaceRoot = path.resolve(workspace);
  const facts = [];
  const files = walk(workspaceRoot);
  const hierarchy = { root: '.', package_scopes: [], source_scopes: [], test_scopes: [] };
  const manifest = packageData(workspaceRoot);
  const packageSource = manifest?.source ? [manifest.source] : [];
  if (manifest?.data && typeof manifest.data === 'object') {
    addFact(facts, workspaceRoot, 'runtime.node', 'node', 'package-manifest', 1, packageSource);
    const deps = { ...(manifest.data.dependencies || {}), ...(manifest.data.devDependencies || {}), ...(manifest.data.peerDependencies || {}) };
    const frameworks = [
      ['next', 'next'], ['react', 'react'], ['vue', 'vue'], ['@angular/core', 'angular'], ['@nestjs/core', 'nestjs'],
      ['expo', 'expo'], ['react-native', 'react-native'], ['prisma', 'prisma'], ['@prisma/client', 'prisma'],
      ['drizzle-orm', 'drizzle'], ['@supabase/supabase-js', 'supabase'],
    ].filter(([name]) => Object.prototype.hasOwnProperty.call(deps, name)).map(([, value]) => value);
    addFact(facts, workspaceRoot, 'framework', frameworks, 'package-manifest', 1, packageSource);
    const testRunners = ['vitest', 'jest', '@playwright/test', 'playwright', 'cypress', 'mocha']
      .filter((name) => Object.prototype.hasOwnProperty.call(deps, name))
      .map((name) => name === '@playwright/test' ? 'playwright' : name);
    addFact(facts, workspaceRoot, 'test.runner', testRunners, 'package-manifest', 1, packageSource);
    const lock = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb'].find((candidate) => files.includes(candidate));
    const packageManager = lock === 'pnpm-lock.yaml' ? 'pnpm' : lock === 'yarn.lock' ? 'yarn' : lock === 'bun.lockb' ? 'bun' : lock === 'package-lock.json' ? 'npm' : 'unknown';
    addFact(facts, workspaceRoot, 'package.manager', packageManager, 'package-manifest', lock ? 1 : 0.6, [...packageSource, lock ? source(workspaceRoot, lock) : null].filter(Boolean));
    if (Object.prototype.hasOwnProperty.call(deps, 'expo') || Object.prototype.hasOwnProperty.call(deps, 'react-native')) {
      addFact(facts, workspaceRoot, 'platform.mobile', 'mobile', 'mobile-manifest', 1, packageSource);
      addFact(facts, workspaceRoot, 'framework.mobile', Object.prototype.hasOwnProperty.call(deps, 'expo') ? 'expo' : 'react-native', 'mobile-manifest', 1, packageSource);
    }
    if (Object.prototype.hasOwnProperty.call(deps, 'prisma') || Object.prototype.hasOwnProperty.call(deps, '@prisma/client')) addFact(facts, workspaceRoot, 'database.tool', 'prisma', 'database-schema', 0.9, packageSource);
    if (Object.prototype.hasOwnProperty.call(deps, 'drizzle-orm')) addFact(facts, workspaceRoot, 'database.tool', 'drizzle', 'database-schema', 0.9, packageSource);
    if (Object.prototype.hasOwnProperty.call(deps, '@supabase/supabase-js')) addFact(facts, workspaceRoot, 'database.tool', 'supabase', 'database-schema', 0.9, packageSource);

    const workspacePackages = workspaceManifestPaths(workspaceRoot, manifest)
      .map((relative) => ({ relative, package: readPackageAt(workspaceRoot, relative) }))
      .filter((entry) => entry.package);
    if (workspacePackages.length) {
      hierarchy.package_scopes = workspacePackages.map((entry) => entry.relative.replace(/\/package\.json$/, '')).sort();
      addFact(facts, workspaceRoot, 'workspace.package', workspacePackages.map((entry) => entry.relative.replace(/\/package\.json$/, '')), 'package-manifest', 1, workspacePackages.map((entry) => entry.package?.source).filter(Boolean));
      const workspaceFrameworks = [];
      const workspaceTestRunners = [];
      for (const entry of workspacePackages) {
        const child = entry.package?.data;
        if (!child || typeof child !== 'object') continue;
        const childDeps = { ...(child.dependencies || {}), ...(child.devDependencies || {}), ...(child.peerDependencies || {}) };
        for (const [name, value] of [['next', 'next'], ['react', 'react'], ['vue', 'vue'], ['@angular/core', 'angular'], ['@nestjs/core', 'nestjs'], ['expo', 'expo'], ['react-native', 'react-native'], ['prisma', 'prisma'], ['@prisma/client', 'prisma'], ['drizzle-orm', 'drizzle'], ['@supabase/supabase-js', 'supabase']]) {
          if (Object.prototype.hasOwnProperty.call(childDeps, name)) workspaceFrameworks.push(value);
        }
        for (const name of ['vitest', 'jest', '@playwright/test', 'playwright', 'cypress', 'mocha']) {
          if (Object.prototype.hasOwnProperty.call(childDeps, name)) workspaceTestRunners.push(name === '@playwright/test' ? 'playwright' : name);
        }
      }
      addFact(facts, workspaceRoot, 'framework', workspaceFrameworks, 'package-manifest', 1, workspacePackages.map((entry) => entry.package?.source).filter(Boolean));
      addFact(facts, workspaceRoot, 'test.runner', workspaceTestRunners, 'package-manifest', 1, workspacePackages.map((entry) => entry.package?.source).filter(Boolean));
    }
  }
  const byLanguage = new Map();
  for (const file of files) {
    const language = EXTENSIONS.get(path.extname(file).toLowerCase());
    if (language) byLanguage.set(language, (byLanguage.get(language) || []).concat(file));
  }
  for (const [language, paths] of [...byLanguage.entries()].sort()) addFact(facts, workspaceRoot, 'language', language, 'language-files', 0.95, paths.slice(0, 20).map((file) => source(workspaceRoot, file)).filter(Boolean));
  hierarchy.source_scopes = [...new Set(files.filter((file) => /^(src|packages)\//.test(file)).map((file) => file.split('/')[0]))].sort();
  hierarchy.test_scopes = [...new Set(files.filter((file) => /(^|\/)(test|tests|__tests__)\//.test(file)).map((file) => file.split('/').slice(0, 2).join('/')))].sort();
  const terraform = files.filter((file) => file.endsWith('.tf') || file.endsWith('.tfvars'));
  if (terraform.length) addFact(facts, workspaceRoot, 'infra.terraform', 'terraform', 'terraform', 1, terraform.map((file) => source(workspaceRoot, file)).filter(Boolean));
  const containers = files.filter((file) => ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'].includes(path.basename(file)));
  if (containers.length) addFact(facts, workspaceRoot, 'infra.container', 'container', 'container', 1, containers.map((file) => source(workspaceRoot, file)).filter(Boolean));
  const prismaSchema = source(workspaceRoot, 'prisma/schema.prisma');
  const drizzleConfig = source(workspaceRoot, 'drizzle.config.ts');
  const supabaseConfig = source(workspaceRoot, 'supabase/config.toml');
  const dbSources = [prismaSchema, drizzleConfig, supabaseConfig].filter(Boolean);
  if (dbSources.length) addFact(facts, workspaceRoot, 'database.schema', dbSources.map((item) => item.path.includes('prisma') ? 'prisma' : item.path.includes('drizzle') ? 'drizzle' : 'supabase'), 'database-schema', 1, dbSources);
  const ci = files.filter((file) => file.startsWith('.github/workflows/') || ['.gitlab-ci.yml', 'azure-pipelines.yml', '.circleci/config.yml'].includes(file));
  if (ci.length) addFact(facts, workspaceRoot, 'ci.provider', ci.map((file) => file.startsWith('.github/') ? 'github-actions' : file.startsWith('.circleci/') ? 'circleci' : file.startsWith('.gitlab') ? 'gitlab' : 'azure-pipelines'), 'ci-config', 1, ci.map((file) => source(workspaceRoot, file)).filter(Boolean));
  return { schema: 'harness/repo-facts/v1', version: 1, workspace_root: workspaceRoot, hierarchy, facts: facts.sort((a, b) => a.fact_id.localeCompare(b.fact_id) || JSON.stringify(a.value).localeCompare(JSON.stringify(b.value))) };
}

function selfTest() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-facts-'));
  try {
    fs.mkdirSync(path.join(fixture, 'prisma'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'packages', 'web'), { recursive: true });
    fs.mkdirSync(path.join(fixture, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ workspaces: ['packages/*'], dependencies: { expo: '^1', react: '^1', '@prisma/client': '^1' } }));
    fs.writeFileSync(path.join(fixture, 'packages', 'web', 'package.json'), JSON.stringify({ name: '@fixture/web', devDependencies: { vitest: '^1' } }));
    fs.writeFileSync(path.join(fixture, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(fixture, 'App.tsx'), 'export default null;\n');
    fs.writeFileSync(path.join(fixture, 'prisma', 'schema.prisma'), 'datasource db {}\n');
    fs.writeFileSync(path.join(fixture, 'Dockerfile'), 'FROM node\n');
    fs.writeFileSync(path.join(fixture, 'main.tf'), 'resource "x" "y" {}\n');
    fs.writeFileSync(path.join(fixture, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
    const result = detectStackFacts(fixture);
    const values = new Set(result.facts.map((fact) => `${fact.fact_id}:${Array.isArray(fact.value) ? fact.value.join(',') : fact.value}`));
    for (const expected of ['runtime.node:node', 'platform.mobile:mobile', 'framework.mobile:expo', 'test.runner:vitest', 'workspace.package:packages/web', 'infra.container:container', 'infra.terraform:terraform', 'ci.provider:github-actions']) if (!values.has(expected)) throw new Error(`missing self-test fact ${expected}`);
    if (result.facts.some((fact) => fact.fact_id.startsWith('domain'))) throw new Error('detector must not infer business domain');
    if (!result.hierarchy || !Array.isArray(result.hierarchy.package_scopes)) throw new Error('missing hierarchical RepoFacts');
    console.log(JSON.stringify({ status: 'PASS', detectors: registry.detectors.length, facts: result.facts.length }));
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const index = process.argv.indexOf('--root');
  const workspace = index >= 0 ? path.resolve(process.argv[index + 1]) : process.cwd();
  process.stdout.write(`${JSON.stringify(detectStackFacts(workspace), null, 2)}\n`);
}
