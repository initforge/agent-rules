import fs from 'node:fs';
import path from 'node:path';

export interface RepositoryFacts {
  readonly manifests: readonly string[];
  readonly packages: readonly string[];
  readonly frameworks: readonly string[];
  readonly schemas: readonly string[];
  readonly changed_files: readonly string[];
}

const manifestNames = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'composer.json'] as const;
const schemaNames = ['prisma/schema.prisma', 'supabase/config.toml', 'drizzle.config.ts', 'drizzle.config.js'] as const;
const frameworkNames = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'vite.config.ts', 'vite.config.js', 'expo-env.d.ts', 'app.json'] as const;
const ignoredWorkspaceDirectories = new Set(['.git', 'node_modules', 'generated', 'dist', 'build', 'coverage']);
const maxWorkspaceManifests = 128;

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  workspaces?: string[] | { packages?: string[] };
}

function safeRelative(root: string, candidate: string): string | null {
  const resolved = path.resolve(root, candidate);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? relativePath(root, resolved) : null;
}

function relativePath(root: string, candidate: string): string {
  return path.relative(root, candidate).replace(/\\/g, '/');
}

function readPackageManifest(file: string): PackageManifest | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageManifest; } catch { return null; }
}

function workspacePatterns(manifest: PackageManifest | null): readonly string[] {
  if (!manifest?.workspaces) return [];
  return Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces.packages ?? [];
}

function workspacePatternMatches(relativeDirectory: string, pattern: string): boolean {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized.split('/').includes('..')) return false;
  let expression = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (character === '*' && normalized[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (character === '*') {
      expression += '[^/]*';
    } else {
      expression += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`).test(relativeDirectory);
}

function discoverWorkspacePackageJsons(root: string, patterns: readonly string[]): string[] {
  if (patterns.length === 0) return [];
  const discovered: string[] = [];
  const stack = [root];
  while (stack.length > 0 && discovered.length < maxWorkspaceManifests) {
    const directory = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    const relativeDirectory = relativePath(root, directory);
    if (relativeDirectory && workspacePatternsMatch(relativeDirectory, patterns)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) discovered.push(manifest);
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || ignoredWorkspaceDirectories.has(entry.name)) continue;
      stack.push(path.join(directory, entry.name));
    }
  }
  return discovered;
}

function workspacePatternsMatch(relativeDirectory: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => workspacePatternMatches(relativeDirectory, pattern));
}

function collectLocalMarkers(root: string, directory: string, schemas: Set<string>, frameworks: Set<string>): void {
  for (const name of schemaNames) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) schemas.add(relativePath(root, file));
  }
  for (const name of frameworkNames) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) frameworks.add(name.split('.')[0]!);
  }
}

export function collectRepositoryFacts(rootValue: string, changedFiles: readonly string[] = []): RepositoryFacts {
  const root = path.resolve(rootValue);
  const manifests = new Set<string>(manifestNames.filter((name) => fs.existsSync(path.join(root, name))));
  const schemas = new Set<string>();
  const packages = new Set<string>();
  const frameworks = new Set<string>();
  const packageJson = path.join(root, 'package.json');
  const rootManifest = fs.existsSync(packageJson) ? readPackageManifest(packageJson) : null;
  const packageManifests = [packageJson, ...discoverWorkspacePackageJsons(root, workspacePatterns(rootManifest))]
    .filter((file, index, all) => fs.existsSync(file) && all.indexOf(file) === index);
  for (const manifest of packageManifests) {
    manifests.add(relativePath(root, manifest));
    const parsed = readPackageManifest(manifest);
    if (parsed) {
      for (const name of Object.keys({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}), ...(parsed.peerDependencies ?? {}), ...(parsed.optionalDependencies ?? {}) })) packages.add(name);
    }
    collectLocalMarkers(root, path.dirname(manifest), schemas, frameworks);
  }
  for (const name of [...packages].sort().slice(0, 256)) {
    if (/^(?:next|react|vue|svelte|@angular\/core|expo|react-native|prisma|@prisma\/client|drizzle-orm|@supabase\/supabase-js)$/.test(name)) frameworks.add(name);
  }

  const changed = changedFiles.slice(0, 128).map((file) => safeRelative(root, file)).filter((file): file is string => Boolean(file));
  return { manifests: [...manifests].sort(), packages: [...packages].sort().slice(0, 256), frameworks: [...frameworks].sort(), schemas: [...schemas].sort(), changed_files: changed };
}

export function repositoryFactsText(facts: RepositoryFacts): string {
  return [...facts.manifests, ...facts.packages, ...facts.frameworks, ...facts.schemas, ...facts.changed_files].join(' ');
}
