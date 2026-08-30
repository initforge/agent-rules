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

function safeRelative(root: string, candidate: string): string | null {
  const resolved = path.resolve(root, candidate);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? candidate.replace(/\\/g, '/') : null;
}

export function collectRepositoryFacts(rootValue: string, changedFiles: readonly string[] = []): RepositoryFacts {
  const root = path.resolve(rootValue);
  const manifests = manifestNames.filter((name) => fs.existsSync(path.join(root, name)));
  const schemas = schemaNames.filter((name) => fs.existsSync(path.join(root, name)));
  const frameworkFiles = frameworkNames.filter((name) => fs.existsSync(path.join(root, name)));
  const packages = new Set<string>();
  const frameworks = new Set<string>();

  const packageJson = path.join(root, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      for (const name of Object.keys({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) }).sort().slice(0, 256)) packages.add(name);
    } catch { /* malformed manifests are handled by the implementation task */ }
  }
  for (const file of frameworkFiles) frameworks.add(file.split('.')[0]);
  for (const name of packages) {
    if (/^(?:next|react|vue|svelte|@angular\/core|expo|react-native|prisma|@prisma\/client|drizzle-orm|@supabase\/supabase-js)$/.test(name)) frameworks.add(name);
  }

  const changed = changedFiles.slice(0, 128).map((file) => safeRelative(root, file)).filter((file): file is string => Boolean(file));
  return { manifests, packages: [...packages], frameworks: [...frameworks], schemas, changed_files: changed };
}

export function repositoryFactsText(facts: RepositoryFacts): string {
  return [...facts.manifests, ...facts.packages, ...facts.frameworks, ...facts.schemas, ...facts.changed_files].join(' ');
}
