/**
 * northstar/project-audit.ts — read-only project audit for
 * adaptive-minimal-proof-testing (owner §13).
 *
 * Audits a project's test architecture without modifying it: test runners,
 * test categories, baseline counts, slow suites, duplicate patterns,
 * browser/live capability, CI commands, missing proof layers, recommended
 * minimal proof profile and project-specific escalation rules.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface ProjectAudit {
  schema: 'agent-rules/project-audit/v1';
  version: 1;
  repository: string;
  audited_at: string;
  test_runners: string[];
  test_categories: string[];
  baseline: { files: number; tests: number; suites: number };
  slow_suites: string[];
  duplicate_patterns: string[];
  browser_live_capability: boolean;
  ci_commands: string[];
  missing_proof_layers: string[];
  recommended_profile: string;
  escalation_rules: string[];
  read_only: true;
}

export interface AuditOptions {
  repoRoot: string;
  /** Limit the file walk to keep audits fast. */
  maxDepth?: number;
}

const KNOWN_RUNNERS = [
  { name: 'vitest', marker: 'vitest', package: 'vitest' },
  { name: 'jest', marker: 'jest', package: 'jest' },
  { name: 'mocha', marker: 'mocha', package: 'mocha' },
  { name: 'playwright', marker: 'playwright', package: '@playwright/test' },
  { name: 'pytest', marker: 'pytest', package: 'pytest' },
  { name: 'cargo test', marker: 'cargo', package: '' },
  { name: 'go test', marker: 'go test', package: '' },
];

function walk(dir: string, depth: number, maxDepth: number, out: string[]): void {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build' || e.name === 'coverage' || e.name === '.next') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, maxDepth, out);
    else out.push(full);
  }
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|py|go|rs)$/i;

export function auditProject(opts: AuditOptions): ProjectAudit {
  const root = opts.repoRoot;
  const files: string[] = [];
  walk(root, 0, opts.maxDepth ?? 3, files);

  const testFiles = files.filter((f) => TEST_FILE_RE.test(f));
  const pkgJson = path.join(root, 'package.json');
  const pyproject = path.join(root, 'pyproject.toml');
  const goMod = path.join(root, 'go.mod');
  const cargoToml = path.join(root, 'Cargo.toml');

  const runners: string[] = [];
  const ciCommands: string[] = [];
  let browserLive = false;

  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
      for (const r of KNOWN_RUNNERS) {
        if (r.package && deps[r.package]) runners.push(r.name);
      }
      const scriptText = Object.values(pkg.scripts ?? {}).join(' ');
      if (/vitest/.test(scriptText)) runners.push('vitest');
      if (/jest/.test(scriptText)) runners.push('jest');
      if (/playwright/.test(scriptText)) runners.push('playwright');
      if (/pytest/.test(scriptText)) runners.push('pytest');
      for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
        if (/test|verify|check|e2e|qa/i.test(name)) ciCommands.push(`${name}: ${cmd}`);
      }
      if (deps['@playwright/test'] || deps['playwright'] || deps['playwright-core'] || /playwright/.test(scriptText)) browserLive = true;
    } catch { /* unreadable package.json */ }
  }
  if (fs.existsSync(pyproject)) {
    runners.push('pytest');
    const text = fs.readFileSync(pyproject, 'utf8');
    if (/playwright|selenium/.test(text)) browserLive = true;
  }
  // Workspace layouts hoist playwright to the root node_modules.
  if (fs.existsSync(path.join(root, 'node_modules', 'playwright')) || fs.existsSync(path.join(root, 'node_modules', 'playwright-core')) || fs.existsSync(path.join(root, 'node_modules', '@playwright', 'test'))) {
    browserLive = true;
    if (!runners.includes('playwright')) runners.push('playwright');
  }
  if (fs.existsSync(goMod)) runners.push('go test');
  if (fs.existsSync(cargoToml)) runners.push('cargo test');

  const testCount = countTests(testFiles);
  const categories = categorizeTestFiles(testFiles);
  const slow = testFiles.filter((f) => /e2e|browser|integration|visual|stress/.test(f)).slice(0, 5);
  const dup = findDuplicatePatterns(testFiles);

  const missing: string[] = [];
  if (runners.length === 0) missing.push('deterministic unit/contract runner');
  if (!browserLive && testFiles.some((f) => /browser|ui|e2e/.test(f))) missing.push('live browser capability for browser claims');

  const recommended = recommendProfile(runners, browserLive, categories);

  return {
    schema: 'agent-rules/project-audit/v1',
    version: 1,
    repository: root,
    audited_at: new Date().toISOString(),
    test_runners: [...new Set(runners)],
    test_categories: categories,
    baseline: { files: testFiles.length, tests: testCount, suites: testFiles.length },
    slow_suites: slow,
    duplicate_patterns: dup,
    browser_live_capability: browserLive,
    ci_commands: ciCommands.slice(0, 10),
    missing_proof_layers: missing,
    recommended_profile: recommended,
    escalation_rules: [
      ...(browserLive ? ['browser claims: require live browser proof (playwright/real browser)'] : ['browser claims: BLOCKED without a live browser host']),
      ...(missing.length ? [`missing layers escalate to: ${missing.join(', ')}`] : []),
    ],
    read_only: true,
  };
}

function countTests(testFiles: string[]): number {
  let count = 0;
  for (const f of testFiles) {
    try {
      const text = fs.readFileSync(f, 'utf8');
      count += (text.match(/\b(it|test|specify)\(/g) ?? []).length;
      count += (text.match(/^\s*(def test_|func Test|#\[test\])/gm) ?? []).length;
    } catch { /* unreadable */ }
  }
  return count;
}

function categorizeTestFiles(testFiles: string[]): string[] {
  const cats = new Set<string>();
  for (const f of testFiles) {
    const p = f.toLowerCase();
    if (/browser|e2e|ui|playwright/.test(p)) cats.add('browser/live');
    else if (/integration|contract/.test(p)) cats.add('integration/contract');
    else if (/security|auth|acl|permission/.test(p)) cats.add('security');
    else if (/migration|schema|data/.test(p)) cats.add('data/migration');
    else if (/perf|benchmark|load|stress/.test(p)) cats.add('performance');
    else cats.add('unit/deterministic');
  }
  return [...cats];
}

function findDuplicatePatterns(testFiles: string[]): string[] {
  const byName = new Map<string, number>();
  for (const f of testFiles) {
    const base = path.basename(f).replace(/\.(test|spec)\..+$/, '');
    byName.set(base, (byName.get(base) ?? 0) + 1);
  }
  return [...byName.entries()].filter(([, n]) => n > 1).map(([name, n]) => `${name} x${n}`);
}

function recommendProfile(runners: string[], browserLive: boolean, categories: string[]): string {
  if (runners.length === 0) return 'external-probed (project has no test runner)';
  if (browserLive && categories.some((c) => c === 'browser/live')) return 'ui-browser';
  if (categories.some((c) => c === 'security')) return 'security';
  if (categories.some((c) => c === 'data/migration')) return 'migration-data';
  if (categories.some((c) => c === 'performance')) return 'performance-reliability';
  return 'business-logic';
}
