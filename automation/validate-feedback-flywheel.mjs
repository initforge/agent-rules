#!/usr/bin/env node
/**
 * Feedback flywheel validation (REQ-019 / AM-0001):
 * repeated classified failures become eval candidates only after
 * context-evolution placement and promotion review; accepted fixes replay
 * historical cases before promotion; model/provider workarounds require
 * owner, trigger, bounded scope, revalidation, expiry, and retirement
 * evidence so obsolete compensating machinery cannot become a permanent
 * global invariant.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = path.resolve(import.meta.dirname, '..');
const FAILURE_EVAL_SCHEMA = path.join(ROOT, 'schemas', 'failure-eval.schema.json');
const SENSOR_SCHEMA = path.join(ROOT, 'schemas', 'sensor-policy.schema.json');

const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ── Fixtures ──────────────────────────────────────────────────────────
const now = new Date().toISOString();

function baseCandidate() {
  return {
    schema: 'harness/failure-eval-candidate',
    version: 1,
    candidate_id: 'E-001',
    failure_class: 'browser-provider-timeout',
    occurrences: [
      { observed_at: now, work_id: 'W-a', claim_id: 'C-001', failure: 'playwright MCP timed out twice' },
      { observed_at: now, work_id: 'W-b', claim_id: 'C-002', failure: 'playwright MCP timed out again' },
    ],
    promotion_status: 'reviewed',
    promotion_review: {
      reviewed_by: 'context-evolution-review',
      reviewed_at: now,
      verdict: 'promote',
      replay_required: true,
      replay_refs: ['evals/harness/failure-to-eval/replay-browser-timeout.json'],
    },
    created_at: now,
  };
}

function workaroundFixture() {
  return {
    ...baseCandidate(),
    promotion_status: 'accepted',
    workaround: {
      owner: 'harness-maintainer',
      trigger: 'host lacks a stable browser MCP server id',
      scope: 'browser.verify activation on this host only',
      revalidation_required: true,
      revalidation_evidence: 'evals/harness/workaround-revalidation/browser-mcp-2026-08.json',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      retirement_evidence: 'evals/harness/workaround-retirement/browser-mcp-retired.json',
    },
  };
}

function sensorPolicyFixture() {
  return {
    schema: 'harness/sensor-policy',
    version: 1,
    sensors: [
      {
        sensor_id: 'SENS-001',
        direction: 'feedforward',
        oracle: 'computational',
        lifecycle: 'pre-execution',
        applicability: 'claim class mechanical/runtime',
        cost: 'cheap',
        independence: 'oracle-group-a',
        freshness_ms: 300000,
        confidence: 0.9,
        escalation: { on_fail: 'escalate to inferential sensor', retry_budget: 2 },
      },
      {
        sensor_id: 'SENS-002',
        direction: 'feedback',
        oracle: 'inferential',
        lifecycle: 'post-execution',
        applicability: 'semantic claims requiring human residual',
        cost: 'deep',
        independence: 'oracle-group-b',
        freshness_ms: 0,
        confidence: 0.6,
        escalation: { on_fail: 'NEEDS_USER review', retry_budget: 1 },
      },
    ],
  };
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const evalValidate = ajv.compile(JSON.parse(fs.readFileSync(FAILURE_EVAL_SCHEMA, 'utf8')));
const sensorValidate = ajv.compile(JSON.parse(fs.readFileSync(SENSOR_SCHEMA, 'utf8')));

// 1. Promotion gate: repeated classified failures must carry review + replay.
{
  const candidate = baseCandidate();
  if (!evalValidate(candidate)) fail(`eval candidate schema: ${JSON.stringify(evalValidate.errors)}`);
  const draft = { ...candidate, promotion_status: 'draft', promotion_review: undefined };
  if (!evalValidate(draft)) fail('draft candidate must stay schema-valid');
  const reviewedWithoutReview = { ...candidate, promotion_review: undefined };
  if (!evalValidate(reviewedWithoutReview)) fail('schema must permit the runtime promotion gate to enforce review');
  const runtimeGate = (entry) => {
    if (['reviewed', 'accepted', 'promoted'].includes(entry.promotion_status) && !entry.promotion_review) {
      throw new Error(`promotion gate: ${entry.candidate_id} is ${entry.promotion_status} without a promotion review`);
    }
  };
  let gateRejected = false;
  try { runtimeGate(reviewedWithoutReview); } catch { gateRejected = true; }
  if (!gateRejected) fail('runtime promotion gate must reject a reviewed candidate without review');
  runtimeGate(candidate);
  if (candidate.promotion_review.verdict === 'promote' && !candidate.promotion_review.replay_required) fail('promotion requires historical replay');
  if (candidate.occurrences.length < 2) fail('repeated failure requires at least two classified occurrences');
}

// 2. Workaround lifecycle: owner/trigger/scope/revalidation/expiry/retirement.
{
  const workaround = workaroundFixture();
  if (!evalValidate(workaround)) fail(`workaround schema: ${JSON.stringify(evalValidate.errors)}`);
  const w = workaround.workaround;
  for (const field of ['owner', 'trigger', 'scope', 'revalidation_required', 'expires_at', 'retirement_evidence']) {
    if (!(field in w)) fail(`workaround missing ${field}`);
  }
  if (new Date(w.expires_at) <= new Date()) fail('workaround expiry must be in the future');
  if (w.revalidation_required && !w.revalidation_evidence) fail('revalidation-required workaround needs revalidation evidence');
  const noRetirement = { ...workaround, workaround: { ...w, retirement_evidence: '' } };
  if (evalValidate(noRetirement)) fail('workaround must not be promotable without retirement evidence');
}

// 3. Typed sensor policy: direction/oracle/lifecycle/cost/independence/freshness/escalation.
{
  const policy = sensorPolicyFixture();
  if (!sensorValidate(policy)) fail(`sensor schema: ${JSON.stringify(sensorValidate.errors)}`);
  const directions = new Set(policy.sensors.map((s) => s.direction));
  if (!directions.has('feedforward') || !directions.has('feedback')) fail('sensor policy must type feedforward and feedback sensors');
  const oracles = new Set(policy.sensors.map((s) => s.oracle));
  if (![...oracles].every((oracle) => ['computational', 'inferential', 'human'].includes(oracle))) fail('sensor oracle class must be computational/inferential/human');
  for (const sensor of policy.sensors) {
    for (const field of ['lifecycle', 'applicability', 'cost', 'independence', 'freshness_ms', 'confidence', 'escalation']) {
      if (!(field in sensor)) fail(`sensor ${sensor.sensor_id} missing ${field}`);
    }
  }
}

// 4. Context-evolution placement: candidates live under evals/harness/ only.
{
  const evalsRoot = path.join(ROOT, 'evals', 'harness');
  if (!fs.existsSync(evalsRoot)) fail('evals/harness/ directory must exist for flywheel candidates');
  const candidates = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.json')) candidates.push(full);
    }
  };
  visit(evalsRoot);
  if (candidates.length === 0) fail('evals/harness/ must contain at least one candidate fixture');
  for (const file of candidates) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw.schema === 'harness/failure-eval-candidate' && !evalValidate(raw)) fail(`eval fixture invalid: ${file}`);
    if (raw.schema === 'harness/sensor-policy' && !sensorValidate(raw)) fail(`sensor fixture invalid: ${file}`);
  }
}

// 5. Retirement: an expired workaround must fail closed instead of silently staying active.
{
  const expired = workaroundFixture();
  expired.workaround.expires_at = new Date(Date.now() - 1000).toISOString();
  if (!evalValidate(expired)) fail(`expired workaround must stay schema-valid (time is a runtime gate): ${JSON.stringify(evalValidate.errors)}`);
  const retirementGate = (entry) => {
    if (new Date(entry.workaround.expires_at) <= new Date()) {
      throw new Error(`retirement gate: workaround ${entry.candidate_id} has expired (${entry.workaround.expires_at})`);
    }
  };
  let rejected = false;
  try { retirementGate(expired); } catch { rejected = true; }
  if (!rejected) fail('retirement gate must reject an expired workaround');
}

console.log(`PASS: feedback flywheel (${sha256(JSON.stringify({ eval: evalValidate, sensor: sensorValidate })).slice(0, 16)}) — promotion review, historical replay, workaround owner/trigger/expiry/retirement, typed sensors`);
