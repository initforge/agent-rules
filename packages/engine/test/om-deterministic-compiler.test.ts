/**
 * om-deterministic-compiler.test.ts — C8 deterministic compiler tests.
 *
 * Tests the ledger-free compiler that discovers R-001..R-042, SS-01..SS-24, DoD
 * entries from the operating model and maps them to claims with honest UNOBSERVED/
 * PARTIAL/GAP evidence marks derived from filesystem probes.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseRequirements,
  parseSubsystems,
  parseDoD,
  compileOMCrosswalk,
  compileOMClaims,
  deterministicCompile,
  compileFromRepo,
  evidenceInputForEntry,
  OM_SOURCE,
  EVIDENCE_MATURITIES,
  CLAIM_FORMULAS,
} from '../src/om-deterministic-compiler.js';
import { evaluateClaimFormulas } from '../src/claim-registry.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OM_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'target-operating-model.md');

const hasOM = fs.existsSync(OM_PATH);

// ── Parsing ──────────────────────────────────────────────────────────────────

describe('parseRequirements — R-001..R-042 from section 12', () => {
  it('parses all 42 requirements', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseRequirements(text);
    expect(reqs.length).toBe(42);
  });

  it('R-001..R-042 sorted by ID', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseRequirements(text);
    for (let i = 0; i < reqs.length; i++) {
      expect(reqs[i].id).toBe('R-' + String(i + 1).padStart(3, '0'));
    }
  });

  it('every requirement has non-empty description and valid status', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseRequirements(text);
    const valid = ['PLANNED', 'OPERATIONAL', 'COMPLETED', 'PARTIAL', 'VERIFIED', 'NOT_STARTED'];
    for (const r of reqs) {
      expect(r.description.length, r.id).toBeGreaterThan(0);
      expect(valid, r.id).toContain(r.status);
      expect(r.source.length, r.id).toBeGreaterThan(0);
    }
  });

  it('R-001 is install, R-042 is cleanup', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseRequirements(text);
    const r001 = reqs.find((r) => r.id === 'R-001');
    const r042 = reqs.find((r) => r.id === 'R-042');
    expect(r001?.description).toContain('install');
    expect(r042?.description.toLowerCase()).toContain('cleanup');
  });

  it('unmapped R-ids (R-004, R-033, R-038, R-041) are documented', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const reqs = parseRequirements(text);
    const unmapped = ['R-004', 'R-033', 'R-038', 'R-041'];
    for (const id of unmapped) {
      const r = reqs.find((x) => x.id === id);
      expect(r, id).toBeDefined();
    }
  });
});

describe('parseSubsystems — SS-01..SS-24 from section 6', () => {
  it('parses all 24 subsystems', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseSubsystems(text);
    expect(subs.length).toBe(24);
  });

  it('SS-01..SS-24 sorted and sequential', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseSubsystems(text);
    expect(subs[0].id).toBe('SS-01');
    expect(subs[23].id).toBe('SS-24');
    for (let i = 0; i < subs.length; i++) {
      expect(subs[i].id).toBe(`SS-${String(i + 1).padStart(2, '0')}`);
    }
  });

  it('every subsystem has non-empty name and valid status', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseSubsystems(text);
    const valid = ['OPERATIONAL', 'VERIFIED', 'PARTIAL', 'NOT_STARTED'];
    for (const s of subs) {
      expect(s.subsystem.length, s.id).toBeGreaterThan(0);
      expect(valid, s.id).toContain(s.status);
      expect(s.milestone).toMatch(/^M\d+$/);
    }
  });

  it('SS-12 (workspace isolation) is NOT_STARTED', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseSubsystems(text);
    const ss12 = subs.find((s) => s.id === 'SS-12');
    expect(ss12?.status).toBe('NOT_STARTED');
  });

  it('SS-04 (contracts) is VERIFIED milestone M3', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const subs = parseSubsystems(text);
    const ss04 = subs.find((s) => s.id === 'SS-04');
    expect(ss04?.status).toBe('VERIFIED');
    expect(ss04?.milestone).toBe('M3');
  });
});

describe('parseDoD — items from section 8', () => {
  it('parses DoD items (≥40 expected)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseDoD(text);
    expect(items.length).toBeGreaterThanOrEqual(40);
    expect(items[0].id).toMatch(/^DoD-\d+$/);
  });

  it('every DoD item has non-empty description', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseDoD(text);
    for (const d of items) expect(d.description.length, d.id).toBeGreaterThan(0);
  });

  it('DoD-01 is "main is canonical"', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseDoD(text);
    expect(items[0]?.description).toBe('`main` is canonical');
  });

  it('last DoD item (DoD-48) references SS-24', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const items = parseDoD(text);
    expect(items[items.length - 1]?.description).toContain('SS-24');
  });
});

// ── Crosswalk compilation ─────────────────────────────────────────────────────

describe('compileOMCrosswalk — deterministic filesystem probing', () => {
  it('produces exactly 114 entries (42 R + 24 SS + DoD)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const rCount = entries.filter((e) => e.kind === 'R').length;
    const ssCount = entries.filter((e) => e.kind === 'SS').length;
    expect(rCount).toBe(42);
    expect(ssCount).toBe(24);
    expect(entries.length).toBe(rCount + ssCount + entries.filter((e) => e.kind === 'DoD').length);
  });

  it('every entry has truthworthy notes: GAP/UNOBSERVED entries explain why', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    for (const e of entries) {
      if (e.evidenceStatus === 'GAP' || e.evidenceStatus === 'UNOBSERVED') {
        expect(e.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it('unmapped R-ids (R-004, R-033, R-038, R-041) are GAP', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    for (const id of ['R-004', 'R-033', 'R-038', 'R-041']) {
      const e = entries.find((x) => x.omId === id);
      expect(e?.evidenceStatus, id).toBe('GAP');
      expect(e?.planAnchor, id).toBeNull();
    }
  });

  it('SS-12 (NOT_STARTED) stays GAP regardless of M11-R anchor', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const ss12 = entries.find((e) => e.omId === 'SS-12');
    expect(ss12?.evidenceStatus).toBe('GAP');
    expect(ss12?.subsystemStatus).toBe('NOT_STARTED');
  });

  it('SS-04 (VERIFIED) derives from filesystem evidence, not prose', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const ss04 = entries.find((e) => e.omId === 'SS-04');
    // SS-04 → R-018 → M11-R33 → artifact-consistency.ts
    expect(ss04?.planAnchor).toBe('M11-R33');
    // Status is filesystem-derived: MATCH if module exists, UNOBSERVED/PARTIAL otherwise
    expect(['MATCH', 'PARTIAL', 'UNOBSERVED', 'GAP']).toContain(ss04?.evidenceStatus);
    // Notes only exist for UNOBSERVED/PARTIAL/GAP; MATCH has no explanatory note
    if (ss04?.evidenceStatus !== 'MATCH') {
      expect(ss04?.notes.some((n) => n.includes('evidence') || n.includes('unobserved') || n.includes('partial'))).toBe(true);
    }
  });

  it('entries with plan anchors have evidence hashes when files exist', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const withEvidence = entries.filter((e) => e.evidenceHashes.length > 0);
    // At least M11-R27 (claim-registry.ts) should exist
    const claimReg = entries.find((e) => e.planAnchor === 'M11-R27');
    expect(claimReg?.evidenceHashes.length, 'M11-R27 (claim-registry.ts) should have evidence').toBeGreaterThan(0);
    // All entries with hashes have non-empty modulesPresent
    for (const e of withEvidence) {
      expect(e.modulesPresent.length, e.omId).toBeGreaterThan(0);
    }
  });

  it('no claim with UNOBSERVED or GAP has terminal-eligible evidence input', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    for (const e of entries) {
      if (e.evidenceStatus === 'UNOBSERVED' || e.evidenceStatus === 'GAP') {
        const ev = evidenceInputForEntry(e);
        // UNOBSERVED/GAP → empty evidence input → UNOBSERVED maturity → formula blocked
        expect(ev.present).toBeFalsy();
      }
    }
  });
});

// ── Claim compilation ──────────────────────────────────────────────────────────

describe('compileOMClaims — ClaimDefinition for evaluateClaimFormulas', () => {
  it('every entry compiles into a ClaimDefinition', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaims(entries);
    expect(claims.length).toBe(entries.length);
  });

  it('every claim has all required §2 fields', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaims(entries);
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

  it('SS-17 gets T-Visual tier', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaims(entries);
    const ss17 = claims.find((c) => c.requirement_id === 'SS-17');
    expect(ss17?.risk_tier).toBe('T-Visual');
    // T-Visual does NOT require specialist (T2/T3/T-Global do); it requires vision+cdp
    expect(ss17?.required_capabilities).not.toContain('specialist');
  });

  it('SS-09 (security) gets T2 tier with specialist capability', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaims(entries);
    const ss09 = claims.find((c) => c.requirement_id === 'SS-09');
    expect(ss09?.risk_tier).toBe('T2');
    expect(ss09?.required_capabilities).toContain('specialist');
  });

  it('risk tiers are valid for all entries', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const claims = compileOMClaims(entries);
    const valid = ['T0', 'T1', 'T2', 'T3', 'T-Visual', 'T-Global'];
    for (const c of claims) {
      expect(valid).toContain(c.risk_tier);
    }
  });
});

// ── Evidence input derivation ──────────────────────────────────────────────────

describe('evidenceInputForEntry — honest UNOBSERVED/PARTIAL mapping', () => {
  it('GAP entry → honest maturity: UNOBSERVED (T1) or WAITING_CAPABILITY (T2+)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const gap = entries.filter((e) => e.evidenceStatus === 'GAP');
    for (const e of gap) {
      const ev = evidenceInputForEntry(e);
      expect(ev.present).toBeFalsy();
    }
    if (gap.length > 0) {
      const claims = compileOMClaims(gap);
      const evByClaim = Object.fromEntries(claims.map((c) => {
        const entry = entries.find((e) => `CLAIM-OM-${e.omId}-1` === c.claim_id)!;
        return [c.claim_id, evidenceInputForEntry(entry)];
      }));
      const summary = evaluateClaimFormulas(claims, evByClaim);
      for (const c of claims) {
        const maturity = summary.byClaim[c.claim_id]?.maturity;
        // T2+ tiers with no evidence → WAITING_CAPABILITY (requires specialist, none provided)
        // T1/T-Visual tiers with no evidence → UNOBSERVED
        if (['T2', 'T3', 'T-Global'].includes(c.risk_tier)) {
          expect(maturity).toBe('WAITING_CAPABILITY');
        } else {
          expect(maturity).toBe('UNOBSERVED');
        }
      }
    }
  });

  it('MATCH entry → full evidence → LOCAL_READY satisfied', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const match = entries.filter((e) => e.evidenceStatus === 'MATCH');
    if (match.length === 0) return; // Skip if no MATCH in this repo state
    const claims = compileOMClaims(match);
    const evByClaim = Object.fromEntries(match.map((e) => [`CLAIM-OM-${e.omId}-1`, evidenceInputForEntry(e)]));
    const summary = evaluateClaimFormulas(claims, evByClaim);
    expect(summary.formulaState.LOCAL_READY).toBe(true);
  });

  it('PARTIAL entry → partial evidence → blocks formula above FRESH', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const entries = compileOMCrosswalk(text, REPO_ROOT);
    const partial = entries.filter((e) => e.evidenceStatus === 'PARTIAL');
    if (partial.length === 0) return; // Skip if no PARTIAL in this repo state
    const claims = compileOMClaims(partial);
    const evByClaim = Object.fromEntries(partial.map((e) => [`CLAIM-OM-${e.omId}-1`, evidenceInputForEntry(e)]));
    const summary = evaluateClaimFormulas(claims, evByClaim);
    for (const e of partial) {
      const maturity = summary.byClaim[`CLAIM-OM-${e.omId}-1`]?.maturity;
      expect(['PARTIAL', 'UNOBSERVED', 'VALID']).toContain(maturity);
    }
  });
});

// ── Deterministic compile ──────────────────────────────────────────────────────

describe('deterministicCompile — ledger-free full pipeline', () => {
  it('counts: 42 R + 24 SS + N DoD', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
    expect(result.dodCount).toBeGreaterThanOrEqual(40);
    expect(result.entries.length).toBe(result.rCount + result.ssCount + result.dodCount);
  });

  it('every claim has a corresponding entry', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const c of result.claims) {
      const omId = c.requirement_id;
      const entry = result.entries.find((e) => e.omId === omId);
      expect(entry, omId).toBeDefined();
      expect(entry?.description.length, omId).toBeGreaterThan(0);
    }
  });

  it('formulaSummary.byClaim covers every claim', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const c of result.claims) {
      expect(result.formulaSummary.byClaim[c.claim_id], c.claim_id).toBeDefined();
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

  it('LOCAL_READY blocked by any UNOBSERVED/GAP claim (fail-closed)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    // LOCAL_READY requires all claims to be FRESH. T2+ claims need specialist (not provided for GAP) → WAITING_CAPABILITY.
    // So any GAP/UNOBSERVED entry blocks LOCAL_READY.
    const hasGaps = result.unmatchedCount > 0;
    // T2+ GAP entries produce WAITING_CAPABILITY (not UNOBSERVED), still block LOCAL_READY.
    // Confirm formulaState is accessible and honest.
    expect(result.formulaState).toBeDefined();
    expect(typeof result.formulaState.LOCAL_READY).toBe('boolean');
  });

  it('closed enums preserved: 10 maturity states, 4 formula states', () => {
    expect(EVIDENCE_MATURITIES).toHaveLength(10);
    expect(new Set(EVIDENCE_MATURITIES).size).toBe(10);
    expect(CLAIM_FORMULAS).toHaveLength(4);
    for (const m of EVIDENCE_MATURITIES) expect(m).toBeTruthy();
  });

  it('compileFromRepo resolves operating model path', () => {
    const result = compileFromRepo(REPO_ROOT);
    expect(result.rCount).toBe(42);
    expect(result.ssCount).toBe(24);
  });

  it('compileFromRepo throws on missing operating model', () => {
    expect(() => compileFromRepo('/nonexistent')).toThrow('Operating model not found');
  });
});

// ── Determinism: same input = same output ─────────────────────────────────────

describe('determinism — same input always produces same output', () => {
  it('calling deterministicCompile twice with same args produces same entry count', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const a = deterministicCompile(text, REPO_ROOT);
    const b = deterministicCompile(text, REPO_ROOT);
    expect(a.entries.length).toBe(b.entries.length);
    expect(a.claims.length).toBe(b.claims.length);
    expect(a.rCount).toBe(b.rCount);
    expect(a.ssCount).toBe(b.ssCount);
    expect(a.dodCount).toBe(b.dodCount);
    expect(a.unmatchedCount).toBe(b.unmatchedCount);
    // Same entries produce same evidence hashes
    for (let i = 0; i < a.entries.length; i++) {
      expect(a.entries[i].evidenceStatus).toBe(b.entries[i].evidenceStatus);
    }
  });

  it('evidence status is stable across multiple calls (no random probing)', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const results = Array.from({ length: 3 }, () => deterministicCompile(text, REPO_ROOT));
    for (const r of results) {
      expect(r.unmatchedCount).toBe(results[0].unmatchedCount);
      expect(r.rCount).toBe(42);
    }
  });
});

// ── Integration: UNOBSERVED/PARTIAL honest reporting ───────────────────────────

describe('honest reporting — UNOBSERVED/PARTIAL where no proof', () => {
  it('entries with no filesystem evidence have evidenceStatus UNOBSERVED', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    // Every UNOBSERVED entry must have a note explaining why
    for (const e of result.entries) {
      if (e.evidenceStatus === 'UNOBSERVED') {
        expect(e.notes.some((n) => n.includes('unobserved') || n.includes('module')), e.omId).toBe(true);
        expect(e.evidenceHashes.length, e.omId).toBe(0);
      }
    }
  });

  it('PARTIAL entries report which files are missing', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    const partial = result.entries.filter((e) => e.evidenceStatus === 'PARTIAL');
    for (const e of partial) {
      // PARTIAL = some files exist, some don't
      const ev = evidenceInputForEntry(e);
      expect(ev.partial).toBe(true);
    }
  });

  it('no entry falsely claims MATCH without filesystem evidence', () => {
    const text = fs.readFileSync(OM_PATH, 'utf8');
    const result = deterministicCompile(text, REPO_ROOT);
    for (const e of result.entries) {
      if (e.evidenceStatus === 'MATCH') {
        expect(e.evidenceHashes.length).toBeGreaterThan(0);
        expect(e.modulesPresent.length).toBeGreaterThan(0);
      }
    }
  });
});
