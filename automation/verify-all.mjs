#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateVitestSkipPolicy } from './verification-skip-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const skipPython = args.has('--skip-python');
const selfCheckOnly = args.has('--self-check-only');
let failed = false;
const reportFile = path.join(root, 'vitest-verify-report.json');
const cleanReport = path.join(root, 'vitest-verify-report.clean.json');
const skipPolicyFile = path.join(root, 'automation', 'verification-skip-policy.json');

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
function run(label, command, commandArgs = [], options = {}) {
  console.log(`\n=== ${label} ===`);
  const started = Date.now();
  const stdio = options.stdio ?? 'pipe';
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: stdio === 'pipe' ? 'utf8' : undefined, stdio, env: { ...process.env, ...(options.env || {}) }, timeout: options.timeout ?? 600_000, shell: process.platform === 'win32' });
  if (stdio === 'pipe' && result.stdout) process.stdout.write(result.stdout);
  if (stdio === 'pipe' && result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    console.error(`[${label}] FAILED (${result.error?.message || `exit ${result.status}`}, ${Date.now()-started}ms)`);
    failed = true;
    return false;
  }
  console.log(`[${label}] OK (${Date.now()-started}ms)`);
  return true;
}
function discoverTests(dir) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules','dist','generated','.git'].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const relative = rel(absolute);
      // The bundled 5fedu snapshot is immutable reference evidence, not a root
      // workspace. Its own tests require the template's dependency tree and are
      // covered here by manifest/hash/source-evidence validation instead.
      if (entry.isDirectory() && relative === 'profiles/5fedu/reference-source/template') continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(?:test|spec)\.ts$/.test(entry.name)) out.push(rel(absolute));
    }
  };
  visit(dir);
  return out.sort();
}
function findPython() {
  for (const candidate of ['python3','python']) {
    const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return candidate;
  }
  return null;
}

if (!fs.existsSync(path.join(root, 'vitest.verify.config.ts'))) { console.error('missing vitest.verify.config.ts'); failed = true; }
const discovered = discoverTests(root);
if (!discovered.length) { console.error('no test files discovered'); failed = true; }
else console.log(`[SELF] discovered ${discovered.length} test file(s)`);
const python = findPython();
console.log(`[SELF] Python: ${python || 'UNAVAILABLE'}`);
if (selfCheckOnly) process.exit(failed ? 1 : 0);

if (!skipBuild) run('BUILD', 'npm', ['run','build']); else console.log('[BUILD] skipped');
run('CHECK: typecheck workspaces', 'npm', ['run','check']);
run('CHECK: .agent protocol', 'node', ['automation/validate-agent-dir.mjs']);
run('CHECK: 5fedu leakage', 'node', ['automation/validate-no-5fedu-leakage.mjs']);
run('CHECK: tool registry', 'node', ['automation/validate-tool-registry.mjs']);
run('CHECK: deterministic stack detectors', 'node', ['automation/detect-stack-facts.mjs', '--self-test']);
run('CHECK: generated RepoFacts provenance', 'node', ['automation/validate-repo-facts.mjs']);
run('CHECK: Decision Fabric dogfood', 'node', ['automation/validate-decision-fabric.mjs']);
run('CHECK: V3 directive 101-criteria audit', 'node', ['automation/validate-v3-directive.mjs']);
run('CHECK: V3 closure ledger and pointer', 'node', ['automation/validate-v3-closure.mjs']);
run('CHECK: 5fedu domain pack', 'node', ['automation/validate-5fedu-domain-pack.mjs','--require-source']);

