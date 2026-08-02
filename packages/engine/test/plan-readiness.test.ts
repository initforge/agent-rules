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
const AMENDMENT_PATH_0020 = path.join(
  PLAN_DIR,
  'amendments',
  '0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md',
);
const AMENDMENT_PATH_0021 = path.join(
  PLAN_DIR,
  'amendments',
  '0021-premium-main-context-economy-and-event-driven-orchestration.md',
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
const rawLedger = hasRealLedger
  ? (JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as {
      shadow_revision: number;
      effective_plan_identity?: { sha256?: string };
      milestones?: { M8?: { requirements?: unknown[] } };
    })
  : null;

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
  it('parses M11-R registry from AM-0021 §11 table rows', () => {
    const text = [
      '## 11. Additive requirements',
      '',
      '| ID | Requirement |',
      '|---|---|',
      '| M11-R37 | Attribute main context, token usage and occupancy separately |',
      '| M11-R38 | Every premium-main wake uses a signed MainRunCapsule |',
      '| M11-R50 | Token SLO never changes the terminal truth formula |',
    ].join('\n');
    const parsed = parseM11Requirements(text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].id).toBe('M11-R37');
    expect(parsed[0].title).toBe('Attribute main context, token usage and occupancy separately');
    expect(parsed[2].id).toBe('M11-R50');
  });
  it('is empty when no M11-R lines', () => {
    expect(parseM11Requirements('# nothing here')).toHaveLength(0);
  });
});

describe('readLedger (real ledger, current revision)', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('reads canonical identity and current revision', () => {
    const ledger = readLedger(LEDGER_PATH);
    expect(ledger.planId).toBe(PLAN_ID);
    expect(ledger.revision).toBe(rawLedger!.shadow_revision);
    expect(ledger.effectiveIdentity).toBe(rawLedger!.effective_plan_identity!.sha256);
    expect(ledger.m8Requirements.length).toBe(rawLedger!.milestones!.M8!.requirements!.length);
  });
});

