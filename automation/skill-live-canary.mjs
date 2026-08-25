#!/usr/bin/env node
/**
 * Live behavior canary for the 7 core workflow skills.
 *
 * Every workflow skill must be live-verifiable through the exact resolver the
 * runtime uses (routeSkills over the generated context graph):
 *   (a) the SKILL.md exists and its metadata.signals are non-empty (so the
 *       graph carries deterministic trigger facts), and
 *   (b) a prompt containing the skill's deterministic trigger fact selects the
 *       skill (positive case), and
 *   (c) a clearly unrelated prompt does NOT select the skill (negative case).
 *
 * This is a canary, not a second router: it resolves through
 * packages/kernel/dist/northstar/routing.js (the built kernel) with the
 * canonical repoRoot, and fails closed if the graph is not generated.
 *
 * Exit 0 only when all 7 x (positive + negative) assertions pass; prints a
 * machine-readable JSON summary on stdout. Exit 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The 7 workflow skills this canary guards. */
const WORKFLOW_SKILLS = [
  'plan-and-handoff',
  'context-evolution-protocol',
  'verification-router',
  'claim-test-strategy',
  'quality',
  'security-review',
  'finish-to-completion',
];

/**
 * The most DISTINCTIVE deterministic trigger per workflow skill. Workflow
 * skills overlap by domain (claim-test-strategy vs verification-router vs
 * security-review all reason about evidence), so the canary uses each skill's
 * single most distinctive phrase instead of blindly taking signals[0], which
 * can collide with a sibling's generic signal (generic-keyword routing is
 * forbidden by REQ-109).
 */
const DISTINCTIVE_TRIGGERS = {
  'plan-and-handoff': 'plan artifact',
  'context-evolution-protocol': 'bổ sung context',
  'verification-router': 'smallest evidence set',
  'claim-test-strategy': 'claim-based testing',
  'quality': 'clean code',
  'security-review': 'threat model',
  'finish-to-completion': 'làm đi',
};

function loadBuiltKernel() {
  // Prefer the built kernel dist (what the runtime imports after `npm run build`).
  const dist = path.join(ROOT, 'packages', 'kernel', 'dist', 'northstar', 'routing.js');
  if (fs.existsSync(dist)) {
    return import(pathToFileURL(dist).href);
  }
  const src = path.join(ROOT, 'packages', 'kernel', 'src', 'northstar', 'routing.ts');
  if (fs.existsSync(src)) {
    throw new Error(
      `built kernel dist not found at ${dist}; run the build first (npm run build) — ` +
      `cannot import TypeScript source directly`,
    );
  }
  throw new Error(`kernel routing module not found (looked at ${dist})`);
}

/** Read the metadata.signals from a SKILL.md frontmatter block. */
function readMetadataSignals(skill) {
  const skillMd = path.join(ROOT, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return { exists: false, signals: [] };
  const text = fs.readFileSync(skillMd, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { exists: true, signals: [] };
  const fm = match[1];
  const signalsRaw = fm.match(/signals:\s*(?:"([^"]*)"|\[([^\]]*)\])/);
  if (!signalsRaw) return { exists: true, signals: [] };
  const raw = signalsRaw[1] ?? signalsRaw[2] ?? '';
  const signals = raw
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''))
    .filter(Boolean);
  return { exists: true, signals };
}

/** Build a TaskPacket carrying only the prompt text (mirrors how the runtime routes). */
function packetFor(goal, skills = []) {
  return {
    protocol_version: '2.0',
    task_id: 'canary-task',
    spec_id: 'canary-spec',
    spec_revision: 1,
    work_id: 'canary-work',
    goal,
    requirements: ['R-canary'],
    scope: { owned: [], forbidden: [] },
    acceptance: [{ claim_id: 'C-canary' }],
    ...(skills.length > 0 ? { skills } : {}),
  };
}

async function main() {
  const results = [];
  const failures = [];

  const { routeSkills } = await loadBuiltKernel();

  for (const skill of WORKFLOW_SKILLS) {
    const { exists, signals } = readMetadataSignals(skill);

    // (a) SKILL.md exists + metadata.signals non-empty
    const structureOk = exists && signals.length > 0;
    results.push({
      skill,
      case: 'structure',
      prompt: null,
      passed: structureOk,
      detail: structureOk
        ? `SKILL.md present with ${signals.length} deterministic trigger signal(s)`
        : `SKILL.md ${exists ? 'missing metadata.signals' : 'missing'}`,
    });
    if (!structureOk) {
      failures.push(`${skill}: structure assert failed (SKILL.md + metadata.signals required)`);
      continue;
    }

    // (b) positive: a prompt containing the skill's most distinctive trigger
    const trigger = DISTINCTIVE_TRIGGERS[skill] ?? signals[0];
    const positivePrompt = `Please apply the ${trigger} procedure for this task now`;
    let positiveIds = [];
    try {
      positiveIds = routeSkills(packetFor(positivePrompt), ROOT).map((r) => r.id);
    } catch (error) {
      results.push({
        skill,
        case: 'positive',
        prompt: positivePrompt,
        passed: false,
        detail: `routeSkills threw: ${error instanceof Error ? error.message : String(error)}`,
      });
      failures.push(`${skill}: positive assert threw (${skill} not selected)`);
      continue;
    }
    const positiveOk = positiveIds.includes(skill);
    results.push({
      skill,
      case: 'positive',
      prompt: positivePrompt,
      passed: positiveOk,
      detail: positiveOk
        ? `selected ${JSON.stringify(positiveIds)}`
        : `not selected; got ${JSON.stringify(positiveIds)}`,
    });
    if (!positiveOk) {
      failures.push(`${skill}: positive assert failed — prompt with trigger fact "${trigger}" did not select ${skill}`);
    }

    // (c) negative: a clearly unrelated prompt must not select the skill
    const negativePrompt = 'Draft a grocery shopping list for the weekly supermarket visit';
    let negativeIds = [];
    try {
      negativeIds = routeSkills(packetFor(negativePrompt), ROOT).map((r) => r.id);
    } catch (error) {
      results.push({
        skill,
        case: 'negative',
        prompt: negativePrompt,
        passed: false,
        detail: `routeSkills threw: ${error instanceof Error ? error.message : String(error)}`,
      });
      failures.push(`${skill}: negative assert threw`);
      continue;
    }
    const negativeOk = !negativeIds.includes(skill);
    results.push({
      skill,
      case: 'negative',
      prompt: negativePrompt,
      passed: negativeOk,
      detail: negativeOk
        ? `not selected (got ${JSON.stringify(negativeIds)})`
        : `wrongly selected within ${JSON.stringify(negativeIds)}`,
    });
    if (!negativeOk) {
      failures.push(`${skill}: negative assert failed — unrelated prompt selected ${skill}`);
    }
  }

  const summary = {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    canary: 'workflow-skills-live',
    skills: WORKFLOW_SKILLS.length,
    assertions: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
    repoRoot: ROOT,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`FAIL: skill live canary harness error: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});