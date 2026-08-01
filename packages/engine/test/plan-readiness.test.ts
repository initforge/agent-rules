import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  compilePlanReadiness,
  validatePlanReadinessBundle,
  compileRequirements,
  parseM11Requirements,
  deriveReadiness,
  readLedger,
  detectHostProbe,
  BUNDLE_FILES,
  READINESS_STATES,
  type HostProbe,
} from '../src/plan-readiness.js';
import type { CompiledLedger } from '../src/plan-readiness.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
const LEDGER_PATH = path.join(REPO_ROOT, '.agent', 'ledger', `${PLAN_ID}.json`);
const PLAN_DIR = path.join(REPO_ROOT, '.agent', 'plans', PLAN_ID);

const AMENDMENT_PATH = path.join(
  PLAN_DIR,
  'amendments',
  '0019-autonomous-native-swarm-whole-system-convergence.md',
);
const ORIGINAL_PATH = path.join(PLAN_DIR, 'original.md');

const fixtureTmp = path.join(os.tmpdir(), `plan-readiness-test-${process.pid}-${Date.now()}`);
fs.mkdirSync(fixtureTmp, { recursive: true });

function hostProbe(): HostProbe {
  return {
    tools: ['claude'],
    cpuCount: 8,
    totalMemMb: 16384,
    externalCiGreen: false,
    ciChecks: [{ workflow: 'quality', check: 'quality-macos', conclusion: 'failure', commitSha: 'abc' }],
  };
}

const hasRealLedger = fs.existsSync(LEDGER_PATH);

describe('parseM11Requirements', () => {
  it('parses M11-R registry from AM-0019 §14 text', () => {
    const text = [
      '## 14. Additive requirement registry',
      '',
      '- M11-R11 Plan readiness and semantic coverage.',
      '- M11-R12 Authority, decisions and clarification completeness.',
      '- M11-R26 Controlled dogfood and adversarial closure.',
    ].join('\n');
    const parsed = parseM11Requirements(text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].id).toBe('M11-R11');
    expect(parsed[2].id).toBe('M11-R26');
  });
  it('is empty when no M11-R lines', () => {
    expect(parseM11Requirements('# nothing here')).toHaveLength(0);
  });
});

describe('readLedger (real r57 ledger)', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('reads canonical identity and revision 57', () => {
    const ledger = readLedger(LEDGER_PATH);
    expect(ledger.planId).toBe(PLAN_ID);
    expect(ledger.revision).toBe(57);
    expect(ledger.effectiveIdentity).toBe('1d524a2706c1bb9c2aa19945de1197015bbbbc4ce7ef54cb0a37ef54f5ca4c27');
    expect(ledger.m8Requirements.length).toBe(15);
  });
});

describe('compileRequirements — dynamic, no hard-coded count', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('compiles 31 requirements (15 REQ + 16 M11-R) without a hard-coded constant', () => {
    const ledger = readLedger(LEDGER_PATH);
    const requirements = compileRequirements(ledger, AMENDMENT_PATH, ORIGINAL_PATH);
    const ids = requirements.map((r) => r.requirement_id);
    expect(ids).toHaveLength(31);
    for (let i = 1; i <= 15; i++) {
      expect(ids).toContain(`REQ-${String(i).padStart(3, '0')}`);
    }
    for (let i = 11; i <= 26; i++) {
      expect(ids).toContain(`M11-R${i}`);
    }
    // M11 additive requirements have no implementation -> honest GAP, no invented evidence
    for (const r of requirements.filter((x) => x.requirement_id.startsWith('M11-R'))) {
      expect(r.status).toBe('GAP');
      expect(r.evidence_contract).toBeNull();
      expect(r.acceptance_criteria).toHaveLength(0);
    }
    // REQ-001..008 carry plan anchors from the ledger
    for (const r of requirements.filter((x) => x.requirement_id.startsWith('REQ-') && Number(x.requirement_id.slice(4)) <= 8)) {
      expect(r.plan_anchor).not.toBeNull();
    }
  });
});

