import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  compileClaims,
  evaluateClaimFormulas,
  parseM11ClaimTitles,
  EVIDENCE_MATURITIES,
  CLAIM_FORMULAS,
  MATURITY_RANK,
  FORMULA_THRESHOLDS,
  type ClaimDefinition,
  type ClaimEvidenceInput,
  type EvidenceMaturity,
} from '../src/claim-registry.js';
import { compileRequirements, readLedger } from '../src/plan-readiness.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
const LEDGER_PATH = path.join(REPO_ROOT, '.agent', 'ledger', `${PLAN_ID}.json`);
const PLAN_DIR = path.join(REPO_ROOT, '.agent', 'plans', PLAN_ID);
const AMENDMENT_PATH_0019 = path.join(PLAN_DIR, 'amendments', '0019-autonomous-native-swarm-whole-system-convergence.md');
const AMENDMENT_PATH_0020 = path.join(PLAN_DIR, 'amendments', '0020-epistemic-integrity-adversarial-review-and-truthful-reporting.md');

const hasRealLedger = fs.existsSync(LEDGER_PATH);

function compileRealClaims(): { claims: ClaimDefinition[]; requirements: ReturnType<typeof compileRequirements> } {
  const ledger = readLedger(LEDGER_PATH);
  const requirements = compileRequirements(ledger, [AMENDMENT_PATH_0019, AMENDMENT_PATH_0020], path.join(PLAN_DIR, 'original.md'), REPO_ROOT);
  const amendmentTexts = [AMENDMENT_PATH_0019, AMENDMENT_PATH_0020].map((p) => fs.readFileSync(p, 'utf8'));
  return { claims: compileClaims({ requirements, amendmentTexts }), requirements };
}

/** All-blocked evidence: nothing observed. */
const none: ClaimEvidenceInput = {};
/** Full evidence: fresh, valid, independently reproduced, terminal eligible. */
function full(): ClaimEvidenceInput {
  return { present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true, capabilities: ['specialist', 'vision', 'cdp', 'deterministic-verifier'] };
}

describe('parseM11ClaimTitles', () => {
  it('parses AM-0020 §14 R27..R36 titles', () => {
    const text = [
      '## 14. Additive requirements',
      '',
      '- M11-R27 Claim semantics registry.',
      '- M11-R36 Claim calibration telemetry.',
    ].join('\n');
    const titles = parseM11ClaimTitles(text);
    expect(titles.get('M11-R27')).toBe('Claim semantics registry');
    expect(titles.get('M11-R36')).toBe('Claim calibration telemetry');
  });
});

