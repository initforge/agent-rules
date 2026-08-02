/**
 * operating-model-crosswalk.test.ts — filesystem-probed crosswalk tests.
 *
 * Tests the operating-model crosswalk using the ledger-free filesystem compiler
 * (om-deterministic-compiler.ts). No ledger required — evidence status derives
 * from module/test file existence probes against the repo root.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseOMRequirements,
  parseOMSubsystems,
  parseOMDoD,
  compileOperatingModelCrosswalk,
  resolveOperatingModelPath,
  crosswalkOperatingModel,
  type OMClaim,
} from '../dist/operating-model-crosswalk.js';
import { evaluateClaimFormulas } from '../dist/claim-registry.js';
import { compileRequirements, readLedger, resolveAmendmentPaths } from '../dist/plan-readiness.js';
import {
  compileOMCrosswalk,
  compileOMClaims as compileOMClaimsFS,
  deterministicCompile,
  compileFromRepo,
  parseRequirements,
  parseSubsystems,
  parseDoD,
} from '../dist/om-deterministic-compiler.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const PLAN_ID = 'agent-rules-harness-v3-rearchitecture-20260726-r1';
const LEDGER_PATH = path.join(REPO_ROOT, '.agent', 'ledger', `${PLAN_ID}.json`);
const PLAN_DIR = path.join(REPO_ROOT, '.agent', 'plans', PLAN_ID);
const OM_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'target-operating-model.md');

const hasRealLedger = fs.existsSync(LEDGER_PATH);
const hasRealOM = fs.existsSync(OM_PATH);

function getPlanRequirements() {
  const ledger = readLedger(LEDGER_PATH);
  const amendmentPaths = resolveAmendmentPaths({ planDir: PLAN_DIR });
  return compileRequirements(ledger, amendmentPaths, undefined, REPO_ROOT);
}

// ── Crosswalk parsing ─────────────────────────────────────────────────────────

describe('parseOMRequirements — R-001..R-042 from section 12', () => {
  it('parses all 42 requirements', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseOMRequirements(text);
    expect(reqs.length).toBe(42);
  });

  it('R-001..R-042 sorted by ID', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseOMRequirements(text);
    for (let i = 0; i < reqs.length; i++) {
      expect(reqs[i].id).toBe('R-' + String(i + 1).padStart(3, '0'));
    }
  });

  it('all parsed requirements have non-empty description and valid status', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseOMRequirements(text);
    const validStatuses = ['PLANNED', 'OPERATIONAL', 'COMPLETED', 'PARTIAL', 'VERIFIED', 'NOT_STARTED'];
    for (const r of reqs) {
      expect(r.description.length, r.id).toBeGreaterThan(0);
      expect(validStatuses, r.id).toContain(r.status);
    }
  });
});

describe('parseOMSubsystems — SS-01..SS-24 from section 6', () => {
  it('parses all 24 subsystems', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseOMSubsystems(text);
    expect(subs.length).toBe(24);
  });

  it('SS-12 (workspace isolation) status is NOT_STARTED', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseOMSubsystems(text);
    const ss12 = subs.find((s) => s.id === 'SS-12');
    expect(ss12?.status).toBe('NOT_STARTED');
  });

  it('SS-04 (contracts) milestone is M3 and status is VERIFIED', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseOMSubsystems(text);
    const ss04 = subs.find((s) => s.id === 'SS-04');
    expect(ss04?.milestone).toBe('M3');
    expect(ss04?.status).toBe('VERIFIED');
  });
});

describe('parseOMDoD — 48 items from section 8', () => {
  it('parses DoD items (≥40 expected)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseOMDoD(text);
    expect(items.length).toBeGreaterThanOrEqual(40);
  });

  it('DoD-01 is "main is canonical"', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseOMDoD(text);
    expect(items[0]?.description).toBe('`main` is canonical');
  });

  it('DoD-48 references SS-24', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseOMDoD(text);
    expect(items[items.length - 1]?.description).toContain('SS-24');
  });
});

// ── Ledger-free crosswalk (filesystem-probed) ──────────────────────────────────

describe('compileOperatingModelCrosswalk — filesystem-probed truthful derivation', () => {
  // Ledger-free: uses module/test existence probes.

  it('crosswalk contains 42 R + 24 SS + DoD entries', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const rCount = entries.filter((e) => e.kind === 'R').length;
    const ssCount = entries.filter((e) => e.kind === 'SS').length;
    expect(rCount).toBe(42);
    expect(ssCount).toBe(24);
    expect(entries.length).toBeGreaterThanOrEqual(42 + 24);
  });

  it('unmapped R-ids (R-004, R-033, R-038, R-041) are GAP', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    for (const unmapped of ['R-004', 'R-033', 'R-038', 'R-041']) {
      const entry = entries.find((e) => e.omId === unmapped);
      expect(entry?.evidenceStatus, unmapped).toBe('GAP');
      expect(entry?.planAnchor, unmapped).toBeNull();
    }
  });

  it('SS-12 (NOT_STARTED) stays GAP regardless of M11-R anchor', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const ss12 = entries.find((e) => e.omId === 'SS-12');
    expect(ss12?.evidenceStatus).toBe('GAP');
    expect(ss12?.subsystemStatus).toBe('NOT_STARTED');
  });

  it('MATCH entries have non-empty evidenceHashes', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const match = entries.filter((e) => e.evidenceStatus === 'MATCH');
    for (const e of match) {
      expect(e.evidenceHashes.length).toBeGreaterThan(0);
      expect(e.modulesPresent.length).toBeGreaterThan(0);
    }
  });

  it('GAP/UNOBSERVED entries have honest explanatory notes', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    for (const e of entries) {
      if (e.evidenceStatus === 'GAP' || e.evidenceStatus === 'UNOBSERVED') {
        expect(e.notes.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Claim compilation (filesystem-probed) ───────────────────────────────────────

describe('compileOMClaims (filesystem) — ClaimDefinition entries', () => {
  it('every filesystem entry compiles into a ClaimDefinition', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    expect(claims.length).toBe(entries.length);
  });

  it('every claim has all required fields', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    for (const c of claims) {
      expect(c.claim_id).toMatch(/^CLAIM-OM-/);
      expect(c.requirement_id).toMatch(/^(R-\d+|SS-\d+|DoD-\d+)/);
      expect(c.plan_anchor.length).toBeGreaterThan(0);
      expect(c.meaning.length).toBeGreaterThan(0);
      expect(c.scope.length).toBeGreaterThan(0);
      expect(c.positive_invariants.length).toBeGreaterThan(0);
      expect(c.negative_invariants.length).toBeGreaterThan(0);
      expect(c.required_evidence.length).toBeGreaterThan(0);
      expect(c.terminal_weight).toBeGreaterThan(0);
    }
  });

  it('SS-17 (UI parity) gets T-Visual tier', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    const ss17 = claims.find((c) => c.requirement_id === 'SS-17');
    expect(ss17?.risk_tier).toBe('T-Visual');
  });

  it('SS-24 (cleanup) gets T3 tier', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    const ss24 = claims.find((c) => c.requirement_id === 'SS-24');
    expect(ss24?.risk_tier).toBe('T3');
  });

  it('risk tiers are valid for all entries', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    const valid = ['T0', 'T1', 'T2', 'T3', 'T-Visual', 'T-Global'];
    for (const c of claims) {
      expect(valid).toContain(c.risk_tier);
    }
  });
});

// ── Deterministic compile full pipeline ───────────────────────────────────────

describe('deterministicCompile (ledger-free) — full pipeline', () => {
  it('counts 42 R + 24 SS + DoD', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
    expect(result.dodCount).toBeGreaterThanOrEqual(40);
  });

  it('every claim has a corresponding entry', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const c of result.claims) {
      const entry = result.entries.find((e) => e.omId === c.requirement_id);
      expect(entry, c.requirement_id).toBeDefined();
    }
  });

  it('formulaSummary.byClaim covers every claim', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const c of result.claims) {
      expect(result.formulaSummary.byClaim[c.claim_id]).toBeDefined();
    }
  });

  it('GAP/UNOBSERVED claims have honest maturity (UNOBSERVED or WAITING_CAPABILITY)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const e of result.entries) {
      if (e.evidenceStatus === 'GAP' || e.evidenceStatus === 'UNOBSERVED') {
        const maturity = result.formulaSummary.byClaim[`CLAIM-OM-${e.omId}-1`]?.maturity;
        const claim = result.claims.find((c) => c.claim_id === `CLAIM-OM-${e.omId}-1`);
        if (['T2', 'T3', 'T-Global'].includes(claim?.risk_tier ?? '')) {
          expect(maturity).toBe('WAITING_CAPABILITY');
        } else {
          expect(maturity).toBe('UNOBSERVED');
        }
      }
    }
  });

  it('formulaState is accessible and boolean', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    expect(result.formulaState).toBeDefined();
    expect(typeof result.formulaState.LOCAL_READY).toBe('boolean');
  });

  it('compileFromRepo resolves and compiles', () => {
    const result = compileFromRepo(REPO_ROOT);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
    expect(result.claims.length).toBeGreaterThan(0);
  });
});

// ── Ledger-dependent crosswalk (preserved, skipped without ledger) ─────────────

const maybe = hasRealLedger ? it : it.skip;
const maybeOM = hasRealOM ? it : it.skip;

describe('compileOperatingModelCrosswalk (ledger) — legacy ledger-dependent crosswalk', () => {
  maybeOM('crosswalk contains R + SS + DoD entries', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = getPlanRequirements();
    const omClaims = compileOperatingModelCrosswalk(text, reqs);
    expect(omClaims.length).toBeGreaterThanOrEqual(42 + 24);
  });

  maybe('unmapped R-ids stay GAP', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = getPlanRequirements();
    const omClaims = compileOperatingModelCrosswalk(text, reqs);
    for (const id of ['R-004', 'R-033', 'R-038', 'R-041']) {
      const claim = omClaims.find((c) => c.om_id === id);
      expect(claim?.status).toBe('GAP');
    }
  });

  maybe('GAP entries have empty evidenceHashes', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = getPlanRequirements();
    const omClaims = compileOperatingModelCrosswalk(text, reqs);
    const gap = omClaims.filter((c) => c.status === 'GAP');
    expect(gap.length).toBeGreaterThan(0);
    for (const c of gap) {
      expect(c.evidenceHashes.length, c.om_id).toBe(0);
    }
  });
});

describe('evaluateClaimFormulas integration — ledger-based OM claims', () => {
  maybeOM('OM claims integrate with evaluateClaimFormulas', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaimsFS(entries);
    const evByClaim: Record<string, object> = {};
    for (const c of claims) {
      const entry = entries.find((e) => `CLAIM-OM-${e.omId}-1` === c.claim_id)!;
      if (entry.evidenceStatus === 'GAP' || entry.evidenceStatus === 'UNOBSERVED') {
        evByClaim[c.claim_id] = {};
      } else {
        evByClaim[c.claim_id] = {
          present: true, valid: true, fresh: true,
          independently_reproduced: true, terminal_eligible: true,
          capabilities: c.required_capabilities,
        };
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = evaluateClaimFormulas(claims, evByClaim as any);
    expect(summary.byClaim).toBeDefined();
  });
});

describe('resolveOperatingModelPath', () => {
  it('resolves to target-operating-model.md', () => {
    const p = resolveOperatingModelPath(REPO_ROOT);
    expect(p).toContain('target-operating-model.md');
  });
});

describe('crosswalkOperatingModel — full pipeline', () => {
  maybe('returns claims + metadata counts', () => {
    const result = crosswalkOperatingModel(REPO_ROOT, LEDGER_PATH, PLAN_DIR);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
    expect(result.claims.length).toBeGreaterThanOrEqual(42 + 24);
  });

  maybe('every claim corresponds to an omClaim', () => {
    const result = crosswalkOperatingModel(REPO_ROOT, LEDGER_PATH, PLAN_DIR);
    for (const c of result.claims) {
      const omClaim = result.omClaims.find((o) => o.om_id === c.requirement_id);
      expect(omClaim).toBeDefined();
    }
  });
});