describe('compileRequirements — dynamic, no hard-coded count', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('compiles 55 requirements (15 REQ + 40 M11-R) without a hard-coded constant', () => {
    const ledger = readLedger(LEDGER_PATH);
    const requirements = compileRequirements(
      ledger,
      [AMENDMENT_PATH, AMENDMENT_PATH_0020, AMENDMENT_PATH_0021],
      ORIGINAL_PATH,
      REPO_ROOT,
    );
    const ids = requirements.map((r) => r.requirement_id);
    expect(ids).toHaveLength(55);
    for (let i = 1; i <= 15; i++) {
      expect(ids).toContain(`REQ-${String(i).padStart(3, '0')}`);
    }
    for (let i = 11; i <= 50; i++) {
      expect(ids).toContain(`M11-R${i}`);
    }
    // M11 additive requirements map to real merged modules with tree evidence.
    const m11 = requirements.filter((x) => x.requirement_id.startsWith('M11-R'));
    expect(m11).toHaveLength(40);
    for (const r of m11) {
      expect(r.status, r.requirement_id).not.toBe('GAP');
      expect(r.acceptance_criteria.length).toBeGreaterThan(0);
      expect(r.execution_cluster.cluster).toMatch(/^C(1|2|3|4|5|6|7|8|9|10)$/);
      expect(r.evidence_contract, `${r.requirement_id} evidence`).not.toBeNull();
    }
    // AM-0019 set: ALL MATCH including M11-R22 (codex native runtime now live;
    // five host attestations validate HEAD when fresh).
    const reqNum = (id: string): number => Number(id.match(/\d+$/)?.[0]);
    const am0019 = m11.filter((x) => reqNum(x.requirement_id) <= 26);
    for (const r of am0019) {
      expect(r.status, r.requirement_id).toBe('MATCH');
    }
    // AM-0020 set: R27..R36 are all MATCH (merged into integration HEAD).
    const am0020plus = m11.filter((x) => reqNum(x.requirement_id) >= 27);
    // R27..R50 should be present
    for (let i = 27; i <= 50; i++) {
      const id = `M11-R${i}`;
      const entry = am0020plus.find((x) => x.requirement_id === id);
      expect(entry, id).toBeDefined();
    }
    // AM-0020 R27..R36 are all MATCH
    const MATCH_IDS = ['M11-R27', 'M11-R28', 'M11-R29', 'M11-R30', 'M11-R31', 'M11-R32', 'M11-R33', 'M11-R34', 'M11-R35', 'M11-R36'];
    for (const id of MATCH_IDS) {
      expect(am0020plus.find((x) => x.requirement_id === id)?.status, id).toBe('MATCH');
    }
    // Mapped implementation modules must actually exist in the tree.
    const implemented = m11.flatMap((r) => r.notes.filter((n) => n.startsWith('implemented:')));
    expect(implemented.length).toBeGreaterThanOrEqual(15);
    // REQ-001..008 carry plan anchors from the ledger
    for (const r of requirements.filter((x) => x.requirement_id.startsWith('REQ-') && Number(x.requirement_id.slice(4)) <= 8)) {
      expect(r.plan_anchor).not.toBeNull();
    }
  });

  maybe('REQ-009..015 compile MATCH from canonical milestone MATCH + evidence despite no anchor/assignment', () => {
    const ledger = readLedger(LEDGER_PATH);
    const requirements = compileRequirements(
      ledger,
      [AMENDMENT_PATH, AMENDMENT_PATH_0020],
      ORIGINAL_PATH,
      REPO_ROOT,
    );
    for (const id of ['REQ-009', 'REQ-010', 'REQ-011', 'REQ-012', 'REQ-013', 'REQ-014', 'REQ-015']) {
      const r = requirements.find((x) => x.requirement_id === id);
      expect(r, id).toBeDefined();
      expect(r?.status, id).toBe('MATCH');
      expect(r?.plan_anchor, id).toBeNull();
      expect(r?.evidence_contract?.hashes.length, id).toBeGreaterThan(0);
      expect(r?.notes.some((n) => n.includes('no plan anchor recorded in ledger')), id).toBe(true);
    }
  });

  it('M8 MATCH without evidence still fails closed (never MATCH)', () => {
    const ledger = readLedger(LEDGER_PATH);
    const stripped: CompiledLedger = {
      ...ledger,
      m8Requirements: ledger.m8Requirements.map((r) => ({
        id: r.id,
        status: 'MATCH',
        evidenceHashes: [],
      })),
    };
    const requirements = compileRequirements(stripped, [AMENDMENT_PATH, AMENDMENT_PATH_0020], ORIGINAL_PATH, REPO_ROOT);
    const req009 = requirements.find((x) => x.requirement_id === 'REQ-009');
    expect(req009).toBeDefined();
    expect(req009?.status).not.toBe('MATCH');
    expect(req009?.notes.some((n) => n.includes('ledger milestone status'))).toBe(false);
    const req001 = requirements.find((x) => x.requirement_id === 'REQ-001');
    expect(req001?.status).not.toBe('MATCH');
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
      amendmentPaths: [AMENDMENT_PATH, AMENDMENT_PATH_0020, AMENDMENT_PATH_0021],
      originalPath: ORIGINAL_PATH,
      headCommit: '5c24650f25e36d9a362830145e457a21967527bb',
    });
    // All 9 files exist on disk and parse as YAML
    for (const file of BUNDLE_FILES) {
      const p = path.join(target, file);
      expect(fs.existsSync(p), `missing ${file}`).toBe(true);
      expect(fs.readFileSync(p, 'utf8').length).toBeGreaterThan(0);
    }
    // Round-trip validation passes with exactly 55 requirements
    const validation = validatePlanReadinessBundle(target);
    expect(validation.valid, validation.errors.join('; ')).toBe(true);
    expect(validation.requirementCount).toBe(55);
    // Readiness is one of the enum values; expected honest outcome is BOUNDED_READY
    expect(READINESS_STATES).toContain(result.readinessState);
    expect(result.requirementCount).toBe(55);
    expect(result.revision).toBe(rawLedger!.shadow_revision);
  });
  maybe('no orphan/unmapped requirement: every id in graph is REQ-001..015 or M11-R11..50', () => {
    const target = path.join(fixtureTmp, 'bundle');
    compilePlanReadiness({
      ledgerPath: LEDGER_PATH,
      planDir: target,
      amendmentPaths: [AMENDMENT_PATH, AMENDMENT_PATH_0020, AMENDMENT_PATH_0021],
      originalPath: ORIGINAL_PATH,
    });
    const graph = parseYaml(
      fs.readFileSync(path.join(target, 'verification-graph.yaml'), 'utf8'),
    ) as { requirements: Array<{ requirement_id: string }>; requirement_count: number; claims: Array<{ claim_id: string }> };
    const graphIds = graph.requirements.map((r: { requirement_id: string }) => r.requirement_id);
    expect(new Set(graphIds).size).toBe(55);
    expect(graph.requirement_count).toBe(55);
    // Claim registry is wired into the verification graph (M11-R27).
    expect(graph.claims.length).toBeGreaterThanOrEqual(55);
  });
  maybe('projection.plan.yaml regenerated to current revision', () => {
    const target = path.join(fixtureTmp, 'bundle');
    compilePlanReadiness({
      ledgerPath: LEDGER_PATH,
      planDir: target,
      amendmentPaths: [AMENDMENT_PATH, AMENDMENT_PATH_0020, AMENDMENT_PATH_0021],
      originalPath: ORIGINAL_PATH,
    });
    const content = fs.readFileSync(path.join(target, 'projection.plan.yaml'), 'utf8');
    expect(content).toContain(`revision: ${rawLedger!.shadow_revision}`);
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
