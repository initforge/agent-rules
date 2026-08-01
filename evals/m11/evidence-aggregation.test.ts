/**
 * evals/m11/evidence-aggregation.test.ts — M11-C10 evidence promotion
 * aggregation proof (AM-0020 §4, §8). A claim's aggregate maturity is derived
 * from the evidence freshness DAG via the promotion ladder, never from report
 * prose: a stale dependent blocks only its own claim, a sibling stays green.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  promoteEvidence,
  buildFreshnessDag,
  invalidateEvidence,
  deriveClaimEvidenceInputs,
  type EvidenceRecord,
} from '../../packages/engine/src/evidence-dag.js';
import type { CandidateEpoch } from '../../packages/engine/src/candidate-epoch.js';
import { evaluateClaimFormulas, type ClaimDefinition } from '../../packages/engine/src/claim-registry.js';

const EPOCH_AT = '2026-08-01T00:00:00.000Z';
const EPOCH_MS = Date.parse(EPOCH_AT);
const HOUR = 3600_000;

function epoch(): CandidateEpoch {
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
  };
}

const claimA: ClaimDefinition = {
  claim_id: 'CLAIM-M11-R28-1', requirement_id: 'M11-R28', plan_anchor: 'AM-0020 §4', meaning: 'evidence promotion', scope: ['release'],
  risk_tier: 'T3', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['evidence-envelope'],
  required_capabilities: ['specialist'], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 5,
};
const claimB: ClaimDefinition = {
  claim_id: 'CLAIM-M11-R27-1', requirement_id: 'M11-R27', plan_anchor: 'AM-0020 §2', meaning: 'claim registry', scope: ['standard'],
  risk_tier: 'T1', positive_invariants: ['p'], negative_invariants: ['n'], required_evidence: ['claim-definitions'],
  required_capabilities: [], freshness_dependencies: [], allowed_deviations: [], terminal_weight: 3,
};

function ev(id: string, claimIds: string[], deps: string[], opts: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    schema: 'evidence/envelope/v1',
    evidence_id: id,
    claim_ids: claimIds,
    candidate_epoch: null,
    candidate_epoch_hash: null,
    producer: 'worker-1',
    session: 'session-w1',
    tool_and_runner_hash: 't'.repeat(64),
    command: 'npm test',
    exit_code: 0,
    started_at: new Date(EPOCH_MS + HOUR).toISOString(),
    finished_at: new Date(EPOCH_MS + HOUR).toISOString(),
    raw_artifact_hashes: [epoch().artifact_digest],
    environment_and_fixture: { environment_hash: 'e'.repeat(64) },
    coverage: { tests_total: 10, tests_passed: 10 },
    limitations: [],
    freshness: { ttl_ms: 24 * HOUR },
    depends_on: deps,
    required_capabilities: [],
    payload: { kind: 'test-log', parseable: true, semanticallyValid: true },
    reproduction: [{ producer: 'reviewer-2', session: 'session-rev2', finished_at: new Date(EPOCH_MS + 2 * HOUR).toISOString() }],
    ...opts,
  };
}

describe('M11-C10 evidence promotion aggregation (AM-0020 §4)', () => {
  it('claim maturity derives from the DAG promotion ladder and satisfies HV3_M11_LOCAL_COMPLETE', () => {
    const records = [ev('ev-r28', [claimA.claim_id], [], { required_capabilities: ['specialist'] })];
    const dag = buildFreshnessDag(records);
    const promoted = records.map((r) => promoteEvidence(r, { epoch: epoch(), capabilities: ['specialist'], now: EPOCH_MS + 3 * HOUR, dag }));
    assert.equal(promoted[0].state, 'TERMINAL_ELIGIBLE');
    const inputs = deriveClaimEvidenceInputs([claimA], records, { epoch: epoch(), capabilities: ['specialist'], now: EPOCH_MS + 3 * HOUR, dag });
    const summary = evaluateClaimFormulas([claimA], inputs);
    assert.equal(summary.byClaim[claimA.claim_id].maturity, 'TERMINAL_ELIGIBLE');
    assert.equal(summary.formulaState.HV3_M11_LOCAL_COMPLETE, true);
  });

  it('invalidation of one evidence base stales only its claim; the sibling claim stays green', () => {
    // claimA evidence depends on base; claimB evidence is an independent sibling.
    const base = ev('base', [], []);
    const evA = ev('ev-a', [claimA.claim_id], ['base'], { required_capabilities: ['specialist'] });
    const evB = ev('ev-b', [claimB.claim_id], []);
    const dag = buildFreshnessDag([base, evA, evB]);
    invalidateEvidence(dag, 'base');
    const inputs = deriveClaimEvidenceInputs([claimA, claimB], [base, evA, evB], { epoch: epoch(), capabilities: ['specialist'], now: EPOCH_MS + 3 * HOUR, dag });
    const summary = evaluateClaimFormulas([claimA, claimB], inputs);
    assert.equal(summary.byClaim[claimA.claim_id].maturity, 'PARTIAL', 'stale dependent blocks only claimA');
    assert.equal(summary.byClaim[claimB.claim_id].maturity, 'TERMINAL_ELIGIBLE', 'sibling claim unaffected');
    assert.equal(summary.formulaState.HV3_M11_LOCAL_COMPLETE, false);
  });

  it('capability-invalid evidence never yields TERMINAL_ELIGIBLE (no silent substitution)', () => {
    const r = ev('ev-cap', [claimA.claim_id], [], { required_capabilities: ['specialist'] });
    const res = promoteEvidence(r, { epoch: epoch(), capabilities: [] });
    assert.equal(res.terminalEligible, false);
    assert.match(res.reason, /capability-invalid/);
  });
});