describe('deriveReadiness', () => {
  it('BOUNDED_READY when missing claude, external CI red, or GAP requirements', () => {
    const ledger = {
      planId: PLAN_ID, originalSha: 'a'.repeat(64), effectiveIdentity: 'b'.repeat(64),
      revision: 57, m8Requirements: [], m11Identity: null, anchors: [], assignments: [],
      amendments: [], ciChecks: [], headCommit: null, executionState: 'EXECUTING',
      status: 'ADOPTED', latestReviewStale: false,
    } as CompiledLedger;
    const result = deriveReadiness([], { ...hostProbe(), tools: [] }, ledger);
    expect(result.state).toBe('BOUNDED_READY');
    expect(result.reasons.some((r) => r.includes('claude'))).toBe(true);
  });
  it('AUTONOMOUS_READY only when tools, CI and full MATCH are present', () => {
    const ledger = {
      planId: PLAN_ID, originalSha: 'a'.repeat(64), effectiveIdentity: 'b'.repeat(64),
      revision: 57, m8Requirements: [], m11Identity: null, anchors: [], assignments: [],
      amendments: [], ciChecks: [], headCommit: null, executionState: 'EXECUTING',
      status: 'ADOPTED', latestReviewStale: false,
    } as CompiledLedger;
    const probe: HostProbe = {
      tools: ['claude', 'opencode'], cpuCount: 8, totalMemMb: 16384,
      externalCiGreen: true, ciChecks: [],
    };
    const result = deriveReadiness([], probe, ledger);
    expect(result.state).toBe('AUTONOMOUS_READY');
  });
  it('state is always one of the three enum values', () => {
    const ledger = {
      planId: PLAN_ID, originalSha: 'a'.repeat(64), effectiveIdentity: 'b'.repeat(64),
      revision: 57, m8Requirements: [], m11Identity: null, anchors: [], assignments: [],
      amendments: [], ciChecks: [], headCommit: null, executionState: null,
      status: null, latestReviewStale: null,
    } as CompiledLedger;
    for (const tools of [['claude'], ['claude', 'opencode'], []]) {
      const r = deriveReadiness([], { ...hostProbe(), tools }, ledger);
      expect(READINESS_STATES).toContain(r.state);
    }
  });
});

describe('bundle round-trip on real plan', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('atomically writes and validates the 9-file bundle', () => {
    const target = path.join(fixtureTmp, 'bundle');
    const result = compilePlanReadiness({
      ledgerPath: LEDGER_PATH,
      planDir: target,
      amendmentPath: AMENDMENT_PATH,
      originalPath: ORIGINAL_PATH,
      headCommit: '5c24650f25e36d9a362830145e457a21967527bb',
    });
    // All 9 files exist on disk and parse as YAML
    for (const file of BUNDLE_FILES) {
      const p = path.join(target, file);
      expect(fs.existsSync(p), `missing ${file}`).toBe(true);
      expect(fs.readFileSync(p, 'utf8').length).toBeGreaterThan(0);
    }
    // Round-trip validation passes with exactly 31 requirements
    const validation = validatePlanReadinessBundle(target);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    expect(validation.requirementCount).toBe(31);
    // Readiness is one of the enum values; expected honest outcome is BOUNDED_READY
    expect(READINESS_STATES).toContain(result.readinessState);
    expect(result.requirementCount).toBe(31);
    expect(result.revision).toBe(57);
  });
  maybe('no orphan/unmapped requirement: every id in graph is REQ-001..015 or M11-R11..26', () => {
    const target = path.join(fixtureTmp, 'bundle');
    compilePlanReadiness({
      ledgerPath: LEDGER_PATH,
      planDir: target,
      amendmentPath: AMENDMENT_PATH,
      originalPath: ORIGINAL_PATH,
    });
    const graph = parseYaml(
      fs.readFileSync(path.join(target, 'verification-graph.yaml'), 'utf8'),
    ) as { requirements: Array<{ requirement_id: string }>; requirement_count: number };
    const graphIds = graph.requirements.map((r: { requirement_id: string }) => r.requirement_id);
    expect(new Set(graphIds).size).toBe(31);
    expect(graph.requirement_count).toBe(31);
  });
  maybe('projection.plan.yaml regenerated to r57', () => {
    const target = path.join(fixtureTmp, 'bundle');
    compilePlanReadiness({
      ledgerPath: LEDGER_PATH,
      planDir: target,
      amendmentPath: AMENDMENT_PATH,
      originalPath: ORIGINAL_PATH,
    });
    const content = fs.readFileSync(path.join(target, 'projection.plan.yaml'), 'utf8');
    expect(content).toContain('revision: 57');
    expect(content).toContain('milestone: M11');
  });
});

describe('detectHostProbe', () => {
  it('reports external CI green only when every check passes', () => {
    const probe = detectHostProbe([
      { workflow: 'quality', check: 'quality-linux', conclusion: 'success' },
      { workflow: 'quality', check: 'quality-macos', conclusion: 'failure' },
    ]);
    expect(probe.externalCiGreen).toBe(false);
    const green = detectHostProbe([
      { workflow: 'quality', check: 'quality-linux', conclusion: 'success', passed: true },
    ]);
    expect(green.externalCiGreen).toBe(true);
  });
  it('returns numeric host capability fields', () => {
    const probe = detectHostProbe([]);
    expect(probe.cpuCount).toBeGreaterThan(0);
    expect(probe.totalMemMb).toBeGreaterThan(0);
  });
});