if (!skipPython) {
  if (!python) { console.error('[PYTHON] unavailable - suite is non-PASS'); failed = true; }
  else {
    const scripts = [
      // Generated reference docs are intentionally ignored by Git, so a clean
      // host must materialize them before link verification. This keeps the
      // check reproducible without treating a stale local generated tree as
      // source evidence.
      ['automation/generate-doc-references.py','generated-doc-references'],
      ['automation/check-internal-links.py','md-link-check'],
      ['automation/validate-agent-skills.py','agent-skills-portability'],
      ['automation/validate-skill-catalog.py','skill-ownership-catalog'],
      ['automation/validate-skill-fabric.py','candidate-skill-fabric'],
      ['automation/validate-route-parity.py','typed-route-parity'],
      ['automation/validate-rule-contracts.py','rule-contracts'],
      ['scripts/verify-pinned-reqs.py','pinned-reqs'],
      ['automation/test-model-policy.py','model-policy'],
      ['automation/test-artifact-schemas.py','artifact-schemas'],
      ['automation/test-platform-contracts.py','platform-contracts'],
      ['automation/test-cross-language-manifests.py','cross-lang-manifests'],
      ['automation/test-platform-lifecycle.py','platform-lifecycle'],
      ['evals/conformance/routing.py','conformance-routing'],
      ['automation/test-installer-trust-boundary.py','installer-trust-boundary'],
      ['automation/test-installer-staging.py','installer-staging'],
      ['automation/test-select-verification.py','select-verification'],
      ['automation/test-parity-verification.py','parity-verification'],
      ['automation/test-5fedu-parity-packet.py','5fedu-parity-packet'],
    ];
    for (const [script,label] of scripts) {
      if (!fs.existsSync(path.join(root, script))) { console.error(`[PYTHON] required script missing: ${script}`); failed = true; continue; }
      run(`CHECK: Python ${label}`, python, [script]);
    }
  }
} else console.log('[PYTHON] skipped');

const verifyTmpDir = path.join(root, '.agent', 'tmp', 'verify-all');
fs.mkdirSync(verifyTmpDir, { recursive: true });
try { fs.rmSync(reportFile, { force: true }); } catch {}
try { fs.rmSync(cleanReport, { force: true }); } catch {}

function partitionTests(files) {
  const partitions = {
    root: [],
    engine: [],
    cli: [],
    'control-plane': [],
    kernel: [],
  };
  const unknownPackageTests = [];
  for (const file of files) {
    if (file.startsWith('packages/engine/')) partitions.engine.push(file);
    else if (file.startsWith('packages/cli/')) partitions.cli.push(file);
    else if (file.startsWith('packages/control-plane/')) partitions['control-plane'].push(file);
    else if (file.startsWith('packages/kernel/')) partitions.kernel.push(file);
    else if (file.startsWith('packages/')) unknownPackageTests.push(file);
    else partitions.root.push(file);
  }
  if (unknownPackageTests.length) {
    throw new Error(`unassigned package test files: ${unknownPackageTests.join(', ')}`);
  }
  return partitions;
}

function partitionSpec(name, files) {
  if (name === 'root') return { cwd: root, config: 'vitest.config.ts', files };
  const cwd = path.join(root, 'packages', name);
  const prefix = `packages/${name}/`;
  return {
    cwd,
    config: 'vitest.config.ts',
    files: files.map((file) => file.startsWith(prefix) ? file.slice(prefix.length) : file),
  };
}

let partitions;
try {
  partitions = partitionTests(discovered);
} catch (error) {
  console.error(`[TEST: partition discovery] FAILED: ${error.message}`);
  failed = true;
  partitions = { root: [], engine: [], cli: [], 'control-plane': [], kernel: [] };
}

