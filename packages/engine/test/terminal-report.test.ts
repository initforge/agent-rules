import { describe, it, expect } from 'vitest';
import { compileTerminalReport, M11_TERMINAL_TOKEN } from '../src/terminal-gate.js';
import { candidateEpochHash, CANDIDATE_EPOCH_SCHEMA, type CandidateEpoch } from '../src/candidate-epoch.js';

const hash = 'a'.repeat(64);

function makeEpoch(): CandidateEpoch {
  return {
    schema: CANDIDATE_EPOCH_SCHEMA,
    source_tree_sha: 'b'.repeat(40),
    candidate_commit_or_tree: hash,
    artifact_digest: hash,
    container_image_digests: [],
    dependency_lock_hash: 'c'.repeat(64),
    migration_set_hash: 'd'.repeat(64),
    environment_hash: 'e'.repeat(64),
    fixture_hash: 'f'.repeat(64),
    topology_hash: 'g'.repeat(64),
    created_at: new Date().toISOString(),
    build_critical_manifest: [],
    notes: {},
  };
}

const epoch = makeEpoch();
const candidate = { headCommit: hash, epoch: 1, epochHash: candidateEpochHash(epoch) };

const freshIso = (msAgo = 3_600_000): string => new Date(Date.now() - msAgo).toISOString();

function eligibleClaims(n = 4): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    claim_id: `CLAIM-REQ-${String(i + 1).padStart(3, '0')}-1`,
    maturity: 'TERMINAL_ELIGIBLE',
    blocked: false,
    observed_at: freshIso(),
  }));
}

function ledger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    effective_plan_identity: { sha256: candidate.epochHash },
    claims: eligibleClaims(),
    reviews: [
      { reviewer_id: 'R1', capabilities: ['specialist', 'vision'], independent: true, blind_challenge: true },
      { reviewer_id: 'R2', capabilities: ['specialist'], independent: true },
    ],
    findings: [],
    orphanFindings: [],
    residuals: [],
    ci_binding: { sha256: candidate.epochHash, runUrl: 'https://github.com/initforge/agent-rules/actions/runs/42' },
    install_binding: { sha256: candidate.epochHash, from: 'certified-local-main' },
    topology_binding: 'topo-hash',
    parity_binding: 'COMPLETE',
    attestation_binding: 'att-hash',
    ...overrides,
  };
}

const happyOpts = { rawTotals: { total: 4, fresh: 4, terminal_eligible: 4 } };

