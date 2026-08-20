#!/usr/bin/env node
/**
 * V-020 / C-020 — Semantic workflow contradiction corpus checker.
 *
 * The structural validators (rule contracts, skill catalog, route parity,
 * agent skills) can pass while the high-impact rule/skill graph still
 * contradicts itself (delegation receipt shape, file-count work sizing,
 * repository worker caps, browser support loading, legacy PAF references,
 * Control Plane UI precedence). This checker replays the encoded corpus from
 * automation/workflow-semantic-cases.json over the actual documents and fails
 * closed on any unresolved contradiction.
 *
 * The corpus is the machine-readable resolution contract: each case names the
 * two (or more) conflicting documents, the required resolution, and the
 * precedence owner. This checker only enforces; it never invents policy.
 *
 * Check kinds (see automation/workflow-semantic-cases.json):
 *   file_contains          — every pattern must appear in the document
 *   file_not_contains      — no pattern may appear in the document
 *   owner_exists           — the precedence owner path must exist
 *   all_skills_not_contains— no top-level skill SKILL.md may contain any pattern
 *
 * Usage: node automation/validate-workflow-semantics.mjs [repo-root]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));
const corpusPath = path.join(here, 'workflow-semantic-cases.json');

const failures = [];
let checksRun = 0;

function normalizeText(raw) {
  // Case-insensitive matching; strip markdown backticks so prose emphasis does
  // not break phrase checks (e.g. `qa-skills` only when QA reasoning).
  return raw.toLowerCase().replace(/`/g, '');
}

function readDocument(rel) {
  const abs = path.resolve(root, rel);
  const resolved = abs === root ? root : abs;
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`document escapes repository root: ${rel}`);
  }
  if (!fs.existsSync(abs)) throw new Error(`document missing: ${rel}`);
  return normalizeText(fs.readFileSync(abs, 'utf8'));
}

function fileContains(rel, patterns) {
  const text = readDocument(rel);
  return patterns.map((p) => ({ p, hit: text.includes(p.toLowerCase()) }));
}

function allSkillFiles() {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, 'SKILL.md'))
    .filter((p) => fs.existsSync(p));
}

function runCheck(caseId, check) {
  checksRun += 1;
  const label = `${caseId}/${check.kind}`;
  try {
    switch (check.kind) {
      case 'owner_exists': {
        const abs = path.resolve(root, check.path);
        if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
          throw new Error(`owner path escapes repository root: ${check.path}`);
        }
        if (!fs.existsSync(abs)) {
          failures.push(`${label}: precedence owner missing: ${check.path} (${check.reason})`);
        }
        break;
      }
      case 'file_contains': {
        const results = fileContains(check.path, check.patterns);
        const missing = results.filter((r) => !r.hit);
        if (missing.length) {
          failures.push(`${label}: ${check.path} must contain ${missing.map((r) => `"${r.p}"`).join(', ')} (${check.reason})`);
        }
        break;
      }
      case 'file_not_contains': {
        const results = fileContains(check.path, check.patterns);
        const present = results.filter((r) => r.hit);
        if (present.length) {
          failures.push(`${label}: ${check.path} must not contain ${present.map((r) => `"${r.p}"`).join(', ')} (${check.reason})`);
        }
        break;
      }
      case 'all_skills_not_contains': {
        const offenders = [];
        for (const file of allSkillFiles()) {
          const text = normalizeText(fs.readFileSync(file, 'utf8'));
          const rel = path.relative(root, file).split(path.sep).join('/');
          for (const p of check.patterns) {
            if (text.includes(p.toLowerCase())) offenders.push(`${rel} contains "${p}"`);
          }
        }
        if (offenders.length) {
          failures.push(`${label}: ${offenders.join('; ')} (${check.reason})`);
        }
        break;
      }
      default:
        throw new Error(`unknown check kind: ${check.kind}`);
    }
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

function main() {
  let corpus;
  try {
    corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  } catch (error) {
    console.error(`FAIL: invalid corpus JSON ${corpusPath}: ${error.message}`);
    process.exit(1);
  }
  if (corpus.version !== 1 || !Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    console.error('FAIL: corpus must be version 1 with a non-empty cases array');
    process.exit(1);
  }
  const ids = corpus.cases.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    console.error('FAIL: corpus case ids must be unique');
    process.exit(1);
  }
  for (const c of corpus.cases) {
    if (!c.canonical_owner || !c.resolution || !c.precedence_owner || !Array.isArray(c.checks) || !c.checks.length) {
      console.error(`FAIL: ${c.id} must declare canonical_owner, resolution, precedence_owner, and checks`);
      process.exit(1);
    }
    for (const check of c.checks) runCheck(c.id, check);
  }

  if (failures.length) {
    console.error(`FAIL: ${failures.length} semantic contradiction(s) unresolved`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: 'PASS',
    cases: corpus.cases.length,
    checks: checksRun,
    concepts: corpus.cases.map((c) => c.concept),
    corpus_sha256: crypto.createHash('sha256').update(fs.readFileSync(corpusPath)).digest('hex'),
  }, null, 2));
}

main();
