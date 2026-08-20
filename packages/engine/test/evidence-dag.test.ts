/**
 * evidence-dag.test.ts — M11-R28 evidence provenance + freshness DAG (AM-0020 §4).
 *
 * Covers: the full PRESENT→TERMINAL_ELIGIBLE ladder, every blocking condition
 * (missing capability, pre-epoch evidence with/without digest equivalence,
 * same-producer reproduction, stale beyond TTL, unparseable payload), the
 * freshness DAG invalidation semantics, the §4 example rules (screenshot≠visual
 * parity, Playwright≠raw CDP), envelope round-trip determinism, and the
 * claim-registry seam (maturity derived from the DAG via promotion).
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  promoteEvidence,
  buildFreshnessDag,
  invalidateEvidence,
  assertFresh,
  serializeEvidenceRecord,
  evidenceEnvelopeHash,
  deriveClaimEvidenceInputs,
  EVIDENCE_PROMOTION_STATES,
  EVIDENCE_ENVELOPE_SCHEMA,
  type EvidenceRecord,
} from '../src/evidence-dag.js';
import { candidateEpochHash, type CandidateEpoch } from '../src/candidate-epoch.js';
import { evaluateClaimFormulas, type ClaimDefinition } from '../src/plan-readiness.js';

const EPOCH_AT = '2026-08-01T00:00:00.000Z';
const EPOCH_MS = Date.parse(EPOCH_AT);
const HOUR = 3600_000;

function epoch(overrides: Partial<CandidateEpoch> = {}): CandidateEpoch {
  return {
    schema: 'artifact/candidate-epoch/v1',
    source_tree_sha: 'a'.repeat(40),
    candidate_commit_or_tree: 'b'.repeat(40),
    artifact_digest: 'c'.repeat(64),
    container_image_digests: [],
    dependency_lock_hash: 'd'.repeat(64),
    migration_set_hash: 'e'.repeat(64),
    environment_hash: 'f'.repeat(64),
    fixture_hash: 'g'.repeat(64),
    topology_hash: 'h'.repeat(64),
    created_at: EPOCH_AT,
    build_critical_manifest: [],
    notes: {},
    ...overrides,
  };
}

function record(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  const base: EvidenceRecord = {
    schema: EVIDENCE_ENVELOPE_SCHEMA,
    evidence_id: 'ev-1',
    claim_ids: ['CLAIM-REQ-001-1'],
    candidate_epoch: null,
    candidate_epoch_hash: null,
    producer: 'worker-1',
    session: 'session-w1',
    tool_and_runner_hash: 'tool-runner-aaaa'.padEnd(64, '0'),
    command: 'npm test',
    exit_code: 0,
    started_at: new Date(EPOCH_MS + HOUR).toISOString(),
    finished_at: new Date(EPOCH_MS + HOUR).toISOString(),
    raw_artifact_hashes: [],
    environment_and_fixture: { environment_hash: 'env-1'.padEnd(64, '0'), fixture_hash: '' },
    coverage: { tests_total: 42, tests_passed: 42 },
    limitations: [],
    freshness: { ttl_ms: 24 * HOUR },
    depends_on: [],
    required_capabilities: [],
    payload: { kind: 'test-log', parseable: true, semanticallyValid: true },
    reproduction: [],
  };
  return { ...base, ...overrides };
}

describe('promoteEvidence — full ladder', () => {
  it('promotes a valid record through all 7 rungs to TERMINAL_ELIGIBLE', () => {
    const r = record({
      raw_artifact_hashes: [epoch().artifact_digest],
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: ['specialist'], now: EPOCH_MS + 3 * HOUR });
    assert.equal(res.state, 'TERMINAL_ELIGIBLE');
    assert.equal(res.terminalEligible, true);
    assert.deepEqual(
      res.steps.map((s) => s.state),
      EVIDENCE_PROMOTION_STATES,
    );
    for (const s of res.steps) assert.equal(s.satisfied, true, s.reason);
    assert.match(res.reason, /terminal-eligible/);
  });

  it('serializes the envelope deterministically (round-trip + stable hash)', () => {
    const r = record();
    const a = serializeEvidenceRecord(r);
    const b = serializeEvidenceRecord(r);
    assert.equal(a, b, 'identical records serialize identically');
    assert.deepEqual(JSON.parse(a), r, 'serialization round-trips the full envelope');
    assert.match(evidenceEnvelopeHash(r), /^[0-9a-f]{64}$/);
    // Every AM-0020 §4 field is present on the record.
    for (const field of [
      'evidence_id', 'claim_ids', 'candidate_epoch', 'producer', 'tool_and_runner_hash',
      'command', 'exit_code', 'started_at', 'finished_at', 'raw_artifact_hashes',
      'environment_and_fixture', 'coverage', 'limitations', 'freshness',
    ]) {
      assert.ok(field in r, `missing envelope field ${field}`);
    }
  });
});

describe('promoteEvidence — blocking conditions', () => {
  it('rejects an unparseable payload at PARSEABLE', () => {
    const r = record({ payload: { kind: 'test-log', parseable: false, semanticallyValid: true } });
    const res = promoteEvidence(r, { epoch: epoch() });
    assert.equal(res.state, 'PARSEABLE');
    assert.equal(res.terminalEligible, false);
    assert.equal(res.steps.length, 2);
    assert.match(res.reason, /not parseable/);
  });

  it('rejects semantically-invalid evidence at SEMANTICALLY_VALID', () => {
    const r = record({ payload: { kind: 'test-log', parseable: true, semanticallyValid: false } });
    const res = promoteEvidence(r, { epoch: epoch() });
    assert.equal(res.state, 'SEMANTICALLY_VALID');
    assert.match(res.reason, /no passing schema\/meaning check/);
  });

  it('rejects evidence produced before the epoch without digest equivalence at BINDS_FINAL_CANDIDATE', () => {
    const before = new Date(EPOCH_MS - HOUR).toISOString();
    const r = record({ finished_at: before, started_at: before, raw_artifact_hashes: ['unrelated'] });
    const res = promoteEvidence(r, { epoch: epoch() });
    assert.equal(res.state, 'BINDS_FINAL_CANDIDATE');
    assert.equal(res.terminalEligible, false);
    assert.match(res.reason, /before candidate epoch|no artifact digest equivalence/);
  });

  it('binds pre-epoch evidence when raw_artifact_hashes demonstrate digest equivalence', () => {
    const before = new Date(EPOCH_MS - HOUR).toISOString();
    const r = record({
      finished_at: before,
      started_at: before,
      raw_artifact_hashes: ['x', epoch().artifact_digest],
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: [], now: EPOCH_MS + 3 * HOUR });
    assert.ok(res.state === 'INDEPENDENTLY_REPRODUCED' || res.state === 'TERMINAL_ELIGIBLE', res.reason);
    const bindStep = res.steps.find((s) => s.state === 'BINDS_FINAL_CANDIDATE');
    assert.equal(bindStep?.satisfied, true);
    assert.match(bindStep?.reason ?? '', /digest equivalence/);
  });

  it('rejects a record bound to a different candidate epoch at BINDS_FINAL_CANDIDATE', () => {
    const otherEpoch = epoch({ artifact_digest: 'z'.repeat(64) });
    const r = record({ candidate_epoch: otherEpoch, candidate_epoch_hash: candidateEpochHash(otherEpoch) });
    const res = promoteEvidence(r, { epoch: epoch() });
    assert.equal(res.state, 'BINDS_FINAL_CANDIDATE');
    assert.match(res.reason, /different candidate epoch/);
  });

  it('rejects missing capability at CAPABILITY_VALID (no silent substitution)', () => {
    const r = record({ required_capabilities: ['vision'] });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: [] });
    assert.equal(res.state, 'CAPABILITY_VALID');
    assert.match(res.reason, /capability-invalid: missing vision/);
  });

  it('rejects same-producer rerun at INDEPENDENTLY_REPRODUCED', () => {
    const r = record({
      reproduction: [{ producer: 'worker-1', session: 'session-w1', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const res = promoteEvidence(r, { epoch: epoch(), now: EPOCH_MS + 3 * HOUR });
    assert.equal(res.state, 'INDEPENDENTLY_REPRODUCED');
    assert.match(res.reason, /same producer\/session/);
  });

  it('rejects evidence with no independent reproduction (empty reproduction list)', () => {
    const r = record({ reproduction: [] });
    const res = promoteEvidence(r, { epoch: epoch(), now: EPOCH_MS + 3 * HOUR });
    assert.equal(res.state, 'INDEPENDENTLY_REPRODUCED');
    assert.equal(res.terminalEligible, false);
  });

  it('rejects stale evidence beyond TTL at TERMINAL_ELIGIBLE', () => {
    // finished_at is 1h after the epoch, now is 25h after finished_at (> 24h ttl).
    const r = record({
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const res = promoteEvidence(r, { epoch: epoch(), now: EPOCH_MS + 26 * HOUR });
    assert.equal(res.terminalEligible, false);
    assert.match(res.reason, /stale: .* exceeds ttl/);
    const termStep = res.steps.find((s) => s.state === 'TERMINAL_ELIGIBLE');
    assert.equal(termStep?.satisfied, false);
  });
});

describe('promoteEvidence — §4 example rules', () => {
  it('rejects screenshot-only evidence for a visual-parity claim at SEMANTICALLY_VALID', () => {
    const r = record({
      payload: { kind: 'screenshot', parseable: true, semanticallyValid: true, claimKind: 'visual-parity' },
    });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: ['vision'] });
    assert.equal(res.state, 'SEMANTICALLY_VALID');
    assert.match(res.reason, /screenshot-only evidence cannot prove visual parity/);
  });

  it('screenshot with paired reference states passes semantic but still needs the vision capability', () => {
    const r = record({
      payload: { kind: 'screenshot', parseable: true, semanticallyValid: true, claimKind: 'visual-parity', pairedReferenceStates: true },
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const noVision = promoteEvidence(r, { epoch: epoch(), capabilities: [], now: EPOCH_MS + 3 * HOUR });
    assert.equal(noVision.state, 'CAPABILITY_VALID');
    assert.match(noVision.reason, /missing vision/);
    const withVision = promoteEvidence(r, { epoch: epoch(), capabilities: ['vision'], now: EPOCH_MS + 3 * HOUR });
    assert.equal(withVision.state, 'TERMINAL_ELIGIBLE');
  });

  it('rejects Playwright-only evidence for a raw-CDP claim at SEMANTICALLY_VALID', () => {
    const r = record({
      payload: { kind: 'playwright', parseable: true, semanticallyValid: true, claimKind: 'raw-cdp' },
    });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: ['cdp'] });
    assert.equal(res.state, 'SEMANTICALLY_VALID');
    assert.match(res.reason, /Playwright-only evidence cannot prove RAW_CDP/);
  });

  it('accepts a raw-CDP claim when a real CDP session was used', () => {
    const r = record({
      payload: { kind: 'cdp-session', parseable: true, semanticallyValid: true, claimKind: 'raw-cdp', cdpSessionUsed: true },
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: ['cdp'], now: EPOCH_MS + 3 * HOUR });
    assert.equal(res.state, 'TERMINAL_ELIGIBLE');
  });
});

describe('freshness DAG', () => {
  const ev = (id: string, deps: string[]): EvidenceRecord => record({ evidence_id: id, depends_on: deps });

  it('builds edges from depends_on and rejects cycles/unknown deps', () => {
    const dag = buildFreshnessDag([ev('base', []), ev('mid', ['base']), ev('top', ['mid'])]);
    assert.deepEqual(dag.dependsOn.get('top'), ['mid']);
    assert.deepEqual([...dag.dependents.get('base') ?? []].sort(), ['mid']);
    const code = (c: string) => (e: unknown) => e instanceof Error && (e as { code?: string }).code === c;
    assert.throws(() => buildFreshnessDag([ev('a', ['missing'])]), code('UNKNOWN_DEPENDENCY'));
    assert.throws(() => buildFreshnessDag([ev('a', ['a'])]), code('SELF_DEPENDENCY'));
    assert.throws(() => buildFreshnessDag([ev('a', ['b']), ev('b', ['a'])]), code('CYCLE'));
  });

  it('invalidating a base evidence stales only its transitive dependents (sibling stays fresh)', () => {
    const dag = buildFreshnessDag([ev('base', []), ev('dep', ['base']), ev('sib', [])]);
    const stale = invalidateEvidence(dag, 'base');
    assert.deepEqual(stale.sort(), ['base', 'dep']);
    assert.equal(assertFresh(dag.records.get('base') as EvidenceRecord, EPOCH_MS + 3 * HOUR, undefined, dag).fresh, false);
    assert.equal(assertFresh(dag.records.get('dep') as EvidenceRecord, EPOCH_MS + 3 * HOUR, undefined, dag).fresh, false);
    const sib = assertFresh(dag.records.get('sib') as EvidenceRecord, EPOCH_MS + 3 * HOUR, undefined, dag);
    assert.equal(sib.fresh, true, 'sibling evidence is not affected by invalidating the base');
  });

  it('TERMINAL_ELIGIBLE refuses dependent evidence once its base is invalidated', () => {
    const base = record({ evidence_id: 'base', depends_on: [] });
    const top = record({
      evidence_id: 'top',
      depends_on: ['base'],
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
    const dag = buildFreshnessDag([base, top]);
    assert.equal(promoteEvidence(top, { epoch: epoch(), now: EPOCH_MS + 3 * HOUR, dag }).terminalEligible, true);
    invalidateEvidence(dag, 'base');
    const res = promoteEvidence(top, { epoch: epoch(), now: EPOCH_MS + 3 * HOUR, dag });
    assert.equal(res.terminalEligible, false);
    assert.match(res.reason, /invalidated in freshness DAG|stale evidence base/);
  });
});

describe('claim-registry seam — maturity derived from the DAG via promotion', () => {
  const claim: ClaimDefinition = {
    claim_id: 'CLAIM-REQ-001-1', requirement_id: 'REQ-001', plan_anchor: 's1', meaning: 'm', scope: ['s'],
    risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['e'],
    required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
  };

  function terminalRecord(id: string, deps: string[] = []): EvidenceRecord {
    return record({
      evidence_id: id,
      claim_ids: [claim.claim_id],
      depends_on: deps,
      raw_artifact_hashes: [epoch().artifact_digest],
      reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    });
  }

  it('a fully-promoted record satisfies every aggregate formula', () => {
    const inputs = deriveClaimEvidenceInputs([claim], [terminalRecord('ev-term')], { epoch: epoch(), now: EPOCH_MS + 3 * HOUR });
    const summary = evaluateClaimFormulas([claim], inputs);
    assert.equal(summary.byClaim[claim.claim_id].maturity, 'TERMINAL_ELIGIBLE');
    for (const f of summary.formulas) assert.equal(f.satisfied, true, f.formula);
  });

  it('a record blocked at CAPABILITY_VALID yields WAITING_CAPABILITY maturity', () => {
    const specialistClaim: ClaimDefinition = { ...claim, required_capabilities: ['specialist'] };
    const rec = terminalRecord('ev-cap');
    rec.required_capabilities = ['specialist'];
    const inputs = deriveClaimEvidenceInputs([specialistClaim], [rec], { epoch: epoch(), capabilities: [], now: EPOCH_MS + 3 * HOUR });
    const summary = evaluateClaimFormulas([specialistClaim], inputs);
    assert.equal(summary.byClaim[specialistClaim.claim_id].maturity, 'WAITING_CAPABILITY');
    assert.equal(summary.formulaState.LOCAL_READY, false);
  });

  it('a stale dependent (base invalidated) blocks the aggregate — only the affected claim', () => {
    const base = record({ evidence_id: 'base', claim_ids: [], depends_on: [] });
    const top = terminalRecord('ev-top', ['base']);
    const dag = buildFreshnessDag([base, top]);
    invalidateEvidence(dag, 'base');
    const inputs = deriveClaimEvidenceInputs([claim], [base, top], { epoch: epoch(), now: EPOCH_MS + 3 * HOUR, dag });
    const summary = evaluateClaimFormulas([claim], inputs);
    assert.equal(summary.byClaim[claim.claim_id].maturity, 'PARTIAL');
    assert.equal(summary.formulaState.LOCAL_READY, false);
    assert.match(summary.formulas.find((f) => f.formula === 'LOCAL_READY')?.reasons.join(' ') ?? '', /stale/);
  });
});

describe('static sanity', () => {
  it('closed promotion enum: exactly the 7 AM-0020 §4 states', () => {
    assert.deepEqual(EVIDENCE_PROMOTION_STATES, [
      'PRESENT', 'PARSEABLE', 'SEMANTICALLY_VALID', 'BINDS_FINAL_CANDIDATE',
      'CAPABILITY_VALID', 'INDEPENDENTLY_REPRODUCED', 'TERMINAL_ELIGIBLE',
    ]);
    assert.equal(new Set(EVIDENCE_PROMOTION_STATES).size, 7);
  });

  it('same content yields the same envelope hash (created_at-style provenance excluded)', () => {
    const r1 = record();
    const r2 = record();
    assert.equal(evidenceEnvelopeHash(r1), evidenceEnvelopeHash(r2));
    assert.equal(createHash('sha256').update(serializeEvidenceRecord(r1)).digest('hex'), evidenceEnvelopeHash(r1));
  });
});