describe('compileTerminalReport (M11-R34, AM-0020 §9)', () => {
  it('contains all 9 report sections', () => {
    const r = compileTerminalReport(ledger(), candidate, happyOpts);
    expect(r.sections).toHaveLength(9);
    const ids = r.sections.map((s) => s.id);
    for (const id of [
      'candidate-identity', 'claim-coverage', 'evidence-maturity-freshness',
      'review-coverage-capabilities', 'open-findings', 'bindings', 'residuals',
      'terminal-formula', 'compiler-status',
    ]) {
      expect(ids).toContain(id);
    }
    for (const s of r.sections) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(typeof s.content).toBe('string');
    }
    expect(r.sections.find((s) => s.id === 'terminal-formula')?.content).toBe(M11_TERMINAL_TOKEN);
  });

  it('sets the formula to HV3_M11_LOCAL_COMPLETE when every gate passes', () => {
    const r = compileTerminalReport(ledger(), candidate, happyOpts);
    expect(r.terminal_formula).toBe(M11_TERMINAL_TOKEN);
    expect(r.compiler_errors).toEqual([]);
    expect(r.candidate_identity).toBe(candidate.epochHash);
  });

  it('fails closed on stale evidence (age > requireFreshEvidenceMs)', () => {
    const claims = eligibleClaims().map((c) => ({ ...c, observed_at: freshIso(48 * 3_600_000) }));
    const r = compileTerminalReport(ledger({ claims }), candidate, happyOpts);
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('stale'))).toBe(true);
  });

  it('fails closed when no claim evidence is fresh', () => {
    const claims = [{ claim_id: 'C1', maturity: 'VALID', blocked: false, observed_at: freshIso() }];
    const r = compileTerminalReport(ledger({ claims }), candidate, happyOpts);
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('evidence stale'))).toBe(true);
  });

  it('fails closed on a missing required capability', () => {
    const r = compileTerminalReport(
      ledger({ reviews: [{ reviewer_id: 'R1', capabilities: ['vision'] }] }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('capability missing'))).toBe(true);
  });

  it('fails closed on an open blocking finding and records it', () => {
    const r = compileTerminalReport(
      ledger({ findings: [{ finding_id: 'F-1', severity: 'critical', status: 'OPEN' }] }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('blocking finding open'))).toBe(true);
    expect(r.open_findings).toEqual([{ id: 'F-1', severity: 'critical', disposition: 'OPEN' }]);
  });

  it('records a non-blocking open finding without failing the formula', () => {
    const r = compileTerminalReport(
      ledger({ findings: [{ finding_id: 'F-2', severity: 'low', status: 'OPEN' }] }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe(M11_TERMINAL_TOKEN);
    expect(r.open_findings).toHaveLength(1);
    expect(r.open_findings[0].severity).toBe('low');
  });

  it('fails closed when report totals conflict with raw artifacts', () => {
    const r = compileTerminalReport(ledger(), candidate, { rawTotals: { total: 99, fresh: 99, terminal_eligible: 99 } });
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('totals conflict'))).toBe(true);
  });

  it('fails closed on candidate identity mismatch', () => {
    const r = compileTerminalReport(
      ledger({ effective_plan_identity: { sha256: 'b'.repeat(64) } }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('candidate identity mismatch'))).toBe(true);
  });

  it('fails closed on CI identity mismatch', () => {
    const r = compileTerminalReport(
      ledger({ ci_binding: { sha256: 'c'.repeat(64), runUrl: 'https://github.com/x/actions/runs/1' } }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('CI identity mismatch'))).toBe(true);
  });

  it('fails closed on install identity mismatch', () => {
    const r = compileTerminalReport(
      ledger({ install_binding: { sha256: 'd'.repeat(64), from: 'elsewhere' } }),
      candidate,
      happyOpts,
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('install identity mismatch'))).toBe(true);
  });

  it('preserves residuals verbatim (LLM cannot delete them)', () => {
    const residuals = ['open residual: visual parity on mobile', 'open residual: T2 codex repro'];
    const r = compileTerminalReport(ledger({ residuals }), candidate, happyOpts);
    expect(r.residuals).toEqual(residuals);
    expect(r.sections.find((s) => s.id === 'residuals')?.content).toBe(residuals.join('\n'));
  });

  it('has no parameter that can force a PASS', () => {
    const broken = ledger({ effective_plan_identity: { sha256: 'b'.repeat(64) } });
    const permissive = {
      requireCapabilities: [],
      blockingSeverities: [],
      requireFreshEvidenceMs: 10 ** 12,
      rawTotals: { total: 4, fresh: 4, terminal_eligible: 4 },
    };
    const r = compileTerminalReport(broken, candidate, permissive);
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('identity mismatch'))).toBe(true);
  });

  it('derives claim coverage dynamically from the ledger (never a constant)', () => {
    const two = compileTerminalReport(
      ledger({ claims: eligibleClaims(2) }),
      candidate,
      { rawTotals: { total: 2, fresh: 2, terminal_eligible: 2 } },
    );
    expect(two.claim_coverage).toEqual({ total: 2, fresh: 2, terminal_eligible: 2, blocked: 0 });

    const seven = compileTerminalReport(
      ledger({ claims: eligibleClaims(7) }),
      candidate,
      { rawTotals: { total: 7, fresh: 7, terminal_eligible: 7 } },
    );
    expect(seven.claim_coverage.total).toBe(7);
    expect(seven.claim_coverage.fresh).toBe(7);
    expect(seven.claim_coverage.terminal_eligible).toBe(7);
  });

  it('ignores a terminal marker written outside an engine event', () => {
    const r = compileTerminalReport(
      ledger({ execution_state: M11_TERMINAL_TOKEN, status: M11_TERMINAL_TOKEN }),
      candidate,
      { rawTotals: { total: 99, fresh: 99, terminal_eligible: 99 } },
    );
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
  });

  it('fails closed on a blocked claim and counts it', () => {
    const claims = [
      ...eligibleClaims(3),
      { claim_id: 'CLAIM-REQ-004-1', maturity: 'PARTIAL', blocked: true, block_reason: 'partial evidence', observed_at: freshIso() },
    ];
    const r = compileTerminalReport(ledger({ claims }), candidate, happyOpts);
    expect(r.terminal_formula).toBe('NOT_ELIGIBLE');
    expect(r.compiler_errors.some((e) => e.includes('blocked claim'))).toBe(true);
    expect(r.claim_coverage.blocked).toBe(1);
  });

  it('summarizes review coverage and capabilities', () => {
    const r = compileTerminalReport(ledger(), candidate, happyOpts);
    expect(r.review_summary).toEqual({
      reviewers: 2,
      capabilities: ['specialist', 'vision'],
      independent: 2,
      blind_challenge: true,
    });
    expect(r.sections.find((s) => s.id === 'review-coverage-capabilities')?.source_ledger_field).toBe('reviews');
  });

  it('reports evidence maturity histogram and oldest fresh age', () => {
    const claims = [
      { claim_id: 'C1', maturity: 'TERMINAL_ELIGIBLE', blocked: false, observed_at: freshIso(2 * 3_600_000) },
      { claim_id: 'C2', maturity: 'INDEPENDENTLY_REPRODUCED', blocked: false, observed_at: freshIso(5 * 3_600_000) },
    ];
    const r = compileTerminalReport(ledger({ claims }), candidate, {
      rawTotals: { total: 2, fresh: 2, terminal_eligible: 1 },
    });
    expect(r.terminal_formula).toBe(M11_TERMINAL_TOKEN);
    expect(r.evidence_summary.maturity.TERMINAL_ELIGIBLE).toBe(1);
    expect(r.evidence_summary.maturity.INDEPENDENTLY_REPRODUCED).toBe(1);
    expect(r.evidence_summary.oldest_fresh_age_ms).toBeGreaterThanOrEqual(5 * 3_600_000 - 1_000);
    expect(r.evidence_summary.oldest_fresh_age_ms).toBeLessThanOrEqual(5 * 3_600_000 + 1_000);
  });
});
