#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDir, '..');

const slash = (value) => String(value).split(path.sep).join('/');

function normalizeFile(filePath, root) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  return slash(path.relative(root, absolute));
}

function key(entry) {
  return `${entry.file}\0${entry.fullName}`;
}

export function collectVitestSkips(report, root = defaultRoot) {
  const skips = [];
  for (const result of report?.testResults ?? []) {
    const file = normalizeFile(result.filePath || result.name || '', root);
    for (const assertion of result.assertionResults ?? []) {
      if (assertion.status !== 'skipped' && assertion.status !== 'pending' && assertion.status !== 'todo' && assertion.status !== 'disabled') continue;
      skips.push({
        file,
        fullName: String(assertion.fullName || [...(assertion.ancestorTitles ?? []), assertion.title].filter(Boolean).join(' ')),
        status: assertion.status,
      });
    }
  }
  return skips.sort((a, b) => key(a).localeCompare(key(b)));
}

export function evaluateVitestSkipPolicy(report, policy, platform = process.platform, root = defaultRoot) {
  if (!policy || policy.version !== 1 || typeof policy.platforms !== 'object') {
    return { ok: false, reason: 'invalid verification skip policy', actual: [], expected: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(policy.platforms, platform)) {
    return { ok: false, reason: `verification skip policy has no explicit entry for platform ${platform}`, actual: collectVitestSkips(report, root), expected: [] };
  }
  const expected = [...(policy.always ?? []), ...(policy.platforms[platform] ?? [])].map((entry) => ({
    file: slash(entry.file),
    fullName: String(entry.fullName),
    rationale: String(entry.rationale || ''),
  })).sort((a, b) => key(a).localeCompare(key(b)));
  const actual = collectVitestSkips(report, root);
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = new Set(actual.map(key));
  if (expectedKeys.size !== expected.length) {
    return { ok: false, reason: `duplicate expected skip entry for platform ${platform}`, actual, expected };
  }
  const unexpected = actual.filter((entry) => !expectedKeys.has(key(entry)));
  const missing = expected.filter((entry) => !actualKeys.has(key(entry)));
  const invalidRationales = expected.filter((entry) => entry.rationale.trim().length < 20);
  const ok = unexpected.length === 0 && missing.length === 0 && invalidRationales.length === 0;
  return {
    ok,
    reason: ok ? null : [
      unexpected.length ? `unexpected skips: ${unexpected.map((x) => `${x.file} :: ${x.fullName}`).join('; ')}` : '',
      missing.length ? `expected platform skips missing: ${missing.map((x) => `${x.file} :: ${x.fullName}`).join('; ')}` : '',
      invalidRationales.length ? `skip entries missing substantive rationale: ${invalidRationales.map((x) => `${x.file} :: ${x.fullName}`).join('; ')}` : '',
    ].filter(Boolean).join('\n'),
    actual,
    expected,
    unexpected,
    missing,
  };
}

function parseArgs(argv) {
  const options = { report: path.join(defaultRoot, 'vitest-verify-report.json'), policy: path.join(defaultRoot, 'automation', 'verification-skip-policy.json'), root: defaultRoot, platform: process.platform };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') options.report = path.resolve(argv[++i]);
    else if (arg === '--policy') options.policy = path.resolve(argv[++i]);
    else if (arg === '--root') options.root = path.resolve(argv[++i]);
    else if (arg === '--platform') options.platform = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = JSON.parse(fs.readFileSync(options.report, 'utf8'));
    const policy = JSON.parse(fs.readFileSync(options.policy, 'utf8'));
    const result = evaluateVitestSkipPolicy(report, policy, options.platform, options.root);
    if (!result.ok) throw new Error(result.reason || 'skip policy rejected report');
    console.log(`[verification-skip-policy] PASS (${result.actual.length} approved skip(s) on ${options.platform})`);
    for (const item of result.expected) console.log(`  - ${item.file} :: ${item.fullName} — ${item.rationale}`);
  } catch (error) {
    console.error(`[verification-skip-policy] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