const partitionReports = [];
const partitionOrder = ['root', 'cli', 'control-plane', 'engine', 'kernel'];
for (const name of partitionOrder) {
  const files = partitions[name];
  if (!files.length) continue;
  const spec = partitionSpec(name, files);
  const outputFile = path.join(verifyTmpDir, `${name}.json`);
  try { fs.rmSync(outputFile, { force: true }); } catch {}
  const ok = run(`TEST: vitest ${name}`, 'node', [
    'automation/run-governed-vitest.mjs',
    '--project-root', root,
    '--cwd', spec.cwd,
    '--mode', 'focused',
    '--timeout-ms', '600000',
    '--',
    'run',
    '--config', spec.config,
    ...spec.files,
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${outputFile}`,
  ], { timeout: 650_000, stdio: 'inherit' });
  if (!fs.existsSync(outputFile)) {
    console.error(`[TEST: vitest ${name}] report missing: ${rel(outputFile)}`);
    failed = true;
    continue;
  }
  try {
    const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    partitionReports.push({ name, report, expected: files });
    if (!ok && (report.numFailedTests || 0) === 0) {
      console.error(`[TEST: vitest ${name}] process failed without reported failing tests`);
    }
  } catch (error) {
    console.error(`[TEST: vitest ${name}] invalid report: ${error.message}`);
    failed = true;
  }
}

console.log('\n=== TEST: combined vitest report ===');
try {
  const testResults = partitionReports.flatMap(({ report }) => report.testResults || []);
  const combined = {
    numTotalTestSuites: partitionReports.reduce((n, { report }) => n + (report.numTotalTestSuites || 0), 0),
    numPassedTestSuites: partitionReports.reduce((n, { report }) => n + (report.numPassedTestSuites || 0), 0),
    numFailedTestSuites: partitionReports.reduce((n, { report }) => n + (report.numFailedTestSuites || 0), 0),
    numPendingTestSuites: partitionReports.reduce((n, { report }) => n + (report.numPendingTestSuites || 0), 0),
    numTotalTests: partitionReports.reduce((n, { report }) => n + (report.numTotalTests || 0), 0),
    numPassedTests: partitionReports.reduce((n, { report }) => n + (report.numPassedTests || 0), 0),
    numFailedTests: partitionReports.reduce((n, { report }) => n + (report.numFailedTests || 0), 0),
    numPendingTests: partitionReports.reduce((n, { report }) => n + (report.numPendingTests || 0), 0),
    testResults,
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(combined)}\n`);

  const canonicalReportedPath = (result) => {
    const raw = result.filePath || result.name;
    if (!raw) return '';
    const absolute = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
    return rel(absolute);
  };
  const reported = testResults.map(canonicalReportedPath).filter(Boolean);
  const discoveredSet = new Set(discovered);
  const reportedSet = new Set(reported);
  const missing = discovered.filter((x) => !reportedSet.has(x));
  const unreported = reported.filter((x) => !discoveredSet.has(x));
  if (!fs.existsSync(skipPolicyFile)) throw new Error('automation/verification-skip-policy.json missing');
  const skipPolicy = JSON.parse(fs.readFileSync(skipPolicyFile, 'utf8'));
  const skipCheck = evaluateVitestSkipPolicy(combined, skipPolicy, process.platform, root);
  const approvedSkips = skipCheck.ok ? skipCheck.actual : [];
  const summary = {
    suites: testResults.length,
    tests: combined.numTotalTests,
    passed: combined.numPassedTests,
    failed: combined.numFailedTests,
    skipped: combined.numPendingTests,
    discovered: discovered.length,
    reported: reported.length,
    partitions: Object.fromEntries(partitionReports.map(({ name, report }) => [name, {
      suites: (report.testResults || []).length,
      tests: report.numTotalTests || 0,
      passed: report.numPassedTests || 0,
      failed: report.numFailedTests || 0,
      skipped: report.numPendingTests || 0,
    }])),
    missing,
    unreported,
    approvedSkips,
  };
  fs.writeFileSync(cleanReport, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  const reasons = [];
  if (partitionReports.length !== Object.values(partitions).filter((files) => files.length).length) reasons.push('one or more partition reports are missing');
  if (missing.length) reasons.push(`missing suites: ${missing.join(', ')}`);
  if (unreported.length) reasons.push(`unreported suites: ${unreported.join(', ')}`);
  if (!skipCheck.ok) reasons.push(`skip policy: ${skipCheck.reason}`);
  if ((combined.numFailedTests || 0) > 0) reasons.push(`failing tests: ${combined.numFailedTests}`);
  if ((combined.numPendingTests || 0) !== approvedSkips.length) reasons.push(`pending test count ${combined.numPendingTests || 0} does not match approved skip count ${approvedSkips.length}`);
  if (reasons.length) throw new Error(reasons.join('\n'));
  console.log('[TEST: combined vitest report] OK');
} catch (error) {
  console.error(`[TEST: combined vitest report] FAILED: ${error.message}`);
  failed = true;
}

console.log(`\nverify:all ${failed ? 'FAILED' : 'PASSED'}`);
process.exit(failed ? 1 : 0);