describe('compileClaims — dynamic claim registry over the 41 effective requirements', () => {
  const maybe = hasRealLedger ? it : it.skip;
  maybe('every effective requirement (41) compiles into ≥1 claim; count derives from the plan, never a constant', () => {
    const { claims, requirements } = compileRealClaims();
    expect(requirements).toHaveLength(41);
    const byReq = new Map<string, number>();
    for (const c of claims) byReq.set(c.requirement_id, (byReq.get(c.requirement_id) ?? 0) + 1);
    // Every requirement has ≥1 claim and no orphan claim exists.
    for (const r of requirements) {
      expect(byReq.get(r.requirement_id) ?? 0, r.requirement_id).toBeGreaterThanOrEqual(1);
    }
    expect(claims.length).toBeGreaterThanOrEqual(41);
    // All AM-0020 §2 fields are present on every claim.
    for (const c of claims) {
      expect(c.claim_id).toMatch(/^CLAIM-/);
      expect(c.plan_anchor.length).toBeGreaterThan(0);
      expect(c.meaning.length).toBeGreaterThan(0);
      expect(c.scope.length).toBeGreaterThan(0);
      expect(c.positive_invariants.length).toBeGreaterThan(0);
      expect(c.negative_invariants.length).toBeGreaterThan(0);
      expect(c.required_evidence.length).toBeGreaterThan(0);
      expect(c.required_capabilities.length).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(c.freshness_dependencies)).toBe(true);
      expect(c.terminal_weight).toBeGreaterThan(0);
    }
  });

  maybe('risk tiers are assigned and T3 claims carry security/concurrency/migration/release scope', () => {
    const { claims } = compileRealClaims();
    const tiers = new Set(claims.map((c) => c.risk_tier));
    for (const tier of ['T0', 'T1', 'T2', 'T3', 'T-Visual', 'T-Global'] as const) {
      expect(tiers.has(tier), tier).toBe(true);
    }
    const t3 = claims.filter((c) => c.risk_tier === 'T3');
    expect(t3.length).toBeGreaterThan(0);
    for (const c of t3) {
      const scope = c.scope.join(' ');
      expect(scope, c.claim_id).toMatch(/security|concurrency|finance|migration|release/);
      expect(c.required_capabilities, c.claim_id).toContain('specialist');
    }
    // R30 (adversarial counterexample compiler) and R34 (machine terminal reporting) are T3.
    for (const id of ['M11-R30', 'M11-R34']) {
      expect(claims.find((c) => c.requirement_id === id)?.risk_tier).toBe('T3');
    }
  });

  maybe('visual claims require the vision capability', () => {
    const { claims } = compileRealClaims();
    const visual = claims.filter((c) => c.risk_tier === 'T-Visual' || c.scope.includes('visual'));
    expect(visual.length).toBeGreaterThan(0);
    for (const c of visual) {
      expect(c.required_capabilities, c.claim_id).toContain('vision');
    }
    // R20/R21 paired REF/TGT + non-vision visual verification carry vision + cdp.
    for (const id of ['M11-R20', 'M11-R21']) {
      const claim = claims.find((c) => c.requirement_id === id);
      expect(claim?.required_capabilities).toContain('vision');
    }
  });

  maybe('AM-0020 R27..R36 claims derive from the amendment §14 registry', () => {
    const { claims } = compileRealClaims();
    for (let i = 27; i <= 36; i++) {
      const id = `M11-R${i}`;
      const claim = claims.find((c) => c.requirement_id === id);
      expect(claim, id).toBeDefined();
      expect(claim?.meaning.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateClaimFormulas — maturity ladder and fail-closed aggregates', () => {
  it('promotes PRESENT→VALID→FRESH→INDEPENDENTLY_REPRODUCED→TERMINAL_ELIGIBLE', () => {
    const claim: ClaimDefinition = {
      claim_id: 'CLAIM-REQ-001-1', requirement_id: 'REQ-001', plan_anchor: 's1', meaning: 'm', scope: ['s'],
      risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
    };
    const steps: Array<[ClaimEvidenceInput, EvidenceMaturity]> = [
      [{}, 'UNOBSERVED'],
      [{ present: true }, 'PRESENT'],
      [{ present: true, valid: true }, 'VALID'],
      [{ present: true, valid: true, fresh: true }, 'FRESH'],
      [{ present: true, valid: true, fresh: true, independently_reproduced: true }, 'INDEPENDENTLY_REPRODUCED'],
      [{ present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true }, 'TERMINAL_ELIGIBLE'],
    ];
    for (const [evidence, expected] of steps) {
      const summary = evaluateClaimFormulas([claim], { [claim.claim_id]: evidence });
      expect(summary.byClaim[claim.claim_id].maturity).toBe(expected);
    }
  });

  it('blocks the ladder on staleness, contradiction, partial, superseded-override and capability-invalid', () => {
    const claim: ClaimDefinition = {
      claim_id: 'CLAIM-T3-1', requirement_id: 'M11-R30', plan_anchor: 'a', meaning: 'm', scope: ['security'],
      risk_tier: 'T3', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: ['specialist'], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 5,
    };
    const cases: Array<[ClaimEvidenceInput, EvidenceMaturity]> = [
      // stale: explicit staleness after valid → PARTIAL
      [{ present: true, valid: true, stale: true, capabilities: ['specialist'] }, 'PARTIAL'],
      [{ present: true, valid: true, fresh: true, contradicted: true, capabilities: ['specialist'] }, 'CONTRADICTED'],
      [{ present: true, valid: true, fresh: true, partial: true, capabilities: ['specialist'] }, 'PARTIAL'],
      // capability-invalid: required specialist absent
      [{ present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true, capabilities: [] }, 'WAITING_CAPABILITY'],
      // approved deviation passes
      [{ superseded: true }, 'SUPERSEDED'],
    ];
    for (const [evidence, expected] of cases) {
      const summary = evaluateClaimFormulas([claim], { [claim.claim_id]: evidence });
      expect(summary.byClaim[claim.claim_id].maturity, JSON.stringify(evidence)).toBe(expected);
    }
  });

  it('LOCAL_READY is blocked by any PARTIAL / CONTRADICTED / stale / capability-invalid subclaim (fail closed)', () => {
    const claim: ClaimDefinition = {
      claim_id: 'CLAIM-REQ-002-1', requirement_id: 'REQ-002', plan_anchor: 'a', meaning: 'm', scope: ['s'],
      risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: ['specialist'], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
    };
    const blockedCases: ClaimEvidenceInput[] = [
      { present: true, valid: true, fresh: true, partial: true },
      { present: true, valid: true, fresh: true, contradicted: true },
      { present: true, valid: true, stale: true },
      { present: true, valid: true, fresh: true, independently_reproduced: true, capabilities: [] },
    ];
    for (const evidence of blockedCases) {
      const summary = evaluateClaimFormulas([claim], { [claim.claim_id]: evidence });
      expect(summary.formulaState.LOCAL_READY, JSON.stringify(evidence)).toBe(false);
      expect(summary.formulas.find((f) => f.formula === 'LOCAL_READY')?.blockedClaims.length).toBe(1);
    }
    const ok = evaluateClaimFormulas([claim], { [claim.claim_id]: full() });
    expect(ok.formulaState.LOCAL_READY).toBe(true);
    expect(ok.formulaState.HV3_M11_LOCAL_COMPLETE).toBe(true);
  });

  it('aggregate thresholds: LOCAL_READY < STAGING_READY ≤ PRODUCTION_READY < HV3_M11_LOCAL_COMPLETE', () => {
    const claim: ClaimDefinition = {
      claim_id: 'CLAIM-REQ-003-1', requirement_id: 'REQ-003', plan_anchor: 'a', meaning: 'm', scope: ['s'],
      risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
    };
    // FRESH alone satisfies LOCAL_READY but not STAGING_READY/PRODUCTION_READY.
    const freshOnly = evaluateClaimFormulas([claim], { [claim.claim_id]: { present: true, valid: true, fresh: true } });
    expect(freshOnly.formulaState.LOCAL_READY).toBe(true);
    expect(freshOnly.formulaState.STAGING_READY).toBe(false);
    // INDEPENDENTLY_REPRODUCED satisfies STAGING/PRODUCTION (T1 keeps the base threshold).
    const reproduced = evaluateClaimFormulas([claim], { [claim.claim_id]: { present: true, valid: true, fresh: true, independently_reproduced: true } });
    expect(reproduced.formulaState.STAGING_READY).toBe(true);
    expect(reproduced.formulaState.PRODUCTION_READY).toBe(true);
    expect(reproduced.formulaState.HV3_M11_LOCAL_COMPLETE).toBe(false);
    // TERMINAL_ELIGIBLE satisfies every aggregate.
    expect(freshOnly.formulaState.HV3_M11_LOCAL_COMPLETE).toBe(false);
    const terminal = evaluateClaimFormulas([claim], { [claim.claim_id]: { present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true } });
    for (const formula of CLAIM_FORMULAS) expect(terminal.formulaState[formula]).toBe(true);
  });

  it('PRODUCTION_READY demands TERMINAL_ELIGIBLE for T3/T-Visual/T-Global claims', () => {
    const t3: ClaimDefinition = {
      claim_id: 'CLAIM-T3', requirement_id: 'M11-R34', plan_anchor: 'a', meaning: 'm', scope: ['release'],
      risk_tier: 'T3', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: ['specialist'], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 5,
    };
    const reproduced = evaluateClaimFormulas([t3], { [t3.claim_id]: { present: true, valid: true, fresh: true, independently_reproduced: true, capabilities: ['specialist'] } });
    expect(reproduced.formulaState.PRODUCTION_READY).toBe(false);
    const pr = reproduced.formulas.find((f) => f.formula === 'PRODUCTION_READY');
    expect(pr?.reasons.join(' ')).toMatch(/TERMINAL_ELIGIBLE|below|blocked/i);
    const terminal = evaluateClaimFormulas([t3], { [t3.claim_id]: { present: true, valid: true, fresh: true, independently_reproduced: true, terminal_eligible: true, capabilities: ['specialist'] } });
    expect(terminal.formulaState.PRODUCTION_READY).toBe(true);
    expect(terminal.formulaState.HV3_M11_LOCAL_COMPLETE).toBe(true);
  });

  it('SUPERSEDED subclaim never blocks the aggregate (approved deviation)', () => {
    const a: ClaimDefinition = {
      claim_id: 'CLAIM-A', requirement_id: 'REQ-001', plan_anchor: 'a', meaning: 'm', scope: ['s'],
      risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
    };
    const b: ClaimDefinition = {
      claim_id: 'CLAIM-B', requirement_id: 'REQ-002', plan_anchor: 'a', meaning: 'm', scope: ['s'],
      risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
      required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
    };
    const summary = evaluateClaimFormulas([a, b], {
      [a.claim_id]: { superseded: true },
      [b.claim_id]: full(),
    });
    for (const formula of CLAIM_FORMULAS) expect(summary.formulaState[formula]).toBe(true);
  });

  it('closed enums: all 10 evidence maturity states and all 4 formula states are valid', () => {
    expect(EVIDENCE_MATURITIES).toHaveLength(10);
    expect(new Set(EVIDENCE_MATURITIES).size).toBe(10);
    expect(CLAIM_FORMULAS).toHaveLength(4);
    for (const m of EVIDENCE_MATURITIES) expect(m).toBeTruthy();
    expect(MATURITY_RANK.FRESH).toBeGreaterThan(MATURITY_RANK.VALID);
    expect(MATURITY_RANK.INDEPENDENTLY_REPRODUCED).toBeGreaterThan(MATURITY_RANK.FRESH);
    expect(MATURITY_RANK.TERMINAL_ELIGIBLE).toBeGreaterThan(MATURITY_RANK.INDEPENDENTLY_REPRODUCED);
    expect(MATURITY_RANK.SUPERSEDED).toBeGreaterThan(MATURITY_RANK.TERMINAL_ELIGIBLE);
    for (const m of ['PARTIAL', 'CONTRADICTED', 'WAITING_CAPABILITY'] as const) {
      expect(MATURITY_RANK[m]).toBe(-1);
    }
    expect(FORMULA_THRESHOLDS.STAGING_READY).toBeGreaterThan(FORMULA_THRESHOLDS.LOCAL_READY);
    expect(FORMULA_THRESHOLDS.HV3_M11_LOCAL_COMPLETE).toBeGreaterThanOrEqual(FORMULA_THRESHOLDS.STAGING_READY);
  });
});
